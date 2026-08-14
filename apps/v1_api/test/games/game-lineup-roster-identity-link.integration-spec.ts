import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * `GamesService.saveLineup`가 로스터에 지정한 계정(`participants[].userId`)을
 * 신원 연결(identity link)로 자동 승격하는 경로 -- action `ROSTER_ASSERTED`,
 * `prisma/migrations/20260813120000_v1_roster_identity_link` -- 의 실행 검증.
 * 이 경로는 `GET /users/:id/records`가 항상 0건이던 문제(연결을 만드는 제품
 * 경로 부재)를 메우는 이번 작업의 핵심이지만, 도입 시점에는 어떤 통합 스펙에도
 * `ROSTER_ASSERTED`/`LINEUP_USER_NOT_TEAM_MEMBER`/`LINEUP_DUPLICATE_USER`가
 * 등장하지 않았다(코드 리딩으로는 트리거·unique 제약 통과 여부를 증명할 수
 * 없다). 이 스펙은 실제 Prisma 라운드트립으로 다섯 갈래를 확인한다:
 *
 *  1) 해피패스 -- 호스트 팀의 active 멤버 userId를 실어 저장하면 participant.
 *     userId가 채워지고, `V1ParticipantIdentityLinkEvent`(action=ROSTER_ASSERTED)
 *     + `V1ParticipantIdentityLinkCurrent`가 같은 트랜잭션에서 생긴다.
 *  2) self -- 매니저가 자기 자신의 userId를 라인업에 넣어도 성공한다(
 *     `v1_guard_identity_event` 트리거가 ATTESTED/EXPIRED에만 승인자≠본인을
 *     강제하므로 ROSTER_ASSERTED는 대상이 아니다 -- 이게 ROSTER_ASSERTED
 *     도입 이유다).
 *  3) 팀 멤버가 아닌 userId -- 422 LINEUP_USER_NOT_TEAM_MEMBER.
 *  4) 같은 요청 안 userId 중복 -- 422 LINEUP_DUPLICATE_USER.
 *  5) userId를 아예 안 보내면 게스트 그대로 -- participant.userId는 null이고
 *     링크 행이 전혀 생기지 않는다.
 *
 * 3)/4)는 futsal-v1(minPlayers=3)의 최소 인원 안에서 게스트 필러로 채워
 * LINEUP_SIZE_INVALID와 뒤섞이지 않게 한다.
 */

const ids = {
  platformOps: '6d000000-0000-4000-8000-000000000001',
  managerUser: '6d000000-0000-4000-8000-000000000002',
  memberUser: '6d000000-0000-4000-8000-000000000003',
  outsiderUser: '6d000000-0000-4000-8000-000000000004',
  sport: '6d000000-0000-4000-8000-000000000010',
  region: '6d000000-0000-4000-8000-000000000011',
  hostTeam: '6d000000-0000-4000-8000-000000000020',
  awayTeam: '6d000000-0000-4000-8000-000000000021',
  tournament: '6d000000-0000-4000-8000-000000000030',
  hostRegistration: '6d000000-0000-4000-8000-000000000040',
  awayRegistration: '6d000000-0000-4000-8000-000000000041',
  fixture: '6d000000-0000-4000-8000-000000000050',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('GamesService.saveLineup auto-links roster userIds via ROSTER_ASSERTED', () => {
  let pinnedMinPlayers: number;
  let gameId: string;
  let hostSideId: string;

  // 매 호출마다 필러 게스트(userId 없음)로 최소 인원을 채운다 -- 검증 대상
  // 참가자 외의 자리는 항상 게스트로 두어 사이즈 게이트와 무관하게 만든다.
  function guests(count: number, label: string) {
    return Array.from({ length: count }, (_, index) => ({
      displayNameSnapshot: `${label} guest ${index + 1}`,
      jerseyNumber: 50 + index,
      started: true,
    }));
  }

  async function currentVersion(): Promise<number> {
    return (await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } })).version;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('futsal-v1 competition config preset is required (run competition-config-backfill.cli.ts)');
    }
    pinnedMinPlayers = (config.lineup as { minPlayers: number }).minPlayers;

    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.managerUser, ids.memberUser, ids.outsiderUser].map((id, index) => ({
        id,
        email: `roster-link-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'Roster link futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'ROSTER_LINK_REGION', name: 'Roster link region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.managerUser, sportId: ids.sport, regionId: ids.region, name: 'Roster link host' },
        { id: ids.awayTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Roster link away' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        // managerUser는 호스트 팀 매니저이자 self 케이스의 그 선수 자신이다.
        { teamId: ids.hostTeam, userId: ids.managerUser, role: 'manager', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.memberUser, role: 'member', status: 'active' },
        // outsiderUser는 호스트 팀 멤버십이 전혀 없다 -- LINEUP_USER_NOT_TEAM_MEMBER 케이스.
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Roster link tournament' },
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        { id: ids.hostRegistration, tournamentId: ids.tournament, teamId: ids.hostTeam, appliedByUserId: ids.managerUser, status: 'confirmed' },
        { id: ids.awayRegistration, tournamentId: ids.tournament, teamId: ids.awayTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
      ],
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: config.id,
        // team_manager 액터 경로(self 케이스)가 resolveActor에서 자기 팀
        // 라인업 권한을 얻으려면 이 fixture의 homeRegistration이 hostTeam을
        // 가리켜야 한다.
        homeRegistrationId: ids.hostRegistration,
        awayRegistrationId: ids.awayRegistration,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Roster link host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Roster link away' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('roster-link-source', input)),
    );
    gameId = created.gameId;
    hostSideId = (
      await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('happy path: a team member userId in the roster creates ROSTER_ASSERTED event + current link', async () => {
    const before = await currentVersion();
    const saved = await games.saveLineup(authUser(ids.platformOps), gameId, hostSideId, 'idem-roster-link-happy', {
      expectedVersion: before,
      clientCommandId: 'idem-roster-link-happy',
      participants: [
        { displayNameSnapshot: 'Roster Link Member', jerseyNumber: 7, started: true, userId: ids.memberUser },
        ...guests(pinnedMinPlayers - 1, 'happy'),
      ],
    });
    expect(saved.version).toBe(before + 1);

    const participant = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { lineupId: saved.lineupId, displayNameSnapshot: 'Roster Link Member' },
    });
    expect(participant.userId).toBe(ids.memberUser);

    const linkEvent = await prisma.v1ParticipantIdentityLinkEvent.findFirstOrThrow({
      where: { participantId: participant.id },
    });
    expect(linkEvent).toEqual(
      expect.objectContaining({
        action: 'ROSTER_ASSERTED',
        userId: ids.memberUser,
        actorType: 'USER',
        actorUserId: ids.platformOps,
      }),
    );

    const currentLink = await prisma.v1ParticipantIdentityLinkCurrent.findUniqueOrThrow({
      where: { participantId: participant.id },
    });
    expect(currentLink.userId).toBe(ids.memberUser);
    expect(currentLink.linkId).toBe(linkEvent.linkId);
  });

  it('self case: the manager entering themselves as a player still succeeds (ROSTER_ASSERTED is exempt from the actor≠self guard)', async () => {
    const before = await currentVersion();
    const saved = await games.saveLineup(authUser(ids.managerUser), gameId, hostSideId, 'idem-roster-link-self', {
      expectedVersion: before,
      clientCommandId: 'idem-roster-link-self',
      participants: [
        { displayNameSnapshot: 'Roster Link Manager Self', jerseyNumber: 9, started: true, userId: ids.managerUser },
        ...guests(pinnedMinPlayers - 1, 'self'),
      ],
    });
    expect(saved.version).toBe(before + 1);

    const participant = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { lineupId: saved.lineupId, displayNameSnapshot: 'Roster Link Manager Self' },
    });
    expect(participant.userId).toBe(ids.managerUser);

    const linkEvent = await prisma.v1ParticipantIdentityLinkEvent.findFirstOrThrow({
      where: { participantId: participant.id },
    });
    // actorUserId === userId: the exact self-attesting shape that the old
    // ATTESTED/EXPIRED actor≠self trigger check would have rejected.
    expect(linkEvent.actorUserId).toBe(ids.managerUser);
    expect(linkEvent.userId).toBe(ids.managerUser);
    expect(linkEvent.action).toBe('ROSTER_ASSERTED');

    expect(
      await prisma.v1ParticipantIdentityLinkCurrent.findUnique({ where: { participantId: participant.id } }),
    ).toEqual(expect.objectContaining({ userId: ids.managerUser }));
  });

  it('rejects a userId that is not an active member of the side team (422 LINEUP_USER_NOT_TEAM_MEMBER)', async () => {
    const before = await currentVersion();
    const failure = await captureFailure(() =>
      games.saveLineup(authUser(ids.platformOps), gameId, hostSideId, 'idem-roster-link-not-member', {
        expectedVersion: before,
        clientCommandId: 'idem-roster-link-not-member',
        participants: [
          { displayNameSnapshot: 'Roster Link Outsider', jerseyNumber: 11, started: true, userId: ids.outsiderUser },
          ...guests(pinnedMinPlayers - 1, 'not-member'),
        ],
      }),
    );
    expectHttpCode(failure, 422, 'LINEUP_USER_NOT_TEAM_MEMBER');
    // No lineup revision, no link, no version bump from the rejected attempt.
    expect(await currentVersion()).toBe(before);
    expect(
      await prisma.v1ParticipantIdentityLinkEvent.findFirst({ where: { userId: ids.outsiderUser } }),
    ).toBeNull();
  });

  it('rejects the same userId appearing twice in one request (422 LINEUP_DUPLICATE_USER)', async () => {
    const before = await currentVersion();
    const failure = await captureFailure(() =>
      games.saveLineup(authUser(ids.platformOps), gameId, hostSideId, 'idem-roster-link-duplicate', {
        expectedVersion: before,
        clientCommandId: 'idem-roster-link-duplicate',
        participants: [
          { displayNameSnapshot: 'Roster Link Dup Starter', jerseyNumber: 1, started: true, userId: ids.memberUser },
          { displayNameSnapshot: 'Roster Link Dup Bench', jerseyNumber: 2, started: true, userId: ids.memberUser },
          ...guests(Math.max(pinnedMinPlayers - 2, 0), 'duplicate'),
        ],
      }),
    );
    expectHttpCode(failure, 422, 'LINEUP_DUPLICATE_USER');
    expect(await currentVersion()).toBe(before);
  });

  it('leaves a lineup with no userId entirely unlinked (guest stays a guest)', async () => {
    const before = await currentVersion();
    const saved = await games.saveLineup(authUser(ids.platformOps), gameId, hostSideId, 'idem-roster-link-guest', {
      expectedVersion: before,
      clientCommandId: 'idem-roster-link-guest',
      participants: [
        { displayNameSnapshot: 'Roster Link Pure Guest', jerseyNumber: 13, started: true },
        ...guests(pinnedMinPlayers - 1, 'pure-guest'),
      ],
    });
    expect(saved.version).toBe(before + 1);

    const participant = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { lineupId: saved.lineupId, displayNameSnapshot: 'Roster Link Pure Guest' },
    });
    expect(participant.userId).toBeNull();
    expect(
      await prisma.v1ParticipantIdentityLinkCurrent.findUnique({ where: { participantId: participant.id } }),
    ).toBeNull();
    expect(
      await prisma.v1ParticipantIdentityLinkEvent.findFirst({ where: { participantId: participant.id } }),
    ).toBeNull();
  });
});
