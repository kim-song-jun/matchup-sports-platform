import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * 대회·리그 경기 명단 재계산 후속 이벤트. 조정 API(경기 단위 빼기·되돌리기, 팀 일괄)만 같은
 * 트랜잭션에서 명단을 맞추고, 나머지 트리거는 이 이벤트만 남긴다. 트리거 트랜잭션은 이미 참가 명단·
 * 팀·다른 경기 행을 쥐고 있어 거기서 경기를 잠그면 순서가 엇갈려 교착하기 때문이다. 워커 핸들러
 * (`game-roster-sync.ts` handleCompetitionRosterResync)에서는 대상 경기 잠금이 첫 잠금이다.
 */
export const COMPETITION_ROSTER_RESYNC_TYPE = 'COMPETITION_ROSTER_RESYNC';

export type RosterResyncTarget =
  /** 한 팀의 그 대회·리그 시작 전 경기 전부. */
  | { readonly scope: 'competitionTeam'; readonly competitionId: string; readonly teamId: string }
  /** 팀 멤버십이 바뀐 팀의, 참가 명단 없이 팀원 기준으로 뛰는 리그 경기. */
  | { readonly scope: 'teamMembers'; readonly teamId: string }
  /** 결장 기간(ISO 시각) 안에 시작하는 팀의 대회·리그 경기가 걸린 대회·리그 전부. */
  | { readonly scope: 'teamPeriod'; readonly teamId: string; readonly startsAt: string; readonly endsAt: string }
  /** 한 경기의 팀 배정된 사이드(시각 필터 없음 — 시각이 지나도 시작 전이면 맞춘다). */
  | { readonly scope: 'game'; readonly gameId: string }
  /** 결과가 바뀐 경기의 양 팀(출전정지 규정이 있을 때만). */
  | { readonly scope: 'result'; readonly gameId: string };

function aggregateOf(target: RosterResyncTarget): { type: 'GAME' | 'TEAM'; id: string } {
  return target.scope === 'game' || target.scope === 'result'
    ? { type: 'GAME', id: target.gameId }
    : { type: 'TEAM', id: target.teamId };
}

/** 한 대회·리그의 팀들. null·중복 팀은 무시한다. */
export function competitionTeamTargets(
  competitionId: string,
  teamIds: readonly (string | null | undefined)[],
): RosterResyncTarget[] {
  return [...new Set(teamIds)]
    .filter((teamId): teamId is string => typeof teamId === 'string')
    .map((teamId) => ({ scope: 'competitionTeam', competitionId, teamId }));
}

/** 멤버십이 바뀐 팀들의 폴백 리그 재계산. */
export function teamMembersTargets(teamIds: readonly string[]): RosterResyncTarget[] {
  return [...new Set(teamIds)].map((teamId) => ({ scope: 'teamMembers', teamId }));
}

/**
 * 트랜잭션 안에서 재계산 이벤트를 남긴다. 같은 호출 안의 같은 대상은 한 번만 남긴다.
 * `businessKey` 는 대상이 하나일 때만 받는다(원천 이벤트 재시도에 멱등한 결과 경로).
 */
export async function enqueueRosterResync(
  tx: Tx,
  targets: readonly RosterResyncTarget[],
  options: { businessKey?: string } = {},
): Promise<void> {
  const unique = new Map(targets.map((target) => [JSON.stringify(target), target]));
  if (options.businessKey !== undefined && unique.size > 1) {
    throw new Error('A fixed roster resync business key needs exactly one target');
  }
  for (const [payload, target] of unique) {
    const aggregate = aggregateOf(target);
    const businessKey = options.businessKey ?? `roster-resync:${aggregate.type}:${aggregate.id}:${randomUUID()}`;
    // available_at 은 워커와 같이 밀리초로 내림한다(`claimOne` 주석: 반올림되면 곧바로 claim 되지 않는다).
    await tx.$executeRaw`
      INSERT INTO v1_outbox_events (id, business_key, aggregate_type, aggregate_id, type, payload, available_at, status, attempts, retry_generation, version, created_at, updated_at)
      VALUES (${randomUUID()}, ${businessKey}, ${aggregate.type}, ${aggregate.id}, ${COMPETITION_ROSTER_RESYNC_TYPE}, ${payload}::jsonb, date_trunc('milliseconds', CURRENT_TIMESTAMP), 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (business_key) DO NOTHING
    `;
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** 이벤트 payload 를 대상으로 읽는다. 모양이 다르면 던진다(재시도 끝에 POISONED 로 드러난다). */
export function parseRosterResyncTarget(payload: unknown): RosterResyncTarget {
  const row = (payload ?? {}) as Record<string, unknown>;
  switch (row.scope) {
    case 'competitionTeam':
      if (isString(row.competitionId) && isString(row.teamId)) {
        return { scope: 'competitionTeam', competitionId: row.competitionId, teamId: row.teamId };
      }
      break;
    case 'teamMembers':
      if (isString(row.teamId)) return { scope: 'teamMembers', teamId: row.teamId };
      break;
    case 'teamPeriod':
      if (isString(row.teamId) && isString(row.startsAt) && isString(row.endsAt)) {
        return { scope: 'teamPeriod', teamId: row.teamId, startsAt: row.startsAt, endsAt: row.endsAt };
      }
      break;
    case 'game':
    case 'result':
      if (isString(row.gameId)) return { scope: row.scope, gameId: row.gameId };
      break;
  }
  throw new Error(`Invalid ${COMPETITION_ROSTER_RESYNC_TYPE} payload`);
}

/**
 * 같은 대상의 대기 중인 이벤트를 처리됨으로 닫는다. 보이는 행은 이미 커밋됐으므로 그 쓰기는 이 뒤의
 * 재계산이 읽는다. 다른 워커가 잡고 있는 행은 건너뛴다(SKIP LOCKED — 서로 기다리지 않는다).
 */
export async function completeQueuedDuplicates(
  tx: Tx,
  event: { id: string; payload: unknown },
): Promise<number> {
  const target = parseRosterResyncTarget(event.payload);
  const aggregate = aggregateOf(target);
  return tx.$executeRaw`
    WITH duplicate AS (
      SELECT id
      FROM v1_outbox_events
      WHERE type = ${COMPETITION_ROSTER_RESYNC_TYPE}
        AND aggregate_type = ${aggregate.type}
        AND aggregate_id = ${aggregate.id}
        AND payload = ${JSON.stringify(target)}::jsonb
        AND status IN ('PENDING', 'RETRY')
        AND id <> ${event.id}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE v1_outbox_events event
    SET status = 'COMPLETED',
        lease_owner = NULL,
        lease_until = NULL,
        last_error = NULL,
        version = event.version + 1,
        updated_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
    FROM duplicate
    WHERE event.id = duplicate.id
  `;
}
