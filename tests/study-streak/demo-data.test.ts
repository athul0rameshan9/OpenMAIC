import { describe, expect, it } from 'vitest';
import { buildDemoRecord } from '@/lib/study-streak/demo-data';
import { addDays, deriveView } from '@/lib/study-streak/engine';
import { DEFAULT_GOAL_XP } from '@/lib/study-streak/types';

const TODAY = '2026-08-05';
const view = () => deriveView(buildDemoRecord(TODAY), DEFAULT_GOAL_XP, TODAY);

describe('demo streak data', () => {
  it('shows a live 12-day streak', () => {
    expect(view().currentStreak).toBe(12);
  });

  it('leaves today unfinished so the goal ring and nudge are visible', () => {
    const v = view();
    expect(v.goalMet).toBe(false);
    expect(v.atRisk).toBe(true);
    expect(v.todayXp).toBe(18);
    expect(v.goalProgress).toBeCloseTo(18 / DEFAULT_GOAL_XP);
  });

  it('keeps a past best above the current run', () => {
    expect(view().longestStreak).toBe(15);
  });

  it('banks a freeze from the current run', () => {
    expect(view().freezes).toBe(1);
  });

  it('includes a frozen day earlier in the history', () => {
    const record = buildDemoRecord(TODAY);
    // The seeded gap 16 days back is bridged, not recorded as a zero day.
    expect(record.xpByDay[addDays(TODAY, -16)]).toBeUndefined();
  });

  it('exercises met, partial, and empty days in the week strip', () => {
    const week = view().week;
    expect(week.filter((d) => d.met)).toHaveLength(6);
    expect(week[6].isToday).toBe(true);
    expect(week[6].met).toBe(false);
  });

  it('lands mid-level with meaningful lifetime XP', () => {
    const level = view().level;
    expect(level.totalXp).toBeGreaterThan(800);
    expect(level.level).toBeGreaterThanOrEqual(4);
    expect(level.xpIntoLevel).toBeLessThan(level.xpForLevel);
  });

  it('has already passed the 7-day milestone and is chasing 14', () => {
    const v = view();
    expect(v.reachedMilestones).toEqual([3, 7]);
    expect(v.nextMilestone).toBe(14);
  });

  it('anchors to whatever day it is built for', () => {
    const other = '2026-01-15';
    expect(deriveView(buildDemoRecord(other), DEFAULT_GOAL_XP, other).currentStreak).toBe(12);
  });

  it('leaves today free of per-kind caps so real activity behaves normally', () => {
    expect(buildDemoRecord(TODAY).xpByDayKind).toEqual({});
  });
});
