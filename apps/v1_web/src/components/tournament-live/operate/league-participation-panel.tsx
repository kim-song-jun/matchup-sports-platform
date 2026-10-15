'use client';

import { useState } from 'react';
import {
  useV1SetGameRosterParticipation,
  useV1TeamGameRoster,
  type V1GameRosterPlayerStatus,
} from '@/hooks/use-v1-game-roster';
import { extractErrorMessage } from '@/lib/error-message';
import { OPERATIONS_BOARD_POLL_INTERVAL_MS } from '@/lib/operations-board-polling';
import { rosterPersonLabel } from '@/lib/roster-presentation';
import type { GameSide } from '@/types/game-operations';
import { jerseyText } from './player-label';

const STATUS_TEXT: Record<V1GameRosterPlayerStatus, string> = {
  PARTICIPATING: '출전',
  EXCLUDED: '빠짐',
  UNAVAILABLE: '결장 기간',
  SUSPENDED: '출전정지',
};

export interface LeagueParticipationPanelProps {
  readonly gameId: string;
  readonly sides: readonly GameSide[];
  readonly disabled?: boolean;
  readonly onError: (message: string) => void;
}

/**
 * 리그 경기의 킥오프 준비. 리그는 운영자가 팀을 고르고 팀 전원이 명단(= 경기 출전자)에 오르므로, 처음부터 전원이
 * 체크돼 있고 오지 않은 사람만 해제한다(2026-10-13 사용자 확정 — 체크 = 출전). 해제는 '이번 경기 빠짐'(명단 조정)이라
 * 경기 기록·출전 횟수에서도 빠지고, 다시 누르면 되돌린다. 결장 기간·출전정지인 사람은 바꿀 수 없다.
 * 대회는 팀이 명단을 직접 내므로 도착 확인(`ArrivalCheckinPanel`)을 그대로 쓴다.
 */
export function LeagueParticipationPanel({ gameId, sides, disabled = false, onError }: LeagueParticipationPanelProps) {
  return (
    <section className="flex flex-col gap-3 px-4" aria-label="킥오프 준비">
      <div>
        <h3 className="text-[length:var(--font-size-body-sm)] font-semibold">킥오프 준비 · 출전 선수</h3>
        <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          이 리그 참가 명단의 출전 가능한 선수가 체크돼 있어요. 오지 않은 선수만 눌러서 빼 주세요. 뺀 선수는 이 경기 출전 기록에 남지 않아요.
        </p>
      </div>
      {sides.map((side) => (
        <LeagueSideParticipation key={side.id} side={side} gameId={gameId} disabled={disabled} onError={onError} />
      ))}
    </section>
  );
}

function LeagueSideParticipation({
  side,
  gameId,
  disabled,
  onError,
}: {
  side: GameSide;
  gameId: string;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  // 요약 줄·명단 화면과 같은 캐시 — 킥오프 직전 팀장이 다른 기기에서 빼는 것도 같은 주기로 따라온다.
  const roster = useV1TeamGameRoster(side.teamId, gameId, { refetchInterval: OPERATIONS_BOARD_POLL_INTERVAL_MS });
  const setParticipation = useV1SetGameRosterParticipation(gameId, roster.data?.sideId ?? null, side.teamId);
  const [pendingUserIds, setPendingUserIds] = useState<ReadonlySet<string>>(new Set());

  if (side.teamId === null) {
    return <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{side.displayNameSnapshot} — 팀이 정해지지 않았어요.</p>;
  }
  if (roster.isPending) {
    return <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{side.displayNameSnapshot} 명단을 불러오는 중이에요…</p>;
  }
  if (roster.isError || roster.data === undefined) {
    return <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{side.displayNameSnapshot} 명단을 불러오지 못했어요.</p>;
  }

  const { base, counts, editable } = roster.data;
  const locked = disabled || !editable;
  const change = async (userIds: readonly string[], participating: boolean) => {
    setPendingUserIds((current) => new Set([...current, ...userIds]));
    try {
      // 한 사람씩 보낸다 — 같은 사이드 명단을 다시 계산하는 요청이라 동시에 보내면 서로 기다린다.
      for (const userId of userIds) {
        await setParticipation.mutateAsync({ userId, participating });
      }
    } catch (error) {
      onError(extractErrorMessage(error, '출전 선수를 바꾸지 못했어요.'));
    } finally {
      setPendingUserIds((current) => new Set([...current].filter((id) => !userIds.includes(id))));
    }
  };
  const excludedIds = base.filter((player) => player.status === 'EXCLUDED').map((player) => player.userId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)]">
          {side.displayNameSnapshot} · 출전 {counts.participating}/{counts.base}명
        </p>
        {excludedIds.length > 0 ? (
          <button
            type="button"
            aria-label={`${side.displayNameSnapshot} 전원 출전`}
            disabled={locked || pendingUserIds.size > 0}
            onClick={() => void change(excludedIds, true)}
            className="min-h-[44px] shrink-0 rounded-lg border border-[var(--border)] px-3 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            전원 출전
          </button>
        ) : (
          <p className="shrink-0 text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)]">전원 출전</p>
        )}
      </div>
      {!editable ? (
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">경기가 시작돼 출전 선수를 더 바꿀 수 없어요.</p>
      ) : null}
      {base.length === 0 ? (
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">명단에 오른 선수가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {base.map((player) => {
            const checked = player.status === 'PARTICIPATING';
            const changeable = player.status === 'PARTICIPATING' || player.status === 'EXCLUDED';
            const jersey = jerseyText(player.jerseyNumber);
            // 운영진 계정에는 실명이 같이 내려온다 — 현장에서 사람을 맞춰 보는 자리라 `실명 (닉네임)` 으로 그린다.
            const name = rosterPersonLabel(player);
            return (
              <li key={player.userId}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  // 컬러만으로 상태를 전달하지 않는다 — aria-label 과 화면 텍스트에 상태를 함께 담는다.
                  aria-label={`${name} — ${STATUS_TEXT[player.status]}${changeable ? (checked ? ', 누르면 이번 경기에서 빼요' : ', 누르면 다시 출전') : ''}`}
                  disabled={locked || !changeable || pendingUserIds.has(player.userId)}
                  onClick={() => void change([player.userId], !checked)}
                  className={[
                    'flex min-h-[44px] w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed',
                    checked ? 'border-[var(--blue500)] bg-[var(--blue50)]' : 'border-[var(--border)] bg-[var(--surface)]',
                    !changeable || pendingUserIds.has(player.userId) ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[length:var(--font-size-micro)] font-bold',
                      checked ? 'border-[var(--blue500)] bg-[var(--blue500)] text-white' : 'border-[var(--border)] text-transparent',
                    ].join(' ')}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--font-size-body-sm)] font-medium">
                      {jersey ? `${jersey} ` : ''}
                      {name}
                    </span>
                    <span className="block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{STATUS_TEXT[player.status]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
