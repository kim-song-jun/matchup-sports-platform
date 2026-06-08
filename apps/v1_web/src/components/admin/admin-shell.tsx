'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export type AdminTab = 'home' | 'matches' | 'teamMatches' | 'teams' | 'reviews' | 'notifications' | 'audit';

interface AdminShellProps {
  children: ReactNode;
  activeTab: AdminTab;
}

const NAV_ITEMS: { id: AdminTab; label: string; href: string; icon: string }[] = [
  { id: 'home', label: '홈', href: '/admin', icon: '🏠' },
  { id: 'matches', label: '매치 관리', href: '/admin/matches', icon: '⚽' },
  { id: 'teamMatches', label: '팀매치', href: '/admin/team-matches', icon: '🏆' },
  { id: 'teams', label: '팀 운영', href: '/admin/teams', icon: '👥' },
  { id: 'reviews', label: '리뷰', href: '/admin/reviews', icon: '⭐' },
  { id: 'notifications', label: '알림', href: '/admin/notifications', icon: '🔔' },
  { id: 'audit', label: '활동 내역', href: '/admin/audit', icon: '📋' },
];

export function AdminShell({ children, activeTab }: AdminShellProps) {
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="flex md:hidden items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 sticky top-0 z-10">
        <Link href="/home" className="text-[13px] text-gray-500 hover:text-gray-700 transition-colors">
          ← 서비스
        </Link>
        <span className="text-[15px] font-bold text-gray-900 flex-1 text-center">운영 센터</span>
        <div className="w-10" />
      </div>

      {/* Mobile scrollable tab strip */}
      <div className="flex md:hidden overflow-x-auto bg-white border-b border-gray-100 sticky top-[49px] z-10 no-scrollbar">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === activeTab;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-4 py-2.5 whitespace-nowrap flex-shrink-0 text-[12px] transition-colors border-b-2 ${
                isActive
                  ? 'border-blue-500 text-blue-600 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] min-h-screen bg-white border-r border-gray-100 flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="px-5 py-6 border-b border-gray-50">
          <span className="text-[17px] font-bold text-gray-900">운영 센터</span>
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === activeTab;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-5 py-3 text-[14px] transition-colors ${
                  isActive
                    ? 'border-l-2 border-blue-500 bg-blue-50/60 text-blue-600 font-semibold'
                    : 'border-l-2 border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-gray-100">
          <Link
            href="/home"
            className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← 서비스로 돌아가기
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-4 md:px-6 py-6 md:py-8">
        <div className="max-w-[960px] mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
