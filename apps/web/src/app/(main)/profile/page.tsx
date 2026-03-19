'use client';

import { useState } from 'react';
import { ChevronRight, LogOut, CreditCard, ShoppingBag, Settings, Star, History, User, Pencil, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { SportIconMap } from '@/components/icons/sport-icons';
import { EditProfileModal } from '@/components/profile/edit-profile-modal';

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
    <div className="pt-[var(--safe-area-top)] lg:pt-0">
      <header className="px-5 lg:px-0 pt-4 pb-3">
        <h1 className="text-[22px] font-bold text-gray-900">마이페이지</h1>
      </header>

      <div className="px-5 lg:px-0">
        {isAuthenticated && user ? (
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-blue-50 text-xl font-bold text-blue-500">
                  {user.nickname?.charAt(0)}
                </div>
                <div>
                  <h2 className="text-[17px] font-bold text-gray-900">{user.nickname}</h2>
                  {(user as any)?.bio && <p className="text-[13px] text-gray-500 mt-0.5">{(user as any).bio}</p>}
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
              <button onClick={() => setShowEditModal(true)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 transition-colors">
                <Pencil size={16} />
              </button>
            </div>

            {user.sportProfiles && user.sportProfiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {user.sportProfiles.map((sp: any) => {
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
                        {sp.matchCount}전 {sp.winCount}승 · ELO {sp.eloRating}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-gray-100 p-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <User size={28} className="text-gray-300" />
            </div>
            <p className="text-[15px] font-medium text-gray-900">로그인하고 매치에 참가하세요</p>
            <p className="text-[13px] text-gray-400 mt-1">기록과 레벨이 쌓여요</p>
            <Link href="/login" className="mt-4 inline-block rounded-lg bg-gray-900 px-6 py-2.5 text-[14px] font-semibold text-white">로그인</Link>
          </div>
        )}
      </div>

      <div className="mt-5 h-2 bg-gray-50 lg:hidden" />

      <div className="px-5 lg:px-0 py-2 lg:mt-4">
        {[
          { label: '매치 히스토리', icon: History, href: '/matches' },
          { label: '내 평가', icon: Star, href: '/reviews' },
          { label: '결제 내역', icon: CreditCard, href: '/payments' },
          { label: '내 장터', icon: ShoppingBag, href: '/marketplace' },
          { label: '내 팀', icon: Users, href: '/teams' },
        ].map((item) => (
          <Link key={item.label} href={item.href}>
            <div className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-3">
                <item.icon size={20} className="text-gray-400" />
                <span className="text-[15px] font-medium text-gray-800">{item.label}</span>
              </div>
              <ChevronRight size={18} className="text-gray-300" />
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
          <button onClick={() => { logout(); router.push('/login'); }} className="flex items-center gap-3 py-4 w-full">
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
