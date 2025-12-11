'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

interface ProcessingModalProps {
  isOpen: boolean;
  progress?: number;
  title?: string;
}

export function ProcessingModal({ isOpen, progress, title = "Processing..." }: ProcessingModalProps) {
  const showProgressBar = progress !== undefined;

  return (
    <Dialog open={isOpen}>
      <DialogContent hideCloseButton className="max-w-md">
        <DialogHeader>
            <DialogTitle className="text-center text-lg font-medium">{title}</DialogTitle>
            <DialogDescription className="text-center">
                Please wait while we process your file. This may take a moment.
            </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <p>
              {showProgressBar ? 'Writing records to the database...' : 'Processing on the server...'}
            </p>
          </div>
          {showProgressBar && (
            <>
              <Progress value={progress} className="w-full" />
              <p className="text-center text-sm font-bold text-foreground">{progress}% complete</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
