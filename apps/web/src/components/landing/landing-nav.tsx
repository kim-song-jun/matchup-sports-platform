'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ArrowRight } from 'lucide-react';

const NAV_LINKS = [
  { href: '/guide', label: '이용 가이드' },
  { href: '/pricing', label: '요금' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: '소개' },
] as const;

export function LandingNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const shellClass = scrolled || mobileOpen
    ? 'border-b border-slate-200/80 bg-white/82 backdrop-blur-2xl shadow-[0_12px_40px_rgba(2,6,23,0.08)] dark:border-white/10 dark:bg-slate-950/78'
    : 'border-b border-slate-200/60 bg-white/68 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/68';

  return (
    <nav aria-label="메인 네비게이션" className={`fixed left-0 right-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300 ${shellClass}`}>
      <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#3182F6,#1B64DA_60%,#0C2B63)] shadow-lg shadow-sky-500/15">
            <span className="text-sm font-black tracking-[0.22em] text-white">MU</span>
          </div>
          <div className="leading-tight">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-blue-600 dark:text-sky-200/80">MatchUp</p>
            <p className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">스포츠 매칭 플랫폼</p>
          </div>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                  isActive
                    ? 'bg-slate-950/6 text-slate-950 dark:bg-white/10 dark:text-white'
                    : 'text-slate-600 hover:bg-slate-950/6 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 dark:text-slate-200 dark:hover:text-white sm:inline-flex"
          >
            로그인
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/20 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
          >
            시작하기
            <ArrowRight size={16} />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 text-slate-700 transition-colors hover:bg-white md:hidden dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200/70 bg-white/92 px-5 py-4 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/90 md:hidden">
          <div className="mx-auto max-w-[1180px] space-y-2">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-950/6 text-slate-950 dark:bg-white/10 dark:text-white'
                      : 'text-slate-600 hover:bg-slate-950/6 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                  }`}
                >
                  <span>{link.label}</span>
                  <span className="text-xs text-blue-500/70 dark:text-sky-200/70">{isActive ? '현재' : '보기'}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
