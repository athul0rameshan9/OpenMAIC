'use client';

import { Flame, Snowflake } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Streak tiers. The flame gets hotter as the streak grows — the visual
 * payoff for a long run is the reason to protect it.
 */
interface Tier {
  min: number;
  color: string;
  glow: string;
}

const TIERS: Tier[] = [
  { min: 0, color: 'text-muted-foreground', glow: 'transparent' },
  { min: 1, color: 'text-amber-500', glow: 'rgba(245,158,11,0.35)' },
  { min: 7, color: 'text-orange-500', glow: 'rgba(249,115,22,0.40)' },
  { min: 30, color: 'text-rose-500', glow: 'rgba(244,63,94,0.42)' },
  { min: 100, color: 'text-violet-500', glow: 'rgba(139,92,246,0.45)' },
];

export function streakTier(streak: number): Tier {
  let tier = TIERS[0];
  for (const t of TIERS) if (streak >= t.min) tier = t;
  return tier;
}

interface StreakFlameProps {
  streak: number;
  /** Today's goal isn't met yet — the flame idles cool instead of burning. */
  atRisk?: boolean;
  /** Icon size in px. */
  size?: number;
  /** Render a snowflake instead: the day was saved by a freeze. */
  frozen?: boolean;
  className?: string;
}

/** The flame itself, sized for wherever it's embedded. */
export function StreakFlame({
  streak,
  atRisk = false,
  size = 16,
  frozen = false,
  className,
}: StreakFlameProps) {
  const reduceMotion = useReducedMotion();
  const tier = streakTier(streak);
  const lit = streak > 0 && !atRisk;

  if (frozen) {
    return (
      <Snowflake className={cn('text-sky-400', className)} style={{ width: size, height: size }} />
    );
  }

  return (
    <motion.span
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      animate={
        lit && !reduceMotion
          ? {
              scale: [1, 1.12, 1],
              filter: [
                `drop-shadow(0 0 0px ${tier.glow})`,
                `drop-shadow(0 0 6px ${tier.glow})`,
                `drop-shadow(0 0 0px ${tier.glow})`,
              ],
            }
          : undefined
      }
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <Flame
        className={cn(
          lit ? tier.color : 'text-muted-foreground/60',
          atRisk && streak > 0 && 'text-amber-400/70',
        )}
        style={{ width: size, height: size }}
        strokeWidth={2.2}
        {...(lit ? { fill: 'currentColor', fillOpacity: 0.18 } : {})}
      />
    </motion.span>
  );
}
