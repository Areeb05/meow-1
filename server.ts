import express from 'express';
import next from 'next';
import { createServer } from 'http';
import { Server } from 'socket.io';
import speech from '@google-cloud/speech';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Configuration validation
const configSchema = z.object({
  port: z.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  corsOrigins: z.array(z.string()).default(['http://localhost:3000', 'https://*.repl.co']),
  maxAudioChunkSize: z.number().default(1024 * 1024), // 1MB
  rateLimit: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
    max: z.number().default(100), // limit each IP to 100 requests per windowMs
  }),
  languageCode: z.string().default('ar-SA'),
});

// Parse and validate configuration
const config = configSchema.parse({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'https://*.repl.co'],
  maxAudioChunkSize: parseInt(process.env.MAX_AUDIO_CHUNK_SIZE || '1048576', 10),
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
  languageCode: process.env.DEFAULT_LANGUAGE_CODE || 'ar-SA',
});

// Detect Replit environment
const isReplit = process.env.REPL_ID && process.env.REPL_OWNER;
const replitSlug = process.env.REPL_SLUG || '';
const replitOwner = process.env.REPL_OWNER || '';

// Automatically add Replit domain to CORS origins if in Replit environment
if (isReplit && replitSlug && replitOwner) {
  const replitDomain = `https://${replitSlug}.${replitOwner}.repl.co`;
  if (!config.corsOrigins.includes(replitDomain)) {
    console.log(`Adding Replit domain to CORS origins: ${replitDomain}`);
    config.corsOrigins.push(replitDomain);
  }
}

// Log initial configuration
console.log('Server configuration:', {
  port: config.port,
  nodeEnv: config.nodeEnv,
  corsOrigins: config.corsOrigins,
  maxAudioChunkSize: config.maxAudioChunkSize,
  rateLimit: config.rateLimit,
  languageCode: config.languageCode,
  isReplit,
});

interface TranscriptionResult {
  results: Array<{
    alternatives: Array<{
      transcript: string;
      confidence: number;
    }>;
    isFinal: boolean;
  }>;
}

const dev = config.nodeEnv !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Function to start the server
async function startServer() {
  try {
    console.log('Preparing Next.js app...');
    await app.prepare();
    console.log('Next.js app prepared successfully');

    const server = express();
    const httpServer = createServer(server);
    
    // Trust proxy for rate limiting
    server.set('trust proxy', 1);
    
    // Security middleware
    server.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", "wss:", "ws:", "https://*.repl.co"],
          scriptSrc: ["'self'", "'unsafe-inline'", ...(config.nodeEnv === 'development' ? ["'unsafe-eval'"] : [])],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "data:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // Rate limiting
    server.use(rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
    }));

    // CORS configuration
    server.use(cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
    }));

    // Initialize Socket.IO with security settings
    const io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps, curl requests)
          if (!origin) {
            console.log('Allowing connection with no origin');
            return callback(null, true);
          }
          
          // Check if origin matches any allowed pattern
          const isAllowed = config.corsOrigins.some(allowedOrigin => {
            // Handle wildcard origins (e.g., https://*.repl.co)
            if (allowedOrigin.includes('*')) {
              const pattern = allowedOrigin.replace('*', '.*');
              const regex = new RegExp(pattern);
              return regex.test(origin);
            }
            return allowedOrigin === origin;
          });
          
          if (isAllowed) {
            console.log(`Allowing connection from origin: ${origin}`);
            return callback(null, true);
          } else {
            console.warn(`Origin ${origin} not allowed by CORS`);
            return callback(new Error(`Origin ${origin} not allowed by CORS`), false);
          }
        },
        methods: ['GET', 'POST'],
        credentials: true,
      },
      maxHttpBufferSize: config.maxAudioChunkSize,
      transports: ['websocket', 'polling'], // Prefer WebSocket but fallback to polling
      allowUpgrades: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 30000,
      allowEIO3: true, // Allow compatibility with older clients
    });

    // Debug Socket.io connections
    io.engine.on('connection_error', (err) => {
      console.error('Socket.io connection error:', err);
    });

    // Initialize Google Cloud Speech-to-Text client
    console.log('Initializing Google Cloud Speech-to-Text client');
    const client = new speech.SpeechClient({
      keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
      credentials: process.env.GOOGLE_CLOUD_CREDENTIALS 
        ? JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS) 
        : undefined,
    });

    // Health check endpoint
    server.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        port: config.port,
        environment: config.nodeEnv,
        corsOrigins: config.corsOrigins,
      });
    });

    // Track active connections and their streams
    const activeStreams = new Map();

    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      // Log connection information for debugging
      const { handshake } = socket;
      console.log('Connection details:', {
        id: socket.id,
        address: socket.handshake.address,
        headers: socket.handshake.headers,
        transport: socket.conn.transport.name,
        protocol: socket.conn.protocol,
      });

      // Get language code from request or use default
      const requestLanguageCode = socket.handshake.query.languageCode as string || config.languageCode;

      const request = {
        config: {
          encoding: 'LINEAR16' as const,
          sampleRateHertz: 16000,
          languageCode: requestLanguageCode,
          model: 'default',
          useEnhanced: true,
        },
        interimResults: true,
      };

      let recognizeStream = client
        .streamingRecognize(request)
        .on('error', (err) => {
          console.error('Transcription error:', err);
          socket.emit('error', { message: 'Transcription error occurred' });
        })
        .on('data', (data: TranscriptionResult) => {
          if (data.results[0] && data.results[0].alternatives[0]) {
            const transcription = {
              text: data.results[0].alternatives[0].transcript,
              isFinal: data.results[0].isFinal,
              confidence: data.results[0].alternatives[0].confidence
            };
            console.log('Sending transcription:', transcription);
            socket.emit('transcription', transcription);
          }
        });

      // Store the stream
      activeStreams.set(socket.id, recognizeStream);

      socket.on('startTranscription', () => {
        console.log('Starting new transcription stream for socket:', socket.id);
        recognizeStream = client.streamingRecognize(request);
        activeStreams.set(socket.id, recognizeStream);
      });

      socket.on('audio', (audioChunk: Buffer) => {
        try {
          const stream = activeStreams.get(socket.id);
          if (stream) {
            console.log('Received audio chunk from socket:', socket.id, 'size:', audioChunk.length);
            stream.write(audioChunk);
          } else {
            console.error('No active stream found for socket:', socket.id);
            socket.emit('error', { message: 'No active transcription stream' });
          }
        } catch (error) {
          console.error('Error writing to stream:', error);
          socket.emit('error', { message: 'Error processing audio' });
        }
      });

      socket.on('endTranscription', () => {
        console.log('Ending transcription stream for socket:', socket.id);
        const stream = activeStreams.get(socket.id);
        if (stream) {
          stream.end();
          activeStreams.delete(socket.id);
        }
      });

      socket.on('disconnect', (reason) => {
        console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
        const stream = activeStreams.get(socket.id);
        if (stream) {
          stream.end();
          activeStreams.delete(socket.id);
        }
      });

      socket.on('error', (error) => {
        console.error(`Socket error for client ${socket.id}:`, error);
      });
    });

    // Error handling middleware
    server.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Server error:', err);
      res.status(500).json({
        error: {
          message: 'Internal server error',
          ...(config.nodeEnv === 'development' && { details: err.message }),
        },
      });
    });

    // Handle all Next.js routes
    server.all('*', (req, res) => handle(req, res));

    // Start the server on the configured port
    httpServer.listen(config.port, () => {
      console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
      console.log('CORS enabled for origins:', config.corsOrigins);
      console.log('Health check available at:', `http://localhost:${config.port}/health`);
    });

  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

// Start the server
startServer(); 