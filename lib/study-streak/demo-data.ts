/**
 * Study streak — demo history.
 *
 * Placeholder data so the streak UI shows a lived-in state before real
 * study activity exists. Seeded once, only into an empty ledger, so it
 * never overwrites a student's actual history.
 *
 * To turn it off: set `NEXT_PUBLIC_STREAK_DEMO_DATA=false`, or flip
 * `DEMO_STREAK_ENABLED` below. To remove it for good, delete this file, the
 * `seedDemoData` action in `lib/store/study-streak.ts`, and the
 * `<StreakDemoSeed />` mount in `app/layout.tsx`.
 */

import { addDays } from './engine';
import type { StreakRecord } from './types';

/** Master switch for the placeholder history. */
export const DEMO_STREAK_ENABLED = process.env.NEXT_PUBLIC_STREAK_DEMO_DATA !== 'false';

/**
 * XP for each of the last 45 days, oldest first, chosen to exercise every
 * state the UI can show at the default 30 XP goal:
 *
 *   • a 12-day run ending yesterday → a live streak with a banked freeze
 *   • today deliberately short (18 XP) → the goal ring mid-fill and the
 *     "at risk" nudge, which is the interesting state to look at
 *   • a missed day 16 days back, bridged by a freeze → snowflake day
 *   • an earlier broken run and some quiet days → a believable history
 *     and enough lifetime XP to land around level 5
 *
 * Index 44 is today; index 0 is 44 days ago.
 */
const DEMO_XP_BY_OFFSET: number[] = [
  // 44–35 days ago: getting started, patchy.
  12, 0, 34, 30, 0, 0, 45, 38, 30, 8,
  // 34–25 days ago: a solid two-week run begins.
  36, 42, 30, 33, 51, 30, 30, 44, 39, 30,
  // 24–17 days ago: run continues, then one missed day (offset 16).
  30, 48, 35, 30, 30, 40, 30, 32,
  // 16 days ago: missed — bridged by a banked freeze.
  0,
  // 15–13 days ago: quiet stretch, run resets.
  14, 0, 22,
  // 12–1 days ago: the current 12-day streak.
  30, 36, 30, 44, 30, 30, 52, 33, 30, 38, 30, 41,
  // Today: partway there.
  18,
];

/**
 * Build the placeholder ledger relative to `today` (a `dayKey`).
 *
 * `xpByDayKind` is intentionally left empty: it only exists to enforce
 * per-kind daily caps, and demo days carry no per-activity breakdown. The
 * only day where that matters is today, which starts with its full cap
 * available — so real activity recorded on top of the demo data behaves
 * exactly as it would on a fresh day.
 */
export function buildDemoRecord(today: string): StreakRecord {
  const xpByDay: Record<string, number> = {};
  const lastIndex = DEMO_XP_BY_OFFSET.length - 1;

  DEMO_XP_BY_OFFSET.forEach((xp, i) => {
    if (xp <= 0) return;
    xpByDay[addDays(today, i - lastIndex)] = xp;
  });

  // A past best the current run hasn't beaten, so the trophy reads as a
  // record to chase rather than just mirroring the live streak.
  return { xpByDay, xpByDayKind: {}, longestStreak: 15 };
}
