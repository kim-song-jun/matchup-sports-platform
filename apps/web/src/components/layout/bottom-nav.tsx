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
      {/* Floating chat FAB — visible when there are unread messages and not on chat pages */}
      {totalUnread > 0 && !isChatPage && (
        <Link
          href="/chat"
          className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-[0_4px_20px_rgba(59,130,246,0.4)] hover:bg-blue-600 active:bg-blue-700 active:scale-95 transition-all duration-200"
        >
          <MessageCircle size={24} />
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-badge-pulse">
            {totalUnread}
          </span>
        </Link>
      )}

      <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 bg-white/95 dark:bg-gray-900 backdrop-blur-xl border-t border-gray-100 dark:border-gray-800 pb-[var(--safe-area-bottom)]">
        <div className="flex items-center justify-around px-2 pt-2 pb-1">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl min-w-[44px] min-h-[44px] px-3 py-1 transition-all duration-200 ${
                  isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 active:text-gray-600'
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.5} className="transition-transform duration-200" />
                <span className={`text-[10px] transition-all duration-200 ${isActive ? 'font-semibold' : 'font-normal'}`}>{label}</span>
                {isActive && <span className="absolute -bottom-0.5 h-[3px] w-4 rounded-full bg-blue-500 animate-scale-in" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
