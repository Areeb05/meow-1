import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import speech from '@google-cloud/speech';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins in development
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Initialize Google Cloud Speech-to-Text client with Replit Secrets
const speechClient = new speech.SpeechClient({
  credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}')
});

const request = {
  config: {
    encoding: 'LINEAR16' as const,
    sampleRateHertz: 16000,
    languageCode: 'ar-SA', // Arabic
    model: 'default',
    useEnhanced: true,
  },
  interimResults: true,
};

io.on('connection', (socket) => {
  console.log('Client connected');

  // Create a streaming recognition request
  const recognizeStream = speechClient
    .streamingRecognize(request)
    .on('error', (err) => {
      console.error('Transcription error:', err);
    })
    .on('data', (data) => {
      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcription = data.results[0].alternatives[0].transcript;
        socket.emit('transcription', transcription);
      }
    });

  // Handle incoming audio chunks
  socket.on('audio', (audioChunk) => {
    recognizeStream.write(audioChunk);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    recognizeStream.end();
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 