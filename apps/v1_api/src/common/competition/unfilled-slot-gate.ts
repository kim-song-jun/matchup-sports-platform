import { Prisma } from '@prisma/client';

/**
 * 정규 리그 빈 경기 공개 게이트의 **유일한 출처**.
 *
 * 자리(slot)에 연결됐는데 그 사이드의 팀이 비어 있는 경기는 공개 화면 어디에도 나가면 안 된다 —
 * 반쪽만 찬 경기도 같다(팀 일정은 양 팀이 다 찼을 때만 생기므로 일정 링크가 404 가 된다).
 * 자리가 없는 기존 경기는 원정이 null 이어도 이 술어에 걸리지 않는다.
 */
export function unfilledSlotFixtureWhere(): Prisma.V1TeamMatchWhereInput {
  return {
    OR: [
      { homeSlotId: { not: null }, hostTeamId: null },
      { awaySlotId: { not: null }, approvedApplicantTeamId: null },
    ],
  };
}

export function excludeUnfilledSlotFixturesWhere(): Prisma.V1TeamMatchWhereInput {
  return { NOT: unfilledSlotFixtureWhere() };
}

const SQL_ALIAS = /^[a-z_][a-z0-9_]*$/i;

/** raw SQL 용 같은 술어. `alias` 는 `Prisma.raw` 로 들어가므로 식별자 모양만 받는다. */
export function excludeUnfilledSlotFixturesSql(alias: string): Prisma.Sql {
  if (!SQL_ALIAS.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  const a = Prisma.raw(alias);
  return Prisma.sql`NOT ((${a}.home_slot_id IS NOT NULL AND ${a}.host_team_id IS NULL) OR (${a}.away_slot_id IS NOT NULL AND ${a}.approved_applicant_team_id IS NULL))`;
}

export function isUnfilledSlotFixture(row: {
  homeSlotId: string | null;
  awaySlotId: string | null;
  hostTeamId: string | null;
  approvedApplicantTeamId: string | null;
}): boolean {
  return (
    (row.homeSlotId !== null && row.hostTeamId === null) ||
    (row.awaySlotId !== null && row.approvedApplicantTeamId === null)
  );
}
