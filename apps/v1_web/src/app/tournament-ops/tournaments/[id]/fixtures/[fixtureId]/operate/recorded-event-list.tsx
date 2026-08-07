'use client';

import type { GameEventRecord, GameLineup, GameSide } from '@/types/game-operations';

/**
 * 서버에 확정된 경기 이벤트 로그.
 *
 * `QueueStatusPanel` 과 혼동하면 안 된다 — 그쪽은 *이번 세션에서 내가 올린* 전송 큐라
 * 새로고침하면 비어 있다. 이 목록은 `game.snapshot` 이 돌려주는 확정 이벤트라
 * 누가 언제 접속하든 같은 것을 본다.
 *
 * 선수 이름은 라인업 스냅샷에서 participantId 로 되짚는다. 라인업이 아직 없거나
 * 해당 참가자가 빠진 경우 이름을 지어내지 않고 팀명만 남긴다.
 */
export function RecordedEventList({
  events,
  sides,
  lineups,
}: {
  readonly events: readonly GameEventRecord[];
  readonly sides: readonly GameSide[];
  readonly lineups: readonly GameLineup[];
}) {
  if (events.length === 0) {
    return (
      <p className="px-1 py-3 text-2xs text-gray-400 dark:text-gray-500">
        아직 기록된 이벤트가 없어요.
      </p>
    );
  }

  const sideName = new Map(sides.map((side) => [side.id, side.displayNameSnapshot]));
  const playerName = new Map(
    lineups.flatMap((lineup) =>
      lineup.participants.map((participant) => [
        participant.id,
        `${participant.jerseyNumber ?? '-'} ${participant.displayNameSnapshot}`,
      ]),
    ),
  );

  return (
    <ul className="flex flex-col gap-1.5" aria-label="기록된 이벤트 목록">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-2xs font-medium tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">
              {event.period}P {Math.floor(event.clockMs / 60000)}&apos;
            </span>
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {eventTypeLabel(event.type)}
              {event.participantId && playerName.has(event.participantId)
                ? ` · ${playerName.get(event.participantId)}`
                : ''}
            </p>
          </div>
          <span className="shrink-0 text-2xs text-gray-500 dark:text-gray-400">
            {event.sideId ? (sideName.get(event.sideId) ?? '') : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function eventTypeLabel(type: string): string {
  switch (type) {
    case 'GOAL':
      return '골';
    case 'YELLOW_CARD':
      return '옐로카드';
    case 'RED_CARD':
      return '레드카드';
    case 'SUBSTITUTION':
      return '교체';
    case 'CORRECTION':
      return '정정';
    default:
      return type;
  }
}
