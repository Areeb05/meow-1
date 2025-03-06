"use client";

import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import RecordRTC from 'recordrtc';
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import Fuse from 'fuse.js';

interface QuranVerse {
  surahNo: number;
  surahNameEn: string;
  surahNameAr: string;
  ayahNoSurah: number;
  ayahAr: string;
  ayahEn: string;
  reference: string;
}

// Use environment variable for socket URL or fallback to localhost
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export function LiveTracker() {
  const [transcription, setTranscription] = useState('');
  const [matchedVerse, setMatchedVerse] = useState<QuranVerse | null>(null);
  const [recorder, setRecorder] = useState<RecordRTC | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [quranVerses, setQuranVerses] = useState<QuranVerse[]>([]);
  const [fuse, setFuse] = useState<Fuse<QuranVerse> | null>(null);

  // Fetch Quran data and initialize Fuse
  useEffect(() => {
    const fetchQuranData = async () => {
      try {
        const response = await fetch('/api/quran');
        const data = await response.json();
        setQuranVerses(data);
        
        // Initialize Fuse with the fetched data
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
      }
    };

    fetchQuranData();
  }, []);

  // Handle socket connection status
  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnected(false);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
    };
  }, []);

  // Listen for transcriptions from the server
  useEffect(() => {
    socket.on('transcription', (text) => {
      setTranscription(text);
      if (fuse) {
        const result = fuse.search(text);
        if (result.length > 0) {
          setMatchedVerse(result[0].item);
        }
      }
    });

    return () => {
      socket.off('transcription');
    };
  }, [fuse]);

  // Start recording audio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioRecorder = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        desiredSampRate: 16000, // Match Google Cloud's requirement
      });
      audioRecorder.startRecording();
      setRecorder(audioRecorder);
      setIsRecording(true);

      // Send audio chunks every second
      const interval = setInterval(() => {
        if (!isRecording) {
          clearInterval(interval);
          return;
        }
        
        audioRecorder.stopRecording(() => {
          const blob = audioRecorder.getBlob();
          const reader = new FileReader();
          reader.readAsArrayBuffer(blob);
          reader.onloadend = () => {
            if (reader.result instanceof ArrayBuffer) {
              const audioChunk = Buffer.from(reader.result);
              socket.emit('audio', audioChunk); // Send to server
            }
          };
          audioRecorder.startRecording();
        });
      }, 1000);

      return () => {
        clearInterval(interval);
        audioRecorder.stopRecording();
        stream.getTracks().forEach(track => track.stop());
      };
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (recorder) {
      recorder.stopRecording();
      recorder.getBlob().stream.getTracks().forEach(track => track.stop());
      setRecorder(null);
      setIsRecording(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex flex-col items-center space-y-2">
        <Button
          onClick={isRecording ? stopRecording : startRecording}
          variant={isRecording ? "destructive" : "default"}
          className="w-48"
          disabled={!isConnected}
        >
          {isRecording ? "Stop Tracking" : "Start Tracking"}
        </Button>
        {!isConnected && (
          <p className="text-sm text-yellow-500">Connecting to server...</p>
        )}
      </div>

      {transcription && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Transcription:</h3>
          <p className="text-gray-300">{transcription}</p>
        </div>
      )}

      {matchedVerse && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Matched Verse:</h3>
          <div className="text-sm text-emerald-500 mb-2">
            {matchedVerse.surahNameEn} [{matchedVerse.reference}]
          </div>
          <div className="text-right text-2xl font-arabic text-emerald-200 mb-2">
            {matchedVerse.ayahAr}
          </div>
          <p className="text-gray-300">{matchedVerse.ayahEn}</p>
        </div>
      )}
    </Card>
  );
} 