import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectionHeaderProps {
  title: string;
  count?: number;
  href?: string;
  showMore?: boolean;
  moreLabel?: string;
  className?: string;
  action?: ReactNode;
}

export function SectionHeader({
  title,
  count,
  href,
  showMore = true,
  moreLabel = '더보기',
  className,
  action,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-3 flex items-center justify-between', className)}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">{title}</h2>
        {count !== undefined && count > 0 ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">{count}</span>
        ) : null}
      </div>
      {action
        ? action
        : showMore && href
          ? (
            <Link
              href={href}
              className="flex min-h-[44px] items-center text-sm font-medium text-blue-500 dark:text-blue-300 transition-colors hover:text-blue-600 dark:hover:text-blue-200"
            >
              {moreLabel}
              <ChevronRight size={14} className="ml-0.5" />
            </Link>
            )
          : null}
    </div>
  );
}
