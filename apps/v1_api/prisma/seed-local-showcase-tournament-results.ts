import {
  Prisma,
  PrismaClient,
  V1GameSourceType,
  V1IdentityActorType,
  V1VisibilityMode,
} from '@prisma/client';

const LOCAL_SHOWCASE_DATABASE = 'teameet_alpha';
const LOCAL_SHOWCASE_HOST = 'v1_postgres';
const SHOWCASE_TOURNAMENT_ID = 'ab100000-0000-4000-8000-000000000001';

function assertLocalShowcaseDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (parsed.hostname !== LOCAL_SHOWCASE_HOST || databaseName !== LOCAL_SHOWCASE_DATABASE) {
    throw new Error(`Refusing local showcase result seed for ${parsed.hostname}/${databaseName || '(missing)'}.`);
  }
}

function resultFor(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return 'WON';
  if (goalsFor < goalsAgainst) return 'LOST';
  return 'DRAWN';
}

async function seedFixtureResult(
  tx: Prisma.TransactionClient,
  fixture: {
    id: string;
    tournamentId: string;
    scheduledAt: Date | null;
    competitionConfigVersionId: string | null;
    result: { homeScore: number; awayScore: number; recordedAt: Date };
    homeRegistration: {
      teamId: string;
      appliedByUserId: string;
      team: { name: string };
      players: readonly { userId: string; realName: string }[];
    } | null;
    awayRegistration: {
      teamId: string;
      appliedByUserId: string;
      team: { name: string };
      players: readonly { userId: string; realName: string }[];
    } | null;
    game: {
      id: string;
      currentOfficialRevisionId: string | null;
      sides: readonly { id: string; sideKey: string; teamId: string | null }[];
      participants: readonly { id: string; sideId: string; userId: string | null }[];
    } | null;
  },
) {
  if (!fixture.homeRegistration || !fixture.awayRegistration || !fixture.scheduledAt || !fixture.competitionConfigVersionId) {
    throw new Error(`Showcase fixture ${fixture.id} is missing registrations, schedule, or competition config.`);
  }
  let game = fixture.game;
  if (!game) {
    const createdGame = await tx.v1Game.create({
      data: {
        sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
        tournamentFixtureId: fixture.id,
        competitionConfigVersionId: fixture.competitionConfigVersionId,
      },
    });
    const sides = [];
    const participants = [];
    for (const [sideKey, registration] of [
      ['HOME', fixture.homeRegistration],
      ['AWAY', fixture.awayRegistration],
    ] as const) {
      const side = await tx.v1GameSide.create({
        data: {
          gameId: createdGame.id,
          sideKey,
          teamId: registration.teamId,
          displayNameSnapshot: registration.team.name,
        },
      });
      const lineup = await tx.v1GameLineup.create({
        data: { gameId: createdGame.id, sideId: side.id, revision: 1 },
      });
      sides.push({ id: side.id, sideKey, teamId: registration.teamId });
      for (let playerIndex = 0; playerIndex < registration.players.length; playerIndex += 1) {
        const player = registration.players[playerIndex];
        const participant = await tx.v1GameParticipant.create({
          data: {
            gameId: createdGame.id,
            sideId: side.id,
            lineupId: lineup.id,
            userId: player.userId,
            displayNameSnapshot: player.realName,
            jerseyNumber: 7 + playerIndex,
            started: true,
          },
        });
        participants.push({
          id: participant.id,
          sideId: side.id,
          userId: player.userId,
        });
      }
    }
    await tx.v1GamePeriod.createMany({
      data: [
        { gameId: createdGame.id, number: 1 },
        { gameId: createdGame.id, number: 2 },
      ],
    });
    await tx.v1GameVisibilityPolicy.create({
      data: { gameId: createdGame.id, mode: V1VisibilityMode.OFFICIAL_ONLY },
    });
    game = {
      id: createdGame.id,
      currentOfficialRevisionId: null,
      sides,
      participants,
    };
  }
  // 완료된 쇼케이스 대회도 LIVE로 두면 공개 라이브 플래그가 꺼진 로컬/Alpha에서
  // STATUS_ONLY로 강등되어 팀 전적 스코어가 가려진다. 공식 결과가 있는 시드 소유
  // 게임은 재실행 시에도 OFFICIAL_ONLY로 복구해 전체/대회 탭이 실제 점수를 보여준다.
  await tx.v1GameVisibilityPolicy.upsert({
    where: { gameId: game.id },
    update: { mode: V1VisibilityMode.OFFICIAL_ONLY },
    create: { gameId: game.id, mode: V1VisibilityMode.OFFICIAL_ONLY },
  });
  if (game.currentOfficialRevisionId) return 'preserved' as const;

  const homeSide = game.sides.find((side) => side.sideKey === 'HOME');
  const awaySide = game.sides.find((side) => side.sideKey === 'AWAY');
  if (!homeSide || !awaySide) throw new Error(`Showcase fixture ${fixture.id} is missing a game side.`);
  const homeParticipant = game.participants.find((participant) => participant.sideId === homeSide.id);
  const awayParticipant = game.participants.find((participant) => participant.sideId === awaySide.id);
  if (!homeParticipant?.userId || !awayParticipant?.userId) {
    throw new Error(`Showcase fixture ${fixture.id} is missing linked roster participants.`);
  }
  const homeUserId = homeParticipant.userId;
  const awayUserId = awayParticipant.userId;

  const { homeScore, awayScore, recordedAt } = fixture.result;
  const score = { home: homeScore, away: awayScore };
  const eventsHash = `local-showcase-tournament:${fixture.id}:${homeScore}-${awayScore}`;
  const scorers = [
    { side: homeSide, participant: homeParticipant, userId: homeUserId, goals: homeScore },
    { side: awaySide, participant: awayParticipant, userId: awayUserId, goals: awayScore },
  ] as const;
  const goalEvents: {
    id: string;
    sideId: string;
    participantId: string;
    minute: number;
    period: number;
    ownGoal: false;
  }[] = [];
  let sequence = 0;
  for (const scorer of scorers) {
    for (let index = 0; index < scorer.goals; index += 1) {
      sequence += 1;
      goalEvents.push({
        id: `local-showcase-goal:${fixture.id}:${sequence}`,
        sideId: scorer.side.id,
        participantId: scorer.participant.id,
        minute: 4 + sequence * 3,
        period: sequence <= Math.ceil((homeScore + awayScore) / 2) ? 1 : 2,
        ownGoal: false,
      });
    }
  }

  const revision = await tx.v1GameResultRevision.create({
    data: {
      gameId: game.id,
      revision: 1,
      state: 'DRAFT',
      score,
      goalEvents,
      eventsHash,
      createdByActorType: V1IdentityActorType.SYSTEM,
      createdBySystemActor: 'LOCAL_SHOWCASE_RESULT_SEED',
    },
  });

  for (const scorer of scorers) {
    await tx.v1GameResultParticipant.create({
      data: {
        resultRevisionId: revision.id,
        participantId: scorer.participant.id,
        sideId: scorer.side.id,
        started: true,
        minutesPlayed: 40,
        goals: scorer.goals,
        assists: 0,
        cards: { yellow: 0, red: 0 },
      },
    });
    await tx.v1ParticipantIdentityLinkCurrent.upsert({
      where: { participantId: scorer.participant.id },
      update: {},
      create: {
        participantId: scorer.participant.id,
        linkId: `local-showcase-link-${scorer.participant.id}`,
        userId: scorer.userId,
        version: 1,
        effectiveFrom: recordedAt,
      },
    });
  }

  for (let index = 0; index < goalEvents.length; index += 1) {
    const goal = goalEvents[index];
    const actorUserId = goal.sideId === homeSide.id ? homeParticipant.userId : awayParticipant.userId;
    await tx.v1GameEvent.create({
      data: {
        gameId: game.id,
        sequence: index + 1,
        clientEventId: goal.id,
        payloadHash: `${goal.id}:hash`,
        type: 'GOAL',
        sideId: goal.sideId,
        participantId: goal.participantId,
        period: goal.period,
        clockMs: goal.minute * 60_000,
        occurredAt: recordedAt,
        actorUserId,
        payload: { seeded: true, source: 'local_showcase_tournament' },
      },
    });
  }

  await tx.v1GameResultRevision.update({
    where: { id: revision.id },
    data: { state: 'OFFICIAL', submittedAt: recordedAt, officialAt: recordedAt },
  });
  await tx.v1Game.update({
    where: { id: game.id },
    data: {
      currentOfficialRevisionId: revision.id,
      lastSequence: goalEvents.length,
      state: 'ENDED',
    },
  });
  await tx.v1GameOfficialFact.create({
    data: {
      revisionId: revision.id,
      gameId: game.id,
      revision: 1,
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      tournamentId: fixture.tournamentId,
      homeTeamId: fixture.homeRegistration.teamId,
      awayTeamId: fixture.awayRegistration.teamId,
      homeScore,
      awayScore,
      score,
      eventsHash,
      officialAt: recordedAt,
    },
  });
  await tx.v1TeamRecordFact.createMany({
    data: [
      {
        revisionId: revision.id,
        gameId: game.id,
        teamId: fixture.homeRegistration.teamId,
        opponentTeamId: fixture.awayRegistration.teamId,
        tournamentId: fixture.tournamentId,
        result: resultFor(homeScore, awayScore),
        goalsFor: homeScore,
        goalsAgainst: awayScore,
        sourceHash: `${eventsHash}:home`,
        playedAt: fixture.scheduledAt,
        officialAt: recordedAt,
      },
      {
        revisionId: revision.id,
        gameId: game.id,
        teamId: fixture.awayRegistration.teamId,
        opponentTeamId: fixture.homeRegistration.teamId,
        tournamentId: fixture.tournamentId,
        result: resultFor(awayScore, homeScore),
        goalsFor: awayScore,
        goalsAgainst: homeScore,
        sourceHash: `${eventsHash}:away`,
        playedAt: fixture.scheduledAt,
        officialAt: recordedAt,
      },
    ],
    skipDuplicates: true,
  });
  return 'created' as const;
}

async function main() {
  assertLocalShowcaseDatabase(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    const fixtures = await prisma.v1TournamentFixture.findMany({
      where: {
        tournamentId: SHOWCASE_TOURNAMENT_ID,
        status: 'completed',
        result: { isNot: null },
      },
      orderBy: [{ scheduledAt: 'asc' }, { fixtureNumber: 'asc' }],
      select: {
        id: true,
        tournamentId: true,
        scheduledAt: true,
        competitionConfigVersionId: true,
        result: { select: { homeScore: true, awayScore: true, recordedAt: true } },
        homeRegistration: {
          select: {
            teamId: true,
            appliedByUserId: true,
            team: { select: { name: true } },
            players: {
              where: { removedAt: null },
              orderBy: { addedAt: 'asc' },
              select: { userId: true, realName: true },
            },
          },
        },
        awayRegistration: {
          select: {
            teamId: true,
            appliedByUserId: true,
            team: { select: { name: true } },
            players: {
              where: { removedAt: null },
              orderBy: { addedAt: 'asc' },
              select: { userId: true, realName: true },
            },
          },
        },
        game: {
          select: {
            id: true,
            currentOfficialRevisionId: true,
            sides: { select: { id: true, sideKey: true, teamId: true } },
            participants: { select: { id: true, sideId: true, userId: true } },
          },
        },
      },
    });
    if (fixtures.length !== 7) {
      throw new Error(`Expected 7 completed showcase fixtures, found ${fixtures.length}.`);
    }

    let created = 0;
    let preserved = 0;
    for (const fixture of fixtures) {
      const result = fixture.result;
      if (!result) throw new Error(`Showcase fixture ${fixture.id} has no result.`);
      const outcome = await prisma.$transaction((tx) => seedFixtureResult(tx, { ...fixture, result }));
      if (outcome === 'created') created += 1;
      else preserved += 1;
    }
    process.stdout.write(JSON.stringify({ status: 'ok', fixtures: fixtures.length, created, preserved }) + '\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
