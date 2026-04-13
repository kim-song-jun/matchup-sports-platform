'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useMyTeams, useTeamMatch, useTeamMatchArrival } from '@/hooks/use-api';
import {
  getArrivalCheck,
  getMyParticipantTeams,
  getParticipantTeams,
  getTeamMatchStatusMeta,
  isArrivalOpen,
} from '@/lib/team-match-operations';
import { formatDateDot, extractErrorMessage } from '@/lib/utils';

function formatCountdown(matchDate: string, startTime: string) {
  const startAt = new Date(`${matchDate}T${startTime}:00`);
  const diff = startAt.getTime() - Date.now();

  if (Number.isNaN(startAt.getTime())) {
    return '--:--';
  }

  if (diff <= 0) {
    return '경기 시작 시간입니다';
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${seconds}초`;
  }

  return `${minutes}분 ${seconds}초`;
}

function formatArrivedAt(value?: string | null) {
  if (!value) {
    return '대기 중';
  }

  return new Date(value).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ArrivalCheckPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;
  const { data: match, isLoading: isMatchLoading } = useTeamMatch(id);
  const { data: myTeams, isLoading: isTeamsLoading } = useMyTeams();
  const arrivalMutation = useTeamMatchArrival();

  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [countdown, setCountdown] = useState('--:--');

  const participantTeams = useMemo(() => (match ? getParticipantTeams(match) : []), [match]);
  const myParticipantTeams = useMemo(
    () => (match ? getMyParticipantTeams(match, myTeams) : []),
    [match, myTeams],
  );
  const statusMeta = match ? getTeamMatchStatusMeta(match.status) : null;
  const canManageResult = myParticipantTeams.some((team) => team.role === 'owner' || team.role === 'manager');

  useEffect(() => {
    if (!myParticipantTeams.length) {
      return;
    }

    if (!myParticipantTeams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(myParticipantTeams[0].id);
    }
  }, [myParticipantTeams, selectedTeamId]);

  useEffect(() => {
    if (!match) {
      return;
    }

    const update = () => setCountdown(formatCountdown(match.matchDate, match.startTime));
    update();

    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [match]);

  const selectedTeam = participantTeams.find((team) => team.id === selectedTeamId) ?? null;
  const selectedArrival = match && selectedTeam ? getArrivalCheck(match, selectedTeam.id) : null;

  const blockedState = useMemo(() => {
    if (!match) {
      return null;
    }

    if (participantTeams.length < 2) {
      return {
        title: '상대 팀이 확정된 뒤 도착 인증이 열립니다',
        description: '현재는 모집 또는 승인 전 단계라서 도착 인증을 시작할 수 없어요.',
      };
    }

    if (myParticipantTeams.length === 0) {
      return {
        title: '참여 팀 멤버만 도착 인증할 수 있어요',
        description: '이 경기에 참여한 팀의 멤버 계정으로 다시 확인해주세요.',
      };
    }

    if (!isArrivalOpen(match.status)) {
      const statusDescription: Record<string, string> = {
        recruiting: '매칭이 성사된 뒤에 도착 인증을 시작할 수 있어요.',
        scheduled: '',
        checking_in: '',
        in_progress: '',
        completed: '이미 경기 결과가 확정되어 도착 인증이 닫혔어요.',
        cancelled: '취소된 경기라서 도착 인증을 진행할 수 없어요.',
      };

      return {
        title: '현재 경기 상태에서는 도착 인증을 진행할 수 없어요',
        description: statusDescription[match.status] || '경기 상태가 바뀐 뒤 다시 확인해주세요.',
      };
    }

    return null;
  }, [match, myParticipantTeams.length, participantTeams.length]);

  function handleCheckIn() {
    if (!selectedTeam) {
      return;
    }

    arrivalMutation.mutate(
      { id, data: { teamId: selectedTeam.id } },
      {
        onSuccess: () => {
          toast('success', `${selectedTeam.name} 도착 인증이 기록되었어요`);
        },
        onError: (error) => {
          toast('error', extractErrorMessage(error, '도착 인증에 실패했어요. 다시 시도해주세요'));
        },
      },
    );
  }

  if (isMatchLoading || isTeamsLoading) {
    return (
      <div className="pt-[var(--safe-area-top)] px-5 @3xl:px-0">
        <div className="pt-4 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="h-6 w-28 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
        <div className="mt-6 space-y-4">
          <div className="h-36 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="h-44 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="pt-[var(--safe-area-top)] px-5 @3xl:px-0">
        <EmptyState
          icon={AlertTriangle}
          title="경기 정보를 찾을 수 없어요"
          description="삭제되었거나 존재하지 않는 팀 매치입니다."
          action={{ label: '매치 상세로', href: '/team-matches' }}
        />
      </div>
    );
  }

  return (
    <div className="pt-[var(--safe-area-top)] animate-fade-in">
      <header className="px-5 @3xl:px-0 pt-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="뒤로 가기"
          className="flex items-center justify-center min-h-11 min-w-11 rounded-xl text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">도착 인증</h1>
      </header>

      <div className="px-5 @3xl:px-0 @3xl:max-w-2xl @3xl:mx-auto space-y-4">
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-blue-500 font-semibold">TEAM MATCH</p>
              <h2 className="mt-1 text-base font-bold text-gray-900 dark:text-white">{match.title}</h2>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta?.className ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
              {statusMeta?.label ?? match.status}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <div className="flex items-center gap-2.5">
              <Calendar size={14} className="text-gray-400" />
              <span>{formatDateDot(match.matchDate)}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock size={14} className="text-gray-400" />
              <span>{match.startTime} ~ {match.endTime}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <MapPin size={14} className="text-gray-400" />
              <span>{match.venueName}</span>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 px-4 py-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">참여 팀</p>
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
              {participantTeams.map((team) => team.name).join(' vs ') || '상대 팀 확정 대기'}
            </p>
          </div>
        </div>

        {blockedState ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} className="mt-0.5 text-amber-600 dark:text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{blockedState.title}</p>
                <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">{blockedState.description}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-gray-900 px-5 py-5 text-center">
              <p className="text-xs text-gray-400">경기 시작까지</p>
              <p className="mt-1 text-3xl font-bold tracking-wide text-white">{countdown}</p>
            </div>

            {myParticipantTeams.length > 1 && (
              <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <label htmlFor="arrival-team-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  인증할 팀 선택
                </label>
                <Select
                  id="arrival-team-select"
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                  className="mt-2"
                >
                  {myParticipantTeams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </Select>
              </div>
            )}

            <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">내 도착 상태</h3>
              {selectedArrival ? (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-4 dark:border-green-900/50 dark:bg-green-950/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-green-600 dark:text-green-300" />
                    <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                      {selectedTeam?.name} 도착 기록 완료
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-green-700 dark:text-green-200/80">
                    기록 시각 {formatArrivedAt(selectedArrival.arrivedAt)}
                  </p>
                  <div className="mt-4 grid gap-2">
                    {canManageResult && (
                      <Link
                        href={`/team-matches/${id}/score`}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
                      >
                        경기 결과 입력으로 이동
                      </Link>
                    )}
                    <Link
                      href={`/team-matches/${id}`}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-semibold text-green-800 transition-colors hover:bg-green-100 dark:border-green-900/50 dark:bg-green-950/10 dark:text-green-200 dark:hover:bg-green-950/30"
                    >
                      매치 상세로 돌아가기
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    현장에 도착했다면 현재 참여 팀 기준으로 도착 시각을 저장해요.
                  </p>
                  <button
                    onClick={handleCheckIn}
                    disabled={!selectedTeam || arrivalMutation.isPending}
                    className="mt-4 w-full min-h-[48px] rounded-2xl bg-blue-500 text-base font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                  >
                    {arrivalMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    {selectedTeam ? `${selectedTeam.name} 도착 기록하기` : '도착 기록하기'}
                  </button>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">팀별 도착 현황</h3>
              <div className="mt-4 space-y-3">
                {participantTeams.map((team) => {
                  const arrival = getArrivalCheck(match, team.id);

                  return (
                    <div
                      key={team.id}
                      className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {team.name}
                          {myParticipantTeams.some((myTeam) => myTeam.id === team.id) && (
                            <span className="ml-2 text-xs font-medium text-blue-500">내 팀</span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {team.isHost ? '호스트 팀' : '상대 팀'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${arrival ? 'text-green-600 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'}`}>
                          {arrival ? '도착 완료' : '대기 중'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {formatArrivedAt(arrival?.arrivedAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 p-5">
          <div className="flex items-start gap-3">
            <Info size={18} className="mt-0.5 text-blue-600 dark:text-blue-300" />
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">현재 지원 범위</p>
              <p className="mt-1 text-sm text-blue-800/90 dark:text-blue-200/80">
                이번 단계에서는 도착 시각만 서버에 저장해요. GPS 반경 판정, 현장 사진 업로드, 상대 팀 지각/노쇼 판정은 아직 연결되지 않아 이 화면에서 제공하지 않아요.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
