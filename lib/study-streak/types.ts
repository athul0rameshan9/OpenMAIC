/**
 * Study streak — types and tuning constants.
 *
 * The streak system turns "did some studying today" into a game: every
 * tracked action earns XP, hitting the daily XP goal marks the day complete,
 * and consecutive complete days build a streak. Everything a student sees
 * (flame count, week strip, level, badges) is *derived* from `xpByDay` plus
 * the goal — see `engine.ts`. Nothing about the streak is stored as a
 * mutable counter, so a stale or hand-edited record can never inflate it.
 */

/** Something a student did that counts as studying. */
export type ActivityKind =
  /** Advanced to a new slide / scene in a classroom. */
  | 'scene'
  /** Asked the study assistant a question. */
  | 'question'
  /** Submitted a quiz. */
  | 'quiz'
  /** Got a single quiz question right (recorded per correct answer). */
  | 'correct_answer'
  /** Reached the end of a classroom. */
  | 'lesson';

/** XP awarded per occurrence of each activity. */
export const XP_BY_ACTIVITY: Record<ActivityKind, number> = {
  scene: 2,
  question: 3,
  quiz: 8,
  correct_answer: 4,
  lesson: 20,
};

/**
 * Per-day XP ceiling per activity kind, so grinding a single action can't
 * carry a day on its own — clicking through 40 slides is not a study session.
 * Kinds absent from this map are uncapped.
 */
export const DAILY_XP_CAP: Partial<Record<ActivityKind, number>> = {
  scene: 20,
  question: 24,
};

/** Selectable daily goals, in XP. */
export const GOAL_PRESETS = [
  { xp: 15, label: 'Casual', hint: '~5 min a day' },
  { xp: 30, label: 'Regular', hint: '~15 min a day' },
  { xp: 60, label: 'Serious', hint: '~30 min a day' },
] as const;

export const DEFAULT_GOAL_XP = 30;

/** Streak lengths worth celebrating, ascending. */
export const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365] as const;

/** One met day in every `DAYS_PER_FREEZE` earns a freeze that can bridge a
 *  single missed day, capped at `MAX_FREEZES`. Life happens; streaks that
 *  shatter on the first slip stop being motivating. */
export const DAYS_PER_FREEZE = 7;
export const MAX_FREEZES = 2;

/** Days of history kept in storage. Older days are pruned on write. */
export const HISTORY_DAYS = 400;

/** Level titles, cycling by tier once the list runs out. */
export const LEVEL_TITLES = [
  'Curious',
  'Learner',
  'Apprentice',
  'Scholar',
  'Adept',
  'Analyst',
  'Strategist',
  'Expert',
  'Mentor',
  'Master',
] as const;

/** Persisted study history for one scope (a course, or all courses). */
export interface StreakRecord {
  /** XP earned per local calendar day, keyed `YYYY-MM-DD`. */
  xpByDay: Record<string, number>;
  /** XP earned per day *per activity kind*, used to enforce `DAILY_XP_CAP`. */
  xpByDayKind: Record<string, Partial<Record<ActivityKind, number>>>;
  /** Longest streak ever reached. Kept because pruning history would
   *  otherwise erase a personal best the student already earned. */
  longestStreak: number;
}

/** One day in the week strip. */
export interface StreakDay {
  day: string;
  xp: number;
  met: boolean;
  /** Missed, but bridged by a freeze so the streak survived. */
  frozen: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface LevelInfo {
  level: number;
  title: string;
  totalXp: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP the current level requires in total. */
  xpForLevel: number;
}

/** Everything the UI needs, all derived. */
export interface StreakView {
  currentStreak: number;
  longestStreak: number;
  todayXp: number;
  goalXp: number;
  goalMet: boolean;
  /** Progress toward today's goal, 0–1. */
  goalProgress: number;
  /** Freezes banked and available to bridge a missed day. */
  freezes: number;
  /** A streak is running and today's goal isn't met yet. */
  atRisk: boolean;
  /** Trailing 7 days, oldest first, ending today. */
  week: StreakDay[];
  level: LevelInfo;
  /** Next milestone above the current streak, or null past the last one. */
  nextMilestone: number | null;
  /** Milestones already reached at this streak length. */
  reachedMilestones: number[];
}

/** A moment worth a toast. Produced when XP is recorded, drained by the UI. */
export type Celebration =
  | { kind: 'goal'; token: string; streak: number; goalXp: number }
  | { kind: 'milestone'; token: string; streak: number }
  | { kind: 'level'; token: string; level: number; title: string };
