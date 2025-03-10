import { Suspense } from 'react';
import { AudioTranscription } from '@/components/audio-transcription';

export const metadata = {
  title: 'Real-time Audio Transcription',
  description: 'Convert speech to text in real-time using Google Cloud Speech-to-Text',
};

export default function TranscribePage() {
  return (
    <main className="container mx-auto py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">Real-time Audio Transcription</h1>
        <p className="text-muted-foreground">
          Speak into your microphone and see your words transcribed in real-time
        </p>
      </div>

      <Suspense fallback={
        <div className="text-center">
          Loading audio transcription component...
        </div>
      }>
        <AudioTranscription />
      </Suspense>
    </main>
  );
} 