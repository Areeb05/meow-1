import express from 'express';
import next from 'next';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { SpeechClient } from '@google-cloud/speech';
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
  corsOrigins: z.array(z.string()).default(['http://localhost:3000']),
  maxAudioChunkSize: z.number().default(1024 * 1024), // 1MB
  rateLimit: z.object({
    windowMs: z.number().default(15 * 60 * 1000), // 15 minutes
    max: z.number().default(100), // limit each IP to 100 requests per windowMs
  }),
});

const config = configSchema.parse({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  maxAudioChunkSize: parseInt(process.env.MAX_AUDIO_CHUNK_SIZE || '1048576', 10),
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
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

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();
  const httpServer = createServer(server);
  
  // Security middleware
  server.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "wss:", "ws:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
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
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: config.maxAudioChunkSize,
  });

  // Initialize Google Cloud Speech-to-Text client
  const client = new SpeechClient();

  // Health check endpoint
  server.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Track active connections and their streams
  const activeStreams = new Map();

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    const request = {
      config: {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        model: 'latest_long',
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
          socket.emit('transcription', transcription);
        }
      });

    // Store the stream
    activeStreams.set(socket.id, recognizeStream);

    socket.on('startTranscription', () => {
      console.log('Starting new transcription stream');
      recognizeStream = client.streamingRecognize(request);
      activeStreams.set(socket.id, recognizeStream);
    });

    socket.on('audio', (audioChunk: Buffer) => {
      try {
        const stream = activeStreams.get(socket.id);
        if (stream) {
          stream.write(audioChunk);
        }
      } catch (error) {
        console.error('Error writing to stream:', error);
        socket.emit('error', { message: 'Error processing audio' });
      }
    });

    socket.on('endTranscription', () => {
      console.log('Ending transcription stream');
      const stream = activeStreams.get(socket.id);
      if (stream) {
        stream.end();
        activeStreams.delete(socket.id);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      const stream = activeStreams.get(socket.id);
      if (stream) {
        stream.end();
        activeStreams.delete(socket.id);
      }
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

  const port = config.port;
  httpServer.listen(port, () => {
    console.log(`Server running on port ${port} in ${config.nodeEnv} mode`);
    console.log('CORS enabled for origins:', config.corsOrigins);
  });
}).catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
}); 