import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * 대회 참가 명단의 등번호 — **raw SQL 로 다룬다.**
 *
 * 생성된 Prisma 클라이언트는 모노레포 공유물이고 이 저장소에서는 재생성하지 않는다(CI 가
 * 생성한다). 그래서 새 컬럼은 로컬 타입에 없고, 타입으로 읽고 쓰면 여기서만 컴파일이 깨진다.
 * Task 164 의 `rosterAutoConfirmedAt` 이 같은 이유로 같은 방식을 썼다.
 *
 * 컬럼이 클라이언트에 들어오면 이 파일은 통째로 지우고 일반 필드처럼 다루면 된다.
 */
type SqlClient = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
};

/** 살아 있는 명단 행의 등번호. 키는 player id. 번호 없는 선수는 아예 들어오지 않는다. */
export async function readJerseyNumbers(
  client: SqlClient,
  registrationId: string,
): Promise<Map<string, number>> {
  const rows = await client.$queryRaw<Array<{ id: string; jersey_number: number | null }>>`
    SELECT id, jersey_number
    FROM "v1_tournament_players"
    WHERE registration_id = ${registrationId} AND removed_at IS NULL
  `;
  const byPlayerId = new Map<string, number>();
  for (const row of rows) {
    if (row.jersey_number !== null) byPlayerId.set(row.id, row.jersey_number);
  }
  return byPlayerId;
}

/**
 * **여러 등록의 등번호를 한 번에** 읽는다. 키는 player id.
 *
 * 공개 대회 상세는 참가팀이 여럿이라, 팀마다 `readJerseyNumbers` 를 부르면 **팀 수만큼
 * 쿼리가 나간다(N+1)**. 등록 id 목록을 받아 한 번만 묻는다.
 *
 * 캐스팅이 `::text[]` 인 이유는 `v1_tournament_players.registration_id` 의 실제 컬럼 타입이
 * `text` 이기 때문이다 — `@default(uuid())` 는 값 생성 방식이지 타입이 아니다. `::uuid[]` 로
 * 쓰면 `operator does not exist: text = uuid` 로 **쿼리 전체가 죽는다**(2026-09-06 alpha 실사고).
 */
export async function readJerseyNumbersForRegistrations(
  client: SqlClient,
  registrationIds: readonly string[],
): Promise<Map<string, number>> {
  const byPlayerId = new Map<string, number>();
  if (registrationIds.length === 0) return byPlayerId;
  const rows = await client.$queryRaw<Array<{ id: string; jersey_number: number | null }>>`
    SELECT id, jersey_number
    FROM "v1_tournament_players"
    WHERE registration_id = ANY(${[...registrationIds]}::text[])
      AND removed_at IS NULL
      AND jersey_number IS NOT NULL
  `;
  for (const row of rows) {
    if (row.jersey_number !== null) byPlayerId.set(row.id, row.jersey_number);
  }
  return byPlayerId;
}

/**
 * 같은 팀 명단에 그 번호를 이미 단 사람이 있으면 409.
 *
 * **스코프는 등록(팀) 단위다** — 같은 대회의 다른 팀이 같은 번호를 쓰는 것은 정상이다.
 * 뺀 선수(`removed_at IS NOT NULL`)는 번호를 점유하지 않는다. 그러지 않으면 한 번 쓴 번호를
 * 그 대회 내내 못 쓴다.
 *
 * DB 에도 같은 조건의 부분 unique 인덱스가 있다 — 이 검사는 **사용자에게 읽히는 메시지를
 * 주기 위한 것**이고, 동시 저장 경합의 최종 방어는 인덱스다.
 */
export async function assertJerseyAvailable(
  client: SqlClient,
  registrationId: string,
  jerseyNumber: number,
  excludePlayerId?: string,
): Promise<void> {
  // **제외는 SQL 에서 한다.** 예전엔 `LIMIT 1` 로 한 행만 받아 JS 에서 걸렀는데, 같은 번호를
  // 가진 행이 둘(자기 + 남)일 때 **플래너가 자기 행을 먼저 주면 중복을 못 잡는다** —
  // 정렬을 안 걸었으므로 어느 행이 오는지는 보장되지 않는다. 제외를 SQL 에 넣어야
  // `LIMIT 1` 이 "제외하고도 남는 행" 을 뜻하게 된다.
  const rows =
    excludePlayerId === undefined
      ? await client.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM "v1_tournament_players"
          WHERE registration_id = ${registrationId}
            AND removed_at IS NULL
            AND jersey_number = ${jerseyNumber}
          LIMIT 1
        `
      : await client.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM "v1_tournament_players"
          WHERE registration_id = ${registrationId}
            AND removed_at IS NULL
            AND jersey_number = ${jerseyNumber}
            AND id <> ${excludePlayerId}
          LIMIT 1
        `;
  if (rows.length > 0) {
    throw new ConflictException({
      code: 'ROSTER_DUPLICATE_JERSEY_NUMBER',
      message: `${jerseyNumber}번은 이미 다른 선수가 달고 있어요.`,
    });
  }
}

/** 등번호를 쓴다. `null` 이면 지운다(번호 없는 선수로 되돌린다). */
export async function writeJerseyNumber(
  client: SqlClient,
  playerId: string,
  jerseyNumber: number | null,
): Promise<void> {
  await client.$executeRaw`
    UPDATE "v1_tournament_players"
    SET jersey_number = ${jerseyNumber}
    WHERE id = ${playerId}
  `;
}

/** `Prisma` 를 값으로 쓰지 않지만 타입만 참조해 두면 이 파일의 의도가 드러난다. */
export type JerseyClient = SqlClient & { $transaction?: Prisma.TransactionClient };
