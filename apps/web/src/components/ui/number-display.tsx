import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export type NumberDisplaySize = 'sm' | 'md' | 'lg' | 'xl' | 'display';
export type NumberDisplayTone = 'default' | 'positive' | 'negative' | 'muted';
export type NumberDisplayFormat = 'money' | 'integer' | 'percent' | 'decimal';

export interface NumberDisplayProps {
  value: number;
  unit?: string;
  sub?: string;
  size?: NumberDisplaySize;
  tone?: NumberDisplayTone;
  format?: NumberDisplayFormat;
  align?: 'left' | 'center' | 'right';
  loading?: boolean;
  ariaLabel?: string;
  className?: string;
}

const sizeClasses: Record<NumberDisplaySize, string> = {
  sm: 'text-md font-semibold',
  md: 'text-xl font-bold',
  lg: 'text-3xl font-bold',
  xl: 'text-4xl font-extrabold',
  display: 'text-5xl font-extrabold',
};

const toneClasses: Record<NumberDisplayTone, string> = {
  default: 'text-gray-900 dark:text-white',
  positive: 'text-success dark:text-green-400',
  negative: 'text-error dark:text-red-400',
  muted: 'text-gray-600 dark:text-gray-400',
};

const alignClasses: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function formatValue(value: number, format: NumberDisplayFormat): string {
  switch (format) {
    case 'money':
      return formatCurrency(value);
    case 'percent':
      return value.toFixed(1) + '%';
    case 'decimal':
      return value.toFixed(2);
    case 'integer':
    default:
      return value.toLocaleString('ko-KR');
  }
}

export function NumberDisplay({
  value,
  unit,
  sub,
  size = 'md',
  tone = 'default',
  format = 'integer',
  align = 'left',
  loading = false,
  ariaLabel,
  className,
}: NumberDisplayProps) {
  const computedAriaLabel = ariaLabel ?? `${value}${unit ?? ''}`;

  if (loading) {
    const skeletonWidths: Record<NumberDisplaySize, string> = {
      sm: 'h-5 w-16',
      md: 'h-6 w-20',
      lg: 'h-8 w-28',
      xl: 'h-10 w-32',
      display: 'h-12 w-40',
    };
    return (
      <div className={cn('flex flex-col gap-1', alignClasses[align], className)}>
        <Skeleton className={skeletonWidths[size]} />
        {sub && <Skeleton className="h-4 w-12" />}
      </div>
    );
  }

  return (
    <div
      className={cn('flex flex-col', alignClasses[align], className)}
      aria-label={computedAriaLabel}
    >
      <span
        className={cn(
          'tabular-nums',
          sizeClasses[size],
          toneClasses[tone],
        )}
      >
        {formatValue(value, format)}
        {unit && (
          <span className="ml-0.5">{unit}</span>
        )}
      </span>
      {sub && (
        <span className="text-sm text-gray-500 dark:text-gray-400">{sub}</span>
      )}
    </div>
  );
}
