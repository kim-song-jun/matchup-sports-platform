'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, GraduationCap, ShoppingBag, User, MessageCircle } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';

const navItems = [
  { href: '/home', icon: Home, label: '홈' },
  { href: '/matches', icon: Search, label: '매치' },
  { href: '/lessons', icon: GraduationCap, label: '강좌' },
  { href: '/marketplace', icon: ShoppingBag, label: '장터' },
  { href: '/profile', icon: User, label: '프로필' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const totalUnread = useChatStore((s) => s.getTotalUnreadCount());
  const isChatPage = pathname.startsWith('/chat');

  return (
    <>
      {/* Chat FAB */}
      {totalUnread > 0 && !isChatPage && (
        <Link
          href="/chat"
          aria-label="채팅"
          className="fixed bottom-24 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg active:scale-95 transition-transform"
        >
          <MessageCircle size={20} />
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
            {totalUnread}
          </span>
        </Link>
      )}

      <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-t border-gray-100 dark:border-gray-800 pb-[var(--safe-area-bottom)]">
        <div className="flex items-center justify-around px-2 pt-1.5 pb-1">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-3 py-1 transition-colors ${
                  isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-normal'}`}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
