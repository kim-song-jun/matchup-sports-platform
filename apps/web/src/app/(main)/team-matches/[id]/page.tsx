'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Clock, MapPin, Trophy, DollarSign,
  Users, Shield, CheckCircle2, XCircle, AlertCircle, Star,
  ChevronRight, MapPinCheck, ClipboardCheck, Pencil,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import {
  useTeamMatch, useTeamMatchRefereeSchedule,
  useApplyTeamMatch, useRespondTeamMatchApplication,
  useTeamMatchArrival,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { getGradeInfo, MATCH_TYPES } from '@/lib/skill-grades';
import type { TeamMatchApplication } from '@/types/api';
import { sportLabel } from '@/lib/constants';
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
  const { user } = useAuthStore();
  const { data: match, isLoading } = useTeamMatch(id);
  const { data: refereeSchedule } = useTeamMatchRefereeSchedule(id);
  const applyMutation = useApplyTeamMatch();
  const respondMutation = useRespondTeamMatchApplication();
  const arrivalMutation = useTeamMatchArrival();

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyMessage, setApplyMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (isLoading) {
    return (
      <div className="pt-[var(--safe-area-top)]">
        <div className="px-5 lg:px-0 pt-4">
          <div className="h-6 w-32 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="px-5 lg:px-0 mt-6 space-y-4">
          <div className="h-[200px] animate-pulse rounded-2xl bg-gray-50 dark:bg-gray-700" />
          <div className="h-[300px] animate-pulse rounded-2xl bg-gray-50 dark:bg-gray-700" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="pt-[var(--safe-area-top)] px-5 lg:px-0">
        <EmptyState
          icon={AlertCircle}
          title="모집글을 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 모집글이에요"
          action={{ label: '목록으로', href: '/team-matches' }}
        />
      </div>
    );
  }

  const isHost = user?.id === match.hostUserId;
  const isMatchDay = new Date(match.matchDate).toDateString() === new Date().toDateString();
  const isCompleted = match.status === 'completed';
  const isRecruiting = match.status === 'recruiting';
  const applications = match.applications ?? [];

  const statusMap: Record<string, { label: string; className: string }> = {
    recruiting: { label: '모집중', className: 'bg-gray-100 text-gray-500' },
    matched: { label: '매칭완료', className: 'bg-gray-100 text-blue-500' },
    in_progress: { label: '경기중', className: 'bg-amber-50 text-amber-600' },
    completed: { label: '경기종료', className: 'bg-gray-100 text-gray-500' },
    cancelled: { label: '취소됨', className: 'bg-red-50 text-red-500' },
  };
  const status = statusMap[match.status] ?? statusMap.recruiting;

  function handleApply() {
    if (!confirmed) return;
    applyMutation.mutate(
      { id, data: { message: applyMessage } },
      { onSuccess: () => setShowApplyModal(false) },
    );
  }

  function handleRespond(applicationId: string, action: 'approve' | 'reject') {
    respondMutation.mutate({ id, applicationId, action });
  }

  function handleArrival() {
    arrivalMutation.mutate(id);
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      {/* Desktop breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 text-sm text-gray-500 mb-6 px-5 lg:px-0 pt-4">
        <Link href="/team-matches" className="hover:text-gray-600 transition-colors">팀 매칭</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">상세</span>
      </div>

      {/* Header */}
      <header className="px-5 lg:px-0 lg:pt-0 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="lg:hidden flex items-center justify-center min-h-11 min-w-11 rounded-xl text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate flex-1">{match.title}</h1>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold ${status.className}`}>
          {status.label}
        </span>
      </header>

      <div className="px-5 lg:px-0">
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
          {/* 왼쪽: 경기 정보 */}
          <div className="space-y-4">
            {/* 기본 정보 카드 */}
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">경기 정보</h2>
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
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">경기 조건</h2>

              {/* 실력등급 배지 + 무료초청 태그 */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {match.skillGrade && (() => {
                  const grade = getGradeInfo(match.skillGrade);
                  return (
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-semibold ${grade.color}`}>
                      {grade.label}등급
                    </span>
                  );
                })()}
                {match.isFreeInvitation && (
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-semibold bg-green-50 text-green-600">
                    무료초청
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 lg:gap-5">
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">실력등급</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {match.skillGrade ? `${getGradeInfo(match.skillGrade).label} - ${getGradeInfo(match.skillGrade).desc}` : (match.requiredLevel ? levelLabel[match.requiredLevel] ?? match.requiredLevel : '제한 없음')}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">선출선수</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{match.proPlayerCount != null ? `${match.proPlayerCount}명` : (match.hasProPlayers ? '있음' : '없음')}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">경기방식</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{match.gameFormat || '-'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">매치 유형</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {match.matchType ? (MATCH_TYPES.find(mt => mt.value === match.matchType)?.label ?? match.matchType) : '-'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">경기 스타일</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {match.matchStyle ? matchStyleLabel[match.matchStyle] ?? match.matchStyle : '미정'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">종목</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {sportLabel[match.sportType] ?? match.sportType}
                  </p>
                </div>
                {match.uniformColor && (
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                    <p className="text-xs text-gray-500 mb-0.5">유니폼 색상</p>
                    <p className="text-base font-semibold text-gray-900 dark:text-white">{match.uniformColor}</p>
                  </div>
                )}
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">용병 허용</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{match.allowMercenary ? '허용' : '불가'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-0.5">심판 유무</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">{match.hasReferee ? '있음' : '없음'}</p>
                </div>
              </div>
              {match.notes && (
                <div className="mt-4 rounded-xl bg-gray-50 dark:bg-gray-700 px-3.5 py-3">
                  <p className="text-xs text-gray-500 mb-1">추가 안내</p>
                  <p className="text-base text-gray-700 whitespace-pre-wrap">{match.notes}</p>
                </div>
              )}
            </div>

            {/* 심판 배정 표 */}
            {match.hasReferee && refereeSchedule && refereeSchedule.length > 0 && (
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
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
                      {refereeSchedule.map((item: { quarter: number; teamName: string }, idx: number) => (
                        <tr key={idx} className="border-b border-gray-50 last:border-0">
                          <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">{item.quarter}쿼터</td>
                          <td className="py-2.5 px-3 text-gray-700">{item.teamName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 호스트 팀 카드 */}
            {match.hostTeam && (
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">호스트 팀</h2>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-500 text-lg font-bold">
                    {match.hostTeam.name?.charAt(0)}
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
                        <span className="text-xs text-gray-500">{String(match.hostTeam.matchCount)}경기</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </div>
            )}
          </div>

          {/* 오른쪽: CTA + 신청 목록 */}
          <div className="mt-4 lg:mt-0 detail-sidebar">
            <div className="sidebar-sticky space-y-3">
            {/* CTA 버튼 영역 */}
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 space-y-3">
              {isRecruiting && !isHost && (
                <button
                  onClick={() => setShowApplyModal(true)}
                  className="w-full rounded-xl bg-blue-500 py-3.5 text-md font-bold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
                >
                  <span className="flex items-center justify-center gap-2">경기 신청하기</span>
                </button>
              )}

              {isMatchDay && !isCompleted && (
                <button
                  onClick={handleArrival}
                  disabled={arrivalMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3.5 text-md font-semibold text-white hover:bg-green-600 active:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <MapPinCheck size={18} />
                  도착 인증
                </button>
              )}

              {isCompleted && (
                <Link
                  href={`/team-matches/${id}/evaluate`}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3.5 text-md font-semibold text-white hover:bg-blue-600 transition-colors"
                >
                  <ClipboardCheck size={18} />
                  경기 평가하기
                </Link>
              )}

              {isHost && isRecruiting && (
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

            {/* 신청 목록 (호스트만) */}
            {isHost && applications.length > 0 && (
              <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Users size={16} className="text-blue-500" />
                  신청 목록
                  <span className="ml-auto text-sm font-normal text-gray-500">{applications.length}팀</span>
                </h2>
                <div className="space-y-3">
                  {applications.map((app: TeamMatchApplication) => {
                    const appStatusMap: Record<string, { label: string; className: string }> = {
                      pending: { label: '대기중', className: 'bg-amber-50 text-amber-600' },
                      approved: { label: '승인', className: 'bg-green-50 text-green-600' },
                      rejected: { label: '거절', className: 'bg-red-50 text-red-500' },
                    };
                    const appStatus = appStatusMap[app.status] ?? appStatusMap.pending;

                    return (
                      <div key={app.id} className="rounded-xl border border-gray-100 dark:border-gray-700 p-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-700 text-sm font-bold text-gray-600">
                              {app.teamName?.charAt(0)}
                            </div>
                            <span className="text-base font-semibold text-gray-900 dark:text-white">{app.teamName}</span>
                          </div>
                          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${appStatus.className}`}>
                            {appStatus.label}
                          </span>
                        </div>
                        {app.message && (
                          <p className="text-sm text-gray-500 mb-3 pl-10">{app.message}</p>
                        )}
                        {app.status === 'pending' && (
                          <div className="flex gap-2 pl-10">
                            <button
                              onClick={() => handleRespond(app.id, 'approve')}
                              disabled={respondMutation.isPending}
                              className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-blue-50 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              <CheckCircle2 size={14} />
                              승인
                            </button>
                            <button
                              onClick={() => handleRespond(app.id, 'reject')}
                              disabled={respondMutation.isPending}
                              className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-gray-50 dark:bg-gray-700 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
                            >
                              <XCircle size={14} />
                              거절
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isHost && applications.length === 0 && isRecruiting && (
              <EmptyState
                icon={Users}
                title="아직 신청한 팀이 없어요"
                description="상대 팀의 신청을 기다리고 있어요"
                size="sm"
              />
            )}
            </div>
          </div>
        </div>
      </div>


      {/* 신청 모달 */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowApplyModal(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-2xl lg:rounded-2xl p-6 pb-[calc(1.5rem+var(--safe-area-bottom))] animate-fade-in">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">경기 신청</h3>

            <label className="flex items-start gap-3 rounded-xl bg-gray-50 dark:bg-gray-700 p-4 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500"
              />
              <div>
                <p className="text-base font-medium text-gray-900 dark:text-white">상호 확인 동의</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  경기 조건, 비용, 규정을 확인했으며 상대팀과 상호 존중하겠습니다.
                </p>
              </div>
            </label>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">메시지 (선택)</label>
              <textarea
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
                disabled={!confirmed || applyMutation.isPending}
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
          </div>
        </div>
      )}
    </div>
  );
}
