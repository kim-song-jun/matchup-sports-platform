'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { ChevronRight, Star, Trophy, Calendar, MapPin, Shield, AlertTriangle, Ban, User } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { useUserProfile } from '@/hooks/use-api';
import type { SportProfile } from '@/types/api';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const { toast } = useToast();

  const { data: user, isLoading } = useUserProfile(userId);

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 bg-gray-100 rounded-lg" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-32 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="animate-fade-in text-center py-20">
        <User size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-[15px] text-gray-500">사용자를 찾을 수 없습니다</p>
        <Link href="/admin/users" className="text-blue-500 text-[13px] mt-2 inline-block">목록으로</Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/admin/users" className="hover:text-gray-600 transition-colors">사용자 관리</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{user.nickname}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Profile card */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xl font-bold text-blue-500">
                {user.nickname?.charAt(0)}
              </div>
              <div className="flex-1">
                <h2 className="text-[20px] font-bold text-gray-900">{user.nickname}</h2>
                {user.email && <p className="text-[13px] text-gray-400 mt-0.5">{user.email}</p>}
                {user.bio && <p className="text-[14px] text-gray-600 mt-2">{user.bio}</p>}
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star size={14} fill="currentColor" />
                    <span className="text-[14px] font-semibold">{user.mannerScore?.toFixed(1)}</span>
                  </div>
                  <span className="text-gray-200">|</span>
                  <span className="text-[13px] text-gray-500">{user.totalMatches}경기</span>
                  {user.locationCity && (
                    <>
                      <span className="text-gray-200">|</span>
                      <span className="flex items-center gap-1 text-[13px] text-gray-500">
                        <MapPin size={12} />
                        {user.locationCity} {user.locationDistrict}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sport profiles */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">종목별 프로필</h3>
            {user.sportProfiles && user.sportProfiles.length > 0 ? (
              <div className="space-y-2">
                {user.sportProfiles.map((sp: SportProfile) => {
                  const SportIcon = SportIconMap[sp.sportType];
                  return (
                    <div key={sp.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
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
            ) : (
              <div className="rounded-xl bg-gray-50 p-8 text-center">
                <Trophy size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-400">등록된 종목이 없어요</p>
              </div>
            )}
          </div>

          {/* Match history summary */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">매치 히스토리</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-gray-50 p-3.5 text-center">
                <p className="text-[24px] font-bold text-gray-900">{user.totalMatches || 0}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">총 경기</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5 text-center">
                <p className="text-[24px] font-bold text-green-500">{user.winCount || 0}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">승리</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3.5 text-center">
                <p className="text-[24px] font-bold text-amber-500">{user.mannerScore?.toFixed(1) || '-'}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">매너점수</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Admin actions & stats */}
        <div className="space-y-4">
          {/* Activity stats */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">활동 통계</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">가입일</span>
                <span className="text-gray-700">{user.createdAt ? new Date(user.createdAt).toLocaleDateString('ko-KR') : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">최근 로그인</span>
                <span className="text-gray-700">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString('ko-KR') : '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">인증 방식</span>
                <span className="text-gray-700">{user.provider || '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400">사용자 ID</span>
                <span className="text-gray-700 font-mono text-[12px]">{user.id?.slice(0, 12)}...</span>
              </div>
            </div>
          </div>

          {/* Admin actions */}
          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">관리 액션</h3>
            <div className="space-y-2">
              <button onClick={async () => {
                try {
                  await api.post(`/admin/users/${userId}/warn`);
                  toast('success', '사용자에게 경고가 발송되었어요');
                } catch {
                  toast('info', 'API 연동 준비 중입니다');
                }
              }} className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100 transition-colors">
                <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-amber-700">경고 부여</p>
                  <p className="text-[11px] text-amber-500">사용자에게 경고를 발송합니다</p>
                </div>
              </button>
              <button onClick={async () => {
                try {
                  await api.patch(`/admin/users/${userId}`, { status: 'suspended' });
                  toast('success', '사용자의 계정이 정지되었어요');
                } catch {
                  toast('info', 'API 연동 준비 중입니다');
                }
              }} className="w-full flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left hover:bg-red-100 transition-colors">
                <Ban size={18} className="text-red-500 shrink-0" />
                <div>
                  <p className="text-[14px] font-medium text-red-700">계정 정지</p>
                  <p className="text-[11px] text-red-500">사용자의 계정을 정지합니다</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
