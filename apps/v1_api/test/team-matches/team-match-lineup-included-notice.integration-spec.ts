import { randomUUID } from 'node:crypto';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameSourceCreationInput } from '../../src/games/games.types';
import { LineupReminderService } from '../../src/jobs/lineup-reminders/lineup-reminder.service';
import type { GameOperationClaim } from '../../src/jobs/v1-game-operations-worker.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { LINEUP_INCLUDED_NOTIFICATION_TYPE, TeamMatchLineupService } from '../../src/team-matches/team-match-lineup.service';

/**
 * Task 180 H1-lineup-included — 친선 참석명단 제출이 같은 트랜잭션에 outbox 행을 남기고, 워커 핸들러가 그 리비전의
 * 선수에게 '참석명단에 올랐어요'를 쓰는지. 다시 제출하면 새로 오른 사람만 받고, 빠진 사람에게는 가지 않는다.
 */
const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const lineups = new TeamMatchLineupService(prisma, new OperationAuditWriterService());
const reminders = new LineupReminderService({} as never, prisma);

const ids = {
  owner: randomUUID(),
  opponentOwner: randomUUID(),
  p1: randomUUID(),
  p2: randomUUID(),
  p3: randomUUID(),
  region: randomUUID(),
  hostTeam: randomUUID(),
  opponentTeam: randomUUID(),
  teamMatch: randomUUID(),
};
const authUser = (id: string) => ({ id, email: `${id}@example.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });

async function submit(participants: string[], key: string) {
  const { version } = await lineups.getLineup(authUser(ids.owner), ids.teamMatch);
  const saved = await lineups.saveLineup(authUser(ids.owner), ids.teamMatch, `${key}-save`, {
    expectedVersion: version,
    participants: participants.map((userId, index) => ({ userId, jerseyNumber: index + 1, goalkeeper: index === 0 })),
  });
  const submitted = await lineups.submitLineup(authUser(ids.owner), ids.teamMatch, `${key}-submit`, { expectedVersion: saved.version });
  const outbox = await prisma.v1OutboxEvent.findUniqueOrThrow({ where: { businessKey: `team-match-lineup-included:${submitted.lineupId}` } });
  expect(outbox).toMatchObject({ type: LINEUP_INCLUDED_NOTIFICATION_TYPE, payload: { lineupId: submitted.lineupId } });
  const claim: GameOperationClaim = { ...outbox, leaseOwner: 'spec', leaseUntil: new Date(), afterCommit: [] };
  await prisma.$transaction((tx) => reminders.lineupIncludedHandler(claim, tx));
}

const recipients = async () =>
  (await prisma.v1Notification.findMany({ where: { targetId: ids.teamMatch, title: '참석명단에 올랐어요' }, select: { recipientUserId: true } }))
    .map((row) => row.recipientUserId)
    .sort();

describe('Task 180 H1 — 참석명단 포함 알림(제출 → outbox → 워커 핸들러)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for lineup-included notice integration verification');
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({ where: { name: 'futsal-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    if (config === null) throw new Error('futsal-v1 competition config preset is required (run competition-config-backfill.cli.ts)');

    const people = [ids.owner, ids.opponentOwner, ids.p1, ids.p2, ids.p3];
    await prisma.v1User.createMany({ data: people.map((id) => ({ id, email: `${id}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' })) });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: 'H1 futsal' }, select: { id: true } });
    await prisma.v1Region.create({ data: { id: ids.region, code: `H1_LINEUP_NOTICE_${ids.region.slice(0, 8)}`, name: 'H1 region', level: 1 } });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.owner, sportId: sport.id, regionId: ids.region, name: '성수 FC' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentOwner, sportId: sport.id, regionId: ids.region, name: '망원 FC' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.owner, role: 'owner', status: 'active' },
        ...[ids.p1, ids.p2, ids.p3].map((userId) => ({ teamId: ids.hostTeam, userId, role: 'member' as const, status: 'active' as const })),
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.owner,
        sportId: sport.id,
        regionId: ids.region,
        title: 'H1 참석명단 알림 경기',
        placeName: '망원 풋살장',
        startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000),
        status: 'matched',
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: config.id,
      },
    });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: '성수 FC' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: '망원 FC' },
      ],
      participants: [],
    };
    await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, {
        actor: { actorType: 'USER', actorUserId: ids.owner, role: 'team_owner' },
        expectedVersion: 0,
        durableCommandId: `h1-lineup-notice-${ids.teamMatch}`,
        payloadHash: canonicalGameCommandPayloadHash(input),
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('제출한 명단의 선수만 받고, 다시 제출하면 새로 오른 사람만 받는다 — 빠진 사람·팀장(명단 밖)은 받지 않는다', async () => {
    await submit([ids.p1, ids.p2], 'h1-first');
    expect(await recipients()).toEqual([ids.p1, ids.p2].sort());

    await submit([ids.p1, ids.p3], 'h1-second');
    expect(await recipients()).toEqual([ids.p1, ids.p2, ids.p3].sort());
    const body = await prisma.v1Notification.findFirstOrThrow({ where: { targetId: ids.teamMatch, recipientUserId: ids.p3 }, select: { body: true, deepLink: true } });
    expect(body).toMatchObject({ deepLink: `/team-matches/${ids.teamMatch}` });
    expect(body.body).toMatch(/^"성수 FC" · vs 망원 FC · .+ · 망원 풋살장$/);
  });
});
