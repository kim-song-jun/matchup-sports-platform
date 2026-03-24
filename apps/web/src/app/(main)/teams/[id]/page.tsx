'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Users, MapPin, MessageCircle, Share2, Globe, Video, ExternalLink, Star, Calendar, Clock, Instagram, Youtube, Image, Shield, CheckCircle, UserPlus, Trophy, AlertCircle } from 'lucide-react';
import { SportIconMap } from '@/components/icons/sport-icons';
import { BadgeDisplay } from '@/components/ui/badge-display';
import { useTeam, useTeamBadges } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { getGradeInfo } from '@/lib/skill-grades';
import { api } from '@/lib/api';

const sportLabel: Record<string, string> = {
  soccer: '축구', futsal: '풋살', basketball: '농구', badminton: '배드민턴',
  ice_hockey: '아이스하키', figure_skating: '피겨', short_track: '쇼트트랙',
  swimming: '수영', tennis: '테니스', baseball: '야구', volleyball: '배구',
};
const levelLabel: Record<number, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '상급', 5: '고수' };

// Mock trust score data (폴백 — API 연동 시 교체 필요)
const mockTrustScore = {
  infoAccuracy: 96,
  mannerScore: 4.6,
  lateRate: 3,
  noShowRate: 0,
  record: { total: 42, wins: 28, draws: 6, losses: 8 },
};

// Mock badges (폴백 — API 데이터가 없을 때 사용)
const mockBadges = [
  { id: 'badge-1', type: 'manner_player', name: '매너 플레이어', description: '매너 점수 4.5+' },
  { id: 'badge-2', type: 'punctual', name: '시간 약속왕', description: '지각률 0%' },
  { id: 'badge-4', type: 'honest_team', name: '정직한 팀', description: '정보 일치도 95%+' },
  { id: 'badge-5', type: 'newcomer', name: '신규 팀', description: '팀 등록 완료' },
];

// Mock recent match results (폴백 — API 연동 시 교체 필요)
const mockRecentMatches = [
  { id: 'rm-1', opponent: '성수 유나이티드', date: '2026-03-15', myScore: 3, opponentScore: 1, result: 'win' as const },
  { id: 'rm-2', opponent: '마포 킥커즈', date: '2026-03-08', myScore: 2, opponentScore: 2, result: 'draw' as const },
  { id: 'rm-3', opponent: '강남 FC', date: '2026-03-01', myScore: 1, opponentScore: 3, result: 'loss' as const },
  { id: 'rm-4', opponent: '잠실 레인저스', date: '2026-02-22', myScore: 4, opponentScore: 0, result: 'win' as const },
];

const hasMercenaryPost = true;

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: team, isLoading } = useTeam(teamId);
  const { data: apiBadges } = useTeamBadges(teamId);

  // API 뱃지가 있으면 사용, 없으면 목업 폴백
  const teamBadges = apiBadges || mockBadges;

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
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-lg -ml-1.5 hover:bg-gray-100 transition-colors"><ArrowLeft size={20} className="text-gray-700" /></button>
        <h1 className="text-[16px] font-semibold text-gray-900 truncate flex-1 ml-3">{team.name}</h1>
        <button
          onClick={async () => {
            if (navigator.share) {
              await navigator.share({ title: team.name, url: window.location.href });
            } else {
              await navigator.clipboard.writeText(window.location.href);
              toast('success', '링크가 복사되었습니다');
            }
          }}
          aria-label="공유하기"
          className="flex items-center justify-center min-h-11 min-w-11 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Share2 size={18} className="text-gray-500" />
        </button>
      </header>

      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6">
        <Link href="/teams" className="hover:text-gray-600">팀&middot;클럽</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{team.name}</span>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
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
                  <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-600">모집중</span>
                )}
                {hasMercenaryPost && (
                  <Link href="/mercenary" className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-600 flex items-center gap-1">
                    <UserPlus size={10} />
                    용병 모집 중
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-400 flex-wrap">
                {SportIcon && <SportIcon size={14} />}
                <span>{sportLabel[team.sportType]}</span>
                <span className="text-gray-200">|</span>
                {team.skillGrade ? (() => {
                  const grade = getGradeInfo(team.skillGrade);
                  return (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold ${grade.color}`}>
                      {grade.label}등급
                    </span>
                  );
                })() : (
                  <span>Lv.{team.level} {levelLabel[team.level]}</span>
                )}
                <span className="text-gray-200">|</span>
                <span>{team.memberCount}명</span>
                {team.proPlayerCount != null && team.proPlayerCount > 0 && (
                  <>
                    <span className="text-gray-200">|</span>
                    <span>선출 {team.proPlayerCount}명</span>
                  </>
                )}
              </div>
              {team.uniformColor && (
                <p className="text-[12px] text-gray-400 mt-1">유니폼: {team.uniformColor}</p>
              )}

              {/* Badge display */}
              <div className="mt-3">
                <BadgeDisplay badges={teamBadges} size="md" />
              </div>

              {team.description && (
                <p className="mt-4 text-[14px] text-gray-600 leading-relaxed whitespace-pre-line">{team.description}</p>
              )}
            </div>
          </div>

          {/* 신뢰도 점수 */}
          <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[16px] font-bold text-gray-900 mb-4">신뢰도</h3>
            <div className="grid grid-cols-2 gap-3 lg:gap-5">
              <TrustItem
                icon={<CheckCircle size={16} />}
                label="정보 일치도"
                value={`${mockTrustScore.infoAccuracy}%`}
                color={mockTrustScore.infoAccuracy >= 90 ? 'text-green-500' : 'text-gray-500'}
              />
              <TrustItem
                icon={<Star size={16} />}
                label="매너 점수"
                value={`${mockTrustScore.mannerScore}/5`}
                color={mockTrustScore.mannerScore >= 4.0 ? 'text-amber-500' : 'text-gray-500'}
              />
              <TrustItem
                icon={<Clock size={16} />}
                label="지각률"
                value={`${mockTrustScore.lateRate}%`}
                color={mockTrustScore.lateRate <= 5 ? 'text-blue-500' : 'text-red-500'}
              />
              <TrustItem
                icon={<AlertCircle size={16} />}
                label="노쇼율"
                value={`${mockTrustScore.noShowRate}%`}
                color={mockTrustScore.noShowRate <= 2 ? 'text-green-500' : 'text-red-500'}
              />
            </div>
            {/* 전적 */}
            <div className="mt-4 rounded-xl bg-gray-50 p-3.5">
              <div className="flex items-center gap-1.5 text-gray-400 mb-2">
                <Trophy size={14} />
                <span className="text-[12px] font-medium">전적</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[18px] font-bold text-gray-900">{mockTrustScore.record.total}전</span>
                <div className="flex items-center gap-2 text-[14px]">
                  <span className="font-semibold text-blue-500">{mockTrustScore.record.wins}승</span>
                  <span className="font-semibold text-gray-400">{mockTrustScore.record.draws}무</span>
                  <span className="font-semibold text-red-400">{mockTrustScore.record.losses}패</span>
                </div>
                <div className="ml-auto">
                  <span className="text-[13px] font-semibold text-gray-600">
                    승률 {((mockTrustScore.record.wins / mockTrustScore.record.total) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 최근 경기 결과 */}
          <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-gray-900">최근 경기</h3>
              <Link href="/team-matches" className="text-[13px] text-blue-500 font-medium">전체보기</Link>
            </div>
            <div className="space-y-2">
              {mockRecentMatches.map((match) => {
                const d = new Date(match.date);
                const resultStyle = {
                  win: { label: '승', className: 'bg-blue-50 text-blue-500' },
                  draw: { label: '무', className: 'bg-gray-100 text-gray-500' },
                  loss: { label: '패', className: 'bg-red-50 text-red-500' },
                };
                const rs = resultStyle[match.result];

                return (
                  <div key={match.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3.5 py-3">
                    <span className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-[12px] font-bold ${rs.className}`}>
                      {rs.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-gray-900 truncate">vs {match.opponent}</p>
                      <p className="text-[12px] text-gray-400">
                        {d.getMonth() + 1}/{d.getDate()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[16px] font-bold text-gray-900">
                        {match.myScore} : {match.opponentScore}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 활동 정보 */}
          <div className="mt-3 rounded-2xl bg-white border border-gray-100 p-5">
            <h3 className="text-[16px] font-bold text-gray-900 mb-4">활동 정보</h3>
            <div className="grid grid-cols-2 gap-3 lg:gap-5">
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
                  <SnsButton href={team.instagramUrl} icon={<Instagram size={16} />} label="Instagram" color="bg-gray-800 text-white" />
                )}
                {team.youtubeUrl && (
                  <SnsButton href={team.youtubeUrl} icon={<Youtube size={16} />} label="YouTube" color="bg-gray-800 text-white" />
                )}
                {team.kakaoOpenChat && (
                  <SnsButton href={team.kakaoOpenChat} icon={<MessageCircle size={16} />} label="오픈채팅" color="bg-gray-700 text-white" />
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
        <div className="px-5 lg:px-0 mt-4 lg:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">
          {/* 팀 참여 신청 */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            {isAuthenticated ? (
              <button
                onClick={async () => {
                  try {
                    await api.post(`/teams/${teamId}/apply`);
                    toast('success', '팀 참여 신청이 완료되었습니다');
                  } catch {
                    toast('error', '신청에 실패했습니다. 이미 신청했거나 권한이 없습니다.');
                  }
                }}
                className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 transition-colors"
              >
                팀 참여 신청
              </button>
            ) : (
              <Link
                href="/login"
                className="block w-full text-center rounded-xl bg-gray-900 py-3.5 text-[15px] font-semibold text-white hover:bg-gray-800 transition-colors"
              >
                로그인 후 신청하기
              </Link>
            )}
          </div>

          {/* CTA */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            {team.isRecruiting ? (
              <div className="text-center mb-4">
                <span className="inline-block rounded-full bg-green-50 px-3 py-1 text-[13px] font-semibold text-green-600 mb-2">팀원 모집중</span>
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

          {/* 용병 모집 중 카드 */}
          {hasMercenaryPost && (
            <Link href="/mercenary" className="block">
              <div className="rounded-2xl bg-orange-50 border border-orange-100 p-4 transition-all hover:shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
                    <UserPlus size={18} className="text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-gray-900">용병 모집 중</p>
                    <p className="text-[12px] text-orange-600 mt-0.5">다음 경기에 함께할 용병을 찾고 있어요</p>
                  </div>
                  <ChevronRight size={16} className="text-orange-400" />
                </div>
              </div>
            </Link>
          )}

          {/* Owner */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
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

function TrustItem({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">
        {icon}
        <span className="text-[12px]">{label}</span>
      </div>
      <p className={`text-[16px] font-bold ${color}`}>{value}</p>
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
