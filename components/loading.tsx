import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function Loading() {
  return (
    <Card className="p-6 max-w-2xl mx-auto mt-8">
      <div className="flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </Card>
  );
} 