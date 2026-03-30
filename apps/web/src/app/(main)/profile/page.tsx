'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Bell,
  Calendar,
  CalendarDays,
  ChevronRight,
  CreditCard,
  History,
  List,
  LogOut,
  MessageCircle,
  MessageSquare,
  Moon,
  Pencil,
  Settings,
  ShoppingBag,
  Star,
  Sun,
  Swords,
  UserCheck,
  Users,
  BookOpen,
  Clock,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';
import { MiniCalendar } from '@/components/ui/mini-calendar';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { useNotificationStore } from '@/stores/notification-store';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useMyMatches } from '@/hooks/use-api';
import type { SportProfile, Match } from '@/types/api';
import { sportLabel, levelLabel } from '@/lib/constants';

const EditProfileModal = dynamic(() => import('@/components/profile/edit-profile-modal').then(m => ({ default: m.EditProfileModal })), { ssr: false });

const surfaceCard =
  'rounded-[28px] border border-slate-200/70 bg-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/75 dark:shadow-black/20';

const softCard =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/10';

export default function ProfilePage() {
  const t = useTranslations('profile');
  const te = useTranslations('empty');
  const tc = useTranslations('common');
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const chatUnread = useChatStore((s) => s.getTotalUnreadCount());
  const notifUnread = useNotificationStore((s) => s.getUnreadCount());

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      setIsDark(root.classList.contains('dark'));
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const menuItems = [
    { label: t('matchHistory'), icon: History, href: '/matches' },
    { label: t('myMatches'), icon: Swords, href: '/my/matches' },
    { label: t('myTeamMatches'), icon: Users, href: '/my/team-matches' },
    { label: t('myTeams'), icon: Users, href: '/my/teams' },
    { label: t('myLessons'), icon: BookOpen, href: '/my/lessons' },
    { label: t('myListings'), icon: ShoppingBag, href: '/my/listings' },
    { label: t('myMercenary'), icon: UserCheck, href: '/my/mercenary' },
    { label: t('myReviews'), icon: Star, href: '/reviews' },
    { label: t('receivedReviews'), icon: MessageSquare, href: '/my/reviews-received' },
    { label: t('paymentHistory'), icon: CreditCard, href: '/payments' },
  ];

  const quickActions = [
    { label: t('chatLabel'), href: '/chat', icon: MessageCircle, unread: chatUnread },
    { label: t('notificationsLabel'), href: '/notifications', icon: Bell, unread: notifUnread },
    { label: tc('settings'), href: '/settings', icon: Settings, unread: 0 },
  ];

  return (
    <div className="relative isolate overflow-hidden pt-[var(--safe-area-top)] pb-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px]"
        style={{
          background:
            'radial-gradient(circle at 18% 0%, rgba(59,130,246,0.20), transparent 34%), radial-gradient(circle at 80% 8%, rgba(15,23,42,0.12), transparent 24%), linear-gradient(180deg, rgba(248,250,252,0.9) 0%, rgba(248,250,252,0.55) 42%, rgba(248,250,252,0) 100%)',
        }}
      />

      <header className="relative px-5 @3xl:px-0 pt-4">
        <div className={`${surfaceCard} p-6 sm:p-7`}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Player profile</p>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">{t('title')}</h1>
              <p className="mt-2 max-w-[44rem] text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                프로필, 일정, 소통, 정산 정보를 한 화면에서 확인하는 운영 중심의 프로필 허브입니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200">
                {isAuthenticated ? '활성 계정' : '비로그인'}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200">
                {chatUnread + notifUnread} 알림
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className={`relative mt-4 px-5 @3xl:px-0 ${isAuthenticated ? '@3xl:grid @3xl:grid-cols-[1fr_360px] @3xl:gap-6' : 'max-w-[720px] mx-auto'}`}>
        <div className="space-y-4">
          {isAuthenticated && user ? (
            <div className={`${surfaceCard} p-5 sm:p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-[22px] bg-slate-950 text-2xl font-black text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] dark:bg-white dark:text-slate-950">
                    {user.nickname?.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{user.nickname}</h2>
                    {user.bio && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user.bio}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200">
                        <Star size={12} />
                        {user.mannerScore?.toFixed(1)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200">
                        {t('matchCount', { count: user.totalMatches })}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  aria-label={t('editProfile')}
                  onClick={() => setShowEditModal(true)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-slate-600 transition-colors hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  <Pencil size={16} />
                </button>
              </div>

              {user.sportProfiles && user.sportProfiles.length > 0 && (
                <div className="mt-5 grid gap-2">
                  {user.sportProfiles.map((sp: SportProfile) => {
                    const SportIcon = SportIconMap[sp.sportType];
                    return (
                      <div key={sp.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="flex items-center gap-3 min-w-0">
                          {SportIcon && <SportIcon size={16} className="text-slate-500" />}
                          <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{sportLabel[sp.sportType]}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {levelLabel[sp.level]}
                          </span>
                        </div>
                        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                          {t('matchRecord', { matchCount: sp.matchCount, winCount: sp.winCount })} · {t('elo')} <span className="font-semibold text-slate-900 dark:text-white">{sp.eloRating}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-4 text-center dark:border-slate-800 dark:bg-slate-950/70">
                  <p className="text-xl font-black text-slate-950 dark:text-white">{user.totalMatches || 0}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('totalMatches')}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-4 text-center dark:border-slate-800 dark:bg-slate-950/70">
                  <p className="text-xl font-black text-slate-950 dark:text-white">{user.mannerScore?.toFixed(1) || '0'}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('mannerScore')}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-4 text-center dark:border-slate-800 dark:bg-slate-950/70">
                  <p className="text-xl font-black text-slate-950 dark:text-white">{t('badgeCount', { count: user.sportProfiles?.length || 0 })}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('badges')}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className={`${surfaceCard} p-8 text-center`}>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{t('loginPromptTitle')}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('loginPromptDesc')}</p>
              <Link href="/login" className="mt-5 inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
                {tc('login')}
              </Link>
            </div>
          )}

          {isAuthenticated && (
            <div className="grid gap-3 sm:grid-cols-3">
              {quickActions.map((action) => (
                <Link key={action.label} href={action.href}>
                  <div className={`${softCard} flex items-center gap-3 p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-white dark:hover:bg-slate-900`}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                      <action.icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{action.label}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{action.href}</p>
                    </div>
                    {action.unread > 0 && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                        {action.unread > 99 ? '99+' : action.unread}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {isAuthenticated && (
            <div className="grid gap-3">
              {menuItems.map((item) => (
                <Link key={item.label} href={item.href}>
                  <div className={`${softCard} flex items-center justify-between gap-4 p-4 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-white dark:hover:bg-slate-900`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                        <item.icon size={18} />
                      </div>
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.label}</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-4 @3xl:mt-0">
          {isAuthenticated && <UpcomingSchedule />}

          <div className={`${surfaceCard} p-4 sm:p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Preferences</p>
                <h3 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{tc('settings')}</h3>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                  onClick={() => {
                    const next = !isDark;
                    document.documentElement.classList.toggle('dark', next);
                    document.documentElement.style.colorScheme = next ? 'dark' : 'light';
                    localStorage.setItem('theme', next ? 'dark' : 'light');
                    setIsDark(next);
                  }}
                className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <span className="flex items-center gap-3">
                  {isDark ? <Sun size={18} className="text-slate-500" /> : <Moon size={18} className="text-slate-500" />}
                  <span>{isDark ? '라이트 모드' : '다크 모드'}</span>
                </span>
                <span className="text-xs text-slate-400">{isDark ? 'ON' : 'OFF'}</span>
              </button>
              {isAuthenticated && (
                <button
                  onClick={() => {
                    logout();
                    router.push('/login');
                  }}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  <span className="flex items-center gap-3">
                    <LogOut size={18} className="text-slate-500" />
                    <span>{tc('logout')}</span>
                  </span>
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showEditModal && <EditProfileModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} />}
    </div>
  );
}

function UpcomingSchedule() {
  const t = useTranslations('profile');
  const te = useTranslations('empty');
  const tc = useTranslations('common');
  const { data } = useMyMatches({ limit: '20' });
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const matches = data?.items ?? [];
  const upcoming = matches.filter((m: Match) => new Date(m.matchDate) >= new Date());
  const listMatches = upcoming.slice(0, 3);

  const calendarMatches = upcoming.map((m: Match) => ({
    id: m.id,
    title: m.title || '',
    matchDate: m.matchDate,
    startTime: m.startTime,
    sportType: m.sportType,
  }));

  return (
    <div className={`${surfaceCard} p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Schedule</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{t('upcomingSchedule')}</h3>
        </div>
        <div className="flex items-center gap-1" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'list'}
            onClick={() => setView('list')}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${view === 'list' ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            aria-label={t('listView')}
          >
            <List size={16} />
          </button>
          <button
            role="tab"
            aria-selected={view === 'calendar'}
            onClick={() => setView('calendar')}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${view === 'calendar' ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            aria-label={t('calendarView')}
          >
            <CalendarDays size={16} />
          </button>
          <Link href="/matches" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200">
            {tc('viewAll')}
          </Link>
        </div>
      </div>

      <div className="mt-4">
        {view === 'calendar' ? (
          <MiniCalendar matches={calendarMatches} />
        ) : listMatches.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={te('noSchedule')}
            description={te('noScheduleDesc')}
            size="sm"
            action={{ label: t('findMatch'), href: '/matches' }}
          />
        ) : (
          <div className="space-y-2">
            {listMatches.map((m: Match) => {
              const d = new Date(m.matchDate);
              const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
              return (
                <Link key={m.id} href={`/matches/${m.id}`}>
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-900">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                      <span className="text-2xs font-semibold">{d.getMonth() + 1}월</span>
                      <span className="text-lg font-black leading-none">{d.getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{m.title}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1"><Clock size={12} /> {m.startTime}</span>
                        <span>({weekdays[d.getDay()]})</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
