'use client';

import { Calendar, Clock, ExternalLink, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudyEventCardProps {
  event: Record<string, unknown>;
  created?: boolean;
}

export function StudyEventCard({ event, created }: StudyEventCardProps) {
  const summary = event.summary as string || 'Untitled Event';
  const start = event.start as Record<string, string> | undefined;
  const htmlLink = event.htmlLink as string | undefined;

  const startTime = start?.dateTime
    ? new Date(start.dateTime).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : start?.date || '';

  return (
    <div className={cn(
      'flex items-start gap-2 rounded-lg border p-2 text-xs',
      created
        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
    )}>
      <div className={cn(
        'mt-0.5 flex h-5 w-5 items-center justify-center rounded',
        created ? 'bg-green-100 dark:bg-green-800' : 'bg-blue-100 dark:bg-blue-900'
      )}>
        {created ? (
          <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
        ) : (
          <Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 dark:text-white truncate">{summary}</p>
        {startTime && (
          <p className="flex items-center gap-1 text-gray-500 mt-0.5">
            <Clock className="h-3 w-3" />
            {startTime}
          </p>
        )}
        {created && <p className="text-green-600 dark:text-green-400 mt-0.5">Event created!</p>}
      </div>
      {htmlLink && (
        <a
          href={htmlLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-600"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
