'use client';

interface WeekBar {
  weekStart: string;
  total: number;
}

interface WeeklyPayoutBarsProps {
  /** Up to 4 weekly buckets, ascending order (oldest first) */
  weeks: WeekBar[];
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}/${day}`;
}

function formatKoreanAmount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만원`;
  return `${n.toLocaleString('ko-KR')}원`;
}

/**
 * Tailwind CSS inline bar chart for weekly payout totals (max 4 weeks).
 * No external chart library — bars are width-percent relative to max total.
 * Each bar has an aria-label for screen readers.
 */
export function WeeklyPayoutBars({ weeks }: WeeklyPayoutBarsProps) {
  const capped = weeks.slice(-4);
  const maxTotal = Math.max(...capped.map((w) => w.total), 1);

  if (capped.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 py-4">지급 데이터가 없어요</p>
    );
  }

  return (
    <div className="space-y-3" role="list" aria-label="주간 지급 합계">
      {capped.map((week, idx) => {
        const pct = Math.max((week.total / maxTotal) * 100, 2);
        const weekLabel = formatWeekLabel(week.weekStart);
        const amountLabel = formatKoreanAmount(week.total);
        const weekNumber = idx + 1;

        return (
          <div
            key={week.weekStart}
            role="listitem"
            className="flex items-center gap-3"
            aria-label={`W${weekNumber} (${weekLabel}~): ${amountLabel}`}
          >
            {/* Week label */}
            <span className="w-10 shrink-0 text-xs text-gray-500 dark:text-gray-400 text-right tabular-nums">
              {weekLabel}~
            </span>

            {/* Bar track */}
            <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-[40px] overflow-hidden relative">
              <div
                className="bg-blue-500 h-full rounded-full transition-transform"
                style={{ width: `${pct}%` }}
                aria-hidden="true"
              />
            </div>

            {/* Amount label */}
            <span className="w-20 shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums text-right">
              {amountLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
