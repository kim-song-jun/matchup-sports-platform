'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Users, MapPin, MessageCircle, Share2, Globe, Video, Star, Instagram, Youtube, UserPlus, Trophy } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SportIconMap } from '@/components/icons/sport-icons';
import { BadgeDisplay } from '@/components/ui/badge-display';
import { SafeImage } from '@/components/ui/safe-image';
import { MediaLightbox } from '@/components/ui/media-lightbox';
import { useTeam, useTeamBadges, useMyTeams } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth-store';
import { getGradeInfo } from '@/lib/skill-grades';
import { api } from '@/lib/api';
import { sportLabel, levelLabel } from '@/lib/constants';
import { getTeamImage, getTeamImageSet, getTeamLogo } from '@/lib/sport-image';

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const { toast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const { data: team, isLoading } = useTeam(teamId);
  const { data: apiBadges } = useTeamBadges(teamId);
  const { data: myTeams } = useMyTeams();
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showMediaLightbox, setShowMediaLightbox] = useState(false);

  // Determine membership role from flattened useMyTeams() response
  const myMembership = myTeams?.find((t) => t.id === teamId);
  const isMyTeam = !!myMembership;
  const myRole = myMembership?.role;

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

  const SportIcon = SportIconMap[team.sportType];
  const hasSns = team.instagramUrl || team.youtubeUrl || team.kakaoOpenChat || team.websiteUrl;
  const coverImage = getTeamImage(team.sportType, team.coverImageUrl, team.id);
  const teamGallery = getTeamImageSet(team.sportType, team.photos, team.id, 3);
  const teamLogo = getTeamLogo(team.name, team.sportType, team.logoUrl, team.id);
  const fallbackCoverImage = getTeamImage(team.sportType, undefined, team.id);
  const fallbackTeamGallery = getTeamImageSet(team.sportType, undefined, team.id, 3);
  const fallbackTeamLogo = getTeamLogo(team.name, team.sportType, undefined, team.id);
  const mediaImages = [coverImage, ...teamGallery]
    .filter((image): image is string => Boolean(image))
    .map((image, index) => ({
      src: image,
      alt: `${team.name} 사진 ${index + 1}`,
      fallbackSrc: index === 0 ? fallbackCoverImage : (fallbackTeamGallery[index - 1] ?? fallbackCoverImage),
    }));

  function openMediaAt(index: number) {
    if (index < 0 || index >= mediaImages.length) return;
    setMediaIndex(index);
    setShowMediaLightbox(true);
  }

  function openMediaBySource(src: string) {
    const index = mediaImages.findIndex((image) => image.src === src);
    openMediaAt(index);
  }

  function handleContact() {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/teams/${teamId}`);
      return;
    }
    const contactInfo = team!.contactInfo;
    if (contactInfo) {
      // contactInfo may be tel: or plain text — open if URI, otherwise toast
      if (contactInfo.startsWith('http') || contactInfo.startsWith('tel:') || contactInfo.startsWith('mailto:')) {
        window.open(contactInfo, '_blank', 'noopener,noreferrer');
      } else {
        toast('info', `연락처: ${contactInfo}`);
      }
    } else {
      toast('info', '연락처가 등록되어 있지 않아요');
    }
  }

  return (
    <div className="pt-[var(--safe-area-top)] @3xl:pt-0 animate-fade-in">
      {/* Mobile header */}
      <header className="@3xl:hidden flex items-center justify-between px-5 py-3 sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm z-10 border-b border-gray-50 dark:border-gray-700">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="flex items-center justify-center min-h-11 min-w-11 rounded-xl -ml-1.5 hover:bg-gray-100 transition-colors"><ArrowLeft size={20} className="text-gray-700" /></button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate flex-1 ml-3">{team.name}</h1>
        <button
          onClick={async () => {
            try {
              if (navigator.share) {
                await navigator.share({ title: team.name, url: window.location.href });
              } else {
                await navigator.clipboard.writeText(window.location.href);
                toast('success', '링크가 복사되었어요');
              }
            } catch { /* user cancelled share */ }
          }}
          aria-label="공유하기"
          className="flex items-center justify-center min-h-11 min-w-11 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Share2 size={18} className="text-gray-500" />
        </button>
      </header>

      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/teams" className="hover:text-gray-600">팀&middot;클럽</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">{team.name}</span>
      </div>

      <div className="@3xl:grid @3xl:grid-cols-[1fr_380px] @3xl:gap-8">
        {/* Left */}
        <div className="px-5 @3xl:px-0">
          {/* Cover + Team header */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
            <button
              type="button"
              onClick={() => openMediaBySource(coverImage)}
              aria-label={`${team.name} 커버 이미지 보기`}
              className="h-32 @3xl:h-44 w-full bg-gray-800 flex items-center justify-center relative"
            >
              <SafeImage
                src={coverImage}
                fallbackSrc={fallbackCoverImage}
                alt=""
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
              <div className="absolute -bottom-6 left-5">
                <div className="rounded-[22px] bg-white/94 p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.24)] backdrop-blur-sm">
                  <SafeImage
                    src={teamLogo}
                    fallbackSrc={fallbackTeamLogo}
                    alt={`${team.name} logo`}
                    className="h-14 w-14 rounded-[18px] object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            </button>

            <div className="pt-8 px-5 pb-5">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{team.name}</h2>
                {team.isRecruiting && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded-full px-2 py-0.5">모집중</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                {SportIcon && <SportIcon size={14} />}
                <span>{sportLabel[team.sportType]}</span>
                <span className="text-gray-200">|</span>
                {team.skillGrade ? (() => {
                  const grade = getGradeInfo(team.skillGrade);
                  return (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-normal ${grade.color}`}>
                      {grade.label}등급
                    </span>
                  );
                })() : (
                  <span>{levelLabel[team.level]}</span>
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
                <p className="text-xs text-gray-500 mt-1">유니폼: {team.uniformColor}</p>
              )}

              {/* Badge display — API data only, no mock fallback */}
              {apiBadges && apiBadges.length > 0 && (
                <div className="mt-3">
                  <BadgeDisplay badges={apiBadges} size="md" />
                </div>
              )}

              {team.description && (
                <p className="mt-4 text-base text-gray-600 leading-relaxed whitespace-pre-line">{team.description}</p>
              )}
            </div>
          </div>

          {/* 최근 경기 결과 — API only */}
          <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">최근 경기</h3>
              <Link href={`/teams/${teamId}/matches`} className="text-sm text-blue-500 font-medium">전체보기</Link>
            </div>
            <EmptyState
              icon={Trophy}
              title="경기 기록이 없어요"
              description="팀 매칭에 참여하면 기록이 쌓여요"
              size="sm"
            />
          </div>

          {/* 활동 정보 */}
          <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">활동 정보</h3>
            <div className="grid grid-cols-2 gap-3 @3xl:gap-5">
              <InfoItem icon={<MapPin size={16} />} label="활동 지역" value={`${team.city || ''} ${team.district || ''}`.trim() || '미등록'} />
              <InfoItem icon={<Users size={16} />} label="팀 규모" value={`${team.memberCount}명`} />
            </div>
          </div>

          {/* SNS & 링크 */}
          {hasSns && (
            <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">SNS & 링크</h3>
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
            <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">홍보 영상</h3>
              <a href={team.shortsUrl} target="_blank" rel="noopener noreferrer"
                className="block rounded-xl bg-gray-900 h-48 @3xl:h-64 flex items-center justify-center text-white/60 hover:text-white/80 transition-colors relative overflow-hidden">
                <div className="text-center z-10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm mx-auto mb-2">
                    <Video size={24} />
                  </div>
                  <p className="text-sm font-medium">영상 보기</p>
                </div>
              </a>
            </div>
          )}

          {/* 갤러리 — 실제 사진이 있을 때만 표시 */}
          {teamGallery.length > 0 && (
            <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">갤러리</h3>
              <div className="grid grid-cols-3 gap-2">
                {teamGallery.map((photo: string, i: number) => (
                  <button
                    key={`${photo}-${i}`}
                    type="button"
                    onClick={() => openMediaBySource(photo)}
                    aria-label={`${team.name} 갤러리 이미지 ${i + 1} 보기`}
                    className="aspect-square rounded-xl bg-gray-50 dark:bg-gray-700 overflow-hidden"
                  >
                    <SafeImage
                      src={photo}
                      fallbackSrc={fallbackTeamGallery[i] ?? fallbackCoverImage}
                      alt={`팀 사진 ${i + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="px-5 @3xl:px-0 mt-4 @3xl:mt-0 detail-sidebar">
          <div className="sidebar-sticky space-y-3">

          {/* 내 팀: 역할별 관리 버튼 */}
          {isMyTeam && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 space-y-2">
              {(myRole === 'owner' || myRole === 'manager') && (
                <Link
                  href={`/teams/${teamId}/edit`}
                  className="block w-full text-center rounded-xl bg-gray-900 dark:bg-white py-3.5 text-base font-bold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
                >
                  팀 정보 수정
                </Link>
              )}
              <Link
                href={`/teams/${teamId}/members`}
                className="block w-full text-center rounded-xl bg-gray-50 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                멤버 관리
              </Link>
              {myRole === 'member' && (
                <button
                  onClick={async () => {
                    try {
                      await api.post(`/teams/${teamId}/leave`);
                      toast('success', '팀에서 나갔어요');
                    } catch {
                      toast('error', '팀 나가기에 실패했어요');
                    }
                  }}
                  className="w-full rounded-xl bg-red-50 dark:bg-red-950/30 py-3 text-base font-semibold text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                >
                  팀 나가기
                </button>
              )}
            </div>
          )}

          {/* 비멤버: 가입 신청 + 연락하기 */}
          {!isMyTeam && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 space-y-2">
              {isAuthenticated ? (
                <button
                  onClick={async () => {
                    try {
                      await api.post(`/teams/${teamId}/apply`);
                      toast('success', '팀 가입 신청이 완료되었어요');
                    } catch {
                      toast('error', '신청에 실패했어요. 이미 신청했거나 권한이 없을 수 있어요');
                    }
                  }}
                  className="w-full rounded-xl bg-blue-500 py-3.5 text-base font-bold text-white hover:bg-blue-600 transition-colors"
                >
                  팀 가입 신청
                </button>
              ) : (
                <Link
                  href={`/login?redirect=/teams/${teamId}`}
                  className="block w-full text-center rounded-xl bg-blue-500 py-3.5 text-base font-semibold text-white hover:bg-blue-600 transition-colors"
                >
                  로그인 후 가입 신청
                </Link>
              )}

              {/* 연락하기 — contactInfo 유무에 따라 disabled */}
              {team.contactInfo ? (
                <button
                  onClick={handleContact}
                  className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle size={18} />
                  연락하기
                </button>
              ) : (
                <button
                  disabled
                  aria-label="연락처 미등록"
                  className="w-full rounded-xl bg-gray-50 dark:bg-gray-700 py-3 text-base font-semibold text-gray-400 dark:text-gray-500 cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <MessageCircle size={18} />
                  연락처 미등록
                </button>
              )}
            </div>
          )}

          {/* 용병 모집 — 전체보기 링크 */}
          <Link href={`/teams/${teamId}/mercenary`} className="block">
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                  <UserPlus size={18} className="text-gray-500" />
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-gray-900 dark:text-white">용병 모집</p>
                  <p className="text-xs text-gray-500 mt-0.5">이 팀의 용병 모집 전체보기</p>
                </div>
                <ChevronRight size={16} className="text-gray-500" />
              </div>
            </div>
          </Link>

          {/* Owner */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">운영자</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-base font-bold text-gray-500">
                {team.owner?.nickname?.charAt(0) || '?'}
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-gray-900 dark:text-white">{team.owner?.nickname || '알 수 없음'}</p>
                {team.owner?.mannerScore && (
                  <div className="flex items-center gap-1 text-sm text-amber-500 mt-0.5">
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

      <MediaLightbox
        isOpen={showMediaLightbox}
        images={mediaImages}
        initialIndex={mediaIndex}
        onClose={() => setShowMediaLightbox(false)}
        title={`${team.name} 이미지`}
      />
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-3">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-base font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function SnsButton({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${color}`}>
      {icon}
      {label}
    </a>
  );
}
