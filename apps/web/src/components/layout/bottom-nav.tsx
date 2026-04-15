'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Users, ShoppingBag, LayoutGrid } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useChatUnreadTotal, useUnreadCount } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import { MoreMenu } from './more-menu';

const MORE_PATHS = [
  '/lessons', '/tournaments', '/venues', '/chat', '/notifications',
  '/badges', '/team-matches', '/mercenary', '/profile',
];

const CREATION_PATHS = ['/matches/new', '/teams/new', '/mercenary/new', '/lessons/new'];

export function BottomNav() {
  const pathname = usePathname();
  const chatUnread = useChatUnreadTotal();
  const { data: unreadData } = useUnreadCount();
  const notifUnread = unreadData?.count ?? 0;
  const totalUnread = chatUnread + notifUnread;
  const t = useTranslations('nav');
  const [showMore, setShowMore] = useState(false);

  if (CREATION_PATHS.includes(pathname)) return null;

  const navItems = [
    { href: '/home', icon: Home, label: t('home'), testId: 'bottom-nav-home' },
    { href: '/matches', icon: Search, label: t('matches'), testId: 'bottom-nav-matches' },
    { href: '/teams', icon: Users, label: t('teams'), testId: 'bottom-nav-teams' },
    { href: '/marketplace', icon: ShoppingBag, label: t('marketplace'), testId: 'bottom-nav-marketplace' },
  ];

  const isMoreActive = showMore || MORE_PATHS.some((p) => pathname.startsWith(p));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 @3xl:hidden flex justify-center px-4 pb-[max(var(--safe-area-bottom),0.5rem)]"
        data-testid="bottom-nav"
      >
        {/* Floating Apple-style frosted glass pill */}
        <div className="glass-mobile-nav w-full max-w-lg rounded-2xl">
          <div className="flex items-center justify-around px-1 py-1.5">
            {navItems.map(({ href, icon: Icon, label, testId }) => {
              const isActive = href === '/teams'
                ? pathname.startsWith('/teams')
                : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={testId}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Icon
                    size={21}
                    strokeWidth={isActive ? 2 : 1.5}
                    className={cn(
                      'transition-colors',
                      isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500',
                    )}
                  />
                  <span className={cn(
                    'text-xs font-medium leading-tight transition-colors',
                    isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500',
                  )}>
                    {label}
                  </span>
                </Link>
              );
            })}

            {/* More button */}
            <button
              type="button"
              data-testid="bottom-nav-more"
              aria-label={t('more')}
              aria-expanded={showMore}
              onClick={() => setShowMore((v) => !v)}
              className="flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="relative">
                <LayoutGrid
                  size={21}
                  strokeWidth={isMoreActive ? 2 : 1.5}
                  className={cn(
                    'transition-colors',
                    isMoreActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500',
                  )}
                />
                {totalUnread > 0 && (
                  <span
                    className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-2xs font-bold text-white"
                    aria-label={`읽지 않은 알림 ${totalUnread > 99 ? '99개 이상' : `${totalUnread}개`}`}
                  >
                    <span aria-hidden="true">{totalUnread > 99 ? '99+' : totalUnread}</span>
                  </span>
                )}
              </div>
              <span className={cn(
                'text-xs font-medium leading-tight transition-colors',
                isMoreActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500',
              )}>
                {t('more')}
              </span>
            </button>
          </div>
        </div>
      </nav>

      <MoreMenu isOpen={showMore} onClose={() => setShowMore(false)} />
    </>
  );
}
