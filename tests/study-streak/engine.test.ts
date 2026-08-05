import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKey,
  dayRange,
  daysBetween,
  deriveView,
  detectCelebrations,
  emptyRecord,
  levelFromXp,
  pruneHistory,
  recordActivity,
  totalXp,
  withLongest,
} from '@/lib/study-streak/engine';
import { HISTORY_DAYS, XP_BY_ACTIVITY, type StreakRecord } from '@/lib/study-streak/types';

const GOAL = 30;
const TODAY = '2026-08-05';

/** Build a record whose listed days each hold `xp`. */
function recordWith(days: Record<string, number>, longestStreak = 0): StreakRecord {
  return { xpByDay: { ...days }, xpByDayKind: {}, longestStreak };
}

/** `n` consecutive met days ending on `end`. */
function metRun(end: string, n: number, xp = GOAL): Record<string, number> {
  const days: Record<string, number> = {};
  for (const day of dayRange(end, n)) days[day] = xp;
  return days;
}

describe('day keys', () => {
  it('formats the local calendar day', () => {
    expect(dayKey(new Date(2026, 7, 5, 23, 30).getTime())).toBe('2026-08-05');
  });

  it('keeps late-evening study on the same day', () => {
    const evening = new Date(2026, 7, 5, 23, 59).getTime();
    const morning = new Date(2026, 7, 5, 0, 1).getTime();
    expect(dayKey(evening)).toBe(dayKey(morning));
  });

  it('shifts across month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29'); // leap year
  });

  it('measures signed day distance', () => {
    expect(daysBetween('2026-08-01', '2026-08-05')).toBe(4);
    expect(daysBetween('2026-08-05', '2026-08-01')).toBe(-4);
  });

  it('builds an inclusive range ending at the given day', () => {
    expect(dayRange('2026-08-05', 3)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });
});

describe('recordActivity', () => {
  it('adds the activity XP for the day without mutating the input', () => {
    const before = emptyRecord();
    const after = recordActivity(before, 'quiz', 1, TODAY);
    expect(after.xpByDay[TODAY]).toBe(XP_BY_ACTIVITY.quiz);
    expect(before.xpByDay).toEqual({});
  });

  it('multiplies by occurrence count', () => {
    const after = recordActivity(emptyRecord(), 'correct_answer', 3, TODAY);
    expect(after.xpByDay[TODAY]).toBe(XP_BY_ACTIVITY.correct_answer * 3);
  });

  it('ignores zero and negative counts', () => {
    const before = emptyRecord();
    expect(recordActivity(before, 'quiz', 0, TODAY)).toBe(before);
    expect(recordActivity(before, 'quiz', -5, TODAY)).toBe(before);
  });

  it('caps a single kind per day so one action cannot carry the day', () => {
    let rec = emptyRecord();
    for (let i = 0; i < 40; i++) rec = recordActivity(rec, 'scene', 1, TODAY);
    expect(rec.xpByDay[TODAY]).toBe(20); // DAILY_XP_CAP.scene
  });

  it('returns the same record once a capped kind is exhausted', () => {
    let rec = emptyRecord();
    for (let i = 0; i < 10; i++) rec = recordActivity(rec, 'scene', 1, TODAY);
    expect(recordActivity(rec, 'scene', 1, TODAY)).toBe(rec);
  });

  it('lets uncapped kinds keep earning after a capped one is spent', () => {
    let rec = emptyRecord();
    for (let i = 0; i < 20; i++) rec = recordActivity(rec, 'scene', 1, TODAY);
    rec = recordActivity(rec, 'lesson', 1, TODAY);
    expect(rec.xpByDay[TODAY]).toBe(20 + XP_BY_ACTIVITY.lesson);
  });

  it('keeps each day in its own bucket', () => {
    let rec = recordActivity(emptyRecord(), 'quiz', 1, '2026-08-04');
    rec = recordActivity(rec, 'quiz', 1, TODAY);
    expect(rec.xpByDay['2026-08-04']).toBe(XP_BY_ACTIVITY.quiz);
    expect(rec.xpByDay[TODAY]).toBe(XP_BY_ACTIVITY.quiz);
  });
});

describe('pruneHistory', () => {
  it('drops days beyond the retention window', () => {
    const old = addDays(TODAY, -(HISTORY_DAYS + 5));
    const pruned = pruneHistory(recordWith({ [old]: 50, [TODAY]: 30 }), TODAY);
    expect(pruned.xpByDay[old]).toBeUndefined();
    expect(pruned.xpByDay[TODAY]).toBe(30);
  });

  it('is a no-op when nothing is stale', () => {
    const rec = recordWith({ [TODAY]: 30 });
    expect(pruneHistory(rec, TODAY)).toBe(rec);
  });
});

describe('streak derivation', () => {
  it('is zero with no history', () => {
    expect(deriveView(emptyRecord(), GOAL, TODAY).currentStreak).toBe(0);
  });

  it('counts consecutive met days ending today', () => {
    const view = deriveView(recordWith(metRun(TODAY, 4)), GOAL, TODAY);
    expect(view.currentStreak).toBe(4);
    expect(view.goalMet).toBe(true);
    expect(view.atRisk).toBe(false);
  });

  it('needs the full goal, not just some XP', () => {
    const view = deriveView(recordWith({ [TODAY]: GOAL - 1 }), GOAL, TODAY);
    expect(view.currentStreak).toBe(0);
    expect(view.goalMet).toBe(false);
    expect(view.goalProgress).toBeCloseTo((GOAL - 1) / GOAL);
  });

  it('keeps yesterday-ending streaks alive but flags them at risk', () => {
    const view = deriveView(recordWith(metRun(addDays(TODAY, -1), 3)), GOAL, TODAY);
    expect(view.currentStreak).toBe(3);
    expect(view.atRisk).toBe(true);
    expect(view.goalMet).toBe(false);
  });

  it('resets after a missed day with no freeze banked', () => {
    // Met 3 days, missed one, met today: only today counts.
    const days = { ...metRun(addDays(TODAY, -4), 3), [TODAY]: GOAL };
    expect(deriveView(recordWith(days), GOAL, TODAY).currentStreak).toBe(1);
  });

  it('banks a freeze every seven met days', () => {
    const view = deriveView(recordWith(metRun(TODAY, 7)), GOAL, TODAY);
    expect(view.currentStreak).toBe(7);
    expect(view.freezes).toBe(1);
  });

  it('caps banked freezes', () => {
    const view = deriveView(recordWith(metRun(TODAY, 60)), GOAL, TODAY);
    expect(view.freezes).toBe(2);
  });

  it('spends a banked freeze to bridge one missed day', () => {
    // 7 met days (banks a freeze), a gap, then 2 more met days.
    const days = {
      ...metRun(addDays(TODAY, -3), 7),
      ...metRun(TODAY, 2),
    };
    const view = deriveView(recordWith(days), GOAL, TODAY);
    expect(view.currentStreak).toBe(9);
    expect(view.freezes).toBe(0);
    expect(view.week.find((d) => d.day === addDays(TODAY, -2))?.frozen).toBe(true);
  });

  it('breaks once the freezes run out', () => {
    // One freeze from 7 days, then two separate gaps: the second one breaks it.
    const days = {
      ...metRun('2026-07-25', 7), // 07-19 … 07-25, banks 1 freeze
      '2026-07-27': GOAL, // 07-26 bridged by the freeze
      // 07-28 missed with nothing banked → reset
      [TODAY]: GOAL,
    };
    expect(deriveView(recordWith(days), GOAL, TODAY).currentStreak).toBe(1);
  });

  it('does not spend a freeze on an unfinished today', () => {
    const days = metRun(addDays(TODAY, -1), 7); // 7 met days, today untouched
    const view = deriveView(recordWith(days), GOAL, TODAY);
    expect(view.currentStreak).toBe(7);
    expect(view.freezes).toBe(1);
    expect(view.atRisk).toBe(true);
  });

  it('reports the longest streak ever, even after history is pruned', () => {
    const rec = withLongest(recordWith(metRun(TODAY, 2)), 2);
    const boasted = { ...rec, longestStreak: 41 };
    expect(deriveView(boasted, GOAL, TODAY).longestStreak).toBe(41);
  });

  it('prefers the running streak when it beats the stored record', () => {
    const view = deriveView(recordWith(metRun(TODAY, 12), 5), GOAL, TODAY);
    expect(view.longestStreak).toBe(12);
  });

  it('re-derives the same numbers from the same ledger', () => {
    const rec = recordWith(metRun(TODAY, 9));
    expect(deriveView(rec, GOAL, TODAY)).toEqual(deriveView(rec, GOAL, TODAY));
  });

  it('shrinks the streak when the goal is raised above past days', () => {
    const rec = recordWith(metRun(TODAY, 5, 30));
    expect(deriveView(rec, 60, TODAY).currentStreak).toBe(0);
  });
});

describe('week strip', () => {
  it('returns seven days, oldest first, ending today', () => {
    const week = deriveView(recordWith(metRun(TODAY, 3)), GOAL, TODAY).week;
    expect(week).toHaveLength(7);
    expect(week[0].day).toBe(addDays(TODAY, -6));
    expect(week[6].day).toBe(TODAY);
    expect(week[6].isToday).toBe(true);
    expect(week.filter((d) => d.met)).toHaveLength(3);
  });
});

describe('levels', () => {
  it('starts at level 1', () => {
    const level = levelFromXp(0);
    expect(level.level).toBe(1);
    expect(level.xpIntoLevel).toBe(0);
    expect(level.xpForLevel).toBe(100);
  });

  it('levels up once the requirement is cleared', () => {
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(249).level).toBe(2); // 100 + 150 = 250 clears level 2
    expect(levelFromXp(250).level).toBe(3);
  });

  it('reports progress inside the current level', () => {
    const level = levelFromXp(140);
    expect(level.level).toBe(2);
    expect(level.xpIntoLevel).toBe(40);
    expect(level.xpForLevel).toBe(150);
  });

  it('assigns a title and never runs out of them', () => {
    expect(levelFromXp(0).title).toBe('Curious');
    expect(levelFromXp(100_000).title).toBeTruthy();
  });

  it('treats negative XP as zero', () => {
    expect(levelFromXp(-50).level).toBe(1);
    expect(levelFromXp(-50).totalXp).toBe(0);
  });

  it('sums lifetime XP from the ledger', () => {
    expect(totalXp(recordWith({ a: 10, b: 25 }))).toBe(35);
  });
});

describe('milestones', () => {
  it('points at the next milestone above the streak', () => {
    expect(deriveView(recordWith(metRun(TODAY, 4)), GOAL, TODAY).nextMilestone).toBe(7);
  });

  it('lists the milestones already reached', () => {
    const view = deriveView(recordWith(metRun(TODAY, 30)), GOAL, TODAY);
    expect(view.reachedMilestones).toEqual([3, 7, 14, 30]);
  });

  it('has nothing left past the final milestone', () => {
    expect(deriveView(recordWith(metRun(TODAY, 400)), GOAL, TODAY).nextMilestone).toBeNull();
  });
});

describe('detectCelebrations', () => {
  const view = (days: Record<string, number>) => deriveView(recordWith(days), GOAL, TODAY);

  it('fires when today crosses the goal', () => {
    const events = detectCelebrations(view({ [TODAY]: GOAL - 5 }), view({ [TODAY]: GOAL }), TODAY);
    expect(events.map((e) => e.kind)).toContain('goal');
    expect(events.find((e) => e.kind === 'goal')?.token).toBe(`goal:${TODAY}`);
  });

  it('does not re-fire once the goal is already met', () => {
    const events = detectCelebrations(view({ [TODAY]: GOAL }), view({ [TODAY]: GOAL + 20 }), TODAY);
    expect(events.some((e) => e.kind === 'goal')).toBe(false);
  });

  it('fires for a newly reached milestone', () => {
    const events = detectCelebrations(
      view(metRun(addDays(TODAY, -1), 6)),
      view(metRun(TODAY, 7)),
      TODAY,
    );
    const milestone = events.find((e) => e.kind === 'milestone');
    expect(milestone).toMatchObject({ streak: 7, token: 'milestone:7' });
  });

  it('fires on level up', () => {
    const events = detectCelebrations(view({ [TODAY]: 90 }), view({ [TODAY]: 110 }), TODAY);
    expect(events.find((e) => e.kind === 'level')).toMatchObject({ level: 2, token: 'level:2' });
  });

  it('reports nothing when nothing changed', () => {
    const same = view({ [TODAY]: 10 });
    expect(detectCelebrations(same, same, TODAY)).toEqual([]);
  });
});
