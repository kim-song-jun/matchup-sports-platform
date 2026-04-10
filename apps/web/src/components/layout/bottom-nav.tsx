'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Users, ShoppingBag, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useChatUnreadTotal, useUnreadCount } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();
  const chatUnread = useChatUnreadTotal();
  const { data: unreadData } = useUnreadCount();
  const notifUnread = unreadData?.count ?? 0;
  const totalUnread = chatUnread + notifUnread;
  const t = useTranslations('nav');

  const navItems = [
    { href: '/home', icon: Home, label: t('home'), testId: 'bottom-nav-home' },
    { href: '/matches', icon: Search, label: t('matches'), testId: 'bottom-nav-matches' },
    { href: '/teams', icon: Users, label: t('teams'), testId: 'bottom-nav-teams' },
    { href: '/marketplace', icon: ShoppingBag, label: t('marketplace'), testId: 'bottom-nav-marketplace' },
    { href: '/profile', icon: User, label: t('profile'), testId: 'bottom-nav-profile' },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[calc(var(--safe-area-bottom)+0.75rem)]"
      data-testid="bottom-nav"
    >
      <div className="floating-bottom-nav flex w-full max-w-xl items-center justify-between rounded-[28px] px-2 py-2">
        {navItems.map(({ href, icon: Icon, label, testId }) => {
          const isActive = href === '/teams'
            ? pathname.startsWith('/teams') || pathname.startsWith('/team-matches') || pathname.startsWith('/mercenary')
            : pathname.startsWith(href);
          const isProfile = href === '/profile';
          return (
            <Link
              key={href}
              href={href}
              data-testid={testId}
              className={cn(
                'bottom-nav-link flex min-h-[56px] min-w-[60px] flex-1 flex-col items-center justify-center gap-1 rounded-[22px] px-3 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                isActive ? 'is-active text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400',
              )}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 1.9 : 1.6} />
                {isProfile && totalUnread > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold text-white animate-badge-pulse">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
              <span className={cn('text-2xs font-semibold tracking-[0.01em]', isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400')}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
