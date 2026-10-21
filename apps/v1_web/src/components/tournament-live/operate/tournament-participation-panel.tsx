'use client';

import { useRef, useState } from 'react';
import { useV1SetGameRosterParticipation, useV1TeamGameRoster, type V1GameRosterView } from '@/hooks/use-v1-game-roster';
import { extractErrorMessage } from '@/lib/error-message';
import { OPERATIONS_BOARD_POLL_INTERVAL_MS } from '@/lib/operations-board-polling';
import { rosterPersonLabel } from '@/lib/roster-presentation';
import { gameRosterStatusLabel } from '@/lib/v1-status-labels';
import { SectionTitle } from '@/components/v1-ui/primitives';
import type { GameSide } from '@/types/game-operations';
import { jerseyText } from './player-label';

const signature = (view: V1GameRosterView) => JSON.stringify(view.base.map(({ userId, status }) => [userId, status]).sort());

/** 팀과 같은 경기 명단을 읽고, 운영자 변경도 경기별 조정 API에 저장한다. */
export function TournamentParticipationPanel({ gameId, sides, disabled, onError }: {
  gameId: string;
  sides: readonly GameSide[];
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3 px-4" aria-label="킥오프 준비">
      <div>
        <SectionTitle title="이번 경기 출전 명단" />
        <p className="mt-1 tm-text-caption">팀에서 설정한 경기 명단이에요. 변경하면 해당 경기 명단에 함께 반영돼요.</p>
      </div>
      {sides.map((side) => <SideParticipation key={`${gameId}:${side.id}:${side.teamId}`} gameId={gameId} side={side} disabled={disabled} onError={onError} />)}
    </section>
  );
}

function SideParticipation({ gameId, side, disabled, onError }: {
  gameId: string;
  side: GameSide;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const roster = useV1TeamGameRoster(side.teamId, gameId, { refetchInterval: OPERATIONS_BOARD_POLL_INTERVAL_MS });
  const mutation = useV1SetGameRosterParticipation(gameId, side.id, side.teamId);
  const [draft, setDraft] = useState<{ baseline: string; selected: ReadonlySet<string> } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const data = roster.data;

  if (side.teamId === null) return <p className="tm-text-caption">{side.displayNameSnapshot} — 팀이 정해지지 않았어요.</p>;
  if (!data || roster.isError) return (
    <div>
      <p role={roster.isError ? 'alert' : 'status'} className="tm-text-caption">{side.displayNameSnapshot} 명단을 {roster.isError ? '불러오지 못했어요.' : '불러오는 중이에요…'}</p>
      {roster.isError ? <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" onClick={() => void roster.refetch()}>다시 불러오기</button> : null}
    </div>
  );

  const stale = draft !== null && draft.baseline !== signature(data);
  const locked = Boolean(disabled) || !data.editable || saving;
  const save = async () => {
    if (!draft || locked || savingRef.current || stale) return;
    savingRef.current = true;
    setSaving(true);
    let applied = 0;
    try {
      // 저장 직전에 팀의 다른 기기에서 바꾼 명단도 확인한다. 확인 실패 시 쓰지 않는다.
      const fresh = await roster.refetch();
      if (fresh.isError || !fresh.data) throw new Error('최신 명단을 확인하지 못했어요. 다시 시도해 주세요.');
      if (!fresh.data.editable || signature(fresh.data) !== draft.baseline) throw new Error('경기 명단이 바뀌었어요. 최신 명단을 확인하고 다시 수정해 주세요.');
      const changes = fresh.data.base.filter((player) =>
        (player.status === 'PARTICIPATING' || player.status === 'EXCLUDED') &&
        (player.status === 'PARTICIPATING') !== draft.selected.has(player.userId));
      for (const player of changes) {
        await mutation.mutateAsync({ userId: player.userId, participating: draft.selected.has(player.userId) });
        applied += 1;
      }
      setDraft(null);
    } catch (error) {
      onError(`${applied > 0 ? `${applied}명의 변경은 저장됐어요. ` : ''}${extractErrorMessage(error, '경기 명단을 저장하지 못했어요.')} 최신 명단을 확인하고 다시 수정해 주세요.`);
      setDraft(null);
    } finally {
      await roster.refetch();
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" aria-label={`${side.displayNameSnapshot} 경기 출전 명단`} role="group" aria-busy={saving}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 tm-text-caption font-medium">{side.displayNameSnapshot} · 출전 {draft ? draft.selected.size : data.counts.participating}/{data.counts.base}명</p>
        {draft ? <div className="flex shrink-0 gap-2">
          <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" disabled={saving} onClick={() => setDraft(null)}>취소</button>
          <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" disabled={locked || stale} onClick={() => void save()}>{saving ? '저장 중…' : '저장'}</button>
        </div> : <button type="button" className="tm-btn tm-btn-sm tm-btn-outline" aria-label={`${side.displayNameSnapshot} 명단 수정하기`} disabled={locked || data.base.length === 0} onClick={() => setDraft({ baseline: signature(data), selected: new Set(data.participants.map((p) => p.userId)) })}>수정하기</button>}
      </div>
      {stale && !saving ? <p role="alert" className="tm-text-caption">팀에서 명단을 변경했어요. 취소한 뒤 최신 명단으로 다시 수정해 주세요.</p> : null}
      {!data.editable ? <p className="tm-text-caption">현재는 이 경기 명단을 수정할 수 없어요.</p> : null}
      {data.base.length === 0 ? <p className="tm-text-caption">등록된 참가 선수가 없어요.</p> : <ul className="flex flex-col gap-2">
        {data.base.map((player) => {
          const checked = draft ? draft.selected.has(player.userId) : player.status === 'PARTICIPATING';
          const changeable = player.status === 'PARTICIPATING' || player.status === 'EXCLUDED';
          const name = rosterPersonLabel(player);
          const jersey = jerseyText(player.jerseyNumber);
          const Row = draft ? 'label' : 'div';
          return <li key={player.userId}><Row className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
            {draft ? <input type="checkbox" className="h-5 w-5 shrink-0" aria-label={`${name} 출전`} checked={checked} disabled={locked || stale || !changeable} onChange={() => setDraft((current) => {
              if (!current) return current;
              const selected = new Set(current.selected);
              if (selected.has(player.userId)) selected.delete(player.userId); else selected.add(player.userId);
              return { ...current, selected };
            })} /> : null}
            <span className="min-w-0 flex-1 break-words tm-text-label">{jersey ? `${jersey} ` : ''}{name}{player.goalkeeper ? ' · GK' : ''}</span>
            <span className="shrink-0 tm-text-caption">{gameRosterStatusLabel(changeable ? (checked ? 'PARTICIPATING' : 'EXCLUDED') : player.status)}</span>
          </Row></li>;
        })}
      </ul>}
    </div>
  );
}
