import {
  Prisma,
  V1GameSideKey,
  V1GameSourceType,
  V1GameState,
  V1TeamMatchStatus,
  type V1FixtureAdvancementOutcome,
  type V1FixtureTargetSide,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { GameActorScope, GameCreationResult, GameParticipantCreationInput } from '../games/games.types';
import { GamesService } from '../games/games.service';
import { createTeamMatchScheduleInTx } from '../team-schedules/team-match-schedule';

export type TournamentMatchCreationTeam = {
  id: string | null;
  name: string;
  participants?: readonly GameParticipantCreationInput[];
};

export type TournamentMatchCreationInput = {
  id?: string;
  tournamentId: string;
  groupId: string | null;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  parentTeamMatchId: string | null;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  sportId: string;
  regionId: string | null;
  title: string;
  placeName: string | null;
  startAt: Date | null;
  endAt?: Date | null;
  fieldId?: string | null;
  status?: V1TeamMatchStatus;
  createdByUserId: string | null;
  competitionConfigVersionId: string;
  home: TournamentMatchCreationTeam;
  away: TournamentMatchCreationTeam;
  actor: GameActorScope;
  durableCommandId: string;
  payloadHash: string;
};

export type TournamentMatchCreationResult = {
  teamMatchId: string;
  detailsId: string;
  game: GameCreationResult;
  schedulesCreated: number;
};

export type TournamentMatchAdvancementInput = {
  tournamentId: string;
  sourceTeamMatchId: string;
  sourceOutcome: V1FixtureAdvancementOutcome;
  targetTeamMatchId: string;
  targetSide: V1FixtureTargetSide;
  createdAt?: Date;
};

function assertDistinctTeams(home: TournamentMatchCreationTeam, away: TournamentMatchCreationTeam): void {
  if (home.id !== null && away.id !== null && home.id === away.id) {
    throw new UnprocessableEntityException({ code: 'FIXTURE_SAME_TEAM', message: '같은 팀끼리 경기를 만들 수 없어요.' });
  }
}

function actorStorageId(actor: GameActorScope): string {
  return actor.actorType === 'USER' ? actor.actorUserId : `SYSTEM:${actor.systemActor}`;
}

function deterministicTeamMatchId(input: TournamentMatchCreationInput, actorId: string): string {
  const digest = createHash('sha256').update(`tournament-match:${actorId}:${input.durableCommandId}`).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${digest.slice(18, 20)}-${digest.slice(20, 32)}`;
}

function assertLegalInitialStatus(status: V1TeamMatchStatus | undefined): void {
  if (status !== undefined && status !== V1TeamMatchStatus.matched) {
    throw new UnprocessableEntityException({ code: 'TEAM_MATCH_INITIAL_STATUS_INVALID', message: '대회 팀 매치는 matched 상태로만 생성할 수 있어요.' });
  }
}

function assertNoParticipantsOnTbd(input: TournamentMatchCreationInput): void {
  if (input.home.id === null && (input.home.participants?.length ?? 0) > 0) {
    throw new UnprocessableEntityException({ code: 'HOME_PARTICIPANTS_WITHOUT_TEAM', message: '홈 팀이 미정이면 참가자를 만들 수 없어요.' });
  }
  if (input.away.id === null && (input.away.participants?.length ?? 0) > 0) {
    throw new UnprocessableEntityException({ code: 'AWAY_PARTICIPANTS_WITHOUT_TEAM', message: '어웨이 팀이 미정이면 참가자를 만들 수 없어요.' });
  }
}

function isStoredGameReplay(value: unknown, existingGame: { id: string; sourceType: V1GameSourceType; competitionConfigVersionId: string }, sourceId: string): value is GameCreationResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const game = value as Partial<GameCreationResult>;
  return game.gameId === existingGame.id && game.sourceType === existingGame.sourceType && game.sourceId === sourceId && game.competitionConfigVersionId === existingGame.competitionConfigVersionId && typeof game.state === 'string' && Object.values(V1GameState).includes(game.state as V1GameState) && Number.isSafeInteger(game.version) && (game.version as number) >= 0;
}

async function assertParticipantRoster(tx: Prisma.TransactionClient, input: TournamentMatchCreationInput): Promise<void> {
  const entries = [
    { registrationId: input.homeRegistrationId, team: input.home, sideKey: V1GameSideKey.HOME },
    { registrationId: input.awayRegistrationId, team: input.away, sideKey: V1GameSideKey.AWAY },
  ];
  const participants = entries.flatMap(({ team, sideKey }) => (team.participants ?? []).map((participant) => ({ participant, sideKey })));
  if (participants.length === 0) return;
  const playerIds = participants.map(({ participant }) => participant.sourceParticipantId);
  const players = await tx.v1TournamentPlayer.findMany({ where: { id: { in: playerIds } }, select: { id: true, registrationId: true, userId: true, removedAt: true } });
  const playerById = new Map(players.map((player) => [player.id, player]));
  for (const { participant, sideKey } of participants) {
    const player = playerById.get(participant.sourceParticipantId);
    const expectedRegistrationId = sideKey === V1GameSideKey.HOME ? input.homeRegistrationId : input.awayRegistrationId;
    if (player === undefined || player.removedAt !== null || player.registrationId !== expectedRegistrationId || participant.sideKey !== sideKey || participant.userId !== player.userId) {
      throw new UnprocessableEntityException({ code: 'PARTICIPANT_ROSTER_INVALID', message: '대회 경기 참가자는 해당 확정 등록의 활성 명단과 일치해야 해요.' });
    }
  }
}

async function assertTournamentReferences(tx: Prisma.TransactionClient, input: TournamentMatchCreationInput): Promise<void> {
  if (input.homeRegistrationId !== null && input.homeRegistrationId === input.awayRegistrationId) {
    throw new UnprocessableEntityException({ code: 'FIXTURE_SAME_REGISTRATION', message: '같은 등록 팀끼리 경기를 만들 수 없어요.' });
  }
  for (const side of [
    { registrationId: input.homeRegistrationId, teamId: input.home.id },
    { registrationId: input.awayRegistrationId, teamId: input.away.id },
  ]) {
    if ((side.registrationId === null) !== (side.teamId === null)) {
      throw new UnprocessableEntityException({ code: 'REGISTRATION_TEAM_PAIR_INVALID', message: '확정 등록과 경기 팀은 함께 정해져야 해요.' });
    }
  }
  if (input.groupId !== null) {
    const group = await tx.v1TournamentGroup.findFirst({ where: { id: input.groupId, tournamentId: input.tournamentId }, select: { id: true } });
    if (group === null) throw new UnprocessableEntityException({ code: 'GROUP_NOT_FOUND', message: '해당 대회의 조를 찾을 수 없어요.' });
  }
  const registrationIds = [input.homeRegistrationId, input.awayRegistrationId].filter((id): id is string => id !== null);
  if (registrationIds.length > 0) {
    const registrations = await tx.v1TournamentRegistration.findMany({ where: { id: { in: registrationIds }, tournamentId: input.tournamentId, status: 'confirmed' }, select: { id: true, teamId: true } });
    if (registrations.length !== registrationIds.length) throw new UnprocessableEntityException({ code: 'REGISTRATION_INVALID', message: '대진 등록이 해당 대회에 없거나 확정되지 않았어요.' });
    const registrationById = new Map(registrations.map((registration) => [registration.id, registration.teamId]));
    const pairs = [
      { registrationId: input.homeRegistrationId, teamId: input.home.id },
      { registrationId: input.awayRegistrationId, teamId: input.away.id },
    ];
    for (const pair of pairs) {
      if (pair.registrationId !== null && pair.teamId !== null && registrationById.get(pair.registrationId) !== pair.teamId) {
        throw new UnprocessableEntityException({ code: 'REGISTRATION_TEAM_MISMATCH', message: '대진 등록 팀과 경기 팀이 일치하지 않아요.' });
      }
    }
  }
  if (input.parentTeamMatchId !== null) {
    const parent = await tx.v1TournamentMatchDetails.findFirst({ where: { teamMatchId: input.parentTeamMatchId, tournamentId: input.tournamentId }, select: { teamMatchId: true } });
    if (parent === null) throw new UnprocessableEntityException({ code: 'PARENT_MATCH_NOT_FOUND', message: '상위 대진을 찾을 수 없어요.' });
  }
}

/** Creates one tournament-owned TeamMatch, bracket Details row, and exactly one TEAM_MATCH game. */
export async function createTournamentMatchInTx(
  tx: Prisma.TransactionClient,
  games: GamesService,
  input: TournamentMatchCreationInput,
): Promise<TournamentMatchCreationResult> {
  assertDistinctTeams(input.home, input.away);
  assertLegalInitialStatus(input.status);
  assertNoParticipantsOnTbd(input);
  if (!/^[a-f0-9]{64}$/i.test(input.payloadHash)) {
    throw new UnprocessableEntityException({ code: 'EVENT_INVALID', message: 'Payload hash must be a SHA-256 hex digest' });
  }
  const payloadHash = input.payloadHash.toLowerCase();

  const actorUserId = actorStorageId(input.actor);
  const teamMatchId = input.id ?? deterministicTeamMatchId(input, actorUserId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tournament-match-create:${actorUserId}:${input.durableCommandId}`}, 0))`;
  const existingCommand = await tx.v1IdempotencyRecord.findFirst({
    where: {
      actorUserId,
      action: 'source_create',
      resourceType: V1GameSourceType.TEAM_MATCH,
      idempotencyKey: input.durableCommandId,
    },
    select: { resourceId: true, payloadHash: true, responseBody: true },
  });
  if (existingCommand !== null) {
    if (existingCommand.resourceId !== teamMatchId) {
      throw new ConflictException({ code: 'TEAM_MATCH_IDEMPOTENCY_RESOURCE_CONFLICT', message: '같은 대진 생성 키가 다른 대진에 이미 사용됐어요.' });
    }
    if (existingCommand.payloadHash.toLowerCase() !== payloadHash) {
      throw new ConflictException({ code: 'COMMAND_IDEMPOTENCY_PAYLOAD_REUSE', message: '같은 대진 생성 키를 다른 내용으로 다시 사용할 수 없어요.' });
    }
    const existing = await tx.v1TeamMatch.findUnique({ where: { id: existingCommand.resourceId }, select: { id: true, tournamentId: true, competitionConfigVersionId: true, tournamentDetails: { select: { teamMatchId: true, tournamentId: true } }, game: { select: { id: true, sourceType: true, teamMatchId: true, competitionConfigVersionId: true, state: true, version: true } } } });
    if (existing === null || existing.tournamentDetails === null || existing.tournamentDetails.tournamentId !== input.tournamentId || existing.tournamentId !== input.tournamentId || (input.id !== undefined && existing.id !== input.id) || existing.tournamentDetails.teamMatchId !== existing.id || existing.game === null || existing.game.sourceType !== V1GameSourceType.TEAM_MATCH || existing.game.teamMatchId !== existing.id || existing.competitionConfigVersionId !== input.competitionConfigVersionId || existing.game.competitionConfigVersionId !== existing.competitionConfigVersionId) {
      throw new ConflictException({ code: 'TEAM_MATCH_IDEMPOTENCY_INCOMPLETE', message: '기존 대진 생성 기록이 완전하지 않아 다시 만들 수 없어요.' });
    }
    const schedulesCreated = await tx.v1TeamSchedule.count({ where: { teamMatchId: existing.id } });
    const storedGame = existingCommand.responseBody;
    if (!isStoredGameReplay(storedGame, existing.game, existing.id)) {
      throw new ConflictException({ code: 'TEAM_MATCH_IDEMPOTENCY_INCOMPLETE', message: '기존 대진 생성 기록이 완전하지 않아 다시 만들 수 없어요.' });
    }
    return {
      teamMatchId: existing.id,
      detailsId: existing.tournamentDetails.teamMatchId,
      game: storedGame as GameCreationResult,
      schedulesCreated,
    };
  }
  await assertTournamentReferences(tx, input);
  await assertParticipantRoster(tx, input);
  const conflictingMatch = await tx.v1TeamMatch.findUnique({ where: { id: teamMatchId }, select: { id: true } });
  if (conflictingMatch !== null) {
    throw new ConflictException({ code: 'TEAM_MATCH_ID_COLLISION', message: '같은 대진 ID가 이미 다른 생성 요청에 사용됐어요.' });
  }
  const teamMatch = await tx.v1TeamMatch.create({
    data: {
      id: teamMatchId,
      tournamentId: input.tournamentId,
      fieldId: input.fieldId ?? null,
      hostTeamId: input.home.id,
      approvedApplicantTeamId: input.away.id,
      createdByUserId: input.createdByUserId,
      sportId: input.sportId,
      regionId: input.regionId,
      title: input.title,
      placeName: input.placeName,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      status: input.status ?? V1TeamMatchStatus.matched,
      competitionConfigVersionId: input.competitionConfigVersionId,
    },
    select: { id: true },
  });

  const details = await tx.v1TournamentMatchDetails.create({
    data: {
      teamMatchId: teamMatch.id,
      tournamentId: input.tournamentId,
      groupId: input.groupId,
      round: input.round,
      fixtureNumber: input.fixtureNumber,
      legNumber: input.legNumber,
      parentTeamMatchId: input.parentTeamMatchId,
      homeRegistrationId: input.homeRegistrationId,
      awayRegistrationId: input.awayRegistrationId,
    },
    select: { teamMatchId: true },
  });

  const game = await games.createFromSourceInTransaction(
    tx,
    {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatch.id,
      competitionConfigVersionId: input.competitionConfigVersionId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: input.home.id, displayNameSnapshot: input.home.name },
        { sideKey: V1GameSideKey.AWAY, teamId: input.away.id, displayNameSnapshot: input.away.name },
      ],
      participants: [...(input.home.participants ?? []), ...(input.away.participants ?? [])],
    },
    {
      actor: input.actor,
      expectedVersion: 0,
      durableCommandId: input.durableCommandId,
      payloadHash,
    },
  );

  let schedulesCreated = 0;
  if (input.home.id !== null && input.startAt !== null) {
    await createTeamMatchScheduleInTx(tx, input.home.id, teamMatch.id, input.title, input.startAt, input.endAt ?? null);
    schedulesCreated = 1;
  }
  if (input.away.id !== null && input.startAt !== null) {
    await createTeamMatchScheduleInTx(tx, input.away.id, teamMatch.id, input.title, input.startAt, input.endAt ?? null);
    schedulesCreated += 1;
  }

  return { teamMatchId: teamMatch.id, detailsId: details.teamMatchId, game, schedulesCreated };
}

/** Copies bracket advancement topology after all source/target Details rows exist. */
export async function createTournamentMatchAdvancementEdgeInTx(
  tx: Prisma.TransactionClient,
  input: TournamentMatchAdvancementInput,
): Promise<string> {
  const edge = await tx.v1TournamentMatchAdvancementEdge.create({
    data: {
      tournamentId: input.tournamentId,
      sourceTeamMatchId: input.sourceTeamMatchId,
      sourceOutcome: input.sourceOutcome,
      targetTeamMatchId: input.targetTeamMatchId,
      targetSide: input.targetSide,
      createdAt: input.createdAt,
    },
    select: { id: true },
  });
  return edge.id;
}
