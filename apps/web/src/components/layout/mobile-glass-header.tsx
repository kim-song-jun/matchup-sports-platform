'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileGlassHeaderProps {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  sticky?: boolean;
  compact?: boolean;
  testId?: string;
}

export function MobileGlassHeader({
  children,
  className,
  title,
  subtitle,
  showBack = false,
  onBack,
  actions,
  sticky = true,
  compact = false,
  testId = 'mobile-glass-header',
}: MobileGlassHeaderProps) {
  const router = useRouter();

  if (title) {
    return (
      <header
        data-testid={testId}
        className={cn(
          '@3xl:hidden glass-mobile-header z-20',
          sticky ? 'sticky top-0' : 'relative',
          className,
        )}
      >
        <div className={cn('flex items-center gap-3 px-5', compact ? 'py-3' : 'py-3.5')}>
          {showBack && (
            <button
              type="button"
              aria-label="뒤로 가기"
              onClick={onBack ?? (() => router.back())}
              className="flex min-h-[44px] min-w-11 items-center justify-center rounded-xl border border-gray-200/80 bg-white/78 text-gray-700 shadow-sm transition-colors hover:bg-white dark:border-white/10 dark:bg-gray-800/82 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <ArrowLeft size={19} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">
              {title}
            </div>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>
    );
  }

  return (
    <header
      data-testid={testId}
      className={cn(
        '@3xl:hidden glass-mobile-header z-10 flex items-center px-5 py-3',
        sticky ? 'sticky top-0' : 'relative',
        className,
      )}
    >
      {children}
    </header>
  );
}
