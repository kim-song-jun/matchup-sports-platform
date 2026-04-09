'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Search, GraduationCap, ShoppingBag, User, LogOut, Plus, ShieldCheck, Users, Swords, MessageCircle, Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { useChatUnreadTotal, useUnreadCount } from '@/hooks/use-api';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const chatUnread = useChatUnreadTotal();
  const { data: unreadData } = useUnreadCount();
  const notifUnread = unreadData?.count ?? 0;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const t = useTranslations('nav');
  const tc = useTranslations('common');

  const navSections = [
    {
      label: null,
      items: [
        { href: '/home', icon: Home, label: t('home') },
      ],
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
    ...(mounted && isAuthenticated ? [{
      label: t('communication'),
      items: [
        { href: '/chat', icon: MessageCircle, label: t('chat') },
        { href: '/notifications', icon: Bell, label: t('notifications') },
      ],
    }] : []),
    {
      label: null,
      items: [
        { href: '/profile', icon: User, label: t('myPage') },
      ],
    },
  ];

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-dvh w-[240px] flex-col border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
      {/* Logo */}
      <div className="px-5 pt-7 pb-5">
        <Link href="/home">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">TeamMeet</h1>
        </Link>
      </div>

      {/* CTA */}
      <div className="px-4 mb-3">
        <Link href="/matches/new"
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-500 px-4 py-3 text-base font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors">
          <Plus size={16} strokeWidth={2.5} />
          {t('createMatch')}
        </Link>
      </div>

      {/* Nav — grouped sections */}
      <nav className="flex-1 px-3 overflow-y-auto">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className={section.label ? 'mt-4' : sIdx > 0 ? 'mt-2 pt-2 border-t border-gray-100 dark:border-gray-800' : ''}>
            {section.label && (
              <p className="px-3 mb-1 text-2xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(({ href, icon: Icon, label }) => {
                const isActive = pathname.startsWith(href);
                const badge = href === '/chat' ? chatUnread : href === '/notifications' ? notifUnread : 0;
                return (
                  <Link key={href} href={href}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}>
                    <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
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
        ))}

        {mounted && isAdmin && (
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Link href="/admin/dashboard"
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}>
              <ShieldCheck size={16} strokeWidth={pathname.startsWith('/admin') ? 2 : 1.5} />
              {t('admin')}
            </Link>
          </div>
        )}
      </nav>

      {/* Locale Switcher */}
      <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800">
        <LocaleSwitcher />
      </div>

      {/* User */}
      <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4">
        {mounted && isAuthenticated && user ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-600 dark:text-gray-300">
                {user.nickname?.charAt(0)}
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.nickname}</p>
            </div>
            <button onClick={() => { logout(); router.push('/login'); }}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" aria-label={tc('logout')}>
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <Link href="/login" className="flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            {tc('login')}
          </Link>
        )}
      </div>
    </aside>
  );
}
