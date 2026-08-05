/**
 * Study streak — pure derivation.
 *
 * Every value the streak UI shows is computed here from a `StreakRecord`
 * (an XP-per-day ledger) plus the daily goal. No streak counter is ever
 * persisted, so the numbers can't drift out of sync with the history and
 * re-deriving after an import, a clock change, or a storage migration
 * always produces the same answer.
 */

import {
  DAILY_XP_CAP,
  DAYS_PER_FREEZE,
  HISTORY_DAYS,
  LEVEL_TITLES,
  MAX_FREEZES,
  MILESTONES,
  XP_BY_ACTIVITY,
  type ActivityKind,
  type Celebration,
  type LevelInfo,
  type StreakDay,
  type StreakRecord,
  type StreakView,
} from './types';

/* ── Day keys ─────────────────────────────────────────────────────────── */

/**
 * Local calendar day key, `YYYY-MM-DD`. Local — not UTC — because a streak
 * is about the student's day: studying at 11pm must count for that evening,
 * not tomorrow morning.
 */
export function dayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Shift a day key by `n` days (negative shifts backwards). */
export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const ms = parseDay(to).getTime() - parseDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Inclusive list of day keys ending at `end`, `count` long, oldest first. */
export function dayRange(end: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

/* ── Records ──────────────────────────────────────────────────────────── */

export function emptyRecord(): StreakRecord {
  return { xpByDay: {}, xpByDayKind: {}, longestStreak: 0 };
}

/**
 * Add XP for one activity, honouring that kind's daily cap.
 *
 * Returns a new record; the input is never mutated. `count` is the number of
 * occurrences (e.g. 4 correct answers in one quiz).
 */
export function recordActivity(
  record: StreakRecord,
  kind: ActivityKind,
  count: number,
  today: string,
): StreakRecord {
  const occurrences = Math.max(0, Math.floor(count));
  if (occurrences === 0) return record;

  const gross = XP_BY_ACTIVITY[kind] * occurrences;
  const cap = DAILY_XP_CAP[kind];
  const already = record.xpByDayKind[today]?.[kind] ?? 0;
  const granted = cap === undefined ? gross : Math.max(0, Math.min(gross, cap - already));
  if (granted === 0) return record;

  const next: StreakRecord = {
    xpByDay: { ...record.xpByDay, [today]: (record.xpByDay[today] ?? 0) + granted },
    xpByDayKind: {
      ...record.xpByDayKind,
      [today]: { ...record.xpByDayKind[today], [kind]: already + granted },
    },
    longestStreak: record.longestStreak,
  };
  return pruneHistory(next, today);
}

/** Drop days older than `HISTORY_DAYS` so storage stays bounded. */
export function pruneHistory(record: StreakRecord, today: string): StreakRecord {
  const cutoff = addDays(today, -HISTORY_DAYS);
  const keys = Object.keys(record.xpByDay);
  const stale = keys.filter((k) => k < cutoff);
  if (stale.length === 0) return record;

  const xpByDay = { ...record.xpByDay };
  const xpByDayKind = { ...record.xpByDayKind };
  for (const k of stale) {
    delete xpByDay[k];
    delete xpByDayKind[k];
  }
  return { ...record, xpByDay, xpByDayKind };
}

/**
 * Fold `longestStreak` forward. Call after recording so a personal best
 * survives history pruning.
 */
export function withLongest(record: StreakRecord, currentStreak: number): StreakRecord {
  if (currentStreak <= record.longestStreak) return record;
  return { ...record, longestStreak: currentStreak };
}

/* ── Streak walk ──────────────────────────────────────────────────────── */

interface WalkResult {
  streak: number;
  freezes: number;
  /** Days that were missed but bridged by a freeze. */
  frozenDays: Set<string>;
}

/**
 * Walk the ledger forward from the first recorded day to `today`.
 *
 * A day counts when its XP reaches the goal. Every `DAYS_PER_FREEZE` met days
 * bank a freeze (up to `MAX_FREEZES`); a missed day spends a freeze to keep
 * the run alive instead of resetting it.
 *
 * Today is special: an unfinished today does *not* break the run and does not
 * spend a freeze — the student still has hours left. That's what makes the
 * `atRisk` state meaningful rather than terminal.
 */
function walk(record: StreakRecord, today: string, goalXp: number): WalkResult {
  const days = Object.keys(record.xpByDay).sort();
  const frozenDays = new Set<string>();
  if (days.length === 0) return { streak: 0, freezes: 0, frozenDays };

  const start = days[0] > today ? today : days[0];
  let streak = 0;
  let freezes = 0;
  let metSinceFreeze = 0;

  for (let day = start; day <= today; day = addDays(day, 1)) {
    const met = (record.xpByDay[day] ?? 0) >= goalXp;

    if (met) {
      streak += 1;
      metSinceFreeze += 1;
      if (metSinceFreeze >= DAYS_PER_FREEZE) {
        metSinceFreeze = 0;
        freezes = Math.min(MAX_FREEZES, freezes + 1);
      }
      continue;
    }

    // Today isn't over yet — leave the run standing.
    if (day === today) break;

    if (freezes > 0 && streak > 0) {
      freezes -= 1;
      frozenDays.add(day);
      continue;
    }

    streak = 0;
    freezes = 0;
    metSinceFreeze = 0;
  }

  return { streak, freezes, frozenDays };
}

/* ── Levels ───────────────────────────────────────────────────────────── */

/** XP required to clear level `n` (1-based). Grows linearly: 100, 150, 200… */
export function xpForLevel(n: number): number {
  return 100 + (n - 1) * 50;
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return {
    level,
    title: LEVEL_TITLES[(level - 1) % LEVEL_TITLES.length],
    totalXp: Math.max(0, totalXp),
    xpIntoLevel: remaining,
    xpForLevel: xpForLevel(level),
  };
}

/* ── View ─────────────────────────────────────────────────────────────── */

export function totalXp(record: StreakRecord): number {
  let sum = 0;
  for (const xp of Object.values(record.xpByDay)) sum += xp;
  return sum;
}

/** Derive everything the streak UI renders. */
export function deriveView(record: StreakRecord, goalXp: number, today: string): StreakView {
  const { streak, freezes, frozenDays } = walk(record, today, goalXp);
  const todayXp = record.xpByDay[today] ?? 0;
  const goalMet = todayXp >= goalXp;

  const week: StreakDay[] = dayRange(today, 7).map((day) => {
    const xp = record.xpByDay[day] ?? 0;
    return {
      day,
      xp,
      met: xp >= goalXp,
      frozen: frozenDays.has(day),
      isToday: day === today,
      isFuture: day > today,
    };
  });

  return {
    currentStreak: streak,
    longestStreak: Math.max(record.longestStreak, streak),
    todayXp,
    goalXp,
    goalMet,
    goalProgress: goalXp <= 0 ? 1 : Math.min(1, todayXp / goalXp),
    freezes,
    atRisk: streak > 0 && !goalMet,
    week,
    level: levelFromXp(totalXp(record)),
    nextMilestone: MILESTONES.find((m) => m > streak) ?? null,
    reachedMilestones: MILESTONES.filter((m) => m <= streak),
  };
}

/* ── Celebrations ─────────────────────────────────────────────────────── */

/**
 * Compare two views and report what just happened worth a toast.
 *
 * Each celebration carries a stable `token` so the store can remember it was
 * already shown — a re-render, a second tab, or a page reload must not replay
 * the same confetti.
 */
export function detectCelebrations(
  before: StreakView,
  after: StreakView,
  today: string,
): Celebration[] {
  const out: Celebration[] = [];

  if (!before.goalMet && after.goalMet) {
    out.push({
      kind: 'goal',
      token: `goal:${today}`,
      streak: after.currentStreak,
      goalXp: after.goalXp,
    });
  }

  for (const m of after.reachedMilestones) {
    if (!before.reachedMilestones.includes(m)) {
      out.push({ kind: 'milestone', token: `milestone:${m}`, streak: m });
    }
  }

  if (after.level.level > before.level.level) {
    out.push({
      kind: 'level',
      token: `level:${after.level.level}`,
      level: after.level.level,
      title: after.level.title,
    });
  }

  return out;
}
