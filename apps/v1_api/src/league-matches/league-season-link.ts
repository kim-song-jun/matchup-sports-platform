import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { findPublicTournamentOnSurface, findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';

/**
 * 독립 정규 리그의 다음 시즌 잇기(2026-11-03 사용자 확정 — 독립 리그 → 독립 리그).
 *
 * 새 리그가 `previousLeagueId` 로 지난 리그를 가리킨다. 끝난 독립 리그를 이어 가는 길은 둘이고 **둘 중 하나만** 쓴다:
 * 이 다음 시즌 잇기, 또는 리그 체계 전환(`league-series-conversion.service.ts`, 1부·2부 첫 시즌 편성). 둘 다 하면
 * 지난 시즌 팀이 새 독립 리그와 체계 첫 시즌에 동시에 들어가 헷갈린다(2026-11-03 사용자 선택). 그래서 두 경로가
 * 이 파일의 판정을 같이 쓴다.
 */

/** 리그 체계 전환의 감사 기록 이름 — 전환 여부를 정하는 영속 기록이다(전환은 컬럼 없이 이 기록만 남긴다). */
export const LEAGUE_CONVERSION_ACTION = 'league_series.convert_independent';

type Db = Prisma.TransactionClient;

/** 리그 체계로 전환한 리그면 만들어진 체계 id(기록이 깨졌으면 null 이지만 전환한 것은 맞다), 아니면 undefined. */
export async function readLeagueConversion(db: Db, leagueId: string): Promise<{ seriesId: string | null } | undefined> {
  const log = await db.v1AdminActionLog.findFirst({
    where: { action: LEAGUE_CONVERSION_ACTION, targetType: 'league', targetId: leagueId },
    select: { afterJson: true },
  });
  if (log === null) return undefined;
  const value = log.afterJson;
  const seriesId =
    value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.seriesId === 'string'
      ? value.seriesId
      : null;
  return { seriesId };
}

/**
 * 리그 체계로 전환한 리그의 첫 시즌 티어(공개, 1부부터)와 확정 팀. 전환하지 않았으면 빈 배열.
 * 원본 리그 화면이 다음 시즌 입구·'다음 시즌' 링크를 티어마다 그린다(2026-11-04·11-06).
 */
export async function findConvertedSeasonTiers(db: Db, leagueId: string) {
  const conversion = await readLeagueConversion(db, leagueId);
  if (conversion?.seriesId == null) return [];
  const leagues = await db.v1Tournament.findMany({
    where: { kind: 'regular_league', deletedAt: null, isPublic: true, seriesId: conversion.seriesId },
    orderBy: [{ seasonNo: 'asc' }, { tier: 'asc' }],
    select: { id: true, title: true, tier: true, seasonNo: true, registrations: { where: { status: 'confirmed' }, select: { teamId: true } } },
  });
  const firstSeason = leagues[0]?.seasonNo;
  return leagues
    .filter((row) => row.seasonNo === firstSeason)
    .map((row) => ({ leagueId: row.id, title: row.title, tier: row.tier, teamIds: row.registrations.map((r) => r.teamId) }));
}

/**
 * 전환으로 만든 체계 첫 시즌 티어의 지난 시즌 = 전환한 원본 리그(공개된 것만). 전환은 컬럼 없이 감사 기록만 남기므로
 * 기록의 `afterJson.seriesId` 로 거꾸로 찾는다. 체계의 2시즌부터와 전환 없이 만든 체계는 null 이다(2026-11-06).
 */
export async function findConversionSourceLeague(
  db: Db,
  league: { seriesId: string | null; seasonNo: number | null },
): Promise<{ id: string; title: string } | null> {
  if (league.seriesId === null || league.seasonNo !== 1) return null;
  const log = await db.v1AdminActionLog.findFirst({
    where: { action: LEAGUE_CONVERSION_ACTION, targetType: 'league', afterJson: { path: ['seriesId'], equals: league.seriesId } },
    select: { targetId: true },
  });
  if (!log?.targetId) return null;
  return findPublicTournamentOnSurface(db, ['regular_league'], {
    where: { id: log.targetId, deletedAt: null },
    select: { id: true, title: true },
  });
}

/** 이 리그를 지난 시즌으로 가리키는(이어진) 다음 시즌 리그. 지운 리그는 이어진 것으로 보지 않는다. */
export async function findNextSeasonLeague(db: Db, leagueId: string): Promise<{ id: string; title: string } | null> {
  return findTournamentOnSurface(db, ['regular_league'], {
    where: { previousLeagueId: leagueId, deletedAt: null },
    select: { id: true, title: true },
  });
}

/** 다음 시즌을 시작할 수 있는 지난 시즌 상태 — 시즌을 시작했거나 끝낸 리그. 화면의 메뉴 노출과 같은 기준이다. */
const NEXT_SEASON_SOURCE_STATUSES = new Set(['in_progress', 'completed']);

/**
 * `previousLeagueId` 리그의 다음 시즌을 만들어도 되는지 본다. 리그 생성이 같은 트랜잭션에서 부른다.
 *
 * 지난 리그 행을 먼저 **갱신해 잠근다**(updatedAt). 리그 체계 전환은 그 행을 FOR UPDATE 로 먼저 잡고 이 연결을
 * 확인하므로, 둘이 겹치면 한쪽이 기다리거나 직렬화 충돌로 끝난다 — 둘 다 성공하지 않는다. 같은 지난 리그에 다음
 * 시즌을 둘 만드는 경쟁은 `previous_league_id` 유니크 인덱스가 막는다.
 */
export async function assertNextSeasonSourceInTx(
  tx: Db,
  input: { previousLeagueId: string; sportId: string },
): Promise<{ id: string; title: string }> {
  const touched = await tx.v1Tournament.updateMany({
    where: { id: input.previousLeagueId, kind: 'regular_league', deletedAt: null },
    data: { updatedAt: new Date() },
  });
  const previous = touched.count === 0
    ? null
    : await findTournamentOnSurface(tx, ['regular_league'], {
        where: { id: input.previousLeagueId, deletedAt: null },
        select: { id: true, title: true, sportId: true, seriesId: true, status: true },
      });
  if (previous === null) {
    throw new UnprocessableEntityException({ code: 'LEAGUE_PREVIOUS_SEASON_INVALID', message: '지난 시즌 리그를 찾을 수 없어요.' });
  }
  if (previous.seriesId !== null) {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_PREVIOUS_SEASON_INVALID',
      message: '리그 체계에 속한 리그는 승강 확정으로 다음 시즌을 이어요.',
    });
  }
  if (!NEXT_SEASON_SOURCE_STATUSES.has(previous.status)) {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_PREVIOUS_SEASON_INVALID',
      message: '시즌을 시작했거나 끝낸 리그에서 다음 시즌을 만들 수 있어요.',
    });
  }
  if (previous.sportId !== input.sportId) {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_PREVIOUS_SEASON_INVALID',
      message: '지난 시즌과 같은 종목으로만 다음 시즌을 만들 수 있어요.',
    });
  }
  if ((await readLeagueConversion(tx, previous.id)) !== undefined) {
    throw new ConflictException({
      code: 'LEAGUE_ALREADY_CONVERTED',
      message: '리그 체계로 전환한 리그는 다음 시즌을 따로 이을 수 없어요.',
    });
  }
  if ((await findNextSeasonLeague(tx, previous.id)) !== null) {
    throw new ConflictException({ code: 'LEAGUE_NEXT_SEASON_EXISTS', message: '이미 다음 시즌이 이어진 리그예요.' });
  }
  // 지운 다음 시즌이 연결을 쥐고 있으면 풀어 준다 — 유니크 인덱스가 새 연결을 막는다(지운 리그는 이어진 것이 아니다).
  await tx.v1Tournament.updateMany({
    where: { previousLeagueId: previous.id, deletedAt: { not: null } },
    data: { previousLeagueId: null },
  });
  return { id: previous.id, title: previous.title };
}
