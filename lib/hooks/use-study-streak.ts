'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GLOBAL_SCOPE, useStudyStreakStore, type RecordOptions } from '@/lib/store/study-streak';
import { dayKey, deriveView, emptyRecord } from '@/lib/study-streak/engine';
import type { ActivityKind, StreakView } from '@/lib/study-streak/types';

/** ms until the next local midnight, plus a second of slack. */
function msUntilMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return next.getTime() - now.getTime();
}

/**
 * The current local day, re-rendering the caller when it rolls over so a
 * tab left open overnight doesn't keep showing yesterday's streak.
 */
function useToday(): string {
  const [today, setToday] = useState(() => dayKey());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setToday(dayKey());
        schedule();
      }, msUntilMidnight());
    };
    schedule();

    // A backgrounded tab's timer can fire late; re-check on focus.
    const onVisible = () => setToday(dayKey());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
}

/**
 * Derived streak state for one scope (default: all courses combined).
 *
 * `hydrated` is false during SSR and the first client paint, before
 * localStorage has been read. Streak UI should render its skeleton until
 * then rather than flashing a zeroed-out streak.
 */
export function useStreakView(scope: string = GLOBAL_SCOPE): {
  view: StreakView;
  hydrated: boolean;
} {
  const record = useStudyStreakStore((s) => s.records[scope]);
  const goalXp = useStudyStreakStore((s) => s.goalXp);
  const today = useToday();

  // Starts false on both server and first client render — reading
  // `hasHydrated()` up front would make the client's first paint disagree
  // with the server HTML and trip a hydration mismatch.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useStudyStreakStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useStudyStreakStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  const view = useMemo(
    () => deriveView(record ?? emptyRecord(), goalXp, today),
    [record, goalXp, today],
  );

  return { view, hydrated };
}

/**
 * Stable recorder for study activity. Safe to call from effects and event
 * handlers; XP caps, dedupe, and day bucketing are handled in the store.
 */
export function useRecordStudy(): (
  kind: ActivityKind,
  count?: number,
  opts?: RecordOptions,
) => void {
  return useCallback((kind, count, opts) => {
    useStudyStreakStore.getState().record(kind, count, opts);
  }, []);
}
