'use client';

import { useState, useEffect } from 'react';
import type { Textbook } from '@/lib/types/textbook';

export function useTextbooks(courseId: string | null) {
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) {
      setTextbooks([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchTextbooks() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/textbooks?course_id=${encodeURIComponent(courseId!)}`);
        const json = await res.json();

        if (!cancelled) {
          if (json.success) {
            setTextbooks(json.textbooks);
          } else {
            setError(json.error ?? 'Failed to load textbooks');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to connect to server');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTextbooks();
    return () => { cancelled = true; };
  }, [courseId]);

  return { textbooks, loading, error };
}
