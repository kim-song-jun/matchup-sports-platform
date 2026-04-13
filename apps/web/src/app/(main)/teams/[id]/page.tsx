'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, MessageCircle, Plus, Share2, Trophy, Users } from 'lucide-react';
import { MobileGlassHeader } from '@/components/layout/mobile-glass-header';
import { Button, buttonStyles } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import dynamic from 'next/dynamic';
import { SafeImage } from '@/components/ui/safe-image';

const MediaLightbox = dynamic(
  () => import('@/components/ui/media-lightbox').then((m) => ({ default: m.MediaLightbox })),
  { ssr: false, loading: () => null }
);
import { useLeaveTeam, useMyTeams, useTeam, useTeamHub } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';
import { sportLabel } from '@/lib/constants';
import { getTeamImage, getTeamImageSet, getTeamLogo, getListingImage, getSportImage } from '@/lib/sport-image';
import type { Lesson, MarketplaceListing, Tournament } from '@/types/api';

type HubSection = 'overview' | 'goods' | 'passes' | 'events';

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
  const leaveTeamMutation = useLeaveTeam();

  const [activeSection, setActiveSection] = useState<HubSection>('overview');
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showMediaLightbox, setShowMediaLightbox] = useState(false);

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
    if (currentTeam.contactInfo.startsWith('http') || currentTeam.contactInfo.startsWith('tel:') || currentTeam.contactInfo.startsWith('mailto:')) {
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
        <Link href="/teams" className="hover:text-gray-600">팀/클럽</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{currentTeam.name}</span>
      </div>

      <div className="@3xl:grid @3xl:grid-cols-[1fr_360px] @3xl:gap-8">
        <div className="px-5 @3xl:px-0">
          <Card padding="none" className="overflow-hidden">
            <button
              type="button"
              onClick={() => openMedia(coverImage)}
              aria-label={`${currentTeam.name} 커버 이미지 보기`}
              className="relative h-36 @3xl:h-48 w-full bg-gray-800"
            >
              <SafeImage src={coverImage} fallbackSrc={fallbackCover} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 60vw" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
              <div className="absolute -bottom-6 left-5">
                <div className="rounded-[20px] bg-white/95 p-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.2)]">
                  <div className="relative h-14 w-14">
                    <SafeImage src={logo} fallbackSrc={fallbackLogo} alt={`${currentTeam.name} logo`} fill className="rounded-[15px] object-cover" sizes="56px" />
                  </div>
                </div>
              </div>
            </button>
            <div className="pt-8 px-5 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{currentTeam.name}</h2>
                {currentTeam.isRecruiting && <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-300">모집중</span>}
              </div>
              <p className="text-sm text-gray-500">
                {sportLabel[currentTeam.sportType] || currentTeam.sportType} · {currentTeam.memberCount}명
                {(currentTeam.city || currentTeam.district) ? ` · ${[currentTeam.city, currentTeam.district].filter(Boolean).join(' ')}` : ''}
              </p>
              {currentTeam.description && <p className="mt-3 text-base text-gray-600 whitespace-pre-line">{currentTeam.description}</p>}
            </div>
          </Card>

          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            <HubSectionTab label="소개" active={activeSection === 'overview'} onClick={() => setActiveSection('overview')} />
            <HubSectionTab label={`굿즈 ${hubData?.sections.goodsCount ?? hubGoods.length}`} active={activeSection === 'goods'} onClick={() => setActiveSection('goods')} />
            <HubSectionTab label={`수강권 ${hubData?.sections.passesCount ?? hubPasses.length}`} active={activeSection === 'passes'} onClick={() => setActiveSection('passes')} />
            <HubSectionTab label={`대회 ${hubData?.sections.eventsCount ?? hubEvents.length}`} active={activeSection === 'events'} onClick={() => setActiveSection('events')} />
          </div>

          {canManageCatalog && (
            <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1 @3xl:hidden">
              <Link
                href={`/marketplace/new?teamId=${teamId}&teamName=${encodeURIComponent(currentTeam.name)}`}
                className="shrink-0 flex items-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 min-h-[44px]"
              >
                <Plus size={14} aria-hidden="true" />
                굿즈 등록
              </Link>
              <Link
                href={`/lessons/new?teamId=${teamId}&teamName=${encodeURIComponent(currentTeam.name)}`}
                className="shrink-0 flex items-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 min-h-[44px]"
              >
                <Plus size={14} aria-hidden="true" />
                수강권 등록
              </Link>
              <Link
                href={`/tournaments/new?teamId=${teamId}&teamName=${encodeURIComponent(currentTeam.name)}`}
                className="shrink-0 flex items-center gap-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 min-h-[44px]"
              >
                <Plus size={14} aria-hidden="true" />
                대회 등록
              </Link>
            </div>
          )}

          {activeSection === 'overview' && (
            <div className="space-y-4 mt-4">
              <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">팀 여정</h3>
                <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-2">
                  <Link href={`/teams/${teamId}/matches`} className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-200">경기 기록</Link>
                  <Link href={`/teams/${teamId}/mercenary`} className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-200">용병 모집</Link>
                  <Link href={`/teams/${teamId}/members`} className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-200">멤버</Link>
                </div>
              </Card>
              {gallery.length > 0 && (
                <Card>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">갤러리</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {gallery.map((photo, index) => (
                      <button key={`${photo}-${index}`} type="button" onClick={() => openMedia(photo)} className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700">
                        <SafeImage src={photo} fallbackSrc={fallbackGallery[index] ?? fallbackCover} alt={`${team.name} 사진 ${index + 1}`} fill className="object-cover" sizes="(max-width: 768px) 33vw, 20vw" />
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {activeSection === 'goods' && (
            <HubGoodsSection items={hubGoods} />
          )}

          {activeSection === 'passes' && (
            <HubPassesSection items={hubPasses} />
          )}

          {activeSection === 'events' && (
            <HubEventsSection items={hubEvents} />
          )}
        </div>

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
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">허브 등록</h3>
                <div className="space-y-1.5 text-sm">
                  <Link href={`/marketplace/new?teamId=${teamId}&teamName=${encodeURIComponent(currentTeam.name)}`} className="block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2.5 min-h-[44px] flex items-center text-gray-700 dark:text-gray-200">
                    굿즈 등록
                  </Link>
                  <Link href={`/lessons/new?teamId=${teamId}&teamName=${encodeURIComponent(currentTeam.name)}`} className="block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2.5 min-h-[44px] flex items-center text-gray-700 dark:text-gray-200">
                    수강권 등록
                  </Link>
                  <Link href={`/tournaments/new?teamId=${teamId}&teamName=${encodeURIComponent(currentTeam.name)}`} className="block rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2.5 min-h-[44px] flex items-center text-gray-700 dark:text-gray-200">
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

            {!isMyTeamsLoading && !isMyTeam && (
              <Card padding="sm" className="space-y-2">
                {!currentTeam.isRecruiting ? (
                  <Button disabled variant="subtle" fullWidth>모집 마감</Button>
                ) : isAuthenticated ? (
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
                ) : (
                  <Link href={`/login?redirect=/teams/${teamId}`} className={buttonStyles({ fullWidth: true })}>
                    로그인 후 가입 신청
                  </Link>
                )}

                <Button onClick={handleContact} variant="subtle" fullWidth className="justify-center gap-2">
                  <MessageCircle size={17} />
                  연락하기
                </Button>
              </Card>
            )}

            <Card padding="sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">허브 섹션</h3>
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
