import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { SpeechClient } from '@google-cloud/speech';
import { validateAudioInput } from './utils/validation';

interface ServerToClientEvents {
  transcription: (text: string) => void;
  error: (message: string) => void;
}

interface ClientToServerEvents {
  audio: (chunk: Buffer) => void;
  error: (error: Error) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  lastActivity: number;
}

const app = express();

// Helper function to get allowed origins
function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  
  // In Replit, allow the Replit domain
  const replitDomain = '976e8954-ef3c-4e3f-b024-edc3ad70e905-00-3sv85topmqw7p.worf.replit.dev';
  origins.push(`https://${replitDomain}`);
  origins.push(`wss://${replitDomain}`);
  origins.push(`http://${replitDomain}`);
  origins.push(`ws://${replitDomain}`);
  
  // Allow localhost in development
  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:3000');
    origins.push('ws://localhost:3000');
    origins.push('http://localhost:3001');
    origins.push('ws://localhost:3001');
  }
  
  return origins;
}

// Add basic route handler for root path
app.get('/', (req: Request, res: Response) => {
  console.log('[DEBUG] Server: Root endpoint called. Headers:', req.headers);
  try {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
    const host = req.headers.host || '';
    const wsUrl = `${protocol}://${host}`;
    console.log('[DEBUG] Server: Constructed WebSocket URL:', wsUrl);

    const response = {
      status: 'ok',
      service: 'Quran Audio Search WebSocket Server',
      timestamp: new Date().toISOString(),
      websocket: {
        connections: io.engine.clientsCount,
        url: wsUrl
      }
    };
    console.log('[DEBUG] Server: Sending response:', response);

    res.setHeader('Content-Type', 'application/json');
    res.json(response);
  } catch (error) {
    console.error('[DEBUG] Server: Error in root endpoint:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: [
        "'self'", 
        "wss:", 
        "ws:", 
        ...getAllowedOrigins()
      ],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req: Request) => {
    return req.ip || req.headers['x-forwarded-for'] as string;
  }
});

app.use(limiter);

// CORS configuration
const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
  },
  transports: ['websocket'],
  pingTimeout: 120000,
  pingInterval: 25000,
  connectTimeout: 30000,
  allowEIO3: true,
  maxHttpBufferSize: 1e8,
});

// Initialize Google Cloud Speech-to-Text client
const speechClient = new SpeechClient({
  credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}')
});

const request = {
  config: {
    encoding: 'LINEAR16' as const,
    sampleRateHertz: 16000,
    languageCode: 'ar-SA',
    model: 'default',
    useEnhanced: true,
  },
  interimResults: true,
};

// Track active connections
type StreamingRecognizeStream = ReturnType<SpeechClient['streamingRecognize']>;

const activeConnections = new Map<string, {
  recognizeStream: StreamingRecognizeStream;
  lastActivity: number;
}>();

// Cleanup inactive connections
setInterval(() => {
  const now = Date.now();
  for (const [socketId, connection] of activeConnections.entries()) {
    if (now - connection.lastActivity > 300000) { // 5 minutes
      connection.recognizeStream.end();
      activeConnections.delete(socketId);
    }
  }
}, 60000); // Check every minute

io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
  console.log('[DEBUG] Server: New client connected:', {
    id: socket.id,
    headers: socket.handshake.headers,
    query: socket.handshake.query,
    totalConnections: io.engine.clientsCount
  });

  // Create a streaming recognition request
  const recognizeStream = speechClient
    .streamingRecognize(request)
    .on('error', (err) => {
      console.error('[DEBUG] Server: Transcription error:', err);
      socket.emit('error', 'Transcription service error');
    })
    .on('data', (data) => {
      console.log('[DEBUG] Server: Received transcription data');
      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcription = data.results[0].alternatives[0].transcript;
        console.log('[DEBUG] Server: Sending transcription:', transcription);
        socket.emit('transcription', transcription);
      }
    });

  // Track connection
  activeConnections.set(socket.id, {
    recognizeStream,
    lastActivity: Date.now()
  });

  // Handle incoming audio chunks
  socket.on('audio', (audioChunk) => {
    console.log('[DEBUG] Server: Received audio chunk from client:', socket.id);
    try {
      if (!validateAudioInput(audioChunk)) {
        console.warn('[DEBUG] Server: Invalid audio input from client:', socket.id);
        throw new Error('Invalid audio input');
      }
      
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.lastActivity = Date.now();
        connection.recognizeStream.write(audioChunk);
        console.log('[DEBUG] Server: Successfully processed audio chunk from client:', socket.id);
      } else {
        console.warn('[DEBUG] Server: No active connection found for client:', socket.id);
      }
    } catch (error) {
      console.error('[DEBUG] Server: Audio processing error:', error);
      socket.emit('error', 'Invalid audio input');
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('[DEBUG] Server: Client disconnected:', {
      id: socket.id,
      remainingConnections: io.engine.clientsCount - 1
    });
    const connection = activeConnections.get(socket.id);
    if (connection) {
      connection.recognizeStream.end();
      activeConnections.delete(socket.id);
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('[DEBUG] Server: Socket error for client:', {
      id: socket.id,
      error: error
    });
    socket.emit('error', 'Internal server error');
  });
});

// Add error handler for the server
io.engine.on('connection_error', (err) => {
  console.error('[DEBUG] Server: Connection error:', {
    error: err,
    activeConnections: io.engine.clientsCount
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[DEBUG] Server: Global error handler:', {
    error: err,
    url: req.url,
    method: req.method,
    headers: req.headers
  });
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 