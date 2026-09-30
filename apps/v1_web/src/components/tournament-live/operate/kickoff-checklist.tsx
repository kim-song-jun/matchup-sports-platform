'use client';

import Link from 'next/link';
import { useV1TeamGameRoster } from '@/hooks/use-v1-game-roster';
import { useCurrentHref } from '@/components/v1-ui/use-current-href';
import { gameRosterScreenPath } from '@/lib/game-roster-routes';
import { OPERATIONS_BOARD_POLL_INTERVAL_MS } from '@/lib/operations-board-polling';
import { withFromPath } from '@/lib/session-storage';
import type { GameSide } from '@/types/game-operations';
import { ArrivalCheckinPanel, arrivalProgress, type ArrivalCheckinPanelProps } from './arrival-checkin-panel';

export interface KickoffChecklistProps extends Omit<ArrivalCheckinPanelProps, 'title' | 'sideAccessory'> {
  readonly gameId: string;
}

/**
 * 경기 시작 전 콘솔의 "킥오프 준비". 예전에는 도착 확인은 콘솔에, 그 팀의 빠짐·정지 요약은 운영 보드에
 * 따로 있어서 운영자가 두 화면을 오가며 킥오프를 준비했다. 한 자리에 모았다: 팀마다 명단 요약(빠짐·정지)과
 * 도착 확인(전원 도착 버튼 포함)을 보고, 끝나면 "경기 시작"으로 이어진다.
 *
 * 도착 확인은 경기 시작의 조건이 아니다(서버도 막지 않는다) — 미확인이 남아도 시작할 수 있다는 것을
 * 안내 문구가 말한다. 그래서 여기에는 별도의 시작 버튼을 두지 않고, 조작 줄의 "경기 시작"이 그 자리다.
 */
export function KickoffChecklist({ gameId, sides, lineups, ...panelProps }: KickoffChecklistProps) {
  const { total, arrived } = arrivalProgress(sides, lineups);
  const remaining = total - arrived;

  return (
    <div className="flex flex-col gap-3">
      <ArrivalCheckinPanel
        title="킥오프 준비"
        sides={sides}
        lineups={lineups}
        sideAccessory={(side) => <RosterSummaryLine side={side} gameId={gameId} />}
        {...panelProps}
      />
      {total > 0 ? (
        <p
          role="status"
          className={[
            'mx-4 rounded-lg px-3 py-2 text-[length:var(--font-size-label)] font-medium',
            remaining === 0 ? 'bg-[var(--blue50)] text-[var(--blue700)]' : 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
          ].join(' ')}
        >
          {remaining === 0
            ? '준비가 끝났어요. ‘경기 시작’을 눌러 주세요.'
            : `아직 도착을 확인하지 못한 선수가 ${remaining}명 있어요. 그래도 ‘경기 시작’은 누를 수 있어요.`}
        </p>
      ) : null}
    </div>
  );
}

/** 한 팀의 빠짐(이번 경기 빠짐 + 결장)·정지 요약. 요약을 못 읽으면 못 읽었다고 말한다 — 0 으로 그리지 않는다. */
function RosterSummaryLine({ side, gameId }: { side: GameSide; gameId: string }) {
  const teamId = side.teamId;
  const from = useCurrentHref();
  // 킥오프 직전은 팀장이 다른 기기에서 결장을 반영하는 시점이라 운영 보드와 같은 주기로 다시 읽는다.
  const roster = useV1TeamGameRoster(teamId, gameId, { refetchInterval: OPERATIONS_BOARD_POLL_INTERVAL_MS });
  if (teamId === null) return null;
  if (roster.isPending) {
    return <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">명단 요약을 불러오는 중이에요…</p>;
  }
  if (roster.isError || roster.data === undefined) {
    return (
      <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">명단 요약을 불러오지 못했어요.</p>
    );
  }
  const missing = roster.data.counts.excluded + roster.data.counts.unavailable;
  const suspended = roster.data.counts.suspended;
  const hasAlert = missing > 0 || suspended > 0;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={[
          'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--font-size-caption)] font-medium',
          hasAlert ? 'bg-[var(--tint-orange)] text-[var(--orange700)]' : 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
        ].join(' ')}
      >
        빠짐 {missing} · 정지 {suspended}
      </span>
      <Link
        href={withFromPath(gameRosterScreenPath(teamId, gameId), from)}
        aria-label={`${side.displayNameSnapshot} 경기 명단 보기`}
        className="inline-flex min-h-11 items-center rounded-lg px-2 text-[length:var(--font-size-caption)] font-medium text-[var(--blue700)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        명단 보기
      </Link>
    </div>
  );
}
