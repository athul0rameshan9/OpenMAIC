'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Textbook } from '@/lib/types/textbook';

interface TextbookCardProps {
  textbook: Textbook;
  isSelected: boolean;
  onSelect: (textbook: Textbook) => void;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  processing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  not_started: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export function TextbookCard({ textbook, isSelected, onSelect }: TextbookCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:bg-accent/50',
        isSelected && 'ring-2 ring-primary bg-primary/5',
      )}
      onClick={() => onSelect(textbook)}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Thumbnail */}
        <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded-sm bg-muted">
          {textbook.thumbnail_url ? (
            <img
              src={textbook.thumbnail_url}
              alt={textbook.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              PDF
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight line-clamp-1">{textbook.title}</p>
          {textbook.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {textbook.description}
            </p>
          )}
          <Badge
            variant="secondary"
            className={cn('mt-1.5 text-[10px] px-1.5 py-0', statusColors[textbook.processing_status])}
          >
            {textbook.processing_status.replace('_', ' ')}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
