
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface ProcessingModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
}

export function ProcessingModal({ isOpen, title, description = "Please wait..." }: ProcessingModalProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

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

  return (
    <Dialog open={isOpen}>
      <DialogContent hideCloseButton className="sm:max-w-sm">
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
      </DialogContent>
    </Dialog>
  );
}
