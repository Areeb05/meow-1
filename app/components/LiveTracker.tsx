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

export function LiveTracker() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [matchingVerses, setMatchingVerses] = useState<Array<Fuse.FuseResult<QuranVerse>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [fuse, setFuse] = useState<Fuse<QuranVerse> | null>(null);

  // Create and memoize AudioProcessor
  const audioProcessor = useCallback(() => {
    const wsManager = WebSocketManager.getInstance();
    const processor = new AudioProcessor({
      onStart: () => {
        wsManager.startRecording();
        setIsRecording(true);
        setError(null);
      },
      onStop: () => {
        wsManager.stopRecording();
        setIsRecording(false);
      },
      onData: (data) => {
        wsManager.sendAudioData(data);
      },
      onError: (err) => {
        setError(`Microphone error: ${err.message}`);
        setIsRecording(false);
      }
    });

    return processor;
  }, []);

  // Fetch Quran data and initialize Fuse
  useEffect(() => {
    const fetchQuranData = async () => {
      try {
        const response = await fetch('/api/quran');
        if (!response.ok) throw new Error('Failed to load Quran data');

        const verses: QuranVerse[] = await response.json();
        const fuseInstance = new Fuse<QuranVerse>(verses, {
          keys: ["ayahEn", "ayahAr"],
          threshold: 0.4,
          includeScore: true,
        });

        setFuse(fuseInstance);
      } catch (err) {
        setError('Failed to load Quran data');
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

      // Search for matching verses if we have transcription and fuse is initialized
      if (text && fuse) {
        const results = fuse.search(text);
        setMatchingVerses(results.slice(0, 3)); // Take top 3 matches
      }
    });

    const unsubscribeError = ws.onError((message) => {
      setError(`Server error: ${message}`);
      setIsRecording(false);
    });

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeTranscription();
      unsubscribeError();
    };
  }, [fuse]);

  const toggleRecording = () => {
    const audio = audioProcessor();
    if (isRecording) {
      audio.stopRecording();
    } else {
      setTranscription('');
      setMatchingVerses([]);
      audio.startRecording();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center space-y-4">
        <Button 
          onClick={toggleRecording}
          className={`rounded-full w-16 h-16 flex items-center justify-center
                    ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </Button>
        <div className="text-sm text-gray-400">
          {isRecording ? 'Tap to stop' : 'Tap to start'}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-xl p-4 flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {transcription && (
        <Card className="bg-gray-800/70 border border-gray-700/50 p-6">
          <div className="text-sm text-gray-400 mb-2">Transcription:</div>
          <div className="text-emerald-300 text-lg">{transcription}</div>
        </Card>
      )}

      {matchingVerses.length > 0 && (
        <div className="space-y-4">
          <div className="text-sm text-gray-400">Matching verses:</div>
          {matchingVerses.map((result) => (
            <Card key={`${result.item.surahNo}-${result.item.ayahNoSurah}`} 
                  className="bg-gray-800/70 border border-gray-700/50 p-6">
              <div className="flex justify-between items-start mb-2">
                <div className="text-emerald-500 text-sm">
                  {result.item.surahNameEn} [{result.item.reference}]
                </div>
                <div className="text-emerald-500/60 text-sm">
                  Match: {((1 - (result.score || 0)) * 100).toFixed(0)}%
                </div>
              </div>
              <div className="mb-4 text-right text-2xl font-arabic text-emerald-200">
                {result.item.ayahAr}
              </div>
              <div className="text-gray-300">
                {result.item.ayahEn}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}