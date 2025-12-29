'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface ProcessingModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
}

/**
 * A modal dialog that indicates a background task is running.
 * It displays a title, an optional description, and a spinning loader icon.
 * It cannot be closed by the user.
 */
export function ProcessingModal({ isOpen, title, description = "Please wait..." }: ProcessingModalProps) {
  return (
    <Dialog open={isOpen}>
      <DialogContent hideCloseButton className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">{title}</DialogTitle>
          <DialogDescription className="text-center pt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center items-center py-6">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
