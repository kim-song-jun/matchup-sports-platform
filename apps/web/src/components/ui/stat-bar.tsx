import { cn } from '@/lib/utils';

export type StatBarTone = 'default' | 'positive' | 'warning' | 'danger';
export type StatBarOrientation = 'horizontal' | 'vertical';

export interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  sub?: string;
  tone?: StatBarTone;
  orientation?: StatBarOrientation;
  showValue?: boolean;
  unit?: string;
  ariaLabel?: string;
  className?: string;
}

const fillClasses: Record<StatBarTone, string> = {
  default: 'bg-blue-500',
  positive: 'bg-success dark:bg-green-500',
  warning: 'bg-warning dark:bg-orange-500',
  danger: 'bg-error dark:bg-red-500',
};

export function StatBar({
  label,
  value,
  max = 100,
  sub,
  tone = 'default',
  orientation = 'horizontal',
  showValue = true,
  unit,
  ariaLabel,
  className,
}: StatBarProps) {
  const safeMax = max > 0 ? max : 100;
  const clampedValue = Math.min(Math.max(value, 0), safeMax);
  const percent = (clampedValue / safeMax) * 100;

  const computedAriaLabel =
    ariaLabel ?? `${label}: ${value}${unit ?? ''} / ${safeMax}${unit ?? ''}`;

  const valueDisplay = unit
    ? `${value}${unit} / ${safeMax}${unit}`
    : `${value} / ${safeMax}`;

  if (orientation === 'vertical') {
    return (
      <div className={cn('flex flex-col items-center gap-1', className)}>
        {showValue && (
          <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
            {valueDisplay}
          </span>
        )}
        <div
          role="progressbar"
          aria-label={computedAriaLabel}
          aria-valuemin={0}
          aria-valuemax={safeMax}
          aria-valuenow={clampedValue}
          className="w-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex-1 min-h-[40px]"
        >
          <div
            className={cn(
              'w-full rounded-full transition-[height] duration-300 ease-out',
              fillClasses[tone],
            )}
            style={{ height: `${percent}%` }}
          />
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        {sub && (
          <span className="text-xs text-gray-400 dark:text-gray-500">{sub}</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>
        {showValue && (
          <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
            {valueDisplay}
          </span>
        )}
      </div>

      <div
        role="progressbar"
        aria-label={computedAriaLabel}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clampedValue}
        className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-out',
            fillClasses[tone],
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {sub && (
        <span className="text-xs text-gray-500 dark:text-gray-400">{sub}</span>
      )}
    </div>
  );
}
