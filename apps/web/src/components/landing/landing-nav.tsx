'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { href: '/guide', label: '이용 가이드' },
  { href: '/pricing', label: '요금' },
  { href: '/faq', label: 'FAQ' },
  { href: '/about', label: '소개' },
] as const;

const mobileLinkBaseClass =
  'flex items-center justify-between text-md px-4 py-3 rounded-xl transition-colors';
const mobileLinkActiveClass =
  'font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-200';
const mobileLinkInactiveClass =
  'text-gray-500 dark:text-gray-300 hover:text-gray-900 hover:bg-gray-50 dark:hover:text-white dark:hover:bg-gray-800';

/** Returns all keyboard-focusable elements within a container. */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function LandingNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const siblingAccessibilityStateRef = useRef(new Map<Element, { ariaHidden: string | null; inert: boolean }>());

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

  // Body scroll lock while mobile menu is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const shell = shellRef.current;
    const parent = shell?.parentElement;
    if (!mobileOpen || !shell || !parent) return;

    const siblings = Array.from(parent.children).filter((node) => node !== shell);
    const previousState = siblingAccessibilityStateRef.current;
    previousState.clear();

    siblings.forEach((node) => {
      previousState.set(node, {
        ariaHidden: node.getAttribute('aria-hidden'),
        inert: node.hasAttribute('inert'),
      });
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('inert', '');
    });

    return () => {
      siblings.forEach((node) => {
        const state = previousState.get(node);
        if (!state) return;

        if (state.ariaHidden === null) {
          node.removeAttribute('aria-hidden');
        } else {
          node.setAttribute('aria-hidden', state.ariaHidden);
        }

        if (state.inert) {
          node.setAttribute('inert', '');
        } else {
          node.removeAttribute('inert');
        }
      });
      previousState.clear();
    };
  }, [mobileOpen]);

  // Focus trap + ESC handler when mobile menu is open
  useEffect(() => {
    if (!mobileOpen) return;

    const dropdown = dropdownRef.current;
    const closeButton = hamburgerRef.current;
    if (!dropdown) return;

    // Focus first focusable element on open
    const focusables = getFocusableElements(dropdown);
    focusables[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        hamburgerRef.current?.focus();
        return;
      }

      if (e.key !== 'Tab') return;

      const elements = getFocusableElements(dropdown);
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: wrap from first to last
        if (document.activeElement === first) {
          e.preventDefault();
          closeButton?.focus();
          return;
        }

        if (closeButton && document.activeElement === closeButton) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: include the visible close button in the trap sequence
        if (document.activeElement === last) {
          e.preventDefault();
          closeButton?.focus();
          return;
        }

        if (closeButton && document.activeElement === closeButton) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  const closeMobileMenu = () => {
    setMobileOpen(false);
    hamburgerRef.current?.focus();
  };

  return (
    <div ref={shellRef}>
      {/* Backdrop overlay — closes menu on tap outside */}
      <div
        aria-hidden="true"
        onClick={closeMobileMenu}
        className={`fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <nav
        aria-label="메인 네비게이션"
        className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,box-shadow,border-color] duration-300 ${
          mobileOpen
            ? 'bg-white/95 backdrop-blur-md border-b border-transparent dark:bg-gray-900/92 dark:border-transparent'
            : scrolled
              ? 'border-b border-gray-100/80 bg-white/92 backdrop-blur-md shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-gray-900/88'
              : 'bg-transparent'
        }`}
      >
        <div className="max-w-[1100px] mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
              <span className="text-white font-black text-sm">M</span>
            </div>
            <span className="font-bold text-xl text-gray-900 dark:text-white tracking-tight">Teameet</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`text-base font-medium px-3 py-2 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                    isActive
                      ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right: actions + mobile hamburger */}
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className={`text-base font-medium text-gray-500 hover:text-gray-900 active:scale-[0.97] transition-colors px-3 py-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                mobileOpen ? 'hidden md:block' : 'hidden sm:block'
              }`}
            >
              로그인
            </Link>
            <Link
              href="/login"
              className={`text-base font-semibold bg-blue-500 text-white px-5 py-2.5 rounded-xl transition-[colors,transform,shadow] active:scale-[0.97] hover:bg-blue-600 shadow-sm shadow-blue-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                mobileOpen ? 'hidden md:inline-flex' : 'inline-flex'
              }`}
            >
              시작하기
            </Link>
            <button
              ref={hamburgerRef}
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`md:hidden flex h-11 w-11 items-center justify-center rounded-xl transition-[background-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 ${
                mobileOpen
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

      </nav>

      {/* Mobile dropdown — keep it outside the blurred nav so viewport anchoring stays stable */}
      <div
        ref={dropdownRef}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? 'true' : undefined}
        aria-label={mobileOpen ? '모바일 메뉴' : undefined}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
        className={`md:hidden fixed inset-x-0 top-16 bottom-0 z-50 bg-white dark:bg-gray-900 shadow-[0_18px_40px_rgba(15,23,42,0.16)] overflow-y-auto overscroll-contain transition-[transform,opacity] duration-300 ease-out ${
          mobileOpen ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-[1100px] mx-auto min-h-full px-5 py-4 space-y-1 flex flex-col">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`${mobileLinkBaseClass} ${isActive ? mobileLinkActiveClass : mobileLinkInactiveClass}`}
              >
                <span>{link.label}</span>
              </Link>
            );
          })}
          {/* CTA section — matches desktop action hierarchy */}
          <div
            data-testid="landing-mobile-menu-actions"
            className="mt-auto space-y-2 border-t border-gray-100 pt-4 pb-[env(safe-area-inset-bottom)] dark:border-gray-700"
          >
            <Link
              href="/login"
              className="block text-md font-medium px-4 py-3 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/login"
              className="block bg-blue-500 text-white rounded-xl py-3 text-center font-bold transition-colors hover:bg-blue-600 active:scale-[0.97]"
            >
              시작하기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
