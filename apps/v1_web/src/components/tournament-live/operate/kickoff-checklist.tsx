'use client';

import { useV1TeamGameRoster } from '@/hooks/use-v1-game-roster';
import { OPERATIONS_BOARD_POLL_INTERVAL_MS } from '@/lib/operations-board-polling';
import type { GameSide } from '@/types/game-operations';
import { TournamentParticipationPanel } from './tournament-participation-panel';
import { LeagueParticipationPanel } from './league-participation-panel';

export interface KickoffChecklistProps {
  readonly gameId: string;
  readonly sides: readonly GameSide[];
  readonly disabled?: boolean;
  readonly onRosterError: (message: string) => void;
}

/** 대회는 팀이 설정한 경기 출전 명단을 조회하고 명시적인 편집으로 변경한다. */
export function KickoffChecklist({ gameId, sides, onRosterError, disabled }: KickoffChecklistProps) {
  // 대회 종류는 팀 명단 응답에서 확인한다 — 하위 패널과 같은 쿼리 캐시를 사용한다.
  const probeTeamId = sides.find((side) => side.teamId !== null)?.teamId ?? null;
  const probe = useV1TeamGameRoster(probeTeamId, gameId, { refetchInterval: OPERATIONS_BOARD_POLL_INTERVAL_MS });

  // 리그인지 알기 전에는 어느 쪽도 그리지 않는다 — 대회용 명단 편집을 먼저 그리면 리그 운영자가 잠깐,
  // 조회가 실패하면 계속 엉뚱한 화면을 본다. 한 번 읽은 뒤의 재조회 실패는 마지막 값을 그대로 쓴다.
  if (probeTeamId !== null && probe.data === undefined) {
    return (
      <section className="flex flex-col items-start gap-2 px-4" aria-label="킥오프 준비">
        <p role={probe.isError ? 'alert' : 'status'} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          {probe.isError ? '킥오프 준비를 불러오지 못했어요.' : '킥오프 준비를 불러오는 중이에요…'}
        </p>
        {probe.isError ? (
          <button
            type="button"
            onClick={() => void probe.refetch()}
            className="min-h-[44px] rounded-lg border border-[var(--border)] px-3 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            다시 불러오기
          </button>
        ) : null}
      </section>
    );
  }
  // 리그는 팀 전원이 처음부터 출전이고 안 온 사람만 뺀다(체크 = 출전). 대회는 팀이 설정한 경기 명단을 조회·편집한다.
  if (probe.data?.competitionKind === 'LEAGUE') {
    return <LeagueParticipationPanel gameId={gameId} sides={sides} disabled={disabled} onError={onRosterError} />;
  }
  return <TournamentParticipationPanel gameId={gameId} sides={sides} disabled={disabled} onError={onRosterError} />;
}
