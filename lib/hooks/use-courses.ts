'use client';

import { useState, useEffect } from 'react';
import type { Course } from '@/lib/types/textbook';

export function useCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCourses() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/courses');
        const json = await res.json();

        if (!cancelled) {
          if (json.success) {
            setCourses(json.courses);
          } else {
            setError(json.error ?? 'Failed to load courses');
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

    fetchCourses();
    return () => { cancelled = true; };
  }, []);

  return { courses, loading, error };
}
