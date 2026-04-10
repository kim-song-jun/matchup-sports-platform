'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Send,
  Star,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useMyTeams, useSubmitTeamMatchEvaluation, useTeamMatch } from '@/hooks/use-api';
import {
  getEvaluation,
  getMyParticipantTeams,
  getOpponentTeam,
  getParticipantTeams,
} from '@/lib/team-match-operations';

const evaluationItems = [
  { key: 'levelAccuracy', label: '수준 일치', desc: '모집글과 실제 경기 수준이 비슷했나요?' },
  { key: 'infoAccuracy', label: '정보 일치', desc: '구장, 인원, 안내 정보가 실제와 맞았나요?' },
  { key: 'mannerRating', label: '매너', desc: '상대 팀이 경기 내내 매너 있게 참여했나요?' },
  { key: 'punctuality', label: '시간 약속', desc: '약속한 시간에 맞춰 참여했나요?' },
  { key: 'paymentClarity', label: '비용 정산', desc: '비용 정산이 명확하고 깔끔했나요?' },
  { key: 'cooperation', label: '경기 협조', desc: '경기 운영과 의사소통이 원활했나요?' },
] as const;

type RatingKey = (typeof evaluationItems)[number]['key'];
type Ratings = Record<RatingKey, number>;

const emptyRatings: Ratings = {
  levelAccuracy: 0,
  infoAccuracy: 0,
  mannerRating: 0,
  punctuality: 0,
  paymentClarity: 0,
  cooperation: 0,
};

function StarRating({ value, onChange, disabled }: { value: number; onChange: (next: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          disabled={disabled}
          aria-label={`${star}점`}
          className="min-h-11 min-w-11 rounded-lg flex items-center justify-center transition-transform active:scale-110 disabled:cursor-default"
        >
          <Star
            size={28}
            className={star <= value ? 'text-amber-400' : 'text-gray-200 dark:text-gray-700'}
            fill={star <= value ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  );
}

export default function TeamMatchEvaluatePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;
  const { data: match, isLoading: isMatchLoading } = useTeamMatch(id);
  const { data: myTeams, isLoading: isTeamsLoading } = useMyTeams();
  const submitEvaluationMutation = useSubmitTeamMatchEvaluation();

  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [ratings, setRatings] = useState<Ratings>(emptyRatings);
  const [comment, setComment] = useState('');

  const participantTeams = useMemo(() => (match ? getParticipantTeams(match) : []), [match]);
  const myParticipantTeams = useMemo(
    () => (match ? getMyParticipantTeams(match, myTeams) : []),
    [match, myTeams],
  );

  useEffect(() => {
    if (!myParticipantTeams.length) {
      return;
    }

    if (!myParticipantTeams.some((team) => team.id === selectedTeamId)) {
      setSelectedTeamId(myParticipantTeams[0].id);
    }
  }, [myParticipantTeams, selectedTeamId]);

  useEffect(() => {
    setRatings(emptyRatings);
    setComment('');
  }, [selectedTeamId]);

  const opponentTeam = match && selectedTeamId ? getOpponentTeam(match, selectedTeamId) : null;
  const submittedEvaluation = match && selectedTeamId ? getEvaluation(match, selectedTeamId) : null;

  const averageRating = evaluationItems.reduce((sum, item) => sum + ratings[item.key], 0) / evaluationItems.length;
  const submittedAverage = submittedEvaluation
    ? evaluationItems.reduce((sum, item) => sum + submittedEvaluation[item.key], 0) / evaluationItems.length
    : 0;
  const allRated = evaluationItems.every((item) => ratings[item.key] > 0);

  const blockedState = useMemo(() => {
    if (!match) {
      return null;
    }

    if (participantTeams.length < 2) {
      return {
        title: '상대 팀이 확정된 경기만 평가할 수 있어요',
        description: '현재는 실제 상대 팀이 확정되지 않아 평가 계약이 열리지 않았습니다.',
      };
    }

    if (match.status !== 'completed') {
      return {
        title: '경기 완료 후에만 평가할 수 있어요',
        description: '결과가 저장된 뒤에만 상대 팀 평가를 제출할 수 있습니다.',
      };
    }

    if (!myParticipantTeams.length) {
      return {
        title: '참여 팀 멤버만 평가를 남길 수 있어요',
        description: '이 경기에 실제로 참여한 팀의 멤버 계정인지 확인해주세요.',
      };
    }

    return null;
  }, [match, myParticipantTeams.length, participantTeams.length]);

  function handleSubmit() {
    if (!opponentTeam || !selectedTeamId || !allRated) {
      return;
    }

    submitEvaluationMutation.mutate(
      {
        id,
        data: {
          evaluatorTeamId: selectedTeamId,
          evaluatedTeamId: opponentTeam.id,
          ...ratings,
          comment,
        },
      },
      {
        onSuccess: () => {
          toast('success', '경기 평가가 저장되었어요');
        },
        onError: (error) => {
          const apiError = error as { response?: { data?: { message?: string } } };
          toast('error', apiError.response?.data?.message || '평가 제출에 실패했어요. 다시 시도해주세요');
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
          <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="h-64 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
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
          action={{ label: '팀 매치 목록으로', href: '/team-matches' }}
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
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">경기 평가</h1>
      </header>

      <div className="px-5 @3xl:px-0 @3xl:max-w-2xl @3xl:mx-auto">
        <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mb-4">
          <p className="text-sm font-semibold text-blue-500">POST MATCH</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{match.title}</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {participantTeams.map((team) => team.name).join(' vs ')}
          </p>
        </div>

        {blockedState ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{blockedState.title}</p>
            <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/80">{blockedState.description}</p>
          </div>
        ) : (
          <>
            {myParticipantTeams.length > 1 && (
              <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mb-4">
                <label htmlFor="evaluation-team-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  평가를 남길 팀 선택
                </label>
                <select
                  id="evaluation-team-select"
                  value={selectedTeamId}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                  className="mt-2 w-full min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-3 text-base text-gray-900 dark:text-white outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 transition-colors"
                >
                  {myParticipantTeams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </div>
            )}

            {submittedEvaluation ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-5 mb-6 dark:border-green-900/50 dark:bg-green-950/20">
                <CheckCircle2 size={30} className="text-green-600 dark:text-green-300" />
                <p className="mt-3 text-lg font-bold text-green-800 dark:text-green-200">이미 평가를 제출했습니다</p>
                <p className="mt-1 text-sm text-green-700 dark:text-green-200/80">
                  {opponentTeam?.name}에 대한 평가가 저장되어 중복 제출이 차단됩니다.
                </p>
                <div className="mt-4 rounded-xl bg-white/80 dark:bg-gray-900/40 px-4 py-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">저장된 평균 점수</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Star size={20} className="text-amber-400" fill="currentColor" />
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{submittedAverage.toFixed(1)}</span>
                  </div>
                  {submittedEvaluation.comment && (
                    <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{submittedEvaluation.comment}</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 px-4 py-4 mb-6">
                  <p className="text-base font-medium text-blue-800 dark:text-blue-200">
                    {opponentTeam?.name}에 대한 솔직한 평가를 남겨주세요
                  </p>
                  <p className="mt-1 text-xs text-blue-700/90 dark:text-blue-200/80">
                    평가는 팀 신뢰 지표에 반영되며, 제출 후에는 같은 팀으로 다시 작성할 수 없습니다.
                  </p>
                </div>

                <div className="space-y-4">
                  {evaluationItems.map((item) => (
                    <div key={item.key} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-base font-semibold text-gray-900 dark:text-white">{item.label}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.desc}</p>
                        </div>
                        <div className="text-base font-bold text-amber-500">
                          {ratings[item.key] > 0 ? ratings[item.key].toFixed(0) : '-'}
                        </div>
                      </div>
                      <div className="mt-3">
                        <StarRating
                          value={ratings[item.key]}
                          onChange={(value) => setRatings((prev) => ({ ...prev, [item.key]: value }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {allRated && (
                  <div className="mt-4 rounded-2xl bg-gray-900 p-5 text-center">
                    <p className="text-sm text-gray-400">종합 평점</p>
                    <div className="mt-1 flex items-center justify-center gap-2">
                      <Star size={24} className="text-amber-400" fill="currentColor" />
                      <span className="text-3xl font-bold text-white">{averageRating.toFixed(1)}</span>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label htmlFor="team-match-eval-comment" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    한줄 코멘트 (선택)
                  </label>
                  <textarea
                    id="team-match-eval-comment"
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="상대 팀과 경기하며 느낀 점을 남겨주세요"
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-base text-gray-900 dark:text-white outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 transition-colors resize-none"
                  />
                </div>

                <div className="mt-6 mb-8">
                  <button
                    onClick={handleSubmit}
                    disabled={!allRated || submitEvaluationMutation.isPending || !opponentTeam}
                    className="w-full min-h-[52px] rounded-2xl bg-blue-500 py-3.5 text-base font-bold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                  >
                    <Send size={16} />
                    {submitEvaluationMutation.isPending ? '제출 중...' : '평가 제출하기'}
                  </button>
                  {!allRated && (
                    <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                      모든 항목을 평가해야 제출할 수 있어요.
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
