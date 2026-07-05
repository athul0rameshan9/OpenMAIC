'use client';

import { useState, useCallback } from 'react';
import { FileText, Download, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PDFDownloadCardProps {
  type: 'study-guide' | 'formula-sheet' | 'flashcards' | 'summary';
  topic: string;
  content: string; // JSON string of the structured content
}

const typeLabels: Record<string, string> = {
  'study-guide': 'Study Guide',
  'formula-sheet': 'Formula Sheet',
  'flashcards': 'Flashcards',
  'summary': 'Summary',
};

export function PDFDownloadCard({ type, topic, content }: PDFDownloadCardProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleDownload = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/student-assistant/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, topic, content }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'PDF generation failed' }));
        throw new Error(err.error || 'PDF generation failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-${topic.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [type, topic, content]);

  return (
    <div className="my-2 flex items-center gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{typeLabels[type] ?? type}</p>
        <p className="truncate text-xs text-muted-foreground">{topic}</p>
      </div>
      <button
        onClick={handleDownload}
        disabled={status === 'loading'}
        className={cn(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          status === 'done'
            ? 'bg-green-500/10 text-green-600'
            : status === 'error'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          status === 'loading' && 'opacity-70 cursor-wait',
        )}
      >
        {status === 'loading' ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating…
          </>
        ) : status === 'done' ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Downloaded
          </>
        ) : status === 'error' ? (
          'Retry'
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </>
        )}
      </button>
    </div>
  );
}
