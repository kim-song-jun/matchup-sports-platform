'use client';

import { useState } from 'react';
import { ChevronRight, LogOut, CreditCard, ShoppingBag, Settings, Star, History, User, Pencil, Users, Calendar, Clock, Swords, BookOpen, UserCheck, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { SportIconMap } from '@/components/icons/sport-icons';
import { EditProfileModal } from '@/components/profile/edit-profile-modal';
import { useMyMatches } from '@/hooks/use-api';
import type { SportProfile, Match } from '@/types/api';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

export default function ProfilePage() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const router = useRouter();
  const [showEditModal, setShowEditModal] = useState(false);

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 dark:bg-gray-900">
      <header className="px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900 dark:text-white">마이페이지</h1>
      </header>

      <div className={`px-5 lg:px-0 ${isAuthenticated ? 'lg:grid lg:grid-cols-[1fr_340px] lg:gap-8' : ''}`}>
        <div>
        {isAuthenticated && user ? (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-blue-50 text-xl font-bold text-blue-500">
                  {user.nickname?.charAt(0)}
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-gray-900">{user.nickname}</h2>
                  {user.bio && <p className="text-[13px] text-gray-500 mt-0.5">{user.bio}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-0.5 text-[13px] text-amber-500">
                      <Star size={13} fill="currentColor" />
                      <span className="font-semibold">{user.mannerScore?.toFixed(1)}</span>
                    </div>
                    <span className="text-gray-200">|</span>
                    <span className="text-[13px] text-gray-500">{user.totalMatches}경기</span>
                  </div>
                </div>
              </div>
              <button aria-label="프로필 수정" onClick={() => setShowEditModal(true)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 active:scale-[0.98] transition-all min-w-[44px] min-h-[44px] flex items-center justify-center">
                <Pencil size={16} />
              </button>
            </div>

            {user.sportProfiles && user.sportProfiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {user.sportProfiles.map((sp: SportProfile) => {
                  const SportIcon = SportIconMap[sp.sportType];
                  return (
                    <div key={sp.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {SportIcon && <SportIcon size={16} className="text-gray-400" />}
                        <span className="text-[14px] font-medium text-gray-800">{sportLabel[sp.sportType]}</span>
                        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-500">
                          Lv.{sp.level} {levelLabel[sp.level]}
                        </span>
                      </div>
                      <div className="text-[12px] text-gray-400">
                        {sp.matchCount}전 {sp.winCount}승 · ELO <span className="animate-scale-in inline-block font-semibold text-blue-500">{sp.eloRating}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 활동 통계 */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-[18px] font-bold text-gray-900">{user.totalMatches || 0}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">총 경기</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-[18px] font-bold text-amber-500">{user.mannerScore?.toFixed(1) || '0'}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">매너 점수</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-[18px] font-bold text-blue-500">{user.sportProfiles?.length || 0}개</p>
                <p className="text-[12px] text-gray-400 mt-0.5">뱃지</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Hero card */}
            <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white text-center">
              <h2 className="text-[22px] font-bold">운동 메이트, 찾고 계셨죠?</h2>
              <p className="text-[14px] text-white/70 mt-2">AI가 내 수준에 딱 맞는 상대를 찾아드려요</p>
              <Link href="/login" className="inline-block mt-4 rounded-xl bg-white px-6 py-3 text-[15px] font-bold text-blue-500">
                3초 만에 시작하기
              </Link>
            </div>

            {/* Value props */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white border border-gray-100 p-4 text-center">
                <div className="text-[24px] font-bold text-gray-900">11</div>
                <p className="text-[12px] text-gray-400 mt-1">지원 종목</p>
              </div>
              <div className="rounded-2xl bg-white border border-gray-100 p-4 text-center">
                <div className="text-[24px] font-bold text-gray-900">S~D</div>
                <p className="text-[12px] text-gray-400 mt-1">실력 등급 매칭</p>
              </div>
              <div className="rounded-2xl bg-white border border-gray-100 p-4 text-center">
                <div className="text-[24px] font-bold text-blue-500">AI</div>
                <p className="text-[12px] text-gray-400 mt-1">맞춤 추천</p>
              </div>
              <div className="rounded-2xl bg-white border border-gray-100 p-4 text-center">
                <div className="text-[24px] font-bold text-gray-900">8종</div>
                <p className="text-[12px] text-gray-400 mt-1">뱃지 시스템</p>
              </div>
            </div>
          </div>
        )}
        {/* 다가오는 일정 — mobile only */}
        <div className="lg:hidden">
          {isAuthenticated && <UpcomingSchedule />}
        </div>
        </div>

        {/* 다가오는 일정 — desktop only, appears as right column */}
        <div className="hidden lg:block">
          {isAuthenticated && <UpcomingSchedule />}
        </div>
      </div>

      <div className="mt-5 h-2 bg-gray-50 lg:hidden" />

      <div className="px-5 lg:px-0 py-2 lg:mt-4">
        {[
          { label: '매치 히스토리', icon: History, href: '/matches', count: null },
          { label: '내가 만든 매치', icon: Swords, href: '/my/matches', count: null },
          { label: '내 팀 매칭 모집글', icon: Users, href: '/my/team-matches', count: null },
          { label: '내 팀', icon: Users, href: '/my/teams', count: null },
          { label: '내 강좌', icon: BookOpen, href: '/my/lessons', count: null },
          { label: '내 장터 매물', icon: ShoppingBag, href: '/my/listings', count: null },
          { label: '내 용병 모집', icon: UserCheck, href: '/my/mercenary', count: null },
          { label: '내 평가', icon: Star, href: '/reviews', count: null },
          { label: '받은 평가', icon: MessageSquare, href: '/my/reviews-received', count: null },
          { label: '결제 내역', icon: CreditCard, href: '/payments', count: null },
        ].map((item) => (
          <Link key={item.label} href={isAuthenticated ? item.href : '/login'}>
            <div className={`flex items-center justify-between py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 active:scale-[0.99] transition-all rounded-lg -mx-2 px-2 ${!isAuthenticated ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-3">
                <item.icon size={20} className="text-gray-400" />
                <span className="text-[15px] font-medium text-gray-800">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {item.count !== null && item.count !== undefined && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-bold text-white">
                    {item.count}
                  </span>
                )}
                <ChevronRight size={18} className="text-gray-300" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="h-2 bg-gray-50 lg:hidden" />

      <div className="px-5 lg:px-0 py-2">
        <Link href="/settings">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3"><Settings size={20} className="text-gray-400" /><span className="text-[15px] font-medium text-gray-800">설정</span></div>
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </Link>
        {isAuthenticated && (
          <button onClick={() => { logout(); router.push('/login'); }} className="flex items-center gap-3 py-4 w-full hover:bg-gray-50 dark:hover:bg-gray-800 -mx-2 px-2 rounded-lg transition-colors">
            <LogOut size={20} className="text-gray-400" />
            <span className="text-[15px] font-medium text-gray-500">로그아웃</span>
          </button>
        )}
      </div>

      <div className="h-6" />

      {showEditModal && <EditProfileModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} />}
    </div>
  );
}

function UpcomingSchedule() {
  const { data } = useMyMatches({ limit: '5' });

  const matches = data?.items ?? [];
  const upcoming = matches.filter((m: Match) => new Date(m.matchDate) >= new Date()).slice(0, 3);

  return (
    <div className="mt-4 lg:mt-0 px-5 lg:px-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[16px] font-bold text-gray-900">다가오는 일정</h3>
        <Link href="/matches" className="text-[13px] text-blue-500 font-medium">전체보기</Link>
      </div>
      {upcoming.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100 p-6 text-center">
          <Calendar size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-[14px] text-gray-500">예정된 일정이 없어요</p>
          <p className="text-[12px] text-gray-400 mt-0.5">매치나 강좌에 참가해보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((m: Match) => {
            const d = new Date(m.matchDate);
            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            return (
              <Link key={m.id} href={`/matches/${m.id}`}>
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-3 hover:shadow-sm active:scale-[0.98] transition-all">
                  <div className="flex flex-col items-center justify-center h-12 w-12 rounded-xl bg-blue-50 text-blue-500 shrink-0">
                    <span className="text-[11px] font-semibold">{d.getMonth() + 1}월</span>
                    <span className="text-[16px] font-black leading-none">{d.getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-gray-900 truncate">{m.title?.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim()}</p>
                    <div className="flex items-center gap-2 text-[12px] text-gray-500 mt-0.5">
                      <span className="flex items-center gap-0.5"><Clock size={11} /> {m.startTime}</span>
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
