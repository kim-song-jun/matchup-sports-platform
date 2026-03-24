'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Trophy, GraduationCap, Building2, ShieldCheck, ArrowLeft, Zap, CreditCard, Wallet, AlertTriangle, BarChart3, Swords, UserPlus, Star } from 'lucide-react';

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

  return (
    <div className="min-h-dvh bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 flex h-dvh w-[240px] flex-col border-r border-gray-100 bg-white">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2 text-gray-900">
            <ShieldCheck size={20} className="text-blue-500" />
            <h1 className="text-[16px] font-bold">MatchUp Admin</h1>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {adminNav.map(({ href, icon: Icon, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all ${
                  isActive ? 'bg-blue-50 text-blue-500' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-100 p-3">
          <Link href="/home" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] text-gray-500 hover:bg-gray-50 transition-colors">
            <ArrowLeft size={16} />
            서비스로 돌아가기
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 pl-[240px]">
        <div className="max-w-[1200px] mx-auto px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
