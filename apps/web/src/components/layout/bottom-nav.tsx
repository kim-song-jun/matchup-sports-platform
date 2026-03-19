'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, ShoppingBag, Bell, User } from 'lucide-react';

const navItems = [
  { href: '/home', icon: Home, label: '홈' },
  { href: '/matches', icon: Search, label: '매치' },
  { href: '/marketplace', icon: ShoppingBag, label: '장터' },
  { href: '/notifications', icon: Bell, label: '알림' },
  { href: '/profile', icon: User, label: '프로필' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 border-t border-border bg-white pb-[var(--safe-area-bottom)]">
      <div className="flex items-center justify-around py-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors ${
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-text-secondary'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
