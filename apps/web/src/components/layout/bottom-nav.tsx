'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, GraduationCap, ShoppingBag, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useChatStore } from '@/stores/chat-store';
import { useNotificationStore } from '@/stores/notification-store';

export function BottomNav() {
  const pathname = usePathname();
  const chatUnread = useChatStore((s) => s.getTotalUnreadCount());
  const notifUnread = useNotificationStore((s) => s.getUnreadCount());
  const totalUnread = chatUnread + notifUnread;
  const t = useTranslations('nav');

  const navItems = [
    { href: '/home', icon: Home, label: t('home') },
    { href: '/matches', icon: Search, label: t('matches') },
    { href: '/lessons', icon: GraduationCap, label: t('lessons') },
    { href: '/marketplace', icon: ShoppingBag, label: t('marketplace') },
    { href: '/profile', icon: User, label: t('profile') },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg shadow-[0_-1px_3px_rgba(0,0,0,0.04)] dark:shadow-[0_-1px_3px_rgba(0,0,0,0.2)] pb-[var(--safe-area-bottom)]">
      <div className="flex items-center justify-around px-2 pt-1.5 pb-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href);
          const isProfile = href === '/profile';
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0 min-w-[44px] min-h-[44px] px-3 py-1 transition-colors ${
                isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 1.8 : 1.5} />
                {isProfile && totalUnread > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold text-white animate-badge-pulse">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-normal">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
