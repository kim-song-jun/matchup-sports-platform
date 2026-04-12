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
      className="fixed inset-x-0 bottom-0 z-50 @3xl:hidden"
      data-testid="bottom-nav"
    >
      {/* Apple-style frosted glass bar — full width, translucent, blur */}
      <div className="glass-mobile-nav pb-[var(--safe-area-bottom)]">
        <div className="flex items-center justify-around px-2 pt-2 pb-1.5">
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
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                className="flex min-h-[44px] min-w-[48px] flex-1 flex-col items-center justify-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="relative">
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2 : 1.5}
                    className={cn(
                      'transition-colors',
                      isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500',
                    )}
                  />
                  {isProfile && totalUnread > 0 && (
                    <span
                      className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white"
                      aria-label={`읽지 않은 알림 ${totalUnread > 99 ? '99개 이상' : `${totalUnread}개`}`}
                    >
                      <span aria-hidden="true">{totalUnread > 99 ? '99+' : totalUnread}</span>
                    </span>
                  )}
                </div>
                <span className={cn(
                  'text-[10px] font-medium leading-tight transition-colors',
                  isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500',
                )}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
