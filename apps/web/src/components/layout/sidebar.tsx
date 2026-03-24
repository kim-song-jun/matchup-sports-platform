'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Search, GraduationCap, ShoppingBag, User, LogOut, Plus, ShieldCheck, Bell, Users, Building2, Swords, MessageCircle, UserPlus, Award } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';

const navItems = [
  { href: '/home', icon: Home, label: '홈' },
  { href: '/matches', icon: Search, label: '매치 찾기' },
  { href: '/team-matches', icon: Swords, label: '팀 매칭' },
  { href: '/chat', icon: MessageCircle, label: '채팅' },
  { href: '/lessons', icon: GraduationCap, label: '강좌' },
  { href: '/marketplace', icon: ShoppingBag, label: '장터' },
  { href: '/teams', icon: Users, label: '팀·클럽' },
  { href: '/mercenary', icon: UserPlus, label: '용병' },
  { href: '/venues', icon: Building2, label: '시설' },
  { href: '/notifications', icon: Bell, label: '알림' },
  { href: '/badges', icon: Award, label: '뱃지' },
  { href: '/profile', icon: User, label: '마이페이지' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const totalUnread = useChatStore((s) => s.getTotalUnreadCount());

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-dvh w-[260px] flex-col border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
      {/* Logo */}
      <div className="px-6 pt-8 pb-4">
        <Link href="/home">
          <h1 className="text-[20px] font-bold tracking-tight text-gray-900 dark:text-white">MatchUp</h1>
        </Link>
        <p className="text-[11px] text-gray-400 mt-0.5">AI 스포츠 매칭 플랫폼</p>
      </div>

      {/* CTA */}
      <div className="px-4 mb-2">
        <Link href="/matches/new"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-[14px] font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors">
          <Plus size={18} strokeWidth={2.5} />
          매치 만들기
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-2">
        <div className="space-y-0.5">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname.startsWith(href);
            const showBadge = href === '/chat' && totalUnread > 0;
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-medium transition-all ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}>
                <div className="relative">
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white animate-badge-pulse">
                      {totalUnread}
                    </span>
                  )}
                </div>
                {label}
              </Link>
            );
          })}
        </div>

        {/* Admin */}
        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
          <p className="px-4 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">관리</p>
          <Link href="/admin/dashboard"
            className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-all">
            <ShieldCheck size={18} />
            Admin
          </Link>
        </div>
      </nav>

      {/* User area */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4">
        {isAuthenticated && user ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-500">
                {user.nickname?.charAt(0)}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{user.nickname}</p>
                <p className="text-[11px] text-gray-400">매너 {user.mannerScore?.toFixed(1)}</p>
              </div>
            </div>
            <button onClick={() => { logout(); router.push('/login'); }}
              className="flex items-center justify-center h-[44px] w-[44px] rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors" aria-label="로그아웃" title="로그아웃">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <Link href="/login" className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            로그인
          </Link>
        )}
      </div>
    </aside>
  );
}
