'use client';

import { useState } from 'react';
import { Check, Settings2, Snowflake, Target, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useStreakView } from '@/lib/hooks/use-study-streak';
import { GLOBAL_SCOPE, useStudyStreakStore } from '@/lib/store/study-streak';
import { GOAL_PRESETS } from '@/lib/study-streak/types';
import { StreakFlame, streakTier } from './streak-flame';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function weekdayInitial(dayIso: string): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  return WEEKDAY_INITIALS[new Date(y, m - 1, d).getDay()];
}

/** Goal ring: an SVG donut filled to today's progress. */
function GoalRing({ progress, met, streak }: { progress: number; met: boolean; streak: number }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={met ? 'stroke-emerald-500' : 'stroke-amber-500'}
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <StreakFlame streak={streak} atRisk={!met} size={20} />
      </div>
    </div>
  );
}

interface StreakCardProps {
  /** Which ledger to show: `GLOBAL_SCOPE`, or a course id for one course. */
  scope?: string;
  /** Heading above the streak. Defaults to the scope's course name. */
  title?: string;
  className?: string;
}

/**
 * The full streak panel: flame + day count, today's goal ring, the trailing
 * week, level progress, and banked freezes. Built for the homepage sidebar
 * and the classroom-complete screen.
 */
export function StreakCard({ scope = GLOBAL_SCOPE, title, className }: StreakCardProps) {
  const { view, hydrated } = useStreakView(scope);
  const courseName = useStudyStreakStore((s) =>
    scope === GLOBAL_SCOPE ? null : s.courseNames[scope],
  );
  const setGoalXp = useStudyStreakStore((s) => s.setGoalXp);
  const [editingGoal, setEditingGoal] = useState(false);

  const heading = title ?? courseName ?? 'Study streak';

  if (!hydrated) {
    return (
      <div
        className={cn(
          'h-[168px] animate-pulse rounded-xl border border-border bg-muted/40',
          className,
        )}
      />
    );
  }

  const tier = streakTier(view.currentStreak);
  const started = view.currentStreak > 0 || view.todayXp > 0 || view.level.totalXp > 0;

  return (
    <div className={cn('rounded-xl border border-border bg-card p-3.5 shadow-sm', className)}>
      {/* Heading + goal editor toggle */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {heading}
        </span>
        <button
          type="button"
          onClick={() => setEditingGoal((v) => !v)}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Change daily goal"
          aria-label="Change daily goal"
          aria-expanded={editingGoal}
        >
          <Settings2 className="size-3.5" />
        </button>
      </div>

      {/* Streak + today's goal */}
      <div className="flex items-center gap-3.5">
        <GoalRing progress={view.goalProgress} met={view.goalMet} streak={view.currentStreak} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-2xl font-bold leading-none tabular-nums', tier.color)}>
              {view.currentStreak}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {view.currentStreak === 1 ? 'day' : 'days'} in a row
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {!started
              ? 'Open a textbook to light your first flame.'
              : view.goalMet
                ? `Goal done — ${view.todayXp} XP today. Come back tomorrow to keep it going.`
                : `${view.goalXp - view.todayXp} XP to go today (${view.todayXp}/${view.goalXp}).`}
          </p>
        </div>
      </div>

      {/* Goal presets */}
      {editingGoal && (
        <div className="mt-3 flex gap-1.5">
          {GOAL_PRESETS.map((preset) => (
            <button
              key={preset.xp}
              type="button"
              onClick={() => {
                setGoalXp(preset.xp);
                setEditingGoal(false);
              }}
              className={cn(
                'flex-1 rounded-lg border px-2 py-1.5 text-left transition-colors',
                view.goalXp === preset.xp
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-border hover:bg-muted',
              )}
              title={preset.hint}
            >
              <span className="block text-[11px] font-semibold">{preset.label}</span>
              <span className="block text-[10px] text-muted-foreground">{preset.xp} XP</span>
            </button>
          ))}
        </div>
      )}

      {/* Trailing week */}
      <div className="mt-3.5 flex items-end justify-between gap-1">
        {view.week.map((day) => (
          <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={cn(
                'flex size-6 items-center justify-center rounded-md border text-[9px] font-semibold transition-colors',
                day.met
                  ? 'border-transparent bg-emerald-500 text-white'
                  : day.frozen
                    ? 'border-sky-300 bg-sky-50 text-sky-500 dark:bg-sky-950/40'
                    : day.isToday
                      ? 'border-amber-400 border-dashed bg-amber-50 text-amber-600 dark:bg-amber-950/30'
                      : 'border-border bg-muted/40 text-muted-foreground/60',
              )}
              title={`${day.day} · ${day.xp} XP`}
            >
              {day.met ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : day.frozen ? (
                <Snowflake className="size-3" />
              ) : (
                Math.min(99, day.xp) || ''
              )}
            </div>
            <span
              className={cn(
                'text-[9px]',
                day.isToday ? 'font-bold text-foreground' : 'text-muted-foreground',
              )}
            >
              {weekdayInitial(day.day)}
            </span>
          </div>
        ))}
      </div>

      {/* Level + records */}
      <div className="mt-3.5 border-t border-border pt-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="font-semibold">
            Lv {view.level.level} ·{' '}
            <span className="text-muted-foreground">{view.level.title}</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {view.level.xpIntoLevel}/{view.level.xpForLevel} XP
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
            initial={false}
            animate={{ width: `${(view.level.xpIntoLevel / view.level.xpForLevel) * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>

        <div className="mt-2.5 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1" title="Longest streak">
            <Trophy className="size-3 text-amber-500" />
            <span className="tabular-nums">{view.longestStreak}d best</span>
          </span>
          {view.nextMilestone !== null && (
            <span className="flex items-center gap-1" title="Next milestone">
              <Target className="size-3 text-violet-500" />
              <span className="tabular-nums">
                {view.nextMilestone - view.currentStreak}d to {view.nextMilestone}
              </span>
            </span>
          )}
          {view.freezes > 0 && (
            <span
              className="flex items-center gap-1"
              title={`${view.freezes} streak freeze${view.freezes > 1 ? 's' : ''} banked — each covers one missed day`}
            >
              <Snowflake className="size-3 text-sky-400" />
              <span className="tabular-nums">{view.freezes}</span>
            </span>
          )}
        </div>
      </div>

      {/* At-risk nudge */}
      {view.atRisk && (
        <p className="mt-2.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          {view.freezes > 0
            ? `Your ${view.currentStreak}-day streak needs ${view.goalXp - view.todayXp} more XP — a freeze can cover today, but not twice.`
            : `Your ${view.currentStreak}-day streak ends tonight unless you hit today's goal.`}
        </p>
      )}
    </div>
  );
}
