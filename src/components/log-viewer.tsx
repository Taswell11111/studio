'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BotMessageSquare } from 'lucide-react';

interface LogViewerProps {
  logs: string[];
  title?: string;
}

/**
 * A component to display an array of log strings in a formatted,
 * scrollable card.
 */
export function LogViewer({ logs, title = 'Logs' }: LogViewerProps) {
  return (
    <Card className="font-mono text-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BotMessageSquare className="w-5 h-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 w-full rounded-md border bg-muted/20 p-4">
          {logs.map((log, index) => (
            <div key={index} className="whitespace-pre-wrap break-all">
              {log}
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
