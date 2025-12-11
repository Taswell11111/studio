'use client';
import { CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type SuccessNotificationProps = {
  show: boolean;
  message: string;
  title?: string;
};

export function SuccessNotification({ show, message, title = "Success!" }: SuccessNotificationProps) {
  if (!show) return null;

  return (
    <div className="fixed top-6 right-6 z-[101] animate-bounce-in">
      <div className="bg-green-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
        <CheckCircle className="w-6 h-6" />
        <div>
          <h4 className="font-bold font-headline">{title}</h4>
          <p className="text-sm text-green-100">{message}</p>
        </div>
      </div>
    </div>
  );
}
