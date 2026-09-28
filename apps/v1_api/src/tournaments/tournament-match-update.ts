import { Prisma, V1GameSideKey } from '@prisma/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createTeamMatchScheduleInTx, MATCH_SCHEDULE_DEFAULT_DURATION_MS } from '../team-schedules/team-match-schedule';
import {
  findUpcomingTeamGameIds,
  lockGameScope,
  requireLockedGames,
  syncGameSideRoster,
  syncRostersForTeamMatchTeams,
  type GameLockScope,
} from '../games/roster/game-roster-sync';

type Tx = Prisma.TransactionClient;

export type TournamentMatchUpdateInput = {
  teamMatchId: string;
  scheduledAt?: Date | null;
  venue?: string;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
};

/**
 * 이 수정이 잠가야 할 경기: 자기 경기와, 시각·팀이 바뀔 수 있으면 바뀌기 전·후 팀들의 시작 전 경기.
 * 잠그기 전에 읽으므로 잠근 뒤의 동기화가 이 밖의 경기를 만나면 409 로 끝난다(`requireLockedGames`).
 */
export async function planTournamentMatchUpdateGames(tx: Tx, input: TournamentMatchUpdateInput): Promise<string[]> {
  const detail = await tx.v1TournamentMatchDetails.findUnique({
    where: { teamMatchId: input.teamMatchId },
    select: {
      tournamentId: true,
      teamMatch: { select: { hostTeamId: true, approvedApplicantTeamId: true, game: { select: { id: true } } } },
    },
  });
  if (detail === null || detail.teamMatch.game === null) return [];
  const ownGameId = detail.teamMatch.game.id;
  const reordersGames =
    input.scheduledAt !== undefined || input.homeRegistrationId !== undefined || input.awayRegistrationId !== undefined;
  if (!reordersGames) return [ownGameId];
  const requestedRegistrationIds = [input.homeRegistrationId, input.awayRegistrationId].filter(
    (id): id is string => id !== undefined && id !== null,
  );
  const requested = requestedRegistrationIds.length === 0
    ? []
    : await tx.v1TournamentRegistration.findMany({
        where: { id: { in: requestedRegistrationIds }, tournamentId: detail.tournamentId },
        select: { teamId: true },
      });
  const teamIds = [
    detail.teamMatch.hostTeamId,
    detail.teamMatch.approvedApplicantTeamId,
    ...requested.map((row) => row.teamId),
  ].filter((teamId): teamId is string => teamId !== null);
  const teamGameIds = await findUpcomingTeamGameIds(
    tx,
    [...new Set(teamIds)].map((teamId) => ({ competitionId: detail.tournamentId, teamId })),
  );
  return [ownGameId, ...teamGameIds];
}

/**
 * Updates the operational TeamMatch and bracket-only Details together. The
 * caller must have performed the admin/auth and official-result checks; this
 * helper owns the row-level mutation and the side/schedule consequences.
 *
 * 경기 행은 `scope` 로 한 번에 잠근 뒤에만 상세·팀 매치를 잡는다(Game → Details → TeamMatch).
 * 여러 대진을 한 트랜잭션에서 고치는 호출자는 전부의 `planTournamentMatchUpdateGames` 를 합쳐
 * 먼저 잠그고 같은 `scope` 를 넘긴다. 없으면 이 호출이 트랜잭션의 첫 경기 잠금이어야 한다.
 */
export async function updateTournamentMatchInTx(
  tx: Tx,
  input: TournamentMatchUpdateInput,
  scope?: GameLockScope,
): Promise<{
  id: string;
  tournamentId: string;
  groupId: string | null;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  parentTeamMatchId: string | null;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  startAt: Date | null;
  placeName: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  const lockScope = scope ?? (await lockGameScope(tx, await planTournamentMatchUpdateGames(tx, input)));
  // 경기 행은 위에서 잡았다. 여기서는 잠근 뒤의 값을 읽기만 한다.
  const gameRows = await tx.$queryRaw<Array<{ id: string; state: string; sourceType: string; currentOfficialRevisionId: string | null }>>`
    SELECT id, state::text AS state, source_type::text AS "sourceType",
           current_official_revision_id AS "currentOfficialRevisionId"
    FROM v1_games
    WHERE team_match_id = ${input.teamMatchId}
  `;
  if (gameRows.length === 1) requireLockedGames(lockScope, [gameRows[0].id]);
  await tx.$queryRaw`SELECT team_match_id FROM v1_tournament_match_details WHERE team_match_id = ${input.teamMatchId} FOR UPDATE`;
  const teamMatchRows = await tx.$queryRaw<Array<{ id: string; deletedAt: Date | null }>>`
    SELECT id, deleted_at AS "deletedAt"
    FROM v1_team_matches
    WHERE id = ${input.teamMatchId}
    FOR UPDATE
  `;
  if (teamMatchRows.length !== 1 || teamMatchRows[0].deletedAt !== null) {
    throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
  }

  const detail = await tx.v1TournamentMatchDetails.findUniqueOrThrow({
    where: { teamMatchId: input.teamMatchId },
    select: {
      teamMatchId: true,
      tournamentId: true,
      groupId: true,
      round: true,
      fixtureNumber: true,
      legNumber: true,
      parentTeamMatchId: true,
      homeRegistrationId: true,
      awayRegistrationId: true,
      teamMatch: {
        select: {
          id: true,
          title: true,
          hostTeamId: true,
          approvedApplicantTeamId: true,
          startAt: true,
          endAt: true,
          placeName: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          game: { select: { id: true, sides: { select: { id: true, sideKey: true, teamId: true } } } },
        },
      },
    },
  });
  const game = detail.teamMatch.game;
  if (gameRows.length !== 1 || game === null || gameRows[0].id !== game.id || gameRows[0].sourceType !== 'TEAM_MATCH') {
    throw new ConflictException({ code: 'TOURNAMENT_MATCH_GAME_MISSING', message: '대회 경기의 정본 게임을 찾을 수 없어요.' });
  }
  const officialRevision = gameRows[0].currentOfficialRevisionId === null
    ? null
    : await tx.v1GameResultRevision.findUnique({ where: { id: gameRows[0].currentOfficialRevisionId }, select: { state: true } });

  const nextHome = input.homeRegistrationId !== undefined ? input.homeRegistrationId : detail.homeRegistrationId;
  const nextAway = input.awayRegistrationId !== undefined ? input.awayRegistrationId : detail.awayRegistrationId;
  if (nextHome !== null && nextAway !== null && nextHome === nextAway) {
    throw new BadRequestException({ code: 'FIXTURE_SAME_TEAM', message: '같은 팀끼리 경기를 만들 수 없어요.' });
  }
  const registrationIds = [nextHome, nextAway].filter((id): id is string => id !== null);
  const registrations = await tx.v1TournamentRegistration.findMany({
    where: { id: { in: registrationIds }, tournamentId: detail.tournamentId, status: 'confirmed' },
    select: {
      id: true,
      teamId: true,
      team: { select: { name: true } },
    },
  });
  if (registrations.length !== registrationIds.length) throw new BadRequestException({ code: 'REGISTRATION_INVALID', message: '대진 등록이 해당 대회에 없거나 확정되지 않았어요.' });
  const registrationById = new Map(registrations.map((row) => [row.id, row]));
  const home = nextHome === null ? null : registrationById.get(nextHome)!;
  const away = nextAway === null ? null : registrationById.get(nextAway)!;
  const nextHomeTeamId = home?.teamId ?? null;
  const nextAwayTeamId = away?.teamId ?? null;
  const homeChanged = detail.teamMatch.hostTeamId !== nextHomeTeamId;
  const awayChanged = detail.teamMatch.approvedApplicantTeamId !== nextAwayTeamId;
  const teamsChanged = homeChanged || awayChanged;
  const nextStartAt = input.scheduledAt !== undefined ? input.scheduledAt : detail.teamMatch.startAt;
  const timeChanged = (detail.teamMatch.startAt?.getTime() ?? null) !== (nextStartAt?.getTime() ?? null);
  if (teamsChanged && (gameRows[0].state !== 'SCHEDULED' || officialRevision?.state === 'OFFICIAL')) {
    throw new ConflictException({
      code: 'FIXTURE_HAS_RESULT',
      message: '진행 중이거나 결과가 확정된 경기는 팀을 바꿀 수 없어요. 결과를 먼저 처리해 주세요.',
    });
  }
  const nextPlaceName = input.venue !== undefined ? input.venue.trim() || null : detail.teamMatch.placeName;
  const nextEndAt = nextStartAt === null
    ? null
    : detail.teamMatch.startAt !== null && detail.teamMatch.endAt !== null
      ? new Date(nextStartAt.getTime() + (detail.teamMatch.endAt.getTime() - detail.teamMatch.startAt.getTime()))
      : detail.teamMatch.endAt;

  await tx.v1TournamentMatchDetails.update({
    where: { teamMatchId: input.teamMatchId },
    data: { homeRegistrationId: nextHome, awayRegistrationId: nextAway },
  });
  const updated = await tx.v1TeamMatch.update({
    where: { id: input.teamMatchId },
    data: {
      hostTeamId: nextHomeTeamId,
      approvedApplicantTeamId: nextAwayTeamId,
      startAt: nextStartAt,
      endAt: nextEndAt,
      placeName: nextPlaceName,
    },
    select: {
      id: true,
      tournamentId: true,
      title: true,
      startAt: true,
      placeName: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const sideChanges = [
    { key: V1GameSideKey.HOME, oldTeamId: detail.teamMatch.hostTeamId, nextTeamId: nextHomeTeamId, name: home?.team.name ?? '홈 팀 미정', changed: homeChanged },
    { key: V1GameSideKey.AWAY, oldTeamId: detail.teamMatch.approvedApplicantTeamId, nextTeamId: nextAwayTeamId, name: away?.team.name ?? '어웨이 팀 미정', changed: awayChanged },
  ];
  for (const sideChange of sideChanges) {
    const side = game.sides.find((candidate) => candidate.sideKey === sideChange.key);
    if (side === undefined) throw new ConflictException({ code: 'TOURNAMENT_MATCH_GAME_SIDE_MISSING', message: '대회 경기의 게임 사이드를 찾을 수 없어요.' });
    if (sideChange.changed) {
      const newLineupId = await invalidateLineupAndTactics(tx, game.id, side.id);
      await tx.v1GameSide.update({ where: { id: side.id }, data: { teamId: sideChange.nextTeamId, displayNameSnapshot: sideChange.name } });
      // 새 팀의 참가 명단(조정·결장·출전정지 반영)으로 방금 만든 리비전 위에 명단을 채운다.
      // 시각이 지난 경기도 SCHEDULED 면 채워야 하므로 팀 단위가 아니라 이 사이드를 직접 맞춘다.
      if (newLineupId !== null && sideChange.nextTeamId !== null) {
        await syncGameSideRoster(tx, { gameId: game.id, sideId: side.id }, {}, lockScope);
      }
    }
    if (teamsChanged && sideChange.oldTeamId !== sideChange.nextTeamId) {
      if (sideChange.oldTeamId !== null) {
        await tx.v1TeamSchedule.updateMany({
          where: { teamMatchId: input.teamMatchId, teamId: sideChange.oldTeamId, state: 'SCHEDULED' },
          data: { state: 'CANCELLED', cancelReason: 'BRACKET_TEAM_CHANGED', version: { increment: 1 } },
        });
      }
    }
    if ((teamsChanged || timeChanged) && sideChange.nextTeamId !== null && nextStartAt !== null) {
      await upsertSchedule(tx, sideChange.nextTeamId, input.teamMatchId, updated.title, nextStartAt, nextEndAt);
    } else if ((teamsChanged || timeChanged) && nextStartAt === null && sideChange.nextTeamId !== null) {
      await tx.v1TeamSchedule.updateMany({
        where: { teamMatchId: input.teamMatchId, teamId: sideChange.nextTeamId, state: 'SCHEDULED' },
        data: { state: 'CANCELLED', cancelReason: 'BRACKET_SCHEDULE_REMOVED', version: { increment: 1 } },
      });
    }
  }
  if (teamsChanged) await tx.v1Game.update({ where: { id: game.id }, data: { version: { increment: 1 } } });
  // 팀 경기 순서(출전정지)와 경기 시각(결장 기간)이 바뀌었으니 관련 팀의 시작 전 경기를 다시 계산한다.
  if (teamsChanged || timeChanged) {
    await syncRostersForTeamMatchTeams(tx, {
      competitionId: detail.tournamentId,
      teamIds: [detail.teamMatch.hostTeamId, detail.teamMatch.approvedApplicantTeamId, nextHomeTeamId, nextAwayTeamId],
    }, lockScope);
  }

  return {
    id: updated.id,
    tournamentId: detail.tournamentId,
    groupId: detail.groupId,
    round: detail.round,
    fixtureNumber: detail.fixtureNumber,
    legNumber: detail.legNumber,
    parentTeamMatchId: detail.parentTeamMatchId,
    homeRegistrationId: nextHome,
    awayRegistrationId: nextAway,
    startAt: updated.startAt,
    placeName: updated.placeName,
    status: updated.status,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/** 새로 만든 대체 리비전의 id를 돌려준다 — 팀이 갓 배정된 것이면 호출자가 그 위에 참가자를 채운다. */
async function invalidateLineupAndTactics(tx: Tx, gameId: string, sideId: string): Promise<string | null> {
  const latest = await tx.v1GameLineup.findFirst({ where: { gameId, sideId }, orderBy: { revision: 'desc' }, select: { id: true, revision: true } });
  await tx.v1GameLineup.updateMany({ where: { gameId, sideId, invalidatedAt: null }, data: { invalidatedAt: new Date(), invalidationReason: 'SIDE_TEAM_CHANGED' } });
  let newLineupId: string | null = null;
  if (latest !== null) {
    const created = await tx.v1GameLineup.create({ data: { gameId, sideId, revision: latest.revision + 1, state: 'DRAFT', supersedesId: latest.id } });
    newLineupId = created.id;
  }
  await tx.v1TeamTacticsBoard.deleteMany({ where: { gameId, sideId } });
  return newLineupId;
}

async function upsertSchedule(
  tx: Tx,
  teamId: string,
  teamMatchId: string,
  title: string,
  startAt: Date,
  endAt: Date | null,
): Promise<void> {
  const schedule = await tx.v1TeamSchedule.findUnique({ where: { teamId_teamMatchId: { teamId, teamMatchId } }, select: { id: true } });
  const effectiveEndAt = endAt ?? new Date(startAt.getTime() + MATCH_SCHEDULE_DEFAULT_DURATION_MS);
  if (schedule === null) {
    await createTeamMatchScheduleInTx(tx, teamId, teamMatchId, title, startAt, endAt);
    return;
  }
  await tx.v1TeamSchedule.update({ where: { id: schedule.id }, data: { title, startAt, endAt: effectiveEndAt, state: 'SCHEDULED', cancelReason: null, version: { increment: 1 } } });
}
