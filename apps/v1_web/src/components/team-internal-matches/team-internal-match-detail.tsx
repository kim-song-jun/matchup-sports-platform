'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertBanner, Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import {
  internalMatchErrorMessage,
  useDeleteInternalMatch,
  useRecordInternalMatchResult,
  useTeamInternalMatch,
  type InternalMatchDetail,
  type InternalMatchGoalInput,
} from '@/hooks/use-team-internal-matches';
import { V1ApiError } from '@/lib/api-client';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';

/** 팀 내 경기 상세 — 편성·점수·득점 기록. 팀장·매니저는 결과를 기록·수정하고 경기를 지울 수 있다. */
export function TeamInternalMatchDetailPageClient({ teamId, matchId }: { teamId: string; matchId: string }) {
  const router = useRouter();
  const query = useTeamInternalMatch(teamId, matchId);
  const remove = useDeleteInternalMatch(teamId, matchId);
  const { confirm, ConfirmModal } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (query.isLoading) return <PageSkeleton variant="detail" />;
  if (query.isError || !query.data) {
    const status = query.error instanceof V1ApiError ? query.error.statusCode : undefined;
    if (status === 403) return <EmptyState title="팀원만 볼 수 있어요" sub="이 기록은 같은 팀 팀원에게만 공개돼요." />;
    if (status === 404) return <EmptyState title="경기를 찾을 수 없어요" sub="지워졌거나 없는 경기예요." />;
    return <ErrorState message="경기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => void query.refetch()} />;
  }
  const match = query.data;

  async function onDelete() {
    const ok = await confirm({ title: '이 경기를 지울까요?', message: '편성과 기록이 모두 지워지고 되돌릴 수 없어요.', confirmLabel: '지우기', tone: 'danger' });
    if (!ok) return;
    setError(null);
    remove.mutate(undefined, {
      onSuccess: () => router.replace(`/teams/${teamId}`),
      onError: (err) => setError(internalMatchErrorMessage(err, '지우지 못했어요.')),
    });
  }

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div className="tm-text-caption">{formatTournamentDateTimeShort(match.playedAt)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${match.sides.length}, 1fr)`, gap: 12, marginTop: 12 }}>
          {match.sides.map((side) => (
            <div key={side.sideNumber}>
              <div className="tm-text-body-lg">{side.name}</div>
              <div className="tab-num" style={{ fontSize: 28, fontWeight: 700 }}>{match.resultRecorded ? side.score ?? 0 : '-'}</div>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 4 }}>
                {side.players.map((player) => (
                  <li key={player.userId} className="tm-text-body" style={{ fontWeight: player.isMe ? 700 : 400 }}>
                    {player.name}{player.isMe ? ' (나)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {!match.resultRecorded ? <p className="tm-text-caption" style={{ marginTop: 12 }}>아직 결과가 기록되지 않았어요.</p> : null}
      </Card>

      {match.resultRecorded && match.goals.length > 0 ? (
        <Card>
          <div className="tm-text-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>득점 기록</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {match.goals.map((goal, index) => (
              <li key={index} className="tm-text-body">
                {match.sides[goal.sideNumber - 1]?.name} · {goal.scorer.name}
                {goal.assist ? <span className="tm-text-caption"> (어시스트 {goal.assist.name})</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {error ? <AlertBanner tone="error" message={error} /> : null}

      {match.canManage ? (
        editing ? (
          <ResultEditor teamId={teamId} match={match} onDone={() => setEditing(false)} />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <button type="button" className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" onClick={() => setEditing(true)}>
              {match.resultRecorded ? '결과 수정하기' : '결과 기록하기'}
            </button>
            <button type="button" className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" disabled={remove.isPending} onClick={() => void onDelete()}>
              경기 지우기
            </button>
          </div>
        )
      ) : null}
      {ConfirmModal}
    </div>
  );
}

type GoalDraft = { sideNumber: number; scorerUserId: string; assistUserId: string };

function ResultEditor({ teamId, match, onDone }: { teamId: string; match: InternalMatchDetail; onDone: () => void }) {
  const record = useRecordInternalMatchResult(teamId, match.id);
  const [scores, setScores] = useState<string[]>(match.sides.map((side) => String(side.score ?? 0)));
  const [goals, setGoals] = useState<GoalDraft[]>(
    match.goals.map((goal) => ({ sideNumber: goal.sideNumber, scorerUserId: goal.scorer.userId, assistUserId: goal.assist?.userId ?? '' })),
  );
  const [error, setError] = useState<string | null>(null);

  const playersOf = (sideNumber: number) => match.sides[sideNumber - 1]?.players ?? [];
  const patchGoal = (index: number, patch: Partial<GoalDraft>) => setGoals((current) => current.map((goal, i) => (i === index ? { ...goal, ...patch } : goal)));

  function save() {
    const numbers = scores.map((value) => Number(value));
    if (numbers.some((value) => !Number.isInteger(value) || value < 0 || value > 99)) { setError('점수는 0~99 사이 정수로 입력해 주세요.'); return; }
    if (goals.some((goal) => !goal.scorerUserId)) { setError('득점자를 고르거나 그 줄을 지워 주세요.'); return; }
    setError(null);
    const payload: InternalMatchGoalInput[] = goals.map((goal) => ({
      sideNumber: goal.sideNumber,
      scorerUserId: goal.scorerUserId,
      ...(goal.assistUserId ? { assistUserId: goal.assistUserId } : {}),
    }));
    record.mutate({ scores: numbers, goals: payload }, { onSuccess: onDone, onError: (err) => setError(internalMatchErrorMessage(err, '저장하지 못했어요.')) });
  }

  return (
    <Card>
      <div className="tm-text-label" style={{ marginBottom: 12, color: 'var(--text-muted)' }}>점수</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${match.sides.length}, 1fr)`, gap: 12 }}>
        {match.sides.map((side, index) => (
          <label key={side.sideNumber} className="tm-text-label">
            {side.name}
            <input className="tm-input" type="number" inputMode="numeric" min={0} max={99} value={scores[index]} aria-label={`${side.name} 점수`}
              onChange={(e) => setScores((current) => current.map((value, i) => (i === index ? e.target.value : value)))} />
          </label>
        ))}
      </div>

      <div className="tm-text-label" style={{ margin: '20px 0 8px', color: 'var(--text-muted)' }}>득점 기록 <em className="tm-auth-optional">선택</em></div>
      <div style={{ display: 'grid', gap: 12 }}>
        {goals.map((goal, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6, alignItems: 'center' }}>
            <select className="tm-input" aria-label="득점 팀" value={goal.sideNumber} onChange={(e) => patchGoal(index, { sideNumber: Number(e.target.value), scorerUserId: '', assistUserId: '' })}>
              {match.sides.map((side) => <option key={side.sideNumber} value={side.sideNumber}>{side.name}</option>)}
            </select>
            <select className="tm-input" aria-label="득점자" value={goal.scorerUserId} onChange={(e) => patchGoal(index, { scorerUserId: e.target.value })}>
              <option value="">득점자</option>
              {playersOf(goal.sideNumber).map((player) => <option key={player.userId} value={player.userId}>{player.name}</option>)}
            </select>
            <select className="tm-input" aria-label="어시스트" value={goal.assistUserId} onChange={(e) => patchGoal(index, { assistUserId: e.target.value })}>
              <option value="">어시스트 없음</option>
              {playersOf(goal.sideNumber).filter((player) => player.userId !== goal.scorerUserId).map((player) => <option key={player.userId} value={player.userId}>{player.name}</option>)}
            </select>
            <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" aria-label="이 득점 지우기" onClick={() => setGoals((current) => current.filter((_, i) => i !== index))}>삭제</button>
          </div>
        ))}
        <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" onClick={() => setGoals((current) => [...current, { sideNumber: 1, scorerUserId: '', assistUserId: '' }])}>+ 득점 추가</button>
      </div>

      {error ? <div style={{ marginTop: 12 }}><AlertBanner tone="error" message={error} /></div> : null}
      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        <button type="button" className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" disabled={record.isPending} onClick={save}>{record.isPending ? '저장 중…' : '저장'}</button>
        <button type="button" className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" onClick={onDone}>취소</button>
      </div>
    </Card>
  );
}
