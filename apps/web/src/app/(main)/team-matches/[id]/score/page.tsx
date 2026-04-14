'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Hash,
  Trophy,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useMyTeams, useSubmitTeamMatchResult, useTeamMatch } from '@/hooks/use-api';
import {
  buildQuarterScoreMap,
  getGuestTeam,
  getMyParticipantTeams,
  getOutcome,
  getParticipantTeams,
  getQuarterKeys,
  isScoreEditable,
} from '@/lib/team-match-operations';
import { getTeamLogo } from '@/lib/sport-image';

function normalizeInput(value: string) {
  return value.replace(/[^0-9]/g, '');
}

export default function ScoreInputPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;
  const { data: match, isLoading: isMatchLoading } = useTeamMatch(id);
  const { data: myTeams, isLoading: isTeamsLoading } = useMyTeams();
  const submitResultMutation = useSubmitTeamMatchResult();

  const [homeScores, setHomeScores] = useState<Record<string, string>>({});
  const [awayScores, setAwayScores] = useState<Record<string, string>>({});

  const participantTeams = useMemo(() => (match ? getParticipantTeams(match) : []), [match]);
  const hostTeam = match?.hostTeam ?? null;
  const guestTeam = match ? getGuestTeam(match) : null;
  const myParticipantTeams = useMemo(
    () => (match ? getMyParticipantTeams(match, myTeams) : []),
    [match, myTeams],
  );
  const canManageResult = myParticipantTeams.some((team) => team.role === 'owner' || team.role === 'manager');
  const canEvaluate = myParticipantTeams.length > 0;

  const quarterKeys = useMemo(
    () => (match ? getQuarterKeys(match.quarterCount) : []),
    [match],
  );

  useEffect(() => {
    if (!match) {
      return;
    }

    const nextHome = buildQuarterScoreMap(match.quarterCount, match.scoreHome);
    const nextAway = buildQuarterScoreMap(match.quarterCount, match.scoreAway);

    setHomeScores(
      Object.fromEntries(
        Object.entries(nextHome).map(([key, value]) => [key, match.status === 'completed' || value > 0 ? String(value) : '']),
      ),
    );
    setAwayScores(
      Object.fromEntries(
        Object.entries(nextAway).map(([key, value]) => [key, match.status === 'completed' || value > 0 ? String(value) : '']),
      ),
    );
  }, [match]);

  const homeTotal = quarterKeys.reduce((sum, key) => sum + Number(homeScores[key] || 0), 0);
  const awayTotal = quarterKeys.reduce((sum, key) => sum + Number(awayScores[key] || 0), 0);
  const allFilled = quarterKeys.every((key) => homeScores[key] !== '' && awayScores[key] !== '');
  const isCompleted = match?.status === 'completed';

  const blockedState = useMemo(() => {
    if (!match) {
      return null;
    }

    if (participantTeams.length < 2) {
      return {
        title: '상대 팀이 확정된 뒤에만 결과를 기록할 수 있어요',
        description: '현재는 실제 참가 팀이 아직 확정되지 않았습니다.',
      };
    }

    if (!canManageResult && match.status !== 'completed') {
      return {
        title: '참여 팀의 매니저 이상만 결과를 입력할 수 있어요',
        description: '현재 계정은 이 경기의 결과 제출 권한이 없습니다.',
      };
    }

    if (!isScoreEditable(match.status) && match.status !== 'completed') {
      return {
        title: '현재 경기 상태에서는 결과를 입력할 수 없어요',
        description: '경기 진행 중이거나 완료 가능한 상태에서만 스코어 입력이 열립니다.',
      };
    }

    return null;
  }, [canManageResult, match, participantTeams.length]);

  function updateScore(target: 'home' | 'away', key: string, value: string) {
    const cleaned = normalizeInput(value);
    const setter = target === 'home' ? setHomeScores : setAwayScores;

    setter((prev) => ({
      ...prev,
      [key]: cleaned,
    }));
  }

  function handleSubmit() {
    if (!match || !hostTeam || !guestTeam || !allFilled) {
      return;
    }

    const scoreHome = Object.fromEntries(quarterKeys.map((key) => [key, Number(homeScores[key])]));
    const scoreAway = Object.fromEntries(quarterKeys.map((key) => [key, Number(awayScores[key])]));
    const outcome = getOutcome(homeTotal, awayTotal);

    submitResultMutation.mutate(
      {
        id,
        data: {
          scoreHome,
          scoreAway,
          resultHome: outcome.home,
          resultAway: outcome.away,
        },
      },
      {
        onSuccess: () => {
          toast('success', '경기 결과가 저장되었어요');
        },
        onError: (error) => {
          const apiError = error as { response?: { data?: { message?: string } } };
          toast('error', apiError.response?.data?.message || '스코어 기록에 실패했어요. 다시 시도해주세요');
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
          <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="h-56 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!match || !hostTeam || !guestTeam) {
    return (
      <div className="pt-[var(--safe-area-top)] px-5 @3xl:px-0">
        <EmptyState
          icon={AlertTriangle}
          title="스코어 입력에 필요한 경기 정보를 찾지 못했어요"
          description="상대 팀이 아직 확정되지 않았거나 경기 정보가 손상되었습니다."
          action={{ label: '매치 상세로', href: `/team-matches/${id}` }}
        />
      </div>
    );
  }

  const homeTeamLogo = getTeamLogo(hostTeam.name, match.sportType, hostTeam.logoUrl, `${match.id}-home`);
  const awayTeamLogo = getTeamLogo(guestTeam.name, match.sportType, guestTeam.logoUrl, `${match.id}-away`);

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
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">스코어 입력</h1>
      </header>

      <div className="px-5 @3xl:px-0 @3xl:max-w-2xl @3xl:mx-auto">
        <div className="rounded-2xl bg-gray-900 p-5 mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                <img
                  src={homeTeamLogo}
                  alt={`${hostTeam.name} logo`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <p className="text-base font-semibold text-white">{hostTeam.name}</p>
              <p className="mt-0.5 text-xs text-gray-400">호스트</p>
            </div>

            <div className="px-2 text-center">
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold text-white">{homeTotal}</span>
                <span className="text-xl text-gray-500">:</span>
                <span className="text-4xl font-bold text-white">{awayTotal}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {homeTotal > awayTotal ? '호스트 팀 우세' : homeTotal < awayTotal ? '상대 팀 우세' : '현재 동점'}
              </p>
            </div>

            <div className="flex-1 text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                <img
                  src={awayTeamLogo}
                  alt={`${guestTeam.name} logo`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <p className="text-base font-semibold text-white">{guestTeam.name}</p>
              <p className="mt-0.5 text-xs text-gray-400">상대 팀</p>
            </div>
          </div>
        </div>

        {blockedState ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{blockedState.title}</p>
            <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">{blockedState.description}</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              {quarterKeys.map((key, index) => (
                <div key={key} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500">
                        <Hash size={14} />
                      </div>
                      <span className="text-base font-semibold text-gray-900 dark:text-white">
                        {index + 1}쿼터
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {homeScores[key] || '-'} : {awayScores[key] || '-'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label htmlFor={`home-${key}`} className="mb-1 block text-center text-xs text-gray-500 dark:text-gray-400">
                        {hostTeam.name}
                      </label>
                      <input
                        id={`home-${key}`}
                        type="text"
                        inputMode="numeric"
                        value={homeScores[key] ?? ''}
                        onChange={(event) => updateScore('home', key, event.target.value)}
                        placeholder="0"
                        disabled={isCompleted || submitResultMutation.isPending}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 py-3 text-center text-xl font-bold text-gray-900 dark:text-white outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 transition-colors"
                      />
                    </div>

                    <span className="mt-5 text-xl font-bold text-gray-300">:</span>

                    <div className="flex-1">
                      <label htmlFor={`away-${key}`} className="mb-1 block text-center text-xs text-gray-500 dark:text-gray-400">
                        {guestTeam.name}
                      </label>
                      <input
                        id={`away-${key}`}
                        type="text"
                        inputMode="numeric"
                        value={awayScores[key] ?? ''}
                        onChange={(event) => updateScore('away', key, event.target.value)}
                        placeholder="0"
                        disabled={isCompleted || submitResultMutation.isPending}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 py-3 text-center text-xl font-bold text-gray-900 dark:text-white outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 mb-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
                <Trophy size={16} className="text-amber-600" />
                쿼터별 누적 점수
              </h3>
              <div className="mt-3 overflow-x-auto scrollbar-hide">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="py-2 px-2 text-left font-semibold text-gray-500">팀</th>
                      {quarterKeys.map((key) => (
                        <th key={key} className="py-2 px-2 text-center font-semibold text-gray-500">
                          {key}
                        </th>
                      ))}
                      <th className="py-2 px-2 text-center font-semibold text-gray-900 dark:text-white">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-50 dark:border-gray-800">
                      <td className="py-2.5 px-2 font-medium text-gray-900 dark:text-white">{hostTeam.name}</td>
                      {quarterKeys.map((key) => (
                        <td key={key} className="py-2.5 px-2 text-center text-gray-700 dark:text-gray-200">
                          {homeScores[key] || '-'}
                        </td>
                      ))}
                      <td className="py-2.5 px-2 text-center font-bold text-blue-500">{homeTotal}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-2 font-medium text-gray-900 dark:text-white">{guestTeam.name}</td>
                      {quarterKeys.map((key) => (
                        <td key={key} className="py-2.5 px-2 text-center text-gray-700 dark:text-gray-200">
                          {awayScores[key] || '-'}
                        </td>
                      ))}
                      <td className="py-2.5 px-2 text-center font-bold text-blue-500">{awayTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {isCompleted ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-5 mb-8 text-center dark:border-green-900/50 dark:bg-green-950/20">
                <CheckCircle2 size={30} className="mx-auto text-green-600 dark:text-green-300" />
                <p className="mt-2 text-lg font-bold text-green-800 dark:text-green-200">저장된 경기 결과입니다</p>
                <p className="mt-1 text-sm text-green-700 dark:text-green-200/80">
                  새로고침 후에도 동일한 스코어가 유지됩니다.
                </p>
                <div className="mt-4 grid gap-3">
                  {canEvaluate && (
                    <Link
                      href={`/team-matches/${id}/evaluate`}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-blue-500 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-600"
                    >
                      경기 평가하기
                    </Link>
                  )}
                  <Link
                    href={`/team-matches/${id}`}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-green-200 bg-white px-4 py-3 text-base font-semibold text-green-800 transition-colors hover:bg-green-100 dark:border-green-900/50 dark:bg-green-950/10 dark:text-green-200 dark:hover:bg-green-950/30"
                  >
                    매치 상세로 돌아가기
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mb-8">
                <button
                  onClick={handleSubmit}
                  disabled={!allFilled || submitResultMutation.isPending}
                  className="w-full min-h-[52px] rounded-2xl bg-blue-500 py-3.5 text-base font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  {submitResultMutation.isPending ? '저장 중...' : '경기 결과 저장'}
                </button>
                {!allFilled && (
                  <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                    모든 쿼터 점수를 입력해야 저장할 수 있어요.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
