'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Swords,
  Trophy,
  Users,
  Star,
  Bell,
  ClipboardList,
  ChevronLeft,
} from 'lucide-react';

interface AdminShellProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: '홈', href: '/admin', icon: <LayoutDashboard size={18} />, exact: true },
  { label: '매치 관리', href: '/admin/matches', icon: <Swords size={18} /> },
  { label: '팀매치', href: '/admin/team-matches', icon: <Trophy size={18} /> },
  { label: '팀 운영', href: '/admin/teams', icon: <Users size={18} /> },
  { label: '리뷰', href: '/admin/reviews', icon: <Star size={18} /> },
  { label: '알림', href: '/admin/notifications', icon: <Bell size={18} /> },
  { label: '활동 내역', href: '/admin/audit', icon: <ClipboardList size={18} /> },
];

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="flex md:hidden items-center gap-1 px-4 py-3 bg-white border-b border-gray-100 sticky top-0 z-20">
        <Link
          href="/home"
          className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-700 transition-colors min-w-[60px]"
        >
          <ChevronLeft size={15} />
          서비스
        </Link>
        <span className="text-[15px] font-bold text-gray-900 flex-1 text-center">운영 센터</span>
        <div className="min-w-[60px]" />
      </div>

      {/* Mobile scrollable tab strip */}
      <div className="flex md:hidden overflow-x-auto bg-white border-b border-gray-100 sticky top-[49px] z-10 scrollbar-hide">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-4 py-2.5 whitespace-nowrap flex-shrink-0 text-[11px] transition-colors border-b-2 ${
                active
                  ? 'border-blue-500 text-blue-600 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className={active ? 'text-blue-600' : 'text-gray-400'}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[220px] min-h-screen bg-white border-r border-gray-100 flex-col sticky top-0 h-screen overflow-y-auto shrink-0">
        <div className="px-5 py-5 border-b border-gray-50 flex items-center gap-2">
          <LayoutDashboard size={18} className="text-blue-500 shrink-0" />
          <span className="text-[16px] font-bold text-gray-900">운영 센터</span>
        </div>
        <nav className="flex-1 py-1.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 text-[14px] transition-colors border-l-2 ${
                  active
                    ? 'border-blue-500 bg-blue-50/60 text-blue-600 font-semibold'
                    : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className={active ? 'text-blue-500' : 'text-gray-400'}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <Link
            href="/home"
            className="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronLeft size={14} />
            서비스로 돌아가기
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-4 md:px-6 py-5 md:py-7">
        <div className="max-w-[900px] mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
