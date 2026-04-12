import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MobilePageTopZoneProps {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  desktopClassName?: string;
  surface?: 'plain' | 'panel';
  testId?: string;
}

export function MobilePageTopZone({
  title,
  subtitle,
  eyebrow,
  action,
  children,
  className,
  desktopClassName,
  surface = 'plain',
  testId = 'mobile-page-top-zone',
}: MobilePageTopZoneProps) {
  return (
    <>
      <section data-testid={testId} className={cn('@3xl:hidden px-5 pt-4 pb-3', className)}>
        <div
          className={cn(
            surface === 'panel' && 'glass-mobile-panel rounded-[24px] px-4 py-4',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {eyebrow && (
                <div
                  className={cn(
                    'font-semibold uppercase',
                    surface === 'panel'
                      ? 'mb-3 inline-flex min-h-[32px] items-center rounded-full border border-white/40 bg-white/55 px-3 py-1 text-2xs text-blue-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-white/10 dark:bg-white/5 dark:text-blue-300'
                      : 'mb-1 text-[11px] tracking-[0.14em] text-gray-400 dark:text-gray-500',
                  )}
                >
                  {eyebrow}
                </div>
              )}
              <h1 className="text-[1.85rem] font-bold tracking-[-0.04em] text-gray-900 dark:text-white">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
          {children && <div className={cn(surface === 'panel' ? 'mt-4' : 'mt-3')}>{children}</div>}
        </div>
      </section>

      <div data-testid={testId} className={cn('mb-6 hidden items-start justify-between gap-4 @3xl:flex', desktopClassName)}>
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-2 text-xs font-semibold tracking-[0.14em] text-blue-500 uppercase">
              {eyebrow}
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-[-0.03em] text-gray-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </>
  );
}
