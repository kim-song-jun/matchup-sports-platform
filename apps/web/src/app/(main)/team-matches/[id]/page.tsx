'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Clock, MapPin, Trophy, DollarSign,
  Users, Shield, AlertCircle, Star,
  ChevronRight, MapPinCheck, ClipboardCheck, Pencil,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { ApplicationsSection } from '@/components/team-matches/applications-section';
import {
  useTeamMatch, useTeamMatchRefereeSchedule,
  useApplyTeamMatch,
  useMyTeams,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { getGradeInfo, MATCH_TYPES } from '@/lib/skill-grades';
import { sportLabel } from '@/lib/constants';
import {
  getMyParticipantTeams,
  getParticipantTeams,
  getTeamMatchStatusMeta,
  isArrivalOpen,
} from '@/lib/team-match-operations';
import { getTeamLogo } from '@/lib/sport-image';
import { formatDateDot, formatAmount } from '@/lib/utils';

const levelLabel: Record<string, string> = {
  beginner: '입문', lower: '하', middle: '중', upper: '상', pro: '프로',
};
const matchStyleLabel: Record<string, string> = {
  friendly: '친선', competitive: '경쟁', manner_focused: '매너 중시',
};

export default function TeamMatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { isAuthenticated } = useAuthStore();
  const { data: match, isLoading } = useTeamMatch(id);
  const { data: refereeSchedule } = useTeamMatchRefereeSchedule(id);
  const { data: myTeams } = useMyTeams();
  const applyMutation = useApplyTeamMatch();

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');

  const isHost = Boolean(
    isAuthenticated
    && match?.hostTeam?.id
    && myTeams?.some((team) => team.id === match.hostTeam?.id && (team.role === 'owner' || team.role === 'manager')),
  );
  const applications = match?.applications ?? [];
  const applicableTeams = (myTeams ?? []).filter((team) => {
    if (team.role !== 'owner' && team.role !== 'manager') return false;
    if (team.id === match?.hostTeam?.id) return false;
    if (applications.some((application) => application.applicantTeamId === team.id)) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="pt-[var(--safe-area-top)]">
        <div className="px-5 @3xl:px-0 pt-4">
          <div className="h-6 w-32 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="px-5 @3xl:px-0 mt-6 space-y-4">
          <div className="h-[200px] animate-pulse rounded-2xl bg-gray-50 dark:bg-gray-700" />
          <div className="h-[300px] animate-pulse rounded-2xl bg-gray-50 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="pt-[var(--safe-area-top)] px-5 @3xl:px-0">
        <EmptyState
          icon={AlertCircle}
          title="모집글을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 모집글이에요"
          action={{ label: '목록으로', href: '/team-matches' }}
        />
      </div>
    );
  }

  const isCompleted = match.status === 'completed';
  const isRecruiting = match.status === 'recruiting';
  const participantTeams = getParticipantTeams(match);
  const myParticipantTeams = getMyParticipantTeams(match, myTeams);
  const isParticipant = myParticipantTeams.length > 0;
  const isParticipantManager = myParticipantTeams.some((team) => team.role === 'owner' || team.role === 'manager');
  const hasConfirmedOpponent = participantTeams.length === 2;
  const canOpenArrival = hasConfirmedOpponent && isParticipant && isArrivalOpen(match.status);
  const canOpenScore =
    hasConfirmedOpponent &&
    (match.status === 'completed' || (isParticipantManager && ['scheduled', 'checking_in', 'in_progress'].includes(match.status)));
  const canOpenEvaluate = isCompleted && isParticipant;
  const hostTeamLogo = match.hostTeam
    ? getTeamLogo(
        match.hostTeam.name,
        match.sportType,
        match.hostTeam.logoUrl,
        match.hostTeam.id || match.id,
      )
    : null;

  const status = getTeamMatchStatusMeta(match.status);
  const refereeRows = Object.entries(refereeSchedule?.schedule ?? {}).map(([quarterKey, assignedTeam]) => ({
    quarter: quarterKey.replace(/^Q(\d+)$/, '$1쿼터'),
    teamName:
      assignedTeam === 'home'
        ? match.hostTeam?.name ?? '호스트 팀'
        : assignedTeam === 'away'
          ? match.guestTeam?.name ?? '게스트 팀'
          : assignedTeam,
  }));

  function handleApply() {
    if (!confirmed) return;
    const teamId = applicableTeams.length > 0 ? (selectedTeamId || applicableTeams[0].id) : undefined;
    if (!teamId) return;
    applyMutation.mutate(
      { id, data: { applicantTeamId: teamId, message: applyMessage } },
      { onSuccess: () => setShowApplyModal(false) },
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Desktop breadcrumb */}
      <div className="hidden @3xl:flex items-center gap-2 text-sm text-gray-500 mb-6 px-5 @3xl:px-0 pt-4">
        <Link href="/team-matches" className="hover:text-gray-600 transition-colors">팀 매칭</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700 dark:text-gray-300">상세</span>
      </div>

      {/* Header */}
      <header className="px-5 @3xl:px-0 @3xl:pt-0 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="@3xl:hidden flex items-center justify-center min-h-11 min-w-11 rounded-xl text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate flex-1">{match.title}</h1>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-normal ${status.className}`}>
          {status.label}
        </span>
      </header>

      <div className="px-5 @3xl:px-0">
        <div className="@3xl:grid @3xl:grid-cols-[1fr_380px] @3xl:gap-8">
          {/* 왼쪽: 경기 정보 */}
          <div className="space-y-4">
            {/* 기본 정보 카드 */}
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">경기 정보</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 shrink-0">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">날짜</p>
                    <p className="text-base font-medium text-gray-900 dark:text-white">{formatDateDot(match.matchDate)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 shrink-0">
                    <Clock size={16} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">시간</p>
                    <p className="text-base font-medium text-gray-900 dark:text-white">
                      {match.startTime} ~ {match.endTime}
                      {match.totalMinutes && <span className="text-gray-500 ml-1">({match.totalMinutes}분)</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 shrink-0">
                    <Trophy size={16} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">쿼터 수</p>
                    <p className="text-base font-medium text-gray-900 dark:text-white">{match.quarterCount}쿼터</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 shrink-0">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">구장</p>
                    <p className="text-base font-medium text-gray-900 dark:text-white">{match.venueName}</p>
                    {match.venueAddress && (
                      <p className="text-xs text-gray-500">{match.venueAddress}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 shrink-0">
                    <DollarSign size={16} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">비용</p>
                    <p className="text-base font-medium text-gray-900 dark:text-white">
                      총 {formatAmount(match.totalFee)}
                      {match.opponentFee != null && (
                        <span className="text-gray-500 ml-1">(상대팀 {formatAmount(match.opponentFee)})</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 경기 조건 */}
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">경기 조건</h2>

              {/* 실력등급 배지 + 무료초청 태그 */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {match.skillGrade && (() => {
                  const grade = getGradeInfo(match.skillGrade);
                  return (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-normal ${grade.color}`}>
                      {grade.label}등급
                    </span>
                  );
                })()}
                {match.isFreeInvitation && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-normal bg-green-50 text-green-600">
                    무료초청
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 @3xl:gap-5">
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">실력등급</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {match.skillGrade ? `${getGradeInfo(match.skillGrade).label} - ${getGradeInfo(match.skillGrade).desc}` : (match.requiredLevel ? levelLabel[match.requiredLevel] ?? match.requiredLevel : '제한 없음')}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">선출선수</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{match.proPlayerCount != null ? `${match.proPlayerCount}명` : (match.hasProPlayers ? '있음' : '없음')}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">경기방식</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{match.gameFormat || '-'}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">매치 유형</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {match.matchType ? (MATCH_TYPES.find(mt => mt.value === match.matchType)?.label ?? match.matchType) : '-'}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">경기 스타일</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {match.matchStyle ? matchStyleLabel[match.matchStyle] ?? match.matchStyle : '미정'}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">종목</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {sportLabel[match.sportType] ?? match.sportType}
                  </p>
                </div>
                {match.uniformColor && (
                  <div className="rounded-2xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                    <p className="text-xs text-gray-500 mb-0.5">유니폼 색상</p>
                    <p className="text-base font-semibold text-gray-900 dark:text-white">{match.uniformColor}</p>
                  </div>
                )}
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">용병 허용</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{match.allowMercenary ? '허용' : '불가'}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">심판 유무</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{match.hasReferee ? '있음' : '없음'}</p>
                </div>
              </div>
              {match.notes && (
                <div className="mt-4 rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-1">추가 안내</p>
                  <p className="text-base text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{match.notes}</p>
                </div>
              )}
            </div>

            {/* 심판 배정 표 */}
            {!match.hasReferee && refereeRows.length > 0 && (
              <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
                <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Shield size={16} className="text-blue-500" />
                  심판 배정표
                </h2>
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <th className="py-2 px-3 text-left font-semibold text-gray-500">쿼터</th>
                        <th className="py-2 px-3 text-left font-semibold text-gray-500">담당팀</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refereeRows.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-50 last:border-0">
                          <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">{item.quarter}</td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{item.teamName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 호스트 팀 카드 */}
            {match.hostTeam && (
              <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
                <h2 className="text-base font-bold tracking-tight text-gray-900 dark:text-white mb-3">호스트 팀</h2>
                <Link
                  href={`/teams/${match.hostTeam.id}`}
                  aria-label="호스트 팀 상세 보기"
                  className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl -mx-2 px-2 py-1 transition-colors"
                >
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 text-lg font-bold">
                    {hostTeamLogo ? (
                      <img
                        src={hostTeamLogo}
                        alt={`${match.hostTeam.name} logo`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      match.hostTeam.name?.charAt(0)
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-md font-semibold text-gray-900 dark:text-white">{match.hostTeam.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {match.hostTeam.mannerScore != null && (
                        <div className="flex items-center gap-0.5 text-xs text-amber-500">
                          <Star size={12} fill="currentColor" />
                          <span className="font-semibold">{match.hostTeam.mannerScore.toFixed(1)}</span>
                        </div>
                      )}
                      {match.hostTeam.matchCount != null && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{String(match.hostTeam.matchCount)}경기</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-gray-300" />
                </Link>
              </div>
            )}
          </div>

          {/* 오른쪽: CTA + 신청 목록 */}
          <div className="mt-4 @3xl:mt-0 detail-sidebar">
            <div className="sidebar-sticky space-y-3">
            {/* CTA 버튼 영역 */}
            <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-3">
              {isRecruiting && !isHost && (
                <button
                  onClick={() => {
                    if (!isAuthenticated) {
                      router.push(`/login?redirect=/team-matches/${id}`);
                      return;
                    }
                    setShowApplyModal(true);
                  }}
                  className="w-full rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
                >
                  <span className="flex items-center justify-center gap-2">경기 신청하기</span>
                </button>
              )}

              {canOpenArrival && (
                <Link
                  href={`/team-matches/${id}/arrival`}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
                >
                  <MapPinCheck size={18} />
                  도착 인증
                </Link>
              )}

              {canOpenScore && (
                <Link
                  href={`/team-matches/${id}/score`}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-3.5 text-md font-semibold text-white hover:bg-gray-800 transition-colors"
                >
                  <Trophy size={18} />
                  {isCompleted ? '저장된 경기 결과 보기' : '경기 결과 입력'}
                </Link>
              )}

              {canOpenEvaluate && (
                <Link
                  href={`/team-matches/${id}/evaluate`}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-semibold text-white hover:bg-blue-600 transition-colors"
                >
                  <ClipboardCheck size={18} />
                  경기 평가하기
                </Link>
              )}

              {isAuthenticated && isHost && isRecruiting && (
                <>
                  <Link
                    href={`/team-matches/${id}/edit`}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-50 dark:bg-gray-700 py-3.5 text-base font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Pencil size={16} />
                    모집글 수정
                  </Link>
                  <p className="text-center text-sm text-gray-500">내가 작성한 모집글이에요</p>
                </>
              )}
            </div>

            {/* 신청 현황 (호스트 팀 매니저+ 전용) */}
            {isHost && (
              <ApplicationsSection matchId={id} isRecruiting={isRecruiting} />
            )}
            </div>
          </div>
        </div>
      </div>


      <div className="h-24" />
      {/* 신청 모달 */}
      <Modal isOpen={showApplyModal} onClose={() => setShowApplyModal(false)} title="경기 신청">
        <label className="flex items-start gap-3 rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500"
          />
          <div>
            <p className="text-base font-medium text-gray-900 dark:text-white">상호 확인 동의</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              경기 조건, 비용, 규정을 확인했으며 상대팀과 상호 존중하겠습니다.
            </p>
          </div>
        </label>

        {applicableTeams.length === 0 ? (
          <div className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            신청 가능한 팀이 없어요. 매니저 이상 권한이 있는 팀으로만 신청할 수 있어요.
          </div>
        ) : applicableTeams.length > 1 ? (
          <div className="mb-4">
            <label htmlFor="team-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">신청 팀 선택</label>
            <select
              id="team-select"
              value={selectedTeamId || applicableTeams[0].id}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-base text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 dark:focus:border-blue-500 transition-colors min-h-[44px]"
            >
              {applicableTeams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mb-4 rounded-xl bg-gray-50 dark:bg-gray-700 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
            신청 팀: <span className="font-semibold">{applicableTeams[0].name}</span>
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="apply-message" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">메시지 (선택)</label>
          <textarea
            id="apply-message"
            value={applyMessage}
            onChange={(e) => setApplyMessage(e.target.value)}
            placeholder="호스트에게 전달할 메시지를 작성하세요"
            rows={3}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 dark:focus:border-blue-500 transition-colors resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowApplyModal(false)}
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 py-3 text-base font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleApply}
            disabled={!confirmed || applyMutation.isPending || applicableTeams.length === 0}
            className="flex-1 rounded-xl bg-blue-500 py-3 text-base font-bold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {applyMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  처리 중...
                </span>
              ) : '신청하기'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
