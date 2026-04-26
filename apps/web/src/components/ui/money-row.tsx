import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';

export type MoneyRowTone = 'default' | 'strong' | 'muted' | 'positive' | 'negative';

export interface MoneyRowProps {
  label: string;
  amount: number;
  unit?: string;
  description?: string;
  strong?: boolean;
  tone?: MoneyRowTone;
  rightSlot?: ReactNode;
  format?: 'money' | 'integer';
  className?: string;
}

const labelToneClasses: Record<MoneyRowTone, string> = {
  default: 'text-gray-700 dark:text-gray-300',
  strong: 'text-gray-900 font-semibold dark:text-white',
  muted: 'text-gray-500',
  positive: 'text-gray-700',
  negative: 'text-gray-700',
};

const amountToneClasses: Record<MoneyRowTone, string> = {
  default: 'text-gray-900 dark:text-white',
  strong: 'text-gray-900 font-bold dark:text-white',
  muted: 'text-gray-500',
  positive: 'text-success dark:text-green-400',
  negative: 'text-error dark:text-red-400',
};

function formatValue(amount: number, format: 'money' | 'integer'): string {
  if (format === 'money') {
    return formatCurrency(amount);
  }
  return amount.toLocaleString('ko-KR');
}

export function MoneyRow({
  label,
  amount,
  unit = '원',
  description,
  strong = false,
  tone = 'default',
  rightSlot,
  format = 'money',
  className,
}: MoneyRowProps) {
  const resolvedTone: MoneyRowTone = strong ? 'strong' : tone;
  const formattedAmount = formatValue(amount, format);
  // unit is already embedded in formatCurrency output for 'money' format,
  // so we skip the separate unit span to avoid duplication
  const showSeparateUnit = format === 'integer';

  return (
    <div
      className={cn(
        'flex items-baseline justify-between min-h-[44px] py-2',
        className,
      )}
      aria-label={`${label} ${amount}${unit}`}
    >
      {/* Left: label + optional description */}
      <div className="flex flex-col">
        <span
          className={cn(
            'text-md',
            labelToneClasses[resolvedTone],
          )}
        >
          {label}
        </span>
        {description && (
          <span className="text-xs text-gray-500">{description}</span>
        )}
      </div>

      {/* Right: amount + unit + optional rightSlot */}
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            'tabular-nums',
            strong ? 'text-xl font-bold' : 'text-md',
            amountToneClasses[resolvedTone],
          )}
        >
          {formattedAmount}
        </span>
        {showSeparateUnit && (
          <span className="text-xs text-gray-500">{unit}</span>
        )}
        {rightSlot}
      </div>
    </div>
  );
}
