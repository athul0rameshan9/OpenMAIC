'use client';

import { cn } from '@/lib/utils';
import { useStreakView } from '@/lib/hooks/use-study-streak';
import { GLOBAL_SCOPE } from '@/lib/store/study-streak';
import { StreakFlame } from './streak-flame';

interface StreakPillProps {
  scope?: string;
  className?: string;
  /** Show today's goal progress as a thin bar under the count. */
  showProgress?: boolean;
}

/**
 * Compact streak readout for dense chrome (stage header, toolbars).
 *
 * Renders nothing until the first XP is earned — an empty "0 day streak"
 * in the header is noise, and the homepage card is where a new student
 * finds out the system exists.
 */
export function StreakPill({
  scope = GLOBAL_SCOPE,
  className,
  showProgress = true,
}: StreakPillProps) {
  const { view, hydrated } = useStreakView(scope);

  if (!hydrated || (view.currentStreak === 0 && view.todayXp === 0)) return null;

  const title = view.goalMet
    ? `${view.currentStreak}-day streak · today's goal complete`
    : `${view.currentStreak}-day streak · ${view.goalXp - view.todayXp} XP left today`;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2 py-1',
        view.atRisk && 'border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20',
        className,
      )}
      title={title}
      aria-label={title}
    >
      <StreakFlame streak={view.currentStreak} atRisk={view.atRisk} size={14} />
      <div className="flex flex-col leading-none">
        <span className="text-xs font-semibold tabular-nums">{view.currentStreak}</span>
        {showProgress && (
          <span className="mt-0.5 block h-0.5 w-6 overflow-hidden rounded-full bg-border">
            <span
              className={cn(
                'block h-full rounded-full transition-all',
                view.goalMet ? 'bg-emerald-500' : 'bg-amber-500',
              )}
              style={{ width: `${Math.round(view.goalProgress * 100)}%` }}
            />
          </span>
        )}
      </div>
    </div>
  );
}
