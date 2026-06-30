'use client';

import { useState, useCallback } from 'react';
import type { TextbookChunk } from '@/lib/types/textbook';

export function useTextbookSearch() {
  const [chunks, setChunks] = useState<TextbookChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (textbookId: string, query: string, topK = 5) => {
    if (!textbookId || !query.trim()) {
      setChunks([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/textbook-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textbook_id: textbookId, query: query.trim(), top_k: topK }),
      });

      const json = await res.json();

      if (json.success) {
        setChunks(json.chunks);
      } else {
        setError(json.error ?? 'Search failed');
        setChunks([]);
      }
    } catch (err) {
      setError('Failed to connect to server');
      setChunks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setChunks([]);
    setError(null);
  }, []);

  return { chunks, loading, error, search, reset };
}
