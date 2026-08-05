'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useStudyStreakStore } from '@/lib/store/study-streak';
import type { Celebration } from '@/lib/study-streak/types';

function message(c: Celebration): { text: string; description?: string; icon: string } {
  switch (c.kind) {
    case 'goal':
      return {
        icon: '🔥',
        text: c.streak > 1 ? `${c.streak}-day streak!` : 'Daily goal complete!',
        description:
          c.streak > 1
            ? `Today's ${c.goalXp} XP goal is done. See you tomorrow.`
            : 'Your streak starts now — come back tomorrow to keep it.',
      };
    case 'milestone':
      return {
        icon: '🏆',
        text: `${c.streak} days in a row`,
        description: 'That is a real habit now. Nice work.',
      };
    case 'level':
      return {
        icon: '⭐',
        text: `Level ${c.level} — ${c.title}`,
        description: 'New title unlocked.',
      };
  }
}

/**
 * Drains queued streak celebrations into toasts.
 *
 * Mounted once at the app root. The store dedupes by token, so a celebration
 * fires exactly once per student per achievement even across reloads.
 */
export function StreakCelebrations() {
  const pending = useStudyStreakStore((s) => s.pending);
  const drain = useStudyStreakStore((s) => s.drainCelebrations);

  useEffect(() => {
    if (pending.length === 0) return;
    for (const c of drain()) {
      const { text, description, icon } = message(c);
      toast(text, { description, icon, duration: 5000 });
    }
  }, [pending, drain]);

  return null;
}
