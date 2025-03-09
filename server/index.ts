import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { SpeechClient } from '@google-cloud/speech';
import { validateConfig } from './config';
import { validateAudioInput } from './utils/validation';

// Load and validate configuration
const config = validateConfig();

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "ws:", ...config.corsOrigins],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  },
  maxHttpBufferSize: config.maxAudioChunkSize,
});

// Initialize Google Cloud Speech-to-Text client
const speechClient = new SpeechClient({
  credentials: config.googleCloudCredentials,
});

// Configure speech recognition request
const recognitionConfig = {
  encoding: 'LINEAR16' as const,
  sampleRateHertz: 16000,
  languageCode: 'ar-SA',
  model: 'default',
  useEnhanced: true,
};

// Track active connections and their streams
const activeStreams = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  let recognizeStream = speechClient
    .streamingRecognize({
      config: recognitionConfig,
      interimResults: true,
    })
    .on('error', (error) => {
      console.error(`Recognition error for client ${socket.id}:`, error);
      socket.emit('error', {
        type: 'recognition_error',
        message: 'Speech recognition error occurred',
      });
    })
    .on('data', (data) => {
      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcription = data.results[0].alternatives[0].transcript;
        socket.emit('transcription', {
          type: 'transcription',
          text: transcription,
          isFinal: data.results[0].isFinal,
        });
      }
    });

  // Store the stream
  activeStreams.set(socket.id, recognizeStream);

  // Handle incoming audio data
  socket.on('audio', async (data) => {
    try {
      if (!validateAudioInput(data)) {
        throw new Error('Invalid audio input');
      }

      const stream = activeStreams.get(socket.id);
      if (stream) {
        stream.write(data);
      }
    } catch (error) {
      console.error(`Error processing audio from client ${socket.id}:`, error);
      socket.emit('error', {
        type: 'audio_processing_error',
        message: error instanceof Error ? error.message : 'Audio processing error',
      });
    }
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    const stream = activeStreams.get(socket.id);
    if (stream) {
      stream.end();
      activeStreams.delete(socket.id);
    }
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      ...(config.nodeEnv === 'development' && { details: err.message }),
    },
  });
});

// Start server
httpServer.listen(config.port, () => {
  console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`CORS enabled for origins:`, config.corsOrigins);
}); 