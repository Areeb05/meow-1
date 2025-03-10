'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import RecordRTC, { StereoAudioRecorder } from 'recordrtc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface TranscriptionResult {
  text: string;
  isFinal: boolean;
}

export function AudioTranscription() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
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
      setIsProcessing(false);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
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

      setTranscription('');
      setIsProcessing(true);
      socketRef.current?.emit('startTranscription');
      recorderRef.current.startRecording();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError('Error accessing microphone. Please ensure you have granted permission.');
      console.error('Error starting recording:', err);
      setIsProcessing(false);
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
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-6 max-w-2xl mx-auto mt-8">
      <div className="space-y-4">
        <div className="flex justify-center space-x-4">
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
            disabled={isProcessing}
          >
            {isRecording ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording...
              </>
            ) : (
              'Start Recording'
            )}
          </Button>
        </div>

        {error && (
          <div className="text-red-500 text-center p-4 bg-red-50 rounded-lg">
            {error}
          </div>
        )}

        <div className="mt-4 p-4 bg-muted rounded-lg min-h-[100px] whitespace-pre-wrap text-right">
          {transcription || 'Transcription will appear here...'}
        </div>
      </div>
    </Card>
  );
} 