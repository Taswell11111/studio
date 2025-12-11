'use client';

import { cn } from '@/lib/utils';

const getStatusColorClass = (status: string): string => {
  if (!status) return 'bg-gray-100 text-gray-800 border-gray-200';
  const upperStatus = status.toUpperCase();

  if (upperStatus.includes('DELIVERED')) {
    return 'bg-green-100 text-green-800 border-green-200';
  }
  if (upperStatus.includes('PICKING')) {
    return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  }
  if (upperStatus.includes('TRANSIT')) {
    return 'bg-blue-100 text-blue-800 border-blue-200';
  }
  if (upperStatus.includes('CANCELLED')) {
    return 'bg-red-100 text-red-800 border-red-200';
  }
  return 'bg-gray-100 text-gray-800 border-gray-200';
};


export function StatusBadge({ status }: { status: string }) {
  const colorClass = getStatusColorClass(status);

  return (
    <div className={cn(
      "px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap",
      colorClass
    )}>
      {status || 'UNKNOWN'}
    </div>
  );
}
