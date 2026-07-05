'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { ChevronDown, FileText } from 'lucide-react';
import type { Citation } from '@/lib/student-assistant/types';

interface SourceCitationProps {
  citation: Citation;
}

export function SourceCitation({ citation }: SourceCitationProps) {
  const [expanded, setExpanded] = useState(false);

  const label = citation.headings[0] || citation.sourceFile;
  const pageInfo = citation.pageNumbers.length > 0
    ? `p. ${citation.pageNumbers.join(', ')}`
    : null;

  return (
    <div className="inline-block">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`Source: ${label}`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
          'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <FileText className="size-3" />
        <span className="max-w-[150px] truncate">{label}</span>
        {pageInfo && <span className="text-muted-foreground/70">{pageInfo}</span>}
        <ChevronDown
          className={cn('size-3 transition-transform', expanded && 'rotate-180')}
        />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1 max-h-[120px] overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
              {citation.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
