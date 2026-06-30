'use client';

import { useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TextbookChunk } from '@/lib/types/textbook';

interface ChunkPreviewProps {
  chunks: TextbookChunk[];
  loading: boolean;
  error: string | null;
}

export function ChunkPreview({ chunks, loading, error }: ChunkPreviewProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No relevant passages found. Try a different query.</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {chunks.length} relevant passage{chunks.length !== 1 ? 's' : ''} found
      </p>
      {chunks.map((chunk, idx) => (
        <Card
          key={idx}
          className="cursor-pointer overflow-hidden transition-colors hover:bg-accent/30"
          onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
        >
          <div className="p-3">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">
                  {chunk.headings.length > 0 ? chunk.headings.join(' › ') : `Chunk ${chunk.chunk_index}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {chunk.page_numbers.length > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    p.{chunk.page_numbers[0]}{chunk.page_numbers.length > 1 ? `–${chunk.page_numbers[chunk.page_numbers.length - 1]}` : ''}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {Math.round(chunk.score * 100)}%
                </Badge>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-muted-foreground transition-transform',
                    expandedIndex === idx && 'rotate-180',
                  )}
                />
              </div>
            </div>

            {/* Preview text */}
            <p className={cn(
              'mt-1.5 text-xs leading-relaxed',
              expandedIndex === idx ? '' : 'line-clamp-2',
            )}>
              {chunk.text}
            </p>

            {/* Content type badges */}
            {expandedIndex === idx && (
              <div className="mt-2 flex gap-1.5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {chunk.content_type}
                </Badge>
                {chunk.has_formula && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">formula</Badge>
                )}
                {chunk.has_table && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">table</Badge>
                )}
                {chunk.has_figure && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">figure</Badge>
                )}
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
