'use client';

import { useEffect } from 'react';
import { useStageStore } from '@/lib/store/stage';
import { useRecordStudy } from '@/lib/hooks/use-study-streak';
import { dayKey } from '@/lib/study-streak/engine';

/**
 * Credits streak XP for working through a classroom.
 *
 * Mounted once inside Stage. Only playback modes count — a teacher moving
 * around in edit mode is authoring, not studying. Each scene is credited
 * once per day (revisiting tomorrow counts again, scrubbing back and forth
 * today does not), and `scene` XP is capped daily in the store so clicking
 * through slides can't carry a day on its own.
 */
export function StudyActivityTracker() {
  const mode = useStageStore((s) => s.mode);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const recordStudy = useRecordStudy();

  useEffect(() => {
    if (mode === 'edit' || !currentSceneId) return;
    recordStudy('scene', 1, { dedupeKey: `scene:${currentSceneId}:${dayKey()}` });
  }, [mode, currentSceneId, recordStudy]);

  return null;
}
