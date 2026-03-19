'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Users, MapPin, MessageCircle, Share2, Globe, Video, ExternalLink, Star, Calendar, Clock, Instagram, Youtube, Image } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SportIconMap } from '@/components/icons/sport-icons';

const sportLabel: Record<string, string> = {
  futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const { data: team, isLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const res = await api.get(`/teams/${teamId}`);
      return (res as any).data;
    },
    enabled: !!teamId,
  });

  if (isLoading) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-32 bg-gray-100 rounded-lg" />
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-32 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="px-5 lg:px-0 pt-[var(--safe-area-top)] lg:pt-0 text-center py-20">
        <p className="text-gray-500">팀을 찾을 수 없습니다</p>
        <Link href="/teams" className="text-blue-500 text-sm mt-2 inline-block">목록으로 돌아가기</Link>
      </div>
    );
  }

  const SportIcon = SportIconMap[team.sportType];
  const hasSns = team.instagramUrl || team.youtubeUrl || team.kakaoOpenChat || team.websiteUrl;

  return (
    <div className="pt-[var(--safe-area-top)] lg:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-50">
        <button onClick={() => router.back()} className="rounded-lg p-1.5 -ml-1.5"><ArrowLeft size={20} className="text-gray-700" /></button>
        <h1 className="text-[16px] font-semibold text-gray-900 truncate flex-1 ml-3">{team.name}</h1>
        <button className="rounded-lg p-1.5"><Share2 size={18} className="text-gray-500" /></button>
      </header>

      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/teams" className="hover:text-gray-600">팀·클럽</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{team.name}</span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
        {/* Left */}
        <div className="px-5 lg:px-0">
          {/* Cover + Team header */}
          <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
            {/* Cover image placeholder */}
            <div className="h-32 lg:h-44 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center relative">
              {team.coverImageUrl ? (
                <img src={team.coverImageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-white/60">
                  <Image size={32} className="mx-auto mb-1" />
                  <p className="text-[12px]">커버 이미지</p>
                </div>
              )}
              {/* Logo overlay */}
              <div className="absolute -bottom-6 left-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900 text-white text-[20px] font-black border-2 border-white shadow-lg">
                  {team.name?.charAt(0)}
                </div>
              </div>
            </div>

            <div className="pt-8 px-5 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-[22px] font-bold text-gray-900">{team.name}</h2>
                {team.isRecruiting && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-500">모집중</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-400">
                {SportIcon && <SportIcon size={14} />}
                <span>{sportLabel[team.sportType]}</span>
                <span className="text-gray-200">|</span>
                <span>평균 Lv.{team.level} {levelLabel[team.level]}</span>
                <span className="text-gray-200">|</span>
                <span>{team.memberCount}명</span>
              </div>
              {team.description && (
                <p className="mt-4 text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{team.description}</p>
              )}
            </div>
          </div>

          {/* 활동 정보 */}
          <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[16px] font-bold text-gray-900 mb-4">활동 정보</h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoItem icon={<MapPin size={16} />} label="활동 지역" value={`${team.city || ''} ${team.district || ''}`} />
              <InfoItem icon={<Calendar size={16} />} label="정기 활동" value="매주 토요일" />
              <InfoItem icon={<Clock size={16} />} label="활동 시간" value="18:00 ~ 20:00" />
              <InfoItem icon={<Users size={16} />} label="팀 규모" value={`${team.memberCount}명`} />
            </div>
          </div>

          {/* SNS & 링크 */}
          {hasSns && (
            <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
              <h3 className="text-[16px] font-bold text-gray-900 mb-4">SNS & 링크</h3>
              <div className="grid grid-cols-2 gap-2">
                {team.instagramUrl && (
                  <SnsButton href={team.instagramUrl} icon={<Instagram size={16} />} label="Instagram" color="bg-gradient-to-r from-purple-500 to-pink-500 text-white" />
                )}
                {team.youtubeUrl && (
                  <SnsButton href={team.youtubeUrl} icon={<Youtube size={16} />} label="YouTube" color="bg-red-500 text-white" />
                )}
                {team.kakaoOpenChat && (
                  <SnsButton href={team.kakaoOpenChat} icon={<MessageCircle size={16} />} label="오픈채팅" color="bg-amber-400 text-gray-900" />
                )}
                {team.websiteUrl && (
                  <SnsButton href={team.websiteUrl} icon={<Globe size={16} />} label="웹사이트" color="bg-gray-700 text-white" />
                )}
              </div>
            </div>
          )}

          {/* 홍보 영상 */}
          {team.shortsUrl && (
            <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
              <h3 className="text-[16px] font-bold text-gray-900 mb-4">홍보 영상</h3>
              <a href={team.shortsUrl} target="_blank" rel="noopener noreferrer"
                className="block rounded-xl bg-gray-900 h-48 lg:h-64 flex items-center justify-center text-white/60 hover:text-white/80 transition-colors relative overflow-hidden">
                <div className="text-center z-10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm mx-auto mb-2">
                    <Video size={24} />
                  </div>
                  <p className="text-[13px] font-medium">영상 보기</p>
                </div>
              </a>
            </div>
          )}

          {/* 갤러리 placeholder */}
          <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[16px] font-bold text-gray-900 mb-4">갤러리</h3>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="aspect-square rounded-xl bg-gray-50 flex items-center justify-center text-gray-300">
                  <Image size={20} />
                </div>
              ))}
            </div>
            <p className="text-[12px] text-gray-400 mt-3 text-center">아직 등록된 사진이 없습니다</p>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="px-5 lg:px-0 mt-4 lg:mt-0">
          {/* CTA */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4 sticky top-4">
            {team.isRecruiting ? (
              <div className="text-center mb-4">
                <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-500 mb-2">팀원 모집중</span>
                <p className="text-[13px] text-gray-400">아래 버튼으로 연락해보세요</p>
              </div>
            ) : (
              <div className="text-center mb-4">
                <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-[13px] font-semibold text-gray-500 mb-2">모집 마감</span>
                <p className="text-[13px] text-gray-400">현재 팀원을 모집하고 있지 않습니다</p>
              </div>
            )}
            <button className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 transition-colors flex items-center justify-center gap-2">
              <MessageCircle size={18} />
              연락하기
            </button>
            {team.contactInfo && (
              <p className="text-[12px] text-gray-400 text-center mt-2">{team.contactInfo}</p>
            )}
          </div>

          {/* Owner */}
          <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-4">
            <h3 className="text-[14px] font-semibold text-gray-900 mb-3">운영자</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-[14px] font-bold text-blue-500">
                {team.owner?.nickname?.charAt(0) || '?'}
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-gray-900">{team.owner?.nickname || '알 수 없음'}</p>
                {team.owner?.mannerScore && (
                  <div className="flex items-center gap-1 text-[13px] text-amber-500 mt-0.5">
                    <Star size={12} fill="currentColor" />
                    <span>{team.owner.mannerScore.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-8" />
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">
        {icon}
        <span className="text-[12px]">{label}</span>
      </div>
      <p className="text-[14px] font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function SnsButton({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90 ${color}`}>
      {icon}
      {label}
    </a>
  );
}
