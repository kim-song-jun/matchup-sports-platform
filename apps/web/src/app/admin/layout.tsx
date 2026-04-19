'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Trophy, GraduationCap, Building2, ShieldCheck, ArrowLeft, Zap, CreditCard, Wallet, AlertTriangle, BarChart3, Swords, UserPlus, Star, Menu, X, Ticket, Banknote } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

const adminNav = [
  { href: '/admin/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { href: '/admin/matches', icon: Trophy, label: '매치 관리' },
  { href: '/admin/users', icon: Users, label: '사용자 관리' },
  { href: '/admin/lessons', icon: GraduationCap, label: '강좌 관리' },
  { href: '/admin/lesson-tickets', icon: Ticket, label: '수강권' },
  { href: '/admin/teams', icon: Zap, label: '팀 관리' },
  { href: '/admin/team-matches', icon: Swords, label: '팀 매칭' },
  { href: '/admin/mercenary', icon: UserPlus, label: '용병' },
  { href: '/admin/reviews', icon: Star, label: '평가' },
  { href: '/admin/venues', icon: Building2, label: '시설 관리' },
  { href: '/admin/payments', icon: CreditCard, label: '결제 관리' },
  { href: '/admin/settlements', icon: Wallet, label: '정산 관리' },
  { href: '/admin/payouts', icon: Banknote, label: '지급 관리' },
  { href: '/admin/disputes', icon: AlertTriangle, label: '신고/분쟁' },
  { href: '/admin/statistics', icon: BarChart3, label: '통계' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isAdmin = user?.role === 'admin';
  const isAuthLoading = isAuthenticated && (!user || !user.id || !user.role);

  // Admin access guard — redirect non-admin users
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (isAuthLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (!isAdmin) {
      router.replace('/home');
    }
  }, [isAdmin, isAuthenticated, isAuthLoading, mounted, router]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!mounted || isAuthLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-500 dark:text-gray-400 text-base">권한 정보를 확인하는 중입니다</div>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center" data-testid="admin-auth-wall">
          <ShieldCheck size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-base">관리자 권한이 필요합니다</p>
          <Link href={isAuthenticated ? "/home" : "/login"} className="mt-3 inline-block text-blue-500 text-base font-medium hover:underline">
            {isAuthenticated ? '홈으로 이동' : '로그인'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 flex">
      {/* Mobile hamburger button */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm"
        aria-label="메뉴 열기"
      >
        <Menu size={20} className="text-gray-700 dark:text-gray-300" />
      </button>

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-dvh w-[240px] flex-col border-r border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:z-40`}
      >
        <div className="px-5 pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white">
            <ShieldCheck size={20} className="text-blue-500" />
            <h1 className="text-lg font-bold">Teameet Admin</h1>
          </div>
          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="메뉴 닫기"
          >
            <X size={18} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {adminNav.map(({ href, icon: Icon, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                }`}>
                <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-100 dark:border-gray-700 p-3">
          <Link href="/home" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors">
            <ArrowLeft size={16} />
            서비스로 돌아가기
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 lg:pl-[240px]">
        <div className="max-w-[1200px] mx-auto px-4 pt-16 pb-6 lg:px-8 lg:py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
