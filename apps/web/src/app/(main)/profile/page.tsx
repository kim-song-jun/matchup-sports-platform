'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, LogOut, CreditCard, ShoppingBag, Settings, Star, History, Pencil, Users, Calendar, Clock, Swords, BookOpen, UserCheck, MessageSquare, MessageCircle, Bell, List, CalendarDays, Ticket, Plus, Award, Activity } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';
import { MiniCalendar } from '@/components/ui/mini-calendar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useRequireAuth } from '@/hooks/use-require-auth';
import { SportIconMap } from '@/components/icons/sport-icons';
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
  ];

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0">
      <header className="px-5 @3xl:px-0 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
      </header>

      <div className={`px-5 @3xl:px-0 ${mounted && isAuthenticated ? '@3xl:grid @3xl:grid-cols-[1fr_340px] @3xl:gap-8' : 'max-w-[600px] mx-auto'}`}>
        <div>
        {mounted && isAuthenticated && user ? (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-[56px] items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xl font-bold text-gray-500 dark:text-gray-500">
                  {user.nickname?.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{user.nickname}</h2>
                  {user.bio && <p className="text-sm text-gray-500 mt-0.5">{user.bio}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-0.5 text-sm text-gray-500 dark:text-gray-500">
                      <Star size={12} fill="currentColor" />
                      <span className="font-semibold">{user.mannerScore?.toFixed(1)}</span>
                    </div>
                    <span className="text-gray-200">|</span>
                    <span className="text-sm text-gray-500">{t('matchCount', { count: user.totalMatches })}</span>
                  </div>
                </div>
              </div>
              <button aria-label={t('editProfile')} onClick={() => setShowEditModal(true)} className="rounded-xl p-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform] min-w-11 min-h-[44px] flex items-center justify-center">
                <Pencil size={16} />
              </button>
            </div>

            {user.sportProfiles && user.sportProfiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {user.sportProfiles.map((sp: SportProfile) => {
                  const SportIcon = SportIconMap[sp.sportType];
                  return (
                    <div key={sp.id} className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {SportIcon && <SportIcon size={16} className="text-gray-500" />}
                        <span className="text-base font-medium text-gray-800 dark:text-gray-200">{sportLabel[sp.sportType]}</span>
                        <span className="rounded-md bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                          {levelLabel[sp.level]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('matchRecord', { matchCount: sp.matchCount, winCount: sp.winCount })} · {t('elo')} <span className="animate-scale-in inline-block font-semibold text-gray-900 dark:text-white">{sp.eloRating}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 활동 통계 */}
            <div className="mt-4 flex items-center divide-x divide-gray-100 dark:divide-gray-700">
              <div className="flex-1 text-center py-2">
                <p className="text-xl font-bold text-gray-900 dark:text-white">{user.totalMatches || 0}</p>
                <p className="text-xs text-gray-500 mt-1">{t('totalMatches')}</p>
              </div>
              <div className="flex-1 text-center py-2">
                <p className="text-xl font-bold text-gray-900 dark:text-white">{user.mannerScore?.toFixed(1) || '0'}</p>
                <p className="text-xs text-gray-500 mt-1">{t('mannerScore')}</p>
              </div>
              <div className="flex-1 text-center py-2">
                <p className="text-xl font-bold text-gray-900 dark:text-white">{t('badgeCount', { count: user.sportProfiles?.length || 0 })}</p>
                <p className="text-xs text-gray-500 mt-1">{t('badges')}</p>
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
          <div className="grid grid-cols-2 gap-3">
            <Link href="/chat">
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 active:scale-[0.98] transition-colors min-h-[44px]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30">
                  <MessageCircle size={20} className="text-blue-500" />
                </div>
                <span className="text-base font-medium text-gray-800 dark:text-gray-200 flex-1">{t('chatLabel')}</span>
                {chatUnread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                )}
              </div>
            </Link>
            <Link href="/notifications">
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 active:scale-[0.98] transition-colors min-h-[44px]">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30">
                  <Bell size={20} className="text-blue-500" />
                </div>
                <span className="text-base font-medium text-gray-800 dark:text-gray-200 flex-1">{t('notificationsLabel')}</span>
                {notifUnread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                    {notifUnread > 99 ? '99+' : notifUnread}
                  </span>
                )}
              </div>
            </Link>
          </div>
        </div>
      )}

      <div className="px-5 @3xl:px-0 py-2 @3xl:mt-4">
        {menuGroups.map((group, gIdx) => (
          <div key={group.label} className={gIdx === 0 ? '' : 'mt-5'}>
            <p className="px-2 py-1.5 text-2xs font-semibold text-gray-400 uppercase tracking-wider">
              {group.label}
            </p>
            {group.items.map((item, idx) => {
              const isLast = idx === group.items.length - 1;
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg -mx-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-[colors,transform]"
                >
                  <Link
                    href={mounted && isAuthenticated ? item.href : '/login'}
                    className={`flex flex-1 items-center gap-3 py-3.5 min-h-[44px] ${isLast ? '' : 'border-b border-gray-100 dark:border-gray-800'}`}
                  >
                    <item.icon size={20} className="text-gray-500" />
                    <span className="text-md font-medium text-gray-800 dark:text-gray-200">{item.label}</span>
                  </Link>
                  <div className={`flex items-center gap-1 pl-2 py-3.5 ${isLast ? '' : 'border-b border-gray-100 dark:border-gray-800'}`}>
                    {item.quickAction && mounted && isAuthenticated && (
                      <Link
                        href={item.quickAction.href}
                        aria-label={`${item.label} ${item.quickAction.label}`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors min-h-[44px]"
                      >
                        <Plus size={12} />
                        {item.quickAction.label}
                      </Link>
                    )}
                    <Link
                      href={mounted && isAuthenticated ? item.href : '/login'}
                      tabIndex={-1}
                      aria-hidden="true"
                      className="flex items-center min-w-11 min-h-[44px] justify-end"
                    >
                      <ChevronRight size={18} className="text-gray-300" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="h-2 bg-gray-50 dark:bg-gray-800 @3xl:hidden" />

      <div className="px-5 @3xl:px-0 py-2">
        <Link href="/settings" className="flex items-center justify-between min-h-[44px] py-3">
          <div className="flex items-center gap-3"><Settings size={20} className="text-gray-500" /><span className="text-md font-medium text-gray-800 dark:text-gray-200">{tc('settings')}</span></div>
          <ChevronRight size={18} className="text-gray-300" aria-hidden="true" />
        </Link>
        {mounted && isAuthenticated && (
          <button onClick={() => { logout(); router.push('/login'); }} className="flex items-center gap-3 min-h-[44px] py-3 w-full hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded-xl transition-colors">
            <LogOut size={20} className="text-gray-500" />
            <span className="text-md font-medium text-gray-500">{tc('logout')}</span>
          </button>
        )}
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
    <div className="mt-4 @3xl:mt-0 px-5 @3xl:px-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('upcomingSchedule')}</h3>
        <div className="flex items-center gap-1" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'list'}
            onClick={() => setView('list')}
            className={`p-1.5 rounded-lg transition-colors ${view === 'list' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            aria-label={t('listView')}
          >
            <List size={16} />
          </button>
          <button
            role="tab"
            aria-selected={view === 'calendar'}
            onClick={() => setView('calendar')}
            className={`p-1.5 rounded-lg transition-colors ${view === 'calendar' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            aria-label={t('calendarView')}
          >
            <CalendarDays size={16} />
          </button>
          <Link href="/matches" className="text-sm text-blue-500 font-medium ml-2">매칭 찾기</Link>
        </div>
      </div>

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
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-[0.98] transition-[colors,transform]">
                  <div className="flex flex-col items-center justify-center h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                    <span className="text-xs font-semibold">{d.getMonth() + 1}월</span>
                    <span className="text-lg font-black leading-none">{d.getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium text-gray-900 dark:text-white truncate">{m.title}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
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
  );
}
