'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  Globe,
  Instagram,
  MapPin,
  MessageCircle,
  Share2,
  Star,
  Trophy,
  UserPlus,
  Users,
  Video,
  Youtube,
} from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { Button, buttonStyles } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { BadgeDisplay } from '@/components/ui/badge-display';
import { SportIconMap } from '@/components/icons/sport-icons';
import dynamic from 'next/dynamic';
import { SafeImage } from '@/components/ui/safe-image';

const MediaLightbox = dynamic(
  () => import('@/components/ui/media-lightbox').then((m) => ({ default: m.MediaLightbox })),
  { ssr: false, loading: () => null }
);
import { useLeaveTeam, useMyTeams, useTeam, useTeamBadges, useTeamHub } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { sportLabel, levelLabel } from '@/lib/constants';
import { getGradeInfo } from '@/lib/skill-grades';
import { getTeamImage, getTeamImageSet, getTeamLogo, getListingImage, getSportImage } from '@/lib/sport-image';
import type { Lesson, MarketplaceListing, Tournament } from '@/types/api';

type HubSection = 'overview' | 'goods' | 'passes' | 'events';

// Mock trust score fallback — replace when API returns TeamTrustScore
const mockTrustScore = {
  infoAccuracy: 96,
  mannerScore: 4.6,
  lateRate: 3,
  noShowRate: 0,
  record: { total: 42, wins: 28, draws: 6, losses: 8 },
};

// Mock recent matches fallback — replace when API returns match history
const mockRecentMatches = [
  { id: 'rm-1', opponent: '성수 유나이티드', date: '2026-03-15', myScore: 3, opponentScore: 1, result: 'win' as const },
  { id: 'rm-2', opponent: '마포 킥커즈', date: '2026-03-08', myScore: 2, opponentScore: 2, result: 'draw' as const },
  { id: 'rm-3', opponent: '강남 FC', date: '2026-03-01', myScore: 1, opponentScore: 3, result: 'loss' as const },
  { id: 'rm-4', opponent: '잠실 레인저스', date: '2026-02-22', myScore: 4, opponentScore: 0, result: 'win' as const },
];

// Mock badges fallback — replace when useTeamBadges returns data
const mockBadges = [
  { id: 'badge-1', type: 'manner_player', name: '매너 플레이어', description: '매너 점수 4.5+' },
  { id: 'badge-2', type: 'punctual', name: '시간 약속왕', description: '지각률 0%' },
  { id: 'badge-4', type: 'honest_team', name: '정직한 팀', description: '정보 일치도 95%+' },
  { id: 'badge-5', type: 'newcomer', name: '신규 팀', description: '팀 등록 완료' },
];

function ticketSummary(lesson: Lesson): string {
  if (!lesson.ticketPlans || lesson.ticketPlans.length === 0) {
    return lesson.fee > 0 ? `${lesson.fee.toLocaleString('ko-KR')}원` : '무료';
  }
  const activePlans = lesson.ticketPlans.filter((plan) => plan.isActive);
  if (activePlans.length === 0) return '수강권 준비중';
  const minPrice = Math.min(...activePlans.map((plan) => plan.price));
  return `수강권 ${activePlans.length}종 · ${minPrice.toLocaleString('ko-KR')}원부터`;
}

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;
  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: team, isLoading } = useTeam(teamId);
  const { data: hubData } = useTeamHub(teamId);
  const { data: myTeams, isLoading: isMyTeamsLoading } = useMyTeams();
  const { data: apiBadges } = useTeamBadges(teamId);
  const leaveTeamMutation = useLeaveTeam();

  const [activeSection, setActiveSection] = useState<HubSection>('overview');
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showMediaLightbox, setShowMediaLightbox] = useState(false);

  const teamBadges = apiBadges || mockBadges;

  const myMembership = myTeams?.find((myTeam) => myTeam.id === teamId);
  const isMyTeam = !!myMembership;
  const canManageTeam = myMembership?.role === 'owner' || myMembership?.role === 'manager';
  const canEditProfile = hubData?.capabilities?.canEditProfile ?? canManageTeam;
  const canManageCatalog = canManageTeam
    || hubData?.capabilities?.canManageGoods
    || hubData?.capabilities?.canManagePasses
    || hubData?.capabilities?.canManageEvents;

  if (isLoading) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-32 bg-gray-100 rounded-lg" />
          <div className="h-48 bg-gray-100 rounded-xl" />
          <div className="h-32 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="px-5 @3xl:px-0 pt-[var(--safe-area-top)] @3xl:pt-0">
        <EmptyState
          icon={Users}
          title="팀을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 팀이에요"
          action={{ label: '목록으로', href: '/teams' }}
        />
      </div>
    );
  }

  const currentTeam = team;
  const SportIcon = SportIconMap[currentTeam.sportType];
  const hasSns = currentTeam.instagramUrl || currentTeam.youtubeUrl || currentTeam.kakaoOpenChat || currentTeam.websiteUrl;

  const hubGoods = hubData?.goods ?? [];
  const hubPasses = hubData?.passes ?? [];
  const hubEvents = hubData?.events ?? [];

  const coverImage = getTeamImage(currentTeam.sportType, currentTeam.coverImageUrl, currentTeam.id);
  const gallery = getTeamImageSet(currentTeam.sportType, currentTeam.photos, currentTeam.id, 4);
  const logo = getTeamLogo(currentTeam.name, currentTeam.sportType, currentTeam.logoUrl, currentTeam.id);
  const fallbackCover = getTeamImage(currentTeam.sportType, undefined, currentTeam.id);
  const fallbackGallery = getTeamImageSet(currentTeam.sportType, undefined, currentTeam.id, 4);
  const fallbackLogo = getTeamLogo(currentTeam.name, currentTeam.sportType, undefined, currentTeam.id);
  const mediaImages = [coverImage, ...gallery]
    .filter((image): image is string => Boolean(image))
    .map((image, index) => ({
      src: image,
      alt: `${currentTeam.name} 이미지 ${index + 1}`,
      fallbackSrc: index === 0 ? fallbackCover : (fallbackGallery[index - 1] ?? fallbackCover),
    }));

  function openMedia(src: string) {
    const index = mediaImages.findIndex((image) => image.src === src);
    if (index < 0) return;
    setMediaIndex(index);
    setShowMediaLightbox(true);
  }

  function handleContact() {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/teams/${teamId}`);
      return;
    }
    if (!currentTeam.contactInfo) {
      toast('info', '연락처가 등록되어 있지 않아요.');
      return;
    }
    if (
      currentTeam.contactInfo.startsWith('http') ||
      currentTeam.contactInfo.startsWith('tel:') ||
      currentTeam.contactInfo.startsWith('mailto:')
    ) {
      window.open(currentTeam.contactInfo, '_blank', 'noopener,noreferrer');
      return;
    }
    toast('info', `연락처: ${currentTeam.contactInfo}`);
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      <MobileGlassHeader className="justify-between">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="glass-mobile-icon-button flex items-center justify-center min-h-11 min-w-11 rounded-xl"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1 ml-3">{currentTeam.name}</h1>
        <button
          onClick={async () => {
            try {
              if (navigator.share) {
                await navigator.share({ title: currentTeam.name, url: window.location.href });
              } else {
                await navigator.clipboard.writeText(window.location.href);
                toast('success', '링크를 복사했어요.');
              }
            } catch {
              // user cancelled share
            }
          }}
          aria-label="공유하기"
          className="glass-mobile-icon-button flex items-center justify-center min-h-11 min-w-11 rounded-xl"
        >
          <Share2 size={18} className="text-gray-500" />
        </button>
      </MobileGlassHeader>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/teams" className="hover:text-gray-600">팀·클럽</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{currentTeam.name}</span>
      </div>

      <div className="@3xl:grid @3xl:grid-cols-[1fr_380px] @3xl:gap-8">
        <div className="px-5 @3xl:px-0">
          {/* Cover + Team header */}
          <Card padding="none" className="overflow-hidden">
            <button
              type="button"
              onClick={() => openMedia(coverImage)}
              aria-label={`${currentTeam.name} 커버 이미지 보기`}
              className="relative h-32 @3xl:h-44 w-full bg-gray-800"
            >
              <SafeImage src={coverImage} fallbackSrc={fallbackCover} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 60vw" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
              {/* Logo overlay */}
              <div className="absolute -bottom-6 left-5">
                <div className="rounded-[20px] bg-white/95 p-1.5 shadow-sm">
                  <div className="relative h-14 w-14">
                    <SafeImage src={logo} fallbackSrc={fallbackLogo} alt={`${currentTeam.name} logo`} fill className="rounded-[15px] object-cover" sizes="56px" />
                  </div>
                </div>
              </div>
            </button>

            <div className="pt-8 px-5 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{currentTeam.name}</h2>
                {currentTeam.isRecruiting && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded-full px-2 py-0.5">모집중</span>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                {SportIcon && <SportIcon size={14} aria-hidden="true" />}
                <span>{sportLabel[currentTeam.sportType]}</span>
                <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">|</span>
                {currentTeam.skillGrade ? (
                  (() => {
                    const grade = getGradeInfo(currentTeam.skillGrade);
                    return (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-normal ${grade.color}`}>
                        {grade.label}등급
                      </span>
                    );
                  })()
                ) : (
                  <span>{levelLabel[currentTeam.level]}</span>
                )}
                <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">|</span>
                <span>{currentTeam.memberCount}명</span>
                {currentTeam.proPlayerCount != null && currentTeam.proPlayerCount > 0 && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">|</span>
                    <span>선출 {currentTeam.proPlayerCount}명</span>
                  </>
                )}
              </div>

              {currentTeam.uniformColor && (
                <p className="text-xs text-gray-500 mt-1">유니폼: {currentTeam.uniformColor}</p>
              )}

              {/* Badge display */}
              <div className="mt-3">
                <BadgeDisplay badges={teamBadges} size="md" />
              </div>

              {currentTeam.description && (
                <p className="mt-4 text-base text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{currentTeam.description}</p>
              )}
            </div>
          </Card>

          {/* Hub section tabs */}
          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            <HubSectionTab label="소개" active={activeSection === 'overview'} onClick={() => setActiveSection('overview')} />
            <HubSectionTab label={`굿즈 ${hubData?.sections.goodsCount ?? hubGoods.length}`} active={activeSection === 'goods'} onClick={() => setActiveSection('goods')} />
            <HubSectionTab label={`수강권 ${hubData?.sections.passesCount ?? hubPasses.length}`} active={activeSection === 'passes'} onClick={() => setActiveSection('passes')} />
            <HubSectionTab label={`대회 ${hubData?.sections.eventsCount ?? hubEvents.length}`} active={activeSection === 'events'} onClick={() => setActiveSection('events')} />
          </div>

          {activeSection === 'overview' && (
            <div className="space-y-4 mt-4">
              {/* 팀 여정 — sub-page links */}
              <Card>
                <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">팀 여정</h3>
                <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-2">
                  <Link href={`/teams/${teamId}/matches`} className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-200">경기 기록</Link>
                  <Link href={`/teams/${teamId}/mercenary`} className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-200">용병 모집</Link>
                  <Link href={`/teams/${teamId}/members`} className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-200">멤버</Link>
                </div>
              </Card>

              {/* 신뢰도 점수 */}
              <Card>
                <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">신뢰도</h3>
                <div className="grid grid-cols-2 gap-3">
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
                <div className="mt-4 rounded-xl bg-gray-50 dark:bg-gray-700 p-3.5">
                  <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mb-2">
                    <Trophy size={14} aria-hidden="true" />
                    <span className="text-xs font-medium">전적</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-gray-900 dark:text-white">{mockTrustScore.record.total}전</span>
                    <div className="flex items-center gap-2 text-base">
                      <span className="font-semibold text-blue-500">{mockTrustScore.record.wins}승</span>
                      <span className="font-semibold text-gray-500 dark:text-gray-400">{mockTrustScore.record.draws}무</span>
                      <span className="font-semibold text-red-400">{mockTrustScore.record.losses}패</span>
                    </div>
                    <div className="ml-auto">
                      <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                        승률 {((mockTrustScore.record.wins / mockTrustScore.record.total) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* 최근 경기 결과 */}
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">최근 경기</h3>
                  <Link href={`/team-matches?teamId=${teamId}`} className="text-sm text-blue-500 font-medium">전체보기</Link>
                </div>
                <div className="space-y-2">
                  {mockRecentMatches.map((match) => {
                    const d = new Date(match.date);
                    const resultStyle = {
                      win: { label: '승', className: 'bg-blue-500 text-white' },
                      draw: { label: '무', className: 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300' },
                      loss: { label: '패', className: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
                    };
                    const rs = resultStyle[match.result];
                    return (
                      <div key={match.id} className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                        <span className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${rs.className}`}>
                          {rs.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-medium text-gray-900 dark:text-white truncate">vs {match.opponent}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {d.getMonth() + 1}/{d.getDate()}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-gray-900 dark:text-white">
                            {match.myScore} : {match.opponentScore}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* 활동 정보 */}
              <Card>
                <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">활동 정보</h3>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem icon={<MapPin size={16} />} label="활동 지역" value={[currentTeam.city, currentTeam.district].filter(Boolean).join(' ') || '미등록'} />
                  <InfoItem icon={<Users size={16} />} label="팀 규모" value={`${currentTeam.memberCount}명`} />
                  <InfoItem icon={<Calendar size={16} />} label="정기 활동" value="매주 토요일" />
                  <InfoItem icon={<Clock size={16} />} label="활동 시간" value="18:00 ~ 20:00" />
                </div>
              </Card>

              {/* SNS & 링크 */}
              {hasSns && (
                <Card>
                  <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">SNS & 링크</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {currentTeam.instagramUrl && (
                      <SnsButton href={currentTeam.instagramUrl} icon={<Instagram size={16} />} label="Instagram" />
                    )}
                    {currentTeam.youtubeUrl && (
                      <SnsButton href={currentTeam.youtubeUrl} icon={<Youtube size={16} />} label="YouTube" />
                    )}
                    {currentTeam.kakaoOpenChat && (
                      <SnsButton href={currentTeam.kakaoOpenChat} icon={<MessageCircle size={16} />} label="오픈채팅" />
                    )}
                    {currentTeam.websiteUrl && (
                      <SnsButton href={currentTeam.websiteUrl} icon={<Globe size={16} />} label="웹사이트" />
                    )}
                  </div>
                </Card>
              )}

              {/* 홍보 영상 */}
              {currentTeam.shortsUrl && (
                <Card>
                  <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">홍보 영상</h3>
                  <a
                    href={currentTeam.shortsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-48 @3xl:h-64 items-center justify-center rounded-xl bg-gray-900 text-white/60 hover:text-white/80 transition-colors"
                  >
                    <div className="text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm mx-auto mb-2">
                        <Video size={24} aria-hidden="true" />
                      </div>
                      <p className="text-sm font-medium">영상 보기</p>
                    </div>
                  </a>
                </Card>
              )}

              {/* 갤러리 */}
              {gallery.length > 0 && (
                <Card>
                  <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">갤러리</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {gallery.map((photo, index) => (
                      <button key={`${photo}-${index}`} type="button" onClick={() => openMedia(photo)} className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700">
                        <SafeImage src={photo} fallbackSrc={fallbackGallery[index] ?? fallbackCover} alt={`${currentTeam.name} 사진 ${index + 1}`} fill className="object-cover" sizes="(max-width: 768px) 33vw, 20vw" />
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {activeSection === 'goods' && <HubGoodsSection items={hubGoods} />}
          {activeSection === 'passes' && <HubPassesSection items={hubPasses} />}
          {activeSection === 'events' && <HubEventsSection items={hubEvents} />}
        </div>

        {/* Right sidebar */}
        <div className="px-5 @3xl:px-0 mt-4 @3xl:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">
            {canEditProfile && (
              <Card padding="sm">
                <Link href={`/teams/${teamId}/edit`} className={buttonStyles({ fullWidth: true })}>
                  팀 페이지 수정
                </Link>
              </Card>
            )}

            {canManageCatalog && (
              <Card padding="sm">
                <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-2">허브 등록</h3>
                <div className="space-y-1.5 text-sm">
                  <Link href={`/marketplace/new?teamId=${teamId}&teamName=${encodeURIComponent(currentTeam.name)}`} className="block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-700 dark:text-gray-200">
                    굿즈 등록
                  </Link>
                  <Link href={`/lessons/new?teamId=${teamId}&teamName=${encodeURIComponent(currentTeam.name)}`} className="block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-700 dark:text-gray-200">
                    수강권 등록
                  </Link>
                  <Link href={`/tournaments/new?teamId=${teamId}&teamName=${encodeURIComponent(currentTeam.name)}`} className="block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-700 dark:text-gray-200">
                    대회 등록
                  </Link>
                </div>
              </Card>
            )}

            {isMyTeam && myMembership?.role === 'member' && (
              <Card padding="sm">
                <Button
                  onClick={() => {
                    leaveTeamMutation.mutate(teamId, {
                      onSuccess: () => {
                        toast('success', '팀에서 나갔어요.');
                        router.push('/my/teams');
                      },
                      onError: () => toast('error', '팀 나가기에 실패했어요.'),
                    });
                  }}
                  disabled={leaveTeamMutation.isPending}
                  variant="dangerSoft"
                  fullWidth
                >
                  {leaveTeamMutation.isPending ? '처리 중...' : '팀 나가기'}
                </Button>
              </Card>
            )}

            {/* CTA — 내 팀이면 관리, 아니면 가입/연락 */}
            {!isMyTeamsLoading && !isMyTeam && (
              <Card padding="sm" className="space-y-2">
                {!currentTeam.isRecruiting ? (
                  <>
                    <div className="text-center mb-3">
                      <span className="inline-block rounded-full bg-gray-100 dark:bg-gray-700 px-3 py-1 text-sm font-semibold text-gray-500 dark:text-gray-400">모집 마감</span>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">현재 팀원을 모집하고 있지 않아요</p>
                    </div>
                    <Button disabled variant="subtle" fullWidth>모집 마감</Button>
                  </>
                ) : isAuthenticated ? (
                  <>
                    <div className="text-center mb-3">
                      <span className="inline-block text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded-full px-2 py-0.5 mb-1">팀원 모집중</span>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">아래 버튼으로 가입 신청해보세요</p>
                    </div>
                    <Button
                      onClick={async () => {
                        try {
                          await api.post(`/teams/${teamId}/apply`);
                          toast('success', '팀 가입 신청이 접수되었어요.');
                        } catch {
                          toast('error', '팀 가입 신청에 실패했어요.');
                        }
                      }}
                      fullWidth
                    >
                      팀 가입 신청
                    </Button>
                  </>
                ) : (
                  <Link href={`/login?redirect=/teams/${teamId}`} className={buttonStyles({ fullWidth: true })}>
                    로그인 후 가입 신청
                  </Link>
                )}

                <Button onClick={handleContact} variant="subtle" fullWidth className="justify-center gap-2">
                  <MessageCircle size={17} aria-hidden="true" />
                  연락하기
                </Button>
              </Card>
            )}

            {/* 용병 모집 중 카드 */}
            <Card padding="sm">
              <Link href={`/mercenary?teamId=${teamId}`} className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                  <UserPlus size={18} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">용병 모집</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">다음 경기에 함께할 용병을 찾아보세요</p>
                </div>
                <ChevronRight size={16} className="text-gray-400 shrink-0" aria-hidden="true" />
              </Link>
            </Card>

            {/* 운영자 카드 */}
            {currentTeam.owner && (
              <Card padding="sm">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2.5">운영자</h3>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-base font-bold text-gray-500 dark:text-gray-300">
                    {currentTeam.owner.nickname?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{currentTeam.owner.nickname ?? '알 수 없음'}</p>
                    {currentTeam.owner.mannerScore != null && (
                      <div className="flex items-center gap-1 text-sm text-amber-500 mt-0.5">
                        <Star size={12} fill="currentColor" aria-hidden="true" />
                        <span>{currentTeam.owner.mannerScore.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* 허브 섹션 빠른 이동 */}
            <Card padding="sm">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">허브 섹션</h3>
              <div className="space-y-1.5 text-sm">
                <button onClick={() => setActiveSection('goods')} className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left text-gray-700 dark:text-gray-200">
                  굿즈 {hubData?.sections.goodsCount ?? hubGoods.length}
                </button>
                <button onClick={() => setActiveSection('passes')} className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left text-gray-700 dark:text-gray-200">
                  수강권 {hubData?.sections.passesCount ?? hubPasses.length}
                </button>
                <button onClick={() => setActiveSection('events')} className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left text-gray-700 dark:text-gray-200">
                  대회 {hubData?.sections.eventsCount ?? hubEvents.length}
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <MediaLightbox isOpen={showMediaLightbox} images={mediaImages} initialIndex={mediaIndex} onClose={() => setShowMediaLightbox(false)} title={`${currentTeam.name} 이미지`} />
      <div className="h-24" />
    </div>
  );
}

function HubSectionTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function TrustItem({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function SnsButton({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl bg-gray-800 dark:bg-gray-700 px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
    >
      {icon}
      {label}
    </a>
  );
}

function HubGoodsSection({ items }: { items: MarketplaceListing[] }) {
  if (items.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState icon={Trophy} title="등록된 굿즈가 없어요" description="전역 장터에서 먼저 등록하면 팀 허브에서 함께 보여요." action={{ label: '장터 보기', href: '/marketplace' }} size="sm" />
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {items.map((item) => (
        <Link key={item.id} href={`/marketplace/${item.id}`} className="block">
          <Card padding="sm" className="flex gap-3">
            <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700 shrink-0">
              <SafeImage src={getListingImage(item.imageUrls, item.id)} fallbackSrc={getListingImage(undefined, item.id)} alt={item.title} fill className="object-cover" sizes="80px" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
              <p className="text-xs text-gray-500 mt-1">{item.price.toLocaleString('ko-KR')}원</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function HubPassesSection({ items }: { items: Lesson[] }) {
  if (items.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState icon={Trophy} title="등록된 수강권이 없어요" description="소속 레슨이 생기면 이 섹션에 자동으로 표시됩니다." action={{ label: '레슨 보기', href: '/lessons' }} size="sm" />
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {items.map((item) => (
        <Link key={item.id} href={`/lessons/${item.id}`} className="block">
          <Card padding="sm" className="flex gap-3">
            <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700 shrink-0">
              <SafeImage src={getSportImage(item.sportType, item.imageUrls?.[0] ?? item.imageUrl, item.id)} fallbackSrc={getSportImage(item.sportType, undefined, item.id)} alt={item.title} fill className="object-cover" sizes="80px" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
              <p className="text-xs text-gray-500 mt-1 truncate">{ticketSummary(item)}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function HubEventsSection({ items }: { items: Tournament[] }) {
  if (items.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState icon={Trophy} title="예정 대회가 없어요" description="대회가 등록되면 팀 허브에서 바로 확인할 수 있어요." action={{ label: '대회 보기', href: '/tournaments' }} size="sm" />
      </Card>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {items.map((event) => (
        <Link key={event.id} href={`/tournaments/${event.id}`} className="block">
          <Card padding="sm">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{event.title}</p>
            <p className="text-xs text-gray-500 mt-1">{event.eventDate}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}
