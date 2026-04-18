'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, LogOut, CreditCard, ShoppingBag, Settings, Star, History, Pencil, Users, Calendar, Clock, Swords, BookOpen, UserCheck, MessageSquare, MessageCircle, Bell, List, CalendarDays, Ticket, Plus, Award, Activity, Info, HelpCircle, FileText, Shield, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { MiniCalendar } from '@/components/ui/mini-calendar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { SportIconMap } from '@/components/icons/sport-icons';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import dynamic from 'next/dynamic';
const EditProfileModal = dynamic(() => import('@/components/profile/edit-profile-modal').then(m => ({ default: m.EditProfileModal })), { ssr: false });
import { useMyMatches, useChatUnreadTotal, useUnreadCount } from '@/hooks/use-api';
import type { SportProfile, Match } from '@/types/api';

import { sportLabel, levelLabel } from '@/lib/constants';

type QuickAction = { href: string; label: string };
type MenuItem = { label: string; icon: React.ElementType; href: string; quickAction?: QuickAction };
type MenuGroup = { label: string; items: MenuItem[] };

export default function ProfilePage() {
  useRequireAuth();
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  const chatUnread = useChatUnreadTotal();
  const { data: unreadData } = useUnreadCount();
  const notifUnread = unreadData?.count ?? 0;

  const menuGroups: MenuGroup[] = [
    {
      label: '매칭',
      items: [
        { label: t('matchHistory'), icon: History, href: '/my/matches?tab=history' },
        { label: t('myMatches'), icon: Swords, href: '/my/matches?tab=created' },
        { label: t('myTeamMatches'), icon: Users, href: '/my/team-matches' },
      ],
    },
    {
      label: '팀 & 용병',
      items: [
        { label: t('myTeams'), icon: Users, href: '/my/teams' },
        { label: t('myMercenary'), icon: UserCheck, href: '/my/mercenary', quickAction: { href: '/mercenary/new', label: '등록' } },
      ],
    },
    {
      label: '강좌 & 장터',
      items: [
        { label: t('myLessons'), icon: BookOpen, href: '/my/lessons' },
        { label: '내 수강권', icon: Ticket, href: '/my/lesson-tickets' },
        { label: t('myListings'), icon: ShoppingBag, href: '/my/listings' },
        { label: '장소 찾기', icon: MapPin, href: '/venues' },
      ],
    },
    {
      label: '평가 & 결제',
      items: [
        { label: t('myReviews'), icon: Star, href: '/reviews' },
        { label: t('receivedReviews'), icon: MessageSquare, href: '/my/reviews-received' },
        { label: t('paymentHistory'), icon: CreditCard, href: '/payments' },
      ],
    },
    {
      label: '활동 & 기록',
      items: [
        { label: '내 뱃지', icon: Award, href: '/badges' },
        { label: '활동 피드', icon: Activity, href: '/feed' },
      ],
    },
    {
      label: '서비스',
      items: [
        { label: '소개', icon: Info, href: '/about' },
        { label: 'FAQ', icon: HelpCircle, href: '/faq' },
        { label: '이용약관', icon: FileText, href: '/settings/terms' },
        { label: '개인정보', icon: Shield, href: '/settings/privacy' },
      ],
    },
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <MobileGlassHeader
        title={t('title')}
        subtitle="기록, 일정, 알림을 한 곳에서 정리하세요."
        actions={(
          <Link
            href="/settings"
            aria-label={tc('settings')}
            className="flex min-h-[44px] min-w-11 items-center justify-center rounded-xl border border-gray-200/80 bg-white/78 text-gray-700 shadow-sm transition-colors hover:bg-white dark:border-white/10 dark:bg-gray-800/82 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Settings size={16} />
          </Link>
        )}
      />

      <div className="mb-6 hidden items-start justify-between gap-4 @3xl:flex">
        <div className="min-w-0">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-500">
            내 계정
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.03em] text-gray-900 dark:text-white">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            기록, 일정, 알림을 한 곳에서 정리하세요.
          </p>
        </div>
        <Link href="/settings" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
          <Settings size={15} />
          {tc('settings')}
        </Link>
      </div>

      <div className={`px-5 @3xl:px-0 ${mounted && isAuthenticated ? '@3xl:grid @3xl:grid-cols-[1fr_340px] @3xl:gap-8' : 'max-w-[600px] mx-auto'}`}>
        <div>
        {mounted && isAuthenticated && user ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                  {user.nickname?.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-gray-900 dark:text-white">{user.nickname}</h2>
                    {user.bio && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{user.bio}</p>}
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex items-center gap-0.5 text-sm text-gray-500 dark:text-gray-400">
                        <Star size={12} fill="currentColor" />
                        <span className="font-semibold">{user.mannerScore?.toFixed(1)}</span>
                      </div>
                      <span className="text-gray-200 dark:text-gray-600">|</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{t('matchCount', { count: user.totalMatches })}</span>
                    </div>
                  </div>
                  <button aria-label={t('editProfile')} onClick={() => setShowEditModal(true)} className="flex min-h-[44px] min-w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500 transition-colors transition-transform hover:bg-gray-100 active:scale-[0.98] dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600">
                    <Pencil size={16} />
                  </button>
                </div>
              </div>
            </div>

            {user.sportProfiles && user.sportProfiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {user.sportProfiles.map((sp: SportProfile) => {
                  const SportIcon = SportIconMap[sp.sportType];
                  return (
                    <div key={sp.id} className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700/60 dark:bg-gray-900/50">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          {SportIcon && <SportIcon size={15} className="shrink-0 text-gray-500 dark:text-gray-400" />}
                          <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{sportLabel[sp.sportType]}</span>
                          <span className="rounded-md bg-white px-1.5 py-0.5 text-2xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {levelLabel[sp.level]}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          ELO {sp.eloRating}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('matchRecord', { matchCount: sp.matchCount, winCount: sp.winCount })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-100 bg-gray-50/80 dark:border-gray-700/60 dark:bg-gray-900/70">
              <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-700">
                <div className="px-3 py-3 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{user.totalMatches || 0}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('totalMatches')}</p>
                </div>
                <div className="px-3 py-3 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{user.mannerScore?.toFixed(1) || '0'}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('mannerScore')}</p>
                </div>
                <div className="px-3 py-3 text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{user.sportProfiles?.length || 0}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">종목</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {/* 다가오는 일정 — mobile only */}
        <div className="@3xl:hidden">
          {mounted && isAuthenticated && <UpcomingSchedule />}
        </div>
        </div>

        {/* 다가오는 일정 — desktop only, appears as right column */}
        <div className="hidden @3xl:block">
          {mounted && isAuthenticated && <UpcomingSchedule />}
        </div>
      </div>

      <div className="mt-5 h-2 bg-gray-50 dark:bg-gray-800 @3xl:hidden" />

      {/* 소통 바로가기 */}
      {mounted && isAuthenticated && (
        <div className="px-5 @3xl:px-0 pt-4 pb-2">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-700">
              <QuickAccessLink href="/chat" icon={MessageCircle} label={t('chatLabel')} count={chatUnread} />
              <QuickAccessLink href="/notifications" icon={Bell} label={t('notificationsLabel')} count={notifUnread} />
            </div>
          </div>
        </div>
      )}

      <div className="px-5 @3xl:px-0 py-2 @3xl:mt-4">
        {menuGroups.map((group, gIdx) => (
          <div key={group.label} className={gIdx === 0 ? '' : 'mt-4'}>
            <p className="px-1 py-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-gray-400">
              {group.label}
            </p>
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
              {group.items.map((item, idx) => {
                const isLast = idx === group.items.length - 1;
                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-3.5 transition-colors transition-transform hover:bg-gray-50 dark:hover:bg-gray-700/70 active:scale-[0.98]"
                  >
                    <Link
                      href={mounted && isAuthenticated ? item.href : '/login'}
                      className={`flex min-h-[44px] flex-1 items-center gap-3 py-3 ${isLast ? '' : 'border-b border-gray-100 dark:border-gray-700'}`}
                    >
                      <item.icon size={18} className="text-gray-500 dark:text-gray-400" />
                      <span className="text-md font-medium text-gray-800 dark:text-gray-200">{item.label}</span>
                    </Link>
                    <div className={`flex items-center gap-2 pl-2 py-3 ${isLast ? '' : 'border-b border-gray-100 dark:border-gray-700'}`}>
                      {item.quickAction && mounted && isAuthenticated && (
                        <Link
                          href={item.quickAction.href}
                          aria-label={`${item.label} ${item.quickAction.label}`}
                          className="flex min-h-[36px] items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-500 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50"
                        >
                          <Plus size={12} />
                          {item.quickAction.label}
                        </Link>
                      )}
                      <Link
                        href={mounted && isAuthenticated ? item.href : '/login'}
                        tabIndex={-1}
                        aria-hidden="true"
                        className="flex min-h-[44px] min-w-10 items-center justify-end"
                      >
                        <ChevronRight size={18} className="text-gray-300 dark:text-gray-600" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="h-2 bg-gray-50 dark:bg-gray-800 @3xl:hidden" />

      <div className="px-5 @3xl:px-0 py-2">
        {mounted && isAuthenticated && (
          <button onClick={() => { logout(); router.push('/login'); }} className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
            <LogOut size={20} className="text-gray-500 dark:text-gray-400" />
            <span className="text-md font-medium text-gray-500 dark:text-gray-400">{tc('logout')}</span>
          </button>
        )}
      </div>


      {showEditModal && <EditProfileModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} />}
    </div>
  );
}

function QuickAccessLink({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  count: number;
}) {
  return (
    <Link href={href} className="flex min-h-[44px] items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/60">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
        <Icon size={18} className="text-blue-500" />
      </div>
      <span className="min-w-0 flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

function UpcomingSchedule() {
  const t = useTranslations('profile');
  const te = useTranslations('empty');
  const { data, isLoading, error, refetch } = useMyMatches({ limit: '20' });
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

  if (isLoading) {
    return (
      <div className="mt-4 @3xl:mt-0">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="space-y-2">
            <div className="h-[72px] rounded-xl bg-gray-100 dark:bg-gray-700 skeleton-shimmer" />
            <div className="h-[72px] rounded-xl bg-gray-100 dark:bg-gray-700 skeleton-shimmer" />
            <div className="h-[72px] rounded-xl bg-gray-100 dark:bg-gray-700 skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 @3xl:mt-0">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <ErrorState onRetry={() => refetch()} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 @3xl:mt-0">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('upcomingSchedule')}</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">다가오는 매치와 일정을 빠르게 확인하세요.</p>
          </div>
          <div className="flex items-center gap-1" role="tablist">
            <button
              role="tab"
              aria-selected={view === 'list'}
              onClick={() => setView('list')}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors ${view === 'list' ? 'bg-blue-50 text-blue-500 dark:bg-blue-900/30' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              aria-label={t('listView')}
            >
              <List size={16} />
            </button>
            <button
              role="tab"
              aria-selected={view === 'calendar'}
              onClick={() => setView('calendar')}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors ${view === 'calendar' ? 'bg-blue-50 text-blue-500 dark:bg-blue-900/30' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              aria-label={t('calendarView')}
            >
              <CalendarDays size={16} />
            </button>
            <Link href="/matches" className="ml-2 text-sm font-semibold text-blue-500">매칭 찾기</Link>
          </div>
        </div>

        {view === 'calendar' ? (
          <MiniCalendar matches={calendarMatches} />
        ) : listMatches.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-6 text-center dark:border-gray-700/60 dark:bg-gray-900/70">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-300">
              <Calendar size={20} aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">{te('noSchedule')}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{te('noScheduleDesc')}</p>
            <Link href="/matches" className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-500 transition-colors hover:bg-blue-50 dark:border-blue-500/30 dark:bg-gray-700 dark:text-blue-400 dark:hover:bg-gray-600">
              {t('findMatch')}
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {listMatches.map((m: Match) => {
              const d = new Date(m.matchDate);
              const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
              return (
                <Link key={m.id} href={`/matches/${m.id}`}>
                  <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-3 transition-colors transition-transform hover:bg-gray-50 active:scale-[0.98] dark:border-gray-700 dark:bg-gray-900/30 dark:hover:bg-gray-700/60">
                    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-white text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      <span className="text-xs font-semibold">{d.getMonth() + 1}월</span>
                      <span className="text-base font-black leading-none">{d.getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{m.title}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-0.5"><Clock size={12} /> {m.startTime}</span>
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
