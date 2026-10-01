import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isSelfRestorable, loadTeamArchivedBy } from './team-dissolution';

/** 같은 종목·같은 지역 안에서 팀 이름이 겹치는지 본다(H2). */
export type TeamNameTarget = { name: string; sportId: string; regionId: string; excludeTeamId?: string };

/** 눈으로 같은 이름을 같게 본다 — 전각·반각, 조합형·완성형 한글(NFKC), 공백 개수, 대소문자. 잠금 키도 이 값이다. */
export function normalizeTeamName(name: string) {
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isSameTeamName(team: { name: string; sportId: string; regionId: string }, target: TeamNameTarget) {
  return normalizeTeamName(team.name) === normalizeTeamName(target.name) && team.sportId === target.sportId && team.regionId === target.regionId;
}

/** 만들기·수정·보관 해제(셀프·운영팀)가 같은 이름을 동시에 통과하지 않게 이름 단위로 줄 세운다(DB 유니크는 기존 중복 때문에 못 건다). */
export async function lockTeamNameScope(tx: Prisma.TransactionClient, target: TeamNameTarget) {
  const scope = `team-name:${target.sportId}:${target.regionId}:${normalizeTeamName(target.name)}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
}

/**
 * normalizeTeamName 으로 같은 이름을 차지한 팀이 있나. 활동 중인 팀과, 팀장이 해체해 아직 직접
 * 복구할 수 있는 팀(H3)이 이름을 차지한다 — 복구 기간이 지났거나 운영팀이 보관한 팀은 이름을 풀어 준다.
 */
export async function hasTeamWithSameName(db: Prisma.TransactionClient, target: TeamNameTarget, now: Date) {
  const normalized = normalizeTeamName(target.name);
  const sameArea = await db.v1Team.findMany({
    where: {
      sportId: target.sportId,
      regionId: target.regionId,
      OR: [{ status: { not: 'archived' }, deletedAt: null }, { status: 'archived' }],
      ...(target.excludeTeamId ? { id: { not: target.excludeTeamId } } : {}),
    },
    select: { id: true, name: true, status: true, deletedAt: true },
  });
  const sameName = sameArea.filter((team) => normalizeTeamName(team.name) === normalized);
  if (sameName.some((team) => team.status !== 'archived')) return true;
  if (sameName.length === 0) return false;
  const archivedBy = await loadTeamArchivedBy(db, sameName.map((team) => team.id));
  return sameName.some((team) => isSelfRestorable(archivedBy(team.id), team.deletedAt, now));
}

export async function assertTeamNameAvailable(tx: Prisma.TransactionClient, target: TeamNameTarget) {
  await lockTeamNameScope(tx, target);
  if (await hasTeamWithSameName(tx, target, new Date())) {
    throw new ConflictException({ code: 'TEAM_NAME_TAKEN', message: '같은 종목·지역에 같은 이름의 팀이 있어요. 다른 이름을 써 주세요.' });
  }
}

/**
 * 보관을 푸는 두 경로(팀장 셀프 복구·운영팀 보관 해제)가 함께 본다. 운영팀 보관은 이름을 바로 풀어 주므로
 * 그 사이 같은 이름의 팀이 생겼을 수 있다. 호출부가 lockTeamNameScope 를 먼저 잡고 있어야 한다.
 */
export async function assertRestoredTeamNameFree(tx: Prisma.TransactionClient, team: { id: string; name: string; sportId: string; regionId: string }) {
  const target = { name: team.name, sportId: team.sportId, regionId: team.regionId, excludeTeamId: team.id };
  if (await hasTeamWithSameName(tx, target, new Date())) {
    throw new ConflictException({ code: 'TEAM_RESTORE_NAME_TAKEN', message: '같은 종목·지역에 같은 이름의 팀이 있어 복구할 수 없어요.' });
  }
}
