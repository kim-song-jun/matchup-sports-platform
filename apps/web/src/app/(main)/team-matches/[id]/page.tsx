'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Clock, MapPin, Trophy, DollarSign,
  Users, Shield, CheckCircle2, XCircle, AlertCircle, Star,
  ChevronRight, MapPinCheck, ClipboardCheck, Pencil,
} from 'lucide-react';
import {
  useTeamMatch, useTeamMatchRefereeSchedule,
  useApplyTeamMatch, useRespondTeamMatchApplication,
  useTeamMatchArrival,
} from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { getGradeInfo, MATCH_TYPES } from '@/lib/skill-grades';
import type { TeamMatchApplication } from '@/types/api';

const levelLabel: Record<string, string> = {
  beginner: '입문', lower: '하', middle: '중', upper: '상', pro: '프로',
};
const matchStyleLabel: Record<string, string> = {
  friendly: '친선', competitive: '경쟁', manner_focused: '매너 중시',
};
const sportLabel: Record<string, string> = { soccer: '축구', futsal: '풋살' };

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${weekdays[d.getDay()]})`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원';
}

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
          <div className="h-[200px] animate-pulse rounded-2xl bg-gray-50" />
          <div className="h-[300px] animate-pulse rounded-2xl bg-gray-50" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="pt-[var(--safe-area-top)] px-5 lg:px-0 py-20 text-center">
        <AlertCircle size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-[15px] text-gray-600">모집글을 찾을 수 없어요</p>
      </div>
    );
  }

  const isHost = user?.id === match.hostUserId;
  const isMatchDay = new Date(match.matchDate).toDateString() === new Date().toDateString();
  const isCompleted = match.status === 'completed';
  const isRecruiting = match.status === 'recruiting';
  const applications = match.applications ?? [];

  const statusMap: Record<string, { label: string; className: string }> = {
    recruiting: { label: '모집중', className: 'bg-blue-50 text-blue-500' },
    matched: { label: '매칭완료', className: 'bg-green-50 text-green-600' },
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
      <div className="hidden lg:flex items-center gap-2 text-[13px] text-gray-400 mb-6 px-5 lg:px-0 pt-4">
        <Link href="/team-matches" className="hover:text-gray-600 transition-colors">팀 매칭</Link>
        <ChevronRight size={14} />
        <span className="text-gray-700">상세</span>
      </div>

      {/* Header */}
      <header className="px-5 lg:px-0 lg:pt-0 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="뒤로 가기" className="lg:hidden flex items-center justify-center min-h-11 min-w-11 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[18px] font-bold text-gray-900 truncate flex-1">{match.title}</h1>
        <span className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-semibold ${status.className}`}>
          {status.label}
        </span>
      </header>

      <div className="px-5 lg:px-0">
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-8">
          {/* 왼쪽: 경기 정보 */}
          <div className="space-y-4">
            {/* 기본 정보 카드 */}
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <h2 className="text-[16px] font-bold text-gray-900 mb-3">경기 정보</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500 shrink-0">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <p className="text-[13px] text-gray-400">날짜</p>
                    <p className="text-[14px] font-medium text-gray-900">{formatDate(match.matchDate)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500 shrink-0">
                    <Clock size={16} />
                  </div>
                  <div>
                    <p className="text-[13px] text-gray-400">시간</p>
                    <p className="text-[14px] font-medium text-gray-900">
                      {match.startTime} ~ {match.endTime}
                      {match.totalMinutes && <span className="text-gray-400 ml-1">({match.totalMinutes}분)</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500 shrink-0">
                    <Trophy size={16} />
                  </div>
                  <div>
                    <p className="text-[13px] text-gray-400">쿼터 수</p>
                    <p className="text-[14px] font-medium text-gray-900">{match.quarterCount}쿼터</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500 shrink-0">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <p className="text-[13px] text-gray-400">구장</p>
                    <p className="text-[14px] font-medium text-gray-900">{match.venueName}</p>
                    {match.venueAddress && (
                      <p className="text-[12px] text-gray-400">{match.venueAddress}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500 shrink-0">
                    <DollarSign size={16} />
                  </div>
                  <div>
                    <p className="text-[13px] text-gray-400">비용</p>
                    <p className="text-[14px] font-medium text-gray-900">
                      총 {formatCurrency(match.totalFee)}
                      {match.opponentFee != null && (
                        <span className="text-gray-400 ml-1">(상대팀 {formatCurrency(match.opponentFee)})</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 경기 조건 */}
            <div className="rounded-2xl bg-white border border-gray-100 p-5">
              <h2 className="text-[16px] font-bold text-gray-900 mb-3">경기 조건</h2>

              {/* 실력등급 배지 + 무료초청 태그 */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {match.skillGrade && (() => {
                  const grade = getGradeInfo(match.skillGrade);
                  return (
                    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-bold ${grade.color}`}>
                      {grade.label}등급
                    </span>
                  );
                })()}
                {match.isFreeInvitation && (
                  <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-[12px] font-semibold text-green-600">
                    무료초청
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 lg:gap-5">
                <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                  <p className="text-[12px] text-gray-400 mb-0.5">실력등급</p>
                  <p className="text-[14px] font-semibold text-gray-900">
                    {match.skillGrade ? `${getGradeInfo(match.skillGrade).label} - ${getGradeInfo(match.skillGrade).desc}` : (match.requiredLevel ? levelLabel[match.requiredLevel] ?? match.requiredLevel : '제한 없음')}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                  <p className="text-[12px] text-gray-400 mb-0.5">선출선수</p>
                  <p className="text-[14px] font-semibold text-gray-900">{match.proPlayerCount != null ? `${match.proPlayerCount}명` : (match.hasProPlayers ? '있음' : '없음')}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                  <p className="text-[12px] text-gray-400 mb-0.5">경기방식</p>
                  <p className="text-[14px] font-semibold text-gray-900">{match.gameFormat || '-'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                  <p className="text-[12px] text-gray-400 mb-0.5">매치 유형</p>
                  <p className="text-[14px] font-semibold text-gray-900">
                    {match.matchType ? (MATCH_TYPES.find(mt => mt.value === match.matchType)?.label ?? match.matchType) : '-'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                  <p className="text-[12px] text-gray-400 mb-0.5">경기 스타일</p>
                  <p className="text-[14px] font-semibold text-gray-900">
                    {match.matchStyle ? matchStyleLabel[match.matchStyle] ?? match.matchStyle : '미정'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                  <p className="text-[12px] text-gray-400 mb-0.5">종목</p>
                  <p className="text-[14px] font-semibold text-gray-900">
                    {sportLabel[match.sportType] ?? match.sportType}
                  </p>
                </div>
                {match.uniformColor && (
                  <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                    <p className="text-[12px] text-gray-400 mb-0.5">유니폼 색상</p>
                    <p className="text-[14px] font-semibold text-gray-900">{match.uniformColor}</p>
                  </div>
                )}
                <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                  <p className="text-[12px] text-gray-400 mb-0.5">용병 허용</p>
                  <p className="text-[14px] font-semibold text-gray-900">{match.allowMercenary ? '허용' : '불가'}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3.5 py-3">
                  <p className="text-[12px] text-gray-400 mb-0.5">심판 유무</p>
                  <p className="text-[14px] font-semibold text-gray-900">{match.hasReferee ? '있음' : '없음'}</p>
                </div>
              </div>
              {match.notes && (
                <div className="mt-4 rounded-xl bg-gray-50 px-3.5 py-3">
                  <p className="text-[12px] text-gray-400 mb-1">추가 안내</p>
                  <p className="text-[14px] text-gray-700 whitespace-pre-wrap">{match.notes}</p>
                </div>
              )}
            </div>

            {/* 심판 배정 표 */}
            {match.hasReferee && refereeSchedule && refereeSchedule.length > 0 && (
              <div className="rounded-2xl bg-white border border-gray-100 p-5">
                <h2 className="text-[16px] font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Shield size={16} className="text-blue-500" />
                  심판 배정표
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="py-2 px-3 text-left font-semibold text-gray-500">쿼터</th>
                        <th className="py-2 px-3 text-left font-semibold text-gray-500">담당팀</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refereeSchedule.map((item: { quarter: number; teamName: string }, idx: number) => (
                        <tr key={idx} className="border-b border-gray-50 last:border-0">
                          <td className="py-2.5 px-3 font-medium text-gray-900">{item.quarter}쿼터</td>
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
              <div className="rounded-2xl bg-white border border-gray-100 p-5">
                <h2 className="text-[16px] font-bold text-gray-900 mb-3">호스트 팀</h2>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-500 text-lg font-bold">
                    {match.hostTeam.name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] font-semibold text-gray-900">{match.hostTeam.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {match.hostTeam.mannerScore != null && (
                        <div className="flex items-center gap-0.5 text-[12px] text-amber-500">
                          <Star size={12} fill="currentColor" />
                          <span className="font-semibold">{match.hostTeam.mannerScore.toFixed(1)}</span>
                        </div>
                      )}
                      {match.hostTeam.matchCount != null && (
                        <span className="text-[12px] text-gray-400">{String(match.hostTeam.matchCount)}경기</span>
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
            <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3">
              {isRecruiting && !isHost && (
                <button
                  onClick={() => setShowApplyModal(true)}
                  className="w-full rounded-xl bg-blue-500 py-3.5 text-[15px] font-semibold text-white hover:bg-blue-600 active:bg-blue-700 transition-colors"
                >
                  <span className="flex items-center justify-center gap-2">경기 신청하기</span>
                </button>
              )}

              {isMatchDay && !isCompleted && (
                <button
                  onClick={handleArrival}
                  disabled={arrivalMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3.5 text-[15px] font-semibold text-white hover:bg-green-600 active:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <MapPinCheck size={18} />
                  도착 인증
                </button>
              )}

              {isCompleted && (
                <Link
                  href={`/team-matches/${id}/evaluate`}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-3.5 text-[15px] font-semibold text-white hover:bg-gray-800 transition-colors"
                >
                  <ClipboardCheck size={18} />
                  경기 평가하기
                </Link>
              )}

              {isHost && isRecruiting && (
                <>
                  <Link
                    href={`/team-matches/${id}/edit`}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-50 py-3.5 text-[14px] font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Pencil size={16} />
                    모집글 수정
                  </Link>
                  <p className="text-center text-[13px] text-gray-400">내가 작성한 모집글이에요</p>
                </>
              )}
            </div>

            {/* 신청 목록 (호스트만) */}
            {isHost && applications.length > 0 && (
              <div className="rounded-2xl bg-white border border-gray-100 p-5">
                <h2 className="text-[16px] font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Users size={16} className="text-blue-500" />
                  신청 목록
                  <span className="ml-auto text-[13px] font-normal text-gray-400">{applications.length}팀</span>
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
                      <div key={app.id} className="rounded-xl border border-gray-100 p-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-sm font-bold text-gray-600">
                              {app.teamName?.charAt(0)}
                            </div>
                            <span className="text-[14px] font-semibold text-gray-900">{app.teamName}</span>
                          </div>
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${appStatus.className}`}>
                            {appStatus.label}
                          </span>
                        </div>
                        {app.message && (
                          <p className="text-[13px] text-gray-500 mb-3 pl-10">{app.message}</p>
                        )}
                        {app.status === 'pending' && (
                          <div className="flex gap-2 pl-10">
                            <button
                              onClick={() => handleRespond(app.id, 'approve')}
                              disabled={respondMutation.isPending}
                              className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-blue-50 py-2 text-[13px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                            >
                              <CheckCircle2 size={14} />
                              승인
                            </button>
                            <button
                              onClick={() => handleRespond(app.id, 'reject')}
                              disabled={respondMutation.isPending}
                              className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-gray-50 py-2 text-[13px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
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
              <div className="rounded-2xl bg-gray-50 p-6 text-center">
                <Users size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-[14px] text-gray-500">아직 신청한 팀이 없어요</p>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      <div className="h-6" />

      {/* 신청 모달 */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowApplyModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-t-2xl lg:rounded-2xl p-6 pb-[calc(1.5rem+var(--safe-area-bottom))] animate-fade-in">
            <h3 className="text-[18px] font-bold text-gray-900 mb-3">경기 신청</h3>

            <label className="flex items-start gap-3 rounded-xl bg-gray-50 p-4 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <div>
                <p className="text-[14px] font-medium text-gray-900">상호 확인 동의</p>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  경기 조건, 비용, 규정을 확인했으며 상대팀과 상호 존중하겠습니다.
                </p>
              </div>
            </label>

            <div className="mb-4">
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">메시지 (선택)</label>
              <textarea
                value={applyMessage}
                onChange={(e) => setApplyMessage(e.target.value)}
                placeholder="호스트에게 전달할 메시지를 작성하세요"
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-all resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowApplyModal(false)}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-[14px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleApply}
                disabled={!confirmed || applyMutation.isPending}
                className="flex-1 rounded-xl bg-blue-500 py-3 text-[14px] font-semibold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
