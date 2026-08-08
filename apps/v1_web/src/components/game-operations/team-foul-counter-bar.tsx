'use client';

import { AlertTriangle } from 'lucide-react';
import { TEAM_FOUL_WARNING_THRESHOLD } from '@/lib/team-foul-counter';
import type { GameSide } from '@/types/game-operations';

export function TeamFoulCounterBar({
  sides,
  counts,
  period,
}: {
  readonly sides: readonly GameSide[];
  readonly counts: Record<string, number>;
  readonly period: number;
}) {
  if (sides.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 px-4" role="group" aria-label={`${period}피리어드 팀 파울`}>
      {sides.map((side) => {
        const count = counts[side.id] ?? 0;
        const warning = count >= TEAM_FOUL_WARNING_THRESHOLD;
        return (
          <div
            key={side.id}
            className={
              warning
                ? 'flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-500/30 dark:bg-orange-500/10'
                : 'flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700'
            }
          >
            <span className="truncate text-2xs font-medium text-gray-600 dark:text-gray-300">{side.displayNameSnapshot}</span>
            <span className="flex items-center gap-1">
              {warning ? <AlertTriangle size={12} aria-hidden="true" className="text-orange-500" /> : null}
              <span
                className={
                  warning
                    ? 'text-sm font-bold tabular-nums text-orange-700 dark:text-orange-300'
                    : 'text-sm font-bold tabular-nums text-gray-900 dark:text-white'
                }
              >
                파울 {count}
              </span>
              {warning ? <span className="text-2xs font-semibold text-orange-700 dark:text-orange-300">· 다음부터 10m 프리킥</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
