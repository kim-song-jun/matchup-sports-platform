'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Swords, UserPlus, GraduationCap, Trophy, MapPin, MessageCircle, Bell, Award, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { useChatUnreadTotal, useUnreadCount } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

interface MoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MoreMenu({ isOpen, onClose }: MoreMenuProps) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('nav');
  const { user, isAuthenticated } = useAuthStore();
  const chatUnread = useChatUnreadTotal();
  const { data: unreadData } = useUnreadCount();
  const notifUnread = unreadData?.count ?? 0;

  // Close on route change
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ESC key + focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Auto-focus first focusable element
    const timeout = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      clearTimeout(timeout);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const matchingItems = [
    { href: '/team-matches', icon: Swords, label: t('teamMatching') },
    { href: '/mercenary', icon: UserPlus, label: t('mercenary') },
  ];

  const exploreItems = [
    { href: '/lessons', icon: GraduationCap, label: t('lessons') },
    { href: '/tournaments', icon: Trophy, label: t('tournaments') },
    { href: '/venues', icon: MapPin, label: t('venues') },
  ];

  const activityItems = [
    { href: '/badges', icon: Award, label: t('badges') },
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="네비게이션 메뉴"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={panelRef}
        className="relative w-full max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 animate-slide-up"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
        </div>
        {/* Close button */}
        <div className="flex justify-end px-4 pb-1">
          <button
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Profile row */}
        <div className="px-4 pb-2">
          {isAuthenticated && user ? (
            <Link
              href="/profile"
              onClick={onClose}
              className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20 text-sm font-bold text-blue-600 dark:text-blue-400">
                {user.nickname?.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user.nickname}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">프로필 보기</p>
              </div>
            </Link>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="flex min-h-[44px] items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              로그인
            </Link>
          )}
        </div>

        <div className="px-4 pb-5 space-y-1">
          {/* Matching group */}
          <MenuGroup label={t('matching')}>
            {matchingItems.map(({ href, icon: Icon, label }) => (
              <MenuLink key={href} href={href} icon={Icon} label={label} pathname={pathname} onClose={onClose} />
            ))}
          </MenuGroup>

          {/* Explore group */}
          <MenuGroup label={t('explore')}>
            {exploreItems.map(({ href, icon: Icon, label }) => (
              <MenuLink key={href} href={href} icon={Icon} label={label} pathname={pathname} onClose={onClose} />
            ))}
          </MenuGroup>

          {/* Communication group — authenticated only */}
          {isAuthenticated && (
            <MenuGroup label={t('communication')}>
              <MenuLink
                href="/chat"
                icon={MessageCircle}
                label={t('chat')}
                pathname={pathname}
                onClose={onClose}
                badge={chatUnread > 0 ? chatUnread : undefined}
              />
              <MenuLink
                href="/notifications"
                icon={Bell}
                label={t('notifications')}
                pathname={pathname}
                onClose={onClose}
                badge={notifUnread > 0 ? notifUnread : undefined}
              />
            </MenuGroup>
          )}

          {/* Activity group */}
          <MenuGroup label={t('activity')}>
            {activityItems.map(({ href, icon: Icon, label }) => (
              <MenuLink key={href} href={href} icon={Icon} label={label} pathname={pathname} onClose={onClose} />
            ))}
          </MenuGroup>
        </div>
      </div>
    </div>
  );
}

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-3">
      <p className="px-3 mb-1 text-2xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  pathname,
  onClose,
  badge,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  pathname: string;
  onClose: () => void;
  badge?: number;
}) {
  const isActive = pathname.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        'flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
      )}
    >
      <Icon size={18} strokeWidth={isActive ? 2 : 1.5} aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span
          className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-2xs font-bold text-white"
          aria-label={`읽지 않은 항목 ${badge > 99 ? '99개 이상' : `${badge}개`}`}
        >
          <span aria-hidden="true">{badge > 99 ? '99+' : badge}</span>
        </span>
      )}
    </Link>
  );
}
