'use client';

import { memo, useMemo } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Streamdown } from 'streamdown';
import { SourceCitation } from './source-citation';
import { PDFDownloadCard } from './pdf-download-card';
import type { StudentMessage } from '@/lib/student-assistant/types';

interface MessageBubbleProps {
  message: StudentMessage;
}

// Regex to find ```pdf-download ... ``` blocks
const PDF_BLOCK_RE = /```pdf-download\s*\n([\s\S]*?)```/g;

interface ParsedSegment {
  kind: 'text' | 'pdf';
  value: string;
}

function parseContent(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(PDF_BLOCK_RE);
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', value: content.slice(lastIndex, match.index) });
    }
    segments.push({ kind: 'pdf', value: match[1].trim() });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < content.length) {
    segments.push({ kind: 'text', value: content.slice(lastIndex) });
  }
  return segments;
}

function tryParsePdfBlock(json: string) {
  try {
    const obj = JSON.parse(json);
    if (obj && obj.type && obj.topic && obj.content) return obj as { type: string; topic: string; content: string };
  } catch { /* not valid json */ }
  return null;
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  const segments = useMemo(
    () => (!isUser ? parseContent(message.content) : null),
    [isUser, message.content],
  );

  return (
    <motion.div
      className={cn('flex w-full flex-col', isUser ? 'items-end' : 'items-start')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {!isUser && (
        <span className="text-[10px] text-muted-foreground mb-0.5 ml-1">Assistant</span>
      )}
      <div
        className={cn(
          'max-w-[85%] px-3 py-2 text-sm break-words',
          isUser
            ? 'rounded-2xl rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-2xl rounded-bl-sm bg-muted text-foreground',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="overflow-x-auto">
            {segments && segments.some((s) => s.kind === 'pdf') ? (
              segments.map((seg, i) => {
                if (seg.kind === 'pdf') {
                  const parsed = tryParsePdfBlock(seg.value);
                  if (parsed) {
                    return (
                      <PDFDownloadCard
                        key={`pdf-${i}`}
                        type={parsed.type as 'study-guide' | 'formula-sheet' | 'flashcards' | 'summary'}
                        topic={parsed.topic}
                        content={parsed.content}
                      />
                    );
                  }
                }
                return (
                  <Streamdown
                    key={`text-${i}`}
                    className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                  >
                    {seg.value}
                  </Streamdown>
                );
              })
            ) : (
              <Streamdown className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                {message.content}
              </Streamdown>
            )}
          </div>
        )}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-border/50 pt-2">
            {message.citations.map((citation, i) => (
              <SourceCitation key={citation.sourceFile + '-' + i} citation={citation} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
});
