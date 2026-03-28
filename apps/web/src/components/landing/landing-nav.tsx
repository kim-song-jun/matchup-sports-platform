'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

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
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <nav aria-label="메인 네비게이션" className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,box-shadow] duration-300 ${
        scrolled || mobileOpen
          ? 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-sm'
          : 'bg-transparent'
      }`}>
        <div className="max-w-[1100px] mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <span className="text-white font-black text-sm">M</span>
            </div>
            <span className="font-bold text-xl text-gray-900 dark:text-white tracking-tight">TeamMeet</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link key={link.href} href={link.href} className={`text-base font-medium px-3 py-2 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                  isActive ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}>{link.label}</Link>
              );
            })}
          </div>

          {/* Right: actions + mobile hamburger */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/login" className="text-base font-medium text-gray-500 hover:text-gray-900 active:scale-[0.97] transition-colors px-3 py-2.5 rounded-lg hidden sm:block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
              로그인
            </Link>
            <Link href="/login" className="text-base font-semibold bg-blue-500 text-white px-5 py-2.5 rounded-xl transition-[colors,transform,shadow] active:scale-[0.97] hover:bg-blue-600 shadow-sm shadow-blue-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400">
              시작하기
            </Link>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 animate-fade-in">
            <div className="max-w-[1100px] mx-auto px-5 py-3 space-y-1">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link key={link.href} href={link.href} className={`block text-md font-medium px-4 py-3 rounded-xl transition-colors ${
                    isActive ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}>{link.label}</Link>
                );
              })}
              <Link href="/login" className="block text-md font-medium px-4 py-3 rounded-xl text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 sm:hidden">
                로그인
              </Link>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
