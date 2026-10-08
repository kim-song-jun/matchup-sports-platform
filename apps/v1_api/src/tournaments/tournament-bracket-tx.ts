import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, V1GameSourceType, type V1TournamentGroup, type V1TournamentGroupPhase } from '@prisma/client';
import { writeAdminActionLog, type V1ActiveAdmin } from '../common/admin-context.service';
import { cascadeCancelTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
import type { GamesService } from '../games/games.service';
import {
  fairPlayByRegistrationFromGroups,
  recalculateAndUpsertGroupStandings,
} from './tournament-group-standings';
import { updateTournamentMatchInTx } from './tournament-match-update';
import { recalculateAndUpsertOverallStandings } from './tournament-overall-standings';
import { loadCanonicalStandingsSource } from './tournament-standings-source';

type Tx = Prisma.TransactionClient;

/**
 * 대진 변경 `…InTx` 함수 모음. 서비스 메서드는 권한 확인·락·응답 직렬화만 하고 변경 본문은 여기 있어서,
 * 템플릿·자리 서비스가 여러 변경을 한 트랜잭션에 묶을 수 있다. 대회 대진 변경은 호출자가
 * `league-fixture-generation:{tournamentId}` advisory lock 을 먼저 잡았다고 가정한다.
 */

export async function createGroupInTx(
  tx: Tx,
  admin: V1ActiveAdmin,
  tournamentId: string,
  input: { name: string; phase: V1TournamentGroupPhase; sortOrder: number; advanceCount: number | null },
): Promise<V1TournamentGroup> {
  const group = await tx.v1TournamentGroup.create({
    data: {
      tournamentId,
      name: input.name,
      phase: input.phase,
      sortOrder: input.sortOrder,
      advanceCount: input.advanceCount,
    },
  });
  await writeAdminActionLog(tx, admin, {
    action: 'tournament.bracket.group.create',
    targetType: 'tournament_group',
    targetId: group.id,
    afterJson: { tournamentId, name: group.name, phase: group.phase },
  });
  return group;
}

/** 조별·통합 순위 전체 재계산. 호출자 tx 안에서 돌고 감사 로그는 호출자가 남긴다. */
export async function recalculateStandingsInTx(tx: Tx, tournamentId: string) {
  const source = await loadCanonicalStandingsSource(tx, tournamentId);
  if (source === null) {
    throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  }
  const { groups, config, configVersionId: competitionConfigVersionId, recalculatedAt: now } = source;
  // 모든 조의 픽스처를 넘겨 한 번에 집계한 페어플레이 벌점 Map 을 그룹별·통합 upsert 양쪽에 넘긴다.
  const fairPlayByRegistration = fairPlayByRegistrationFromGroups(groups);
  for (const group of groups) {
    await recalculateAndUpsertGroupStandings(
      tx,
      { tournamentId, configVersionId: competitionConfigVersionId, config, group, fairPlayByRegistration },
      now,
    );
  }

  // 조별 upsert 를 부르는 경로는 같은 tx 에서 통합 upsert 도 불러야 조별 화면과 통합 화면이 어긋나지 않는다.
  await recalculateAndUpsertOverallStandings(
    tx,
    { tournamentId, configVersionId: competitionConfigVersionId, config, groups, fairPlayByRegistration },
    now,
  );
  return {
    groupCount: groups.length,
    recalculatedAt: now,
    competitionConfigVersionId,
    audit: { groupCount: groups.length, recalculatedAt: now.toISOString(), competitionConfigVersionId },
  };
}

/**
 * 조별 순위는 조 편성(V1TournamentGroupTeam) 기준으로 계산·표시된다. 조별리그(`group`) 조 안의
 * 경기에 들어가는 팀이 편성에 없으면 순위표에서 빠지므로, 경기를 넣는 같은 트랜잭션에서 편성한다.
 * 결선 단계 조는 편성이 대진 자리(부전승·정원)를 뜻해서 건드리지 않는다.
 */
export async function ensureGroupPhaseTeamsInTx(
  tx: Tx,
  admin: V1ActiveAdmin,
  tournamentId: string,
  groupId: string,
  groupPhase: string,
  registrationIds: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  if (groupPhase !== 'group') return;
  const ids = [...new Set(registrationIds.filter((id): id is string => typeof id === 'string'))];
  if (ids.length === 0) return;
  const assigned = await tx.v1TournamentGroupTeam.findMany({
    where: { groupId },
    select: { registrationId: true, sortOrder: true },
  });
  const assignedIds = new Set(assigned.map((team) => team.registrationId));
  let nextSortOrder = assigned.length === 0 ? 0 : Math.max(...assigned.map((team) => team.sortOrder)) + 1;
  // 순위 행이 하나라도 있는 조는 행만 보여 줘서, 새 편성 팀은 재계산 전까지 표에서 빠진다.
  const groupHasStandings = (await tx.v1TournamentStanding.count({ where: { groupId } })) > 0;
  const createdTeamIds: string[] = [];
  for (const registrationId of ids) {
    if (assignedIds.has(registrationId)) continue;
    const created = await tx.v1TournamentGroupTeam.create({
      data: { groupId, registrationId, isBye: false, sortOrder: nextSortOrder++ },
    });
    await writeAdminActionLog(tx, admin, {
      action: 'tournament.bracket.group_team.create',
      targetType: 'tournament_group_team',
      targetId: created.id,
      afterJson: { groupId, registrationId, isBye: false, auto: 'fixture', standingsRecalculated: groupHasStandings },
    });
    createdTeamIds.push(created.id);
  }
  if (createdTeamIds.length > 0 && groupHasStandings) {
    const recalculated = await recalculateStandingsInTx(tx, tournamentId);
    await writeAdminActionLog(tx, admin, {
      action: 'tournament.bracket.standings.recalculate_auto',
      targetType: 'tournament',
      targetId: tournamentId,
      afterJson: { trigger: 'fixture_group_team_enroll', groupId, ...recalculated.audit },
    });
  }
}

/** `createEmptyTournamentFixtureInTx` 와 같은 자리에 쓰는 외부 의존. 사이드 배정은 이 중 아무것도 쓰지 않는다. */
export type BracketTxDeps = { games: GamesService };

export type TournamentFixtureUpdateInput = {
  fixtureId: string;
  tournamentId: string;
  groupId: string | null;
  fixtureNumber?: number;
  scheduledAt?: Date | null;
  venue?: string;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
};

/**
 * 일정·장소·번호·두 사이드를 한 번에 바꾼다(`PATCH /admin/fixtures/:id` 의 tx 본문). 팀을 바꾸는 요청이면
 * 부전승 팀을 거절하고 조별리그 조에 편성한 뒤, 사이드·팀 일정·명단 재계산 이벤트는 `updateTournamentMatchInTx` 가 맡는다.
 * undefined 인 필드는 건드리지 않고 null 은 "미정으로 비움" 이다.
 */
export async function updateTournamentFixtureInTx(tx: Tx, admin: V1ActiveAdmin, input: TournamentFixtureUpdateInput) {
  const changesTeams = input.homeRegistrationId !== undefined || input.awayRegistrationId !== undefined;
  if (input.groupId && changesTeams) {
    const byeTeam = await tx.v1TournamentGroupTeam.findFirst({ where: {
      groupId: input.groupId, isBye: true,
      registrationId: { in: [input.homeRegistrationId, input.awayRegistrationId].filter((id): id is string => typeof id === 'string') },
    } });
    if (byeTeam) throw new ConflictException({ code: 'BYE_TEAM_HAS_MATCH', message: '부전승팀은 해당 라운드의 경기에 넣을 수 없어요. 다음 라운드에 직접 배정해 주세요.' });
    const group = await tx.v1TournamentGroup.findFirst({ where: { id: input.groupId }, select: { phase: true } });
    if (group) await ensureGroupPhaseTeamsInTx(tx, admin, input.tournamentId, input.groupId, group.phase, [input.homeRegistrationId, input.awayRegistrationId]);
  }
  const previousNumber = input.fixtureNumber === undefined ? undefined : (await tx.v1TournamentMatchDetails.findUniqueOrThrow({
    where: { teamMatchId: input.fixtureId }, select: { fixtureNumber: true },
  })).fixtureNumber;
  const row = await updateTournamentMatchInTx(tx, {
    teamMatchId: input.fixtureId,
    fixtureNumber: input.fixtureNumber,
    scheduledAt: input.scheduledAt,
    venue: input.venue,
    homeRegistrationId: input.homeRegistrationId,
    awayRegistrationId: input.awayRegistrationId,
  });
  await writeAdminActionLog(tx, admin, {
    action: 'tournament.bracket.fixture.update',
    targetType: 'team_match',
    targetId: input.fixtureId,
    ...(previousNumber === undefined ? {} : { beforeJson: { fixtureNumber: previousNumber } }),
    afterJson: {
      fixtureNumber: row.fixtureNumber,
      scheduledAt: row.startAt?.toISOString() ?? null,
      venue: row.placeName,
      homeRegistrationId: row.homeRegistrationId,
      awayRegistrationId: row.awayRegistrationId,
    },
  });
  return row;
}

/**
 * 한 경기의 한쪽 사이드에 팀을 넣거나(null 이면 비운다) 반대쪽은 그대로 둔다. 자리 서비스(PR-1b)가 자리에 연결된
 * 경기마다 부른다. 호출자가 대회 advisory lock 을 잡고 있어야 한다. `deps` 는 계약 시그니처를 맞추는 자리로,
 * 사이드 배정 자체는 `GamesService` 를 쓰지 않는다.
 */
export async function assignTournamentFixtureSideInTx(
  tx: Tx,
  _deps: BracketTxDeps,
  admin: V1ActiveAdmin,
  input: { fixtureId: string; side: 'HOME' | 'AWAY'; registrationId: string | null },
): Promise<void> {
  const details = await tx.v1TournamentMatchDetails.findUnique({
    where: { teamMatchId: input.fixtureId },
    select: { tournamentId: true, groupId: true },
  });
  if (details === null) throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
  await updateTournamentFixtureInTx(tx, admin, {
    fixtureId: input.fixtureId,
    tournamentId: details.tournamentId,
    groupId: details.groupId,
    ...(input.side === 'HOME' ? { homeRegistrationId: input.registrationId } : { awayRegistrationId: input.registrationId }),
  });
}

/**
 * 자리(slot)에 연결된 사이드의 팀은 자리 서비스만 바꾼다. 경기 수정 API 가 직접 바꾸면 자리와 경기가 어긋난다.
 * 현재 값과 같은 값이거나 보내지 않은 쪽은 허용한다(일정·장소만 고치는 요청이 막히면 안 된다).
 */
export function assertSidesNotSlotLinked(
  current: { homeSlotId: string | null; awaySlotId: string | null; homeRegistrationId: string | null; awayRegistrationId: string | null },
  change: { homeRegistrationId?: string | null; awayRegistrationId?: string | null },
): void {
  const homeChanged = change.homeRegistrationId !== undefined && change.homeRegistrationId !== current.homeRegistrationId;
  const awayChanged = change.awayRegistrationId !== undefined && change.awayRegistrationId !== current.awayRegistrationId;
  if ((current.homeSlotId !== null && homeChanged) || (current.awaySlotId !== null && awayChanged)) {
    throw new ConflictException({
      code: 'SLOT_LINKED',
      message: '대진 자리에 연결된 팀은 경기에서 직접 바꿀 수 없어요. 자리에서 팀을 바꿔 주세요.',
    });
  }
}

/**
 * 시작 전 경기를 숨긴다(Game·감사 이력은 지우지 않는다). 자리 연결(`homeSlotId`·`awaySlotId`)도 같은 update 로 푼다.
 * 경기 한 건의 Game→TeamMatch 행만 잠그며 대회 행·advisory lock 은 호출자가 잡는다.
 */
export async function softDeleteTournamentFixtureInTx(tx: Tx, admin: V1ActiveAdmin, fixtureId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${fixtureId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id = ${fixtureId} FOR UPDATE`;
  const canonical = await tx.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: fixtureId },
    include: { tournament: true, teamMatch: { include: { game: true } } } });
  if (!canonical || canonical.teamMatch.deletedAt !== null) throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
  const game = canonical.teamMatch.game;
  if (!game || game.sourceType !== V1GameSourceType.TEAM_MATCH) throw new ConflictException({ code: 'TOURNAMENT_MATCH_GAME_MISSING', message: '대회 경기의 정본 TeamMatch 게임을 찾을 수 없어요.' });
  if (game.currentOfficialRevisionId !== null) throw new ConflictException({ code: 'FIXTURE_HAS_RESULT', message: '결과가 기록된 경기는 삭제할 수 없어요.' });
  if (!['draft', 'open', 'closed'].includes(canonical.tournament.status) || game.state !== 'SCHEDULED' || canonical.teamMatch.status !== 'matched') {
    throw new ConflictException({ code: 'FIXTURE_ALREADY_STARTED', message: '대회 시작 전의 아직 시작하지 않은 경기만 삭제할 수 있어요.' });
  }
  await tx.$queryRaw`SELECT g.id FROM v1_games g JOIN v1_tournament_match_advancement_edges e ON g.team_match_id = e.target_team_match_id WHERE e.source_team_match_id = ${fixtureId} ORDER BY g.id FOR UPDATE OF g`;
  const linked = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { sourceTeamMatchId: fixtureId }, include: { target: { include: { teamMatch: { include: { game: true } } } } } });
  if (linked.some((edge) => edge.target.homeRegistrationId !== null || edge.target.awayRegistrationId !== null || edge.target.teamMatch.game?.state !== 'SCHEDULED' || edge.target.teamMatch.game.currentOfficialRevisionId !== null)) {
    throw new ConflictException({ code: 'FIXTURE_DOWNSTREAM_ASSIGNED', message: '연결된 다음 경기의 팀 배정을 먼저 해제해 주세요. 시작된 다음 경기가 있으면 삭제할 수 없어요.' });
  }
  const children = await tx.v1TournamentMatchDetails.findMany({ where: { parentTeamMatchId: fixtureId, teamMatch: { deletedAt: null } }, select: { teamMatchId: true } });
  if (children.length) throw new ConflictException({ code: 'FIXTURE_HAS_CHILDREN', message: '연결된 하위 경기를 먼저 삭제해 주세요.' });
  await cascadeCancelTeamMatchSchedulesInTx(tx, fixtureId, 'admin_bracket_deleted_before_start');
  await tx.v1Game.update({ where: { id: game.id }, data: { state: 'CANCELLED', version: { increment: 1 } } });
  await tx.v1GameVisibilityPolicy.update({ where: { gameId: game.id }, data: { mode: 'STATUS_ONLY', lineupAt: null, version: { increment: 1 } } });
  await tx.v1TeamMatch.update({ where: { id: fixtureId }, data: { status: 'archived', deletedAt: new Date(), homeSlotId: null, awaySlotId: null } });
  await tx.v1TournamentMatchAdvancementEdge.deleteMany({ where: { OR: [{ sourceTeamMatchId: fixtureId }, { targetTeamMatchId: fixtureId }] } });
  // Free the original round/number unique key; the original identity is retained in the audit below.
  await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: fixtureId }, data: { groupId: null, parentTeamMatchId: null, round: canonical.round + ':deleted:' + fixtureId } });
  await tx.v1StatusChangeLog.create({ data: { targetType: 'team_match', targetId: fixtureId, fromStatus: canonical.teamMatch.status, toStatus: 'archived', actorType: 'admin', actorUserId: admin.userId, reason: 'admin_bracket_deleted_before_start' } });
  await writeAdminActionLog(tx, admin, { action: 'tournament.bracket.fixture.delete', targetType: 'team_match', targetId: fixtureId,
    beforeJson: { tournamentId: canonical.tournamentId, groupId: canonical.groupId, round: canonical.round, fixtureNumber: canonical.fixtureNumber, legNumber: canonical.legNumber },
    afterJson: { deleted: true, gameId: game.id, state: 'CANCELLED' } });
}
