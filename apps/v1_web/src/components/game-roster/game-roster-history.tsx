import type { V1GameRosterHistoryEvent } from '@/hooks/use-v1-game-roster';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { gameRosterActorRoleLabel, gameRosterReasonLabel } from '@/lib/v1-status-labels';

export function gameRosterHistoryTitle(event: V1GameRosterHistoryEvent): string {
  if (event.type === 'REVOKE') return `${event.displayName} 출전으로 되돌림`;
  const reason = gameRosterReasonLabel(event.reason);
  return reason === null ? `${event.displayName} 빠짐` : `${event.displayName} 빠짐 · ${reason}`;
}

/** 시각 · 누가. 사람이 없는 기록(대진이 바뀌어 자동으로 되돌림)은 이름 대신 역할 라벨("자동")만. */
export function gameRosterHistoryCaption(event: V1GameRosterHistoryEvent): string {
  const role = gameRosterActorRoleLabel(event.actor.role);
  const who =
    event.actor.userId === null
      ? (role ?? event.actor.displayName)
      : role === null
        ? event.actor.displayName
        : `${role} ${event.actor.displayName}`;
  const when = formatTournamentDateTimeShort(event.at);
  return when === null ? who : `${when} · ${who}`;
}

/** 경기 명단 변경 기록 — 최근 것부터. 서버는 시간순으로 준다. */
export function GameRosterHistoryList({ events }: { events: readonly V1GameRosterHistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="tm-text-caption" style={{ margin: 0, color: 'var(--text-muted)' }}>
        아직 바꾼 기록이 없어요. 참가 명단 그대로 출전해요.
      </p>
    );
  }
  const newestFirst = [...events].reverse();
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {newestFirst.map((event, index) => (
        <li
          key={`${event.adjustmentId}:${event.type}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '12px 0',
            borderBottom: index === newestFirst.length - 1 ? 'none' : '1px solid var(--border)',
          }}
        >
          <span className="tm-text-label" style={{ color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>
            {gameRosterHistoryTitle(event)}
          </span>
          <span className="tm-text-caption">{gameRosterHistoryCaption(event)}</span>
        </li>
      ))}
    </ul>
  );
}
