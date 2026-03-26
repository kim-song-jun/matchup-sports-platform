'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Search, GraduationCap, ShoppingBag, User, LogOut, Plus, ShieldCheck, Users, Swords, MessageCircle, Building2, Bell } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';

const navItems = [
  { href: '/home', icon: Home, label: '홈' },
  { href: '/matches', icon: Search, label: '매치 찾기' },
  { href: '/team-matches', icon: Swords, label: '팀 매칭' },
  { href: '/lessons', icon: GraduationCap, label: '강좌' },
  { href: '/marketplace', icon: ShoppingBag, label: '장터' },
  { href: '/teams', icon: Users, label: '팀·클럽' },
  { href: '/chat', icon: MessageCircle, label: '채팅' },
  { href: '/venues', icon: Building2, label: '시설' },
  { href: '/notifications', icon: Bell, label: '알림' },
  { href: '/profile', icon: User, label: '마이페이지' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const totalUnread = useChatStore((s) => s.getTotalUnreadCount());

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-dvh w-[240px] flex-col border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
      {/* Logo */}
      <div className="px-5 pt-7 pb-5">
        <Link href="/home">
          <h1 className="text-[20px] font-bold tracking-tight text-gray-900 dark:text-white">TeamMeet</h1>
        </Link>
      </div>

      {/* CTA */}
      <div className="px-4 mb-3">
        <Link href="/matches/new"
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-500 px-4 py-3 text-[14px] font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors">
          <Plus size={16} strokeWidth={2.5} />
          매치 만들기
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname.startsWith(href);
            const badge = href === '/chat' ? totalUnread : 0;
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500'
                    : 'text-gray-500 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}>
                <div className="relative">
                  <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </div>
                {label}
              </Link>
            );
          })}
        </div>

        {/* Admin */}
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
          <Link href="/admin/dashboard"
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
              pathname.startsWith('/admin')
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}>
            <ShieldCheck size={16} strokeWidth={pathname.startsWith('/admin') ? 2 : 1.5} />
            Admin
          </Link>
        </div>
      </nav>

      {/* User */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4">
        {isAuthenticated && user ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-[13px] font-bold text-gray-600 dark:text-gray-300">
                {user.nickname?.charAt(0)}
              </div>
              <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate">{user.nickname}</p>
            </div>
            <button onClick={() => { logout(); router.push('/login'); }}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" aria-label="로그아웃">
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <Link href="/login" className="flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 py-2.5 text-[13px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            로그인
          </Link>
        )}
      </div>
    </aside>
  );
}
