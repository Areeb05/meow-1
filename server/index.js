const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const speech = require('@google-cloud/speech');
const client = new speech.SpeechClient({ keyFilename: 'key.json' }); // Replace with your key file path
const port = process.env.PORT || 3001;

io.on('connection', (socket) => {
  console.log('Client connected');

  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'ar-SA', // Arabic (Saudi Arabia)
    },
    interimResults: true, // Get real-time results
  };

  const recognizeStream = client
    .streamingRecognize(request)
    .on('data', (data) => {
      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcription = data.results[0].alternatives[0].transcript;
        socket.emit('transcription', transcription); // Send transcription to client
      }
    })
    .on('error', (err) => {
      console.error('Transcription error:', err);
    });

  socket.on('audio', (audioChunk) => {
    recognizeStream.write(audioChunk); // Receive audio from client
  });

  socket.on('disconnect', () => {
    recognizeStream.end();
    console.log('Client disconnected');
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});