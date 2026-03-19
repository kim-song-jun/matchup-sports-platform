'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, GraduationCap, ShoppingBag, User } from 'lucide-react';

const navItems = [
  { href: '/home', icon: Home, label: '홈' },
  { href: '/matches', icon: Search, label: '매치' },
  { href: '/lessons', icon: GraduationCap, label: '강좌' },
  { href: '/marketplace', icon: ShoppingBag, label: '장터' },
  { href: '/profile', icon: User, label: '프로필' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 bg-white/95 backdrop-blur-xl border-t border-gray-100 pb-[var(--safe-area-bottom)]">
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 transition-all duration-200 ${
                isActive ? 'text-blue-500' : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.5} />
              <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-normal'}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
