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
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const socketRef = useRef<Socket | null>(null);
  const recorderRef = useRef<RecordRTC | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    // Clean up any previous connection
    if (socketRef.current) {
      console.log('Cleaning up previous Socket.io connection');
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    console.log('Initializing Socket.io connection');
    setConnectionStatus('connecting');
    
    // Determine Socket.IO server URL with fallbacks
    // Try NEXT_PUBLIC_SOCKET_URL first, then NEXT_PUBLIC_WS_URL, then use window.location.origin
    const getSocketUrl = () => {
      if (typeof window === 'undefined') return '';
      
      // Debugging info
      console.log('Environment variables:');
      console.log('NEXT_PUBLIC_SOCKET_URL:', process.env.NEXT_PUBLIC_SOCKET_URL);
      console.log('NEXT_PUBLIC_WS_URL:', process.env.NEXT_PUBLIC_WS_URL);
      console.log('window.location.origin:', window.location.origin);
      
      if (process.env.NEXT_PUBLIC_SOCKET_URL) {
        return process.env.NEXT_PUBLIC_SOCKET_URL;
      }
      
      if (process.env.NEXT_PUBLIC_WS_URL) {
        return process.env.NEXT_PUBLIC_WS_URL;
      }
      
      // In Replit/production, use the same origin if no explicit URL is provided
      return window.location.origin;
    };
    
    const socketUrl = getSocketUrl();
    console.log('Connecting to Socket.IO server:', socketUrl);
    
    if (!socketUrl) {
      console.error('No Socket.IO URL available');
      setError('Socket.IO server URL is not configured. Please check your environment variables.');
      setConnectionStatus('disconnected');
      return;
    }
    
    try {
      // Create socket with improved config for Replit
      socketRef.current = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling'], // Try WebSocket first, fallback to polling
        forceNew: true, // Force a new connection
        withCredentials: true,
        autoConnect: true,
      });

      socketRef.current.on('connect', () => {
        console.log('Socket.IO connected successfully');
        setConnectionStatus('connected');
        setError(null);
        reconnectAttemptsRef.current = 0;
      });

      socketRef.current.on('connect_error', (err) => {
        console.error('Socket.IO connection error:', err);
        reconnectAttemptsRef.current += 1;
        
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setConnectionStatus('disconnected');
          setError(`Failed to connect to server: ${err.message}. Please reload the page.`);
        } else {
          // Still trying to connect
          setError(`Connection attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} failed: ${err.message}. Retrying...`);
        }
      });

      socketRef.current.on('transcription', (result: TranscriptionResult) => {
        console.log('Received transcription:', result);
        if (result.isFinal) {
          setTranscription(prev => prev + ' ' + result.text);
        }
      });

      socketRef.current.on('error', (error: { message: string }) => {
        console.error('Socket.IO error:', error);
        setError(`Socket error: ${error.message}`);
        setIsProcessing(false);
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected, reason:', reason);
        setConnectionStatus('disconnected');
        if (reason === 'io server disconnect') {
          // The server has forced the disconnection
          setError('Disconnected by server. Please reload the page.');
        }
      });
    } catch (err) {
      console.error('Error creating Socket.IO connection:', err);
      setError(`Failed to create Socket.IO connection: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setConnectionStatus('disconnected');
    }

    return () => {
      console.log('Cleaning up Socket.IO connection');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // Manual reconnect function for the button
  const handleReconnect = () => {
    console.log('Manual reconnect initiated');
    // Re-run the effect by forcing a re-render
    reconnectAttemptsRef.current = 0;
    setConnectionStatus('connecting');
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.connect();
    } else {
      // Force re-render to trigger useEffect
      setError(null);
      forceReconnect();
    }
  };

  // Force a reconnect by toggling a state
  const forceReconnect = () => {
    // This is a hack to force the useEffect to run again
    setConnectionStatus('connecting');
    setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.connect();
      }
    }, 500);
  };

  const startRecording = async () => {
    try {
      console.log('Requesting microphone access');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      console.log('Microphone access granted, initializing RecordRTC');
      recorderRef.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: StereoAudioRecorder,
        timeSlice: 250, // Send data every 250ms
        desiredSampRate: 16000,
        numberOfAudioChannels: 1,
        bufferSize: 4096,
        ondataavailable: (blob: Blob) => {
          console.log('Audio chunk available, size:', blob.size);
          const reader = new FileReader();
          reader.onloadend = () => {
            const buffer = Buffer.from(reader.result as ArrayBuffer);
            console.log('Sending audio chunk to server');
            socketRef.current?.emit('audio', buffer);
          };
          reader.readAsArrayBuffer(blob);
        }
      });

      setTranscription('');
      setIsProcessing(true);
      console.log('Starting transcription stream');
      socketRef.current?.emit('startTranscription');
      recorderRef.current.startRecording();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Error accessing microphone. Please ensure you have granted permission.');
      setIsProcessing(false);
    }
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      console.log('Stopping recording');
      recorderRef.current.stopRecording(() => {
        console.log('Recording stopped, ending transcription stream');
        socketRef.current?.emit('endTranscription');
        
        if (recorderRef.current) {
          const stream = recorderRef.current.getInternalRecorder().stream;
          if (stream) {
            const tracks = stream.getTracks();
            tracks.forEach((track: MediaStreamTrack) => track.stop());
          }
        }
      });
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-6 max-w-2xl mx-auto mt-8">
      <div className="space-y-4">
        <div className="flex flex-col space-y-2">
          <div className="flex justify-center space-x-4">
            <Button
              onClick={isRecording ? stopRecording : connectionStatus === 'disconnected' ? handleReconnect : startRecording}
              variant={isRecording ? "destructive" : connectionStatus === 'disconnected' ? "outline" : "default"}
              disabled={isProcessing || (connectionStatus !== 'connected' && !isRecording && connectionStatus !== 'disconnected')}
              className="w-full md:w-auto"
            >
              {isRecording ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Recording...
                </>
              ) : connectionStatus === 'connecting' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : connectionStatus === 'disconnected' ? (
                'Reconnect'
              ) : (
                'Start Recording'
              )}
            </Button>
          </div>
          
          <div className="text-center text-xs">
            Connection status: <span className={`font-semibold ${connectionStatus === 'connected' ? 'text-green-500' : connectionStatus === 'connecting' ? 'text-amber-500' : 'text-red-500'}`}>
              {connectionStatus}
            </span>
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-center p-4 bg-red-50 rounded-lg">
            {error}
          </div>
        )}

        <div className="mt-4 p-4 bg-muted rounded-lg min-h-[200px] whitespace-pre-wrap overflow-y-auto max-h-[400px] text-right">
          {transcription || 'Transcription will appear here...'}
        </div>
      </div>
    </Card>
  );
} 