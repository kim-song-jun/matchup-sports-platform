'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, Search, GraduationCap, ShoppingBag, User, LogOut, Plus, ShieldCheck, Users, Swords, MessageCircle, Bell, Sun, Moon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { useNotificationStore } from '@/stores/notification-store';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const chatUnread = useChatStore((s) => s.getTotalUnreadCount());
  const notifUnread = useNotificationStore((s) => s.getUnreadCount());
  const t = useTranslations('nav');
  const tc = useTranslations('common');

  const navSections = [
    {
      label: null,
      items: [{ href: '/home', icon: Home, label: t('home') }],
    },
    {
      label: t('matching'),
      items: [
        { href: '/matches', icon: Search, label: t('findMatch') },
        { href: '/team-matches', icon: Swords, label: t('teamMatching') },
      ],
    },
    {
      label: t('explore'),
      items: [
        { href: '/lessons', icon: GraduationCap, label: t('lessons') },
        { href: '/marketplace', icon: ShoppingBag, label: t('marketplace') },
        { href: '/teams', icon: Users, label: t('teams') },
      ],
    },
    {
      label: t('communication'),
      items: [
        { href: '/chat', icon: MessageCircle, label: t('chat') },
        { href: '/notifications', icon: Bell, label: t('notifications') },
      ],
    },
    {
      label: null,
      items: [{ href: '/profile', icon: User, label: t('myPage') }],
    },
  ];

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-[272px] px-4 py-4 lg:flex">
      <div className="glass-panel flex h-full w-full flex-col rounded-[32px] p-4">
        <Link href="/home" className="flex items-start gap-3 rounded-[24px] px-2 py-2">
          <div className="brand-mark"><span>M</span></div>
          <div className="pt-0.5">
            <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">MatchUp</h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Trust-first sports matching</p>
          </div>
        </Link>

        <div className="solid-panel mt-4 rounded-[28px] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">Create</p>
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">오늘 뛰고 싶은 경기를 바로 여세요.</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">매칭, 팀전, 프로필 기반 운영을 하나의 흐름으로 정리했습니다.</p>
          <Link
            href="/matches/new"
            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-blue-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-600 active:bg-blue-700"
          >
            <Plus size={16} strokeWidth={2.5} />
            {t('createMatch')}
          </Link>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto pr-1">
          {navSections.map((section, sIdx) => (
            <div key={sIdx} className="mb-3">
              <div className="v2-sidebar-section">
                {section.label && <p className="nav-section-label">{section.label}</p>}
                <div className="space-y-1">
                  {section.items.map(({ href, icon: Icon, label }) => {
                    const isActive = pathname.startsWith(href);
                    const badge = href === '/chat' ? chatUnread : href === '/notifications' ? notifUnread : 0;

                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-blue-500 text-white shadow-[0_16px_32px_rgba(49,130,246,0.22)]'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-white',
                        )}
                      >
                        <Icon size={16} strokeWidth={isActive ? 2 : 1.7} />
                        <span className="flex-1">{label}</span>
                        {badge > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-2xs font-bold text-white">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          <div className="v2-sidebar-section">
            <p className="nav-section-label">Operations</p>
            <Link
              href="/admin/dashboard"
              className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-blue-500 text-white shadow-[0_16px_32px_rgba(49,130,246,0.22)]'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-white',
              )}
            >
              <ShieldCheck size={16} strokeWidth={pathname.startsWith('/admin') ? 2 : 1.7} />
              {t('admin')}
            </Link>
          </div>
        </nav>

        <div className="surface-divider my-3" />

        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>

        <div className="solid-panel mt-3 rounded-[24px] px-4 py-4">
          {isAuthenticated && user ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                  {user.nickname?.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{user.nickname}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email ?? 'Active player profile'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { logout(); router.push('/login'); }}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800"
                aria-label={tc('logout')}
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <Link href="/login" className="flex min-h-[48px] items-center justify-center rounded-full bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
              {tc('login')}
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    document.documentElement.style.colorScheme = next ? 'dark' : 'light';
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="다크모드 전환"
      className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-[var(--surface-outline)] bg-white/35 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-white/70 hover:text-gray-900 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-800/80 dark:hover:text-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      {isDark ? <Sun size={14} /> : <Moon size={14} />}
      {isDark ? '라이트' : '다크'}
    </button>
  );
}
