'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import RecordRTC, { StereoAudioRecorder } from 'recordrtc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

export function AudioTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const recorderRef = useRef<RecordRTC | null>(null);

  useEffect(() => {
    // Connect to Socket.IO server
    socketRef.current = io();

    socketRef.current.on('transcription', (result: TranscriptionResult) => {
      if (result.isFinal) {
        setTranscription(prev => prev + ' ' + result.text);
      }
    });

    socketRef.current.on('error', (error: { message: string }) => {
      setError(error.message);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      recorderRef.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: StereoAudioRecorder,
        timeSlice: 250, // Send data every 250ms
        desiredSampRate: 16000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        ondataavailable: (blob: Blob) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const buffer = Buffer.from(reader.result as ArrayBuffer);
            socketRef.current?.emit('audio', buffer);
          };
          reader.readAsArrayBuffer(blob);
        }
      });

      socketRef.current?.emit('startTranscription');
      recorderRef.current.startRecording();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError('Error accessing microphone. Please ensure you have granted permission.');
      console.error('Error starting recording:', err);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stopRecording(() => {
        socketRef.current?.emit('endTranscription');
        const tracks = recorderRef.current?.getBlob()
          .getAudioTracks();
        tracks?.forEach(track => track.stop());
      });
      setIsRecording(false);
    }
  };

  return (
    <Card className="p-6 max-w-2xl mx-auto mt-8">
      <div className="space-y-4">
        <div className="flex justify-center space-x-4">
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </Button>
        </div>

        {error && (
          <div className="text-red-500 text-center">
            {error}
          </div>
        )}

        <div className="mt-4 p-4 bg-muted rounded-lg min-h-[100px] whitespace-pre-wrap">
          {transcription || 'Transcription will appear here...'}
        </div>
      </div>
    </Card>
  );
} 