"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { WebSocketManager } from '@/lib/websocket-manager';
import { AudioProcessor } from '@/lib/audio-processor';
import Fuse from 'fuse.js';
import { AlertCircle, Mic, MicOff } from 'lucide-react';

interface QuranVerse {
  surahNo: number;
  surahNameEn: string;
  surahNameAr: string;
  ayahNoSurah: number;
  ayahAr: string;
  ayahEn: string;
  reference: string;
}

interface ErrorState {
  type: 'permission' | 'device' | 'connection' | 'processing';
  message: string;
  retryable: boolean;
  action?: () => void;
}

export function LiveTracker() {
  const [transcription, setTranscription] = useState('');
  const [matchedVerse, setMatchedVerse] = useState<QuranVerse | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [quranVerses, setQuranVerses] = useState<QuranVerse[]>([]);
  const [fuse, setFuse] = useState<Fuse<QuranVerse> | null>(null);
  const [volume, setVolume] = useState(1);
  const [isConnected, setIsConnected] = useState(false);

  // Get WebSocket manager singleton instance
  const wsManager = useCallback(() => WebSocketManager.getInstance(), []);

  const audioProcessor = useCallback(() => {
    const processor = new AudioProcessor();
    processor.onAudioProcessed = (data) => {
      if (wsManager().isSocketConnected()) {
        wsManager().sendAudio(Buffer.from(data.buffer));
      }
    };
    return processor;
  }, []);

  // Import the WebSocketManager properly
import { WebSocketManager } from '../../lib';

// Fetch Quran data and initialize Fuse
  useEffect(() => {
    const fetchQuranData = async () => {
      try {
        const response = await fetch('/api/quran');
        if (!response.ok) throw new Error('Failed to fetch Quran data');
        
        const data = await response.json();
        setQuranVerses(data);
        
        setFuse(new Fuse(data, {
          keys: ['ayahAr', 'ayahEn'],
          includeScore: true,
          threshold: 0.4,
          minMatchCharLength: 3,
          useExtendedSearch: true,
          ignoreLocation: true,
          shouldSort: true
        }));
      } catch (error) {
        console.error('Error fetching Quran data:', error);
        setError({
          type: 'processing',
          message: 'Failed to load Quran data. Please try again later.',
          retryable: true,
          action: fetchQuranData
        });
      }
    };

    fetchQuranData();
  }, []);

  // Handle WebSocket events
  useEffect(() => {
    const ws = WebSocketManager.getInstance();
    
    // Subscribe to WebSocket events
    const unsubscribeTranscription = ws.onTranscription((text) => {
      setTranscription(text);
      if (fuse) {
        const result = fuse.search(text);
        if (result.length > 0) {
          setMatchedVerse(result[0].item);
        }
      }
    });

    const unsubscribeError = ws.onError((error) => {
      setError({
        type: 'connection',
        message: error,
        retryable: true,
        action: () => ws.connect()
      });
    });

    const unsubscribeConnection = ws.onConnectionChange((status) => {
      setIsConnected(status);
      if (!status) {
        setError({
          type: 'connection',
          message: 'Connection lost. Attempting to reconnect...',
          retryable: true,
          action: () => ws.connect()
        });
      } else {
        setError(null);
      }
    });

    // Initialize connection
    ws.connect();

    // Cleanup subscriptions
    return () => {
      unsubscribeTranscription();
      unsubscribeError();
      unsubscribeConnection();
      ws.disconnect();
    };
  }, [wsManager, fuse]);

  const startRecording = async () => {
    try {
      const audio = audioProcessor();
      await audio.setupAudio();
      audio.startProcessing();
      audio.setVolume(volume);
      setIsRecording(true);
      setError(null);
    } catch (error) {
      console.error('Error starting recording:', error);
      setError({
        type: 'permission',
        message: error instanceof Error ? error.message : 'Failed to start recording',
        retryable: true,
        action: startRecording
      });
    }
  };

  const stopRecording = async () => {
    try {
      const audio = audioProcessor();
      await audio.cleanup();
      setIsRecording(false);
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError({
        type: 'device',
        message: 'Failed to stop recording properly',
        retryable: false
      });
    }
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(event.target.value);
    setVolume(newVolume);
    audioProcessor().setVolume(newVolume);
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex flex-col items-center space-y-4">
        <Button
          onClick={isRecording ? stopRecording : startRecording}
          variant={isRecording ? "destructive" : "default"}
          className="w-48"
          disabled={!isConnected}
        >
          {isRecording ? (
            <>
              <MicOff className="mr-2 h-4 w-4" />
              Stop Recording
            </>
          ) : (
            <>
              <Mic className="mr-2 h-4 w-4" />
              Start Recording
            </>
          )}
        </Button>

        {!isConnected && (
          <p className="text-sm text-yellow-500">Connecting to server...</p>
        )}

        {error && (
          <div className="flex items-center space-x-2 text-sm text-red-500 bg-red-500/10 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span>{error.message}</span>
            {error.retryable && error.action && (
              <Button
                variant="ghost"
                size="sm"
                onClick={error.action}
                className="ml-2"
              >
                Try Again
              </Button>
            )}
          </div>
        )}

        <div className="w-full max-w-xs space-y-2">
          <label className="text-sm text-gray-400">Volume</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            className="w-full"
          />
        </div>
      </div>

      {transcription && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Transcription:</h3>
          <p className="text-gray-300">{transcription}</p>
        </div>
      )}

      {matchedVerse && (
        <div className="mt-4 p-4 bg-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Matched Verse:</h3>
          <p className="text-xl mb-2 font-arabic">{matchedVerse.ayahAr}</p>
          <p className="text-gray-300">{matchedVerse.ayahEn}</p>
          <p className="text-sm text-gray-400 mt-2">
            {matchedVerse.surahNameEn} ({matchedVerse.surahNameAr}) - Verse {matchedVerse.ayahNoSurah}
          </p>
        </div>
      )}
    </Card>
  );
} 