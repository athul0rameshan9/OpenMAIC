'use client';

import { useEffect } from 'react';
import { useStudyStreakStore } from '@/lib/store/study-streak';
import { DEMO_STREAK_ENABLED } from '@/lib/study-streak/demo-data';

/**
 * Seeds placeholder streak history so the UI has something to show before
 * real study activity accumulates.
 *
 * Runs after persistence has hydrated — seeding before that would race the
 * localStorage read and could overwrite a real ledger. The store's
 * `seedDemoData` is itself a no-op when any history already exists, so this
 * is safe to mount unconditionally.
 *
 * Temporary: delete this component, `lib/study-streak/demo-data.ts`, and the
 * store's `seedDemoData` action once real data flows.
 */
export function StreakDemoSeed() {
  useEffect(() => {
    if (!DEMO_STREAK_ENABLED) return;

    const seed = () => useStudyStreakStore.getState().seedDemoData();
    if (useStudyStreakStore.persist.hasHydrated()) {
      seed();
      return;
    }
    return useStudyStreakStore.persist.onFinishHydration(seed);
  }, []);

  return null;
}
