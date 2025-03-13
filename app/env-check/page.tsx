'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

export default function EnvCheckPage() {
  const [socketUrl, setSocketUrl] = useState<string>('');
  const [wsUrl, setWsUrl] = useState<string>('');
  const [origin, setOrigin] = useState<string>('');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setSocketUrl(process.env.NEXT_PUBLIC_SOCKET_URL || 'Not defined');
    setWsUrl(process.env.NEXT_PUBLIC_WS_URL || 'Not defined');
    setOrigin(window.location.origin);
  }, []);

  return (
    <main className="container mx-auto py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">Environment Variables Check</h1>
        <p className="text-muted-foreground">
          This page helps debug environment variable issues
        </p>
      </div>

      <Card className="p-6 max-w-2xl mx-auto mt-8">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Socket.io Configuration</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="font-medium">NEXT_PUBLIC_SOCKET_URL:</div>
            <div className="font-mono bg-muted p-1 rounded">
              {isClient ? socketUrl : 'Loading...'}
            </div>
            
            <div className="font-medium">NEXT_PUBLIC_WS_URL:</div>
            <div className="font-mono bg-muted p-1 rounded">
              {isClient ? wsUrl : 'Loading...'}
            </div>
            
            <div className="font-medium">Window Origin:</div>
            <div className="font-mono bg-muted p-1 rounded">
              {isClient ? origin : 'Loading...'}
            </div>
            
            <div className="font-medium">Connection Target:</div>
            <div className="font-mono bg-muted p-1 rounded">
              {isClient ? (socketUrl || wsUrl || origin) : 'Loading...'}
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-amber-50 rounded border border-amber-200">
            <p className="text-amber-800">
              <strong>Note:</strong> If none of your environment variables are defined, 
              the connection will attempt to use the current window origin 
              ({isClient ? origin : 'loading...'}). Make sure your socket.io server is 
              running on the same origin or set the environment variables correctly.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
} 