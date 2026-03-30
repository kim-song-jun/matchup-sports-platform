'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Trophy, GraduationCap, Building2, ShieldCheck, ArrowLeft, Zap, CreditCard, Wallet, AlertTriangle, BarChart3, Swords, UserPlus, Star, Menu, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

const adminNav = [
  { href: '/admin/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { href: '/admin/matches', icon: Trophy, label: '매치 관리' },
  { href: '/admin/users', icon: Users, label: '사용자 관리' },
  { href: '/admin/lessons', icon: GraduationCap, label: '강좌 관리' },
  { href: '/admin/teams', icon: Zap, label: '팀 관리' },
  { href: '/admin/team-matches', icon: Swords, label: '팀 매칭' },
  { href: '/admin/mercenary', icon: UserPlus, label: '용병' },
  { href: '/admin/reviews', icon: Star, label: '평가' },
  { href: '/admin/venues', icon: Building2, label: '시설 관리' },
  { href: '/admin/payments', icon: CreditCard, label: '결제 관리' },
  { href: '/admin/settlements', icon: Wallet, label: '정산 관리' },
  { href: '/admin/disputes', icon: AlertTriangle, label: '신고/분쟁' },
  { href: '/admin/statistics', icon: BarChart3, label: '통계' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="solid-panel w-full max-w-md rounded-[28px] px-8 py-10 text-center">
          <ShieldCheck size={48} className="mx-auto mb-4 text-blue-500" />
          <p className="text-base font-semibold text-gray-900 dark:text-white">관리자 권한이 필요합니다</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">운영 콘솔은 로그인 사용자만 접근할 수 있습니다.</p>
          <Link href="/login" className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600">
            로그인
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app-main-frame flex min-h-dvh">
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="glass-panel fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-2xl lg:hidden"
        aria-label="메뉴 열기"
      >
        <Menu size={20} className="text-gray-700 dark:text-gray-200" />
      </button>

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="메뉴 닫기"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 h-dvh w-[272px] px-4 py-4 transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:z-40`}
      >
        <div className="glass-panel flex h-full flex-col rounded-[32px] p-4">
          <div className="flex items-start justify-between gap-3 rounded-[24px] px-2 py-2">
            <Link href="/admin/dashboard" className="flex items-start gap-3">
              <div className="brand-mark"><span>M</span></div>
              <div className="pt-0.5">
                <p className="text-base font-bold text-gray-900 dark:text-white">MatchUp Ops</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">운영 콘솔</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white/50 dark:hover:bg-gray-800/70"
              aria-label="메뉴 닫기"
            >
              <X size={18} />
            </button>
          </div>

          <div className="solid-panel mt-4 rounded-[24px] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">Console</p>
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">운영 상태, 결제, 분쟁, 정산을 한 화면에서 관리합니다.</p>
          </div>

          <nav className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
            {adminNav.map(({ href, icon: Icon, label }) => {
              const isActive = pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-500 text-white shadow-[0_16px_32px_rgba(49,130,246,0.22)]'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-white/55 dark:hover:bg-gray-800/70'
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.7} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <Link href="/home" className="solid-panel mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-white dark:text-gray-200 dark:hover:bg-gray-800/80">
            <ArrowLeft size={16} />
            서비스로 돌아가기
          </Link>
        </div>
      </aside>

      <main className="flex-1 lg:pl-[292px]">
        <div className="shell-container px-3 pt-16 pb-3 lg:px-6 lg:py-6">
          <div className="solid-panel section-shell min-h-[calc(100dvh-1.5rem)] px-4 py-4 lg:px-8 lg:py-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
