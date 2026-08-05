/**
 * Study Streak Store
 *
 * Persists the XP-per-day ledger to localStorage, one record per scope:
 * the global scope (`GLOBAL_SCOPE`) plus one per course the student studies.
 * Streak, level, and week strip are never stored — they're derived on read
 * by `lib/study-streak/engine`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  dayKey,
  deriveView,
  detectCelebrations,
  emptyRecord,
  recordActivity as applyActivity,
  withLongest,
} from '@/lib/study-streak/engine';
import { buildDemoRecord } from '@/lib/study-streak/demo-data';
import {
  DEFAULT_GOAL_XP,
  type ActivityKind,
  type Celebration,
  type StreakRecord,
  type StreakView,
} from '@/lib/study-streak/types';

/** Scope key for "everything the student studies", shown on the homepage. */
export const GLOBAL_SCOPE = '__all__';

/** How many dedupe keys to remember before the oldest are forgotten. */
const CREDITED_LIMIT = 600;

export interface RecordOptions {
  /** Course to credit alongside the global scope. Defaults to the active course. */
  courseId?: string | null;
  /** Credit this action at most once; repeats with the same key are ignored. */
  dedupeKey?: string;
}

export interface StudyStreakState {
  /** Daily XP target, shared across scopes. */
  goalXp: number;
  /** Ledgers keyed by scope: `GLOBAL_SCOPE` or a course id. */
  records: Record<string, StreakRecord>;
  /** Display names for course scopes, so the UI needn't refetch courses. */
  courseNames: Record<string, string>;
  /** Course the student is currently working in, if known. */
  activeCourseId: string | null;
  /** Celebrations raised but not yet shown. */
  pending: Celebration[];
  /** Tokens already celebrated, so a reload doesn't replay them. */
  celebrated: string[];
  /**
   * Dedupe keys already credited, newest last. Lets callers make an action
   * award XP at most once (e.g. a quiz that gets retried, or a slide that
   * gets revisited) without tracking that themselves.
   */
  credited: string[];
}

export interface StudyStreakActions {
  setGoalXp: (xp: number) => void;
  setActiveCourse: (courseId: string | null, courseName?: string) => void;
  /**
   * Credit studying. Always credits the global scope, and additionally the
   * course scope when `courseId` is given or a course is active.
   *
   * Pass `dedupeKey` for actions that can repeat (quiz retries, revisited
   * slides) to credit them only once.
   */
  record: (kind: ActivityKind, count?: number, opts?: RecordOptions) => void;
  /** Remove pending celebrations the UI has shown. */
  drainCelebrations: () => Celebration[];
  /** Wipe one scope's history (`GLOBAL_SCOPE` resets the overall streak). */
  resetScope: (scope: string) => void;
  /**
   * Fill an empty global ledger with placeholder history. No-op once any
   * history exists, so it can never clobber real study activity.
   * Remove alongside `lib/study-streak/demo-data.ts` when real data lands.
   */
  seedDemoData: () => void;
  /** Derived view for a scope — the only read path the UI should use. */
  viewFor: (scope?: string) => StreakView;
}

export const useStudyStreakStore = create<StudyStreakState & StudyStreakActions>()(
  persist(
    (set, get) => ({
      goalXp: DEFAULT_GOAL_XP,
      records: {},
      courseNames: {},
      activeCourseId: null,
      pending: [],
      celebrated: [],
      credited: [],

      setGoalXp: (xp) => set({ goalXp: Math.max(1, Math.round(xp)) }),

      setActiveCourse: (courseId, courseName) =>
        set((s) => ({
          activeCourseId: courseId,
          courseNames:
            courseId && courseName ? { ...s.courseNames, [courseId]: courseName } : s.courseNames,
        })),

      record: (kind, count = 1, opts = {}) => {
        const state = get();
        const { courseId, dedupeKey } = opts;
        if (dedupeKey && state.credited.includes(dedupeKey)) return;

        const today = dayKey();
        const goalXp = state.goalXp;
        const scopes = [GLOBAL_SCOPE];
        const course = courseId ?? state.activeCourseId;
        if (course) scopes.push(course);

        const records = { ...state.records };
        let celebrations: Celebration[] = [];

        for (const scope of scopes) {
          const before = records[scope] ?? emptyRecord();
          const beforeView = deriveView(before, goalXp, today);
          const updated = applyActivity(before, kind, count, today);
          if (updated === before) continue;

          const afterView = deriveView(updated, goalXp, today);
          records[scope] = withLongest(updated, afterView.currentStreak);

          // Only the global scope raises toasts — a single action crediting
          // two scopes would otherwise fire the same celebration twice.
          if (scope === GLOBAL_SCOPE) {
            celebrations = detectCelebrations(beforeView, afterView, today);
          }
        }

        const fresh = celebrations.filter(
          (c) =>
            !state.celebrated.includes(c.token) && !state.pending.some((p) => p.token === c.token),
        );

        set({
          records,
          pending: fresh.length > 0 ? [...state.pending, ...fresh] : state.pending,
          credited: dedupeKey
            ? [...state.credited, dedupeKey].slice(-CREDITED_LIMIT)
            : state.credited,
        });
      },

      drainCelebrations: () => {
        const { pending, celebrated } = get();
        if (pending.length === 0) return [];
        set({
          pending: [],
          // Bound the ledger: goal tokens are per-day, so this grows daily.
          celebrated: [...celebrated, ...pending.map((c) => c.token)].slice(-120),
        });
        return pending;
      },

      resetScope: (scope) =>
        set((s) => {
          const records = { ...s.records };
          delete records[scope];
          return {
            records,
            // Drop day-scoped tokens so a fresh start can celebrate again.
            celebrated: scope === GLOBAL_SCOPE ? [] : s.celebrated,
            credited: scope === GLOBAL_SCOPE ? [] : s.credited,
          };
        }),

      seedDemoData: () => {
        const state = get();
        const existing = state.records[GLOBAL_SCOPE];
        if (existing && Object.keys(existing.xpByDay).length > 0) return;
        set({ records: { ...state.records, [GLOBAL_SCOPE]: buildDemoRecord(dayKey()) } });
      },

      viewFor: (scope = GLOBAL_SCOPE) => {
        const { records, goalXp } = get();
        return deriveView(records[scope] ?? emptyRecord(), goalXp, dayKey());
      },
    }),
    {
      name: 'study-streak-storage',
      // Transient UI state stays out of storage.
      partialize: (s) => ({
        goalXp: s.goalXp,
        records: s.records,
        courseNames: s.courseNames,
        activeCourseId: s.activeCourseId,
        celebrated: s.celebrated,
        credited: s.credited,
      }),
    },
  ),
);
