
'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, X } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';

interface ProcessingModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onAbort?: () => void;
  logs?: string[];
}

export function ProcessingModal({ isOpen, title, description = "Please wait...", onAbort, logs = [] }: ProcessingModalProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen) {
      setElapsedTime(0); // Reset timer when modal opens
      timer = setInterval(() => {
        setElapsedTime(prevTime => prevTime + 1);
      }, 1000);
    }

    return () => {
      clearInterval(timer); // Cleanup timer on close
    };
  }, [isOpen]);
  
  useEffect(() => {
    // Auto-scroll to bottom of logs
    if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
    }
  }, [logs]);

  return (
    <Dialog open={isOpen}>
      <DialogContent hideCloseButton className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center pt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col justify-center items-center py-6 gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-mono">
            Elapsed Time: {elapsedTime}s
          </p>
        </div>
        
        {logs.length > 0 && (
            <div className="font-mono text-xs max-h-48">
                <p className="font-semibold mb-2">Logs:</p>
                <ScrollArea ref={scrollAreaRef} className="h-48 w-full rounded-md border bg-muted/20 p-4">
                    {logs.map((log, index) => (
                        <div key={index} className="whitespace-pre-wrap break-all leading-relaxed">
                            {log}
                        </div>
                    ))}
                </ScrollArea>
            </div>
        )}

        {onAbort && (
          <DialogFooter className="mt-4">
            <Button variant="destructive" onClick={onAbort}>
                <X className="mr-2 h-4 w-4" />
                Abort Search
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
