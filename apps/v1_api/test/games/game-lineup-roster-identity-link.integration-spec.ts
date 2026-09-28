import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * 대진 생성 시 참가 명단의 계정(`participants[].userId`)이 같은 트랜잭션에서 신원 연결
 * (action `ROSTER_ASSERTED`, reason `source_roster`)로 승격되는지 실제 Prisma 라운드트립으로 본다.
 * 코드 리딩으로는 트리거·unique 제약 통과 여부를 증명할 수 없다.
 *
 * 예전에는 `GamesService.saveLineup` 의 연결 갈래(팀 멤버 검증·중복 userId·게스트)도 여기서 쟀지만
 * Task 176 에서 그 저장 경로가 없어졌다 — 대회·리그 명단은 동기화가 만든다(`game-roster-sync`).
 */

const ids = {
  platformOps: '6d000000-0000-4000-8000-000000000001',
  managerUser: '6d000000-0000-4000-8000-000000000002',
  memberUser: '6d000000-0000-4000-8000-000000000003',
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

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

describe('대진 생성 참가 명단의 계정은 ROSTER_ASSERTED 로 연결된다', () => {
  let gameId: string;

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

    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.managerUser, ids.memberUser].map((id, index) => ({
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
        { teamId: ids.hostTeam, userId: ids.managerUser, role: 'manager', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.memberUser, role: 'member', status: 'active' },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Roster link tournament', competitionConfigVersionId: config.id },
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        { id: ids.hostRegistration, tournamentId: ids.tournament, teamId: ids.hostTeam, appliedByUserId: ids.managerUser, status: 'confirmed' },
        { id: ids.awayRegistration, tournamentId: ids.tournament, teamId: ids.awayTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        sportId: ids.sport,
        hostTeamId: ids.hostTeam,
        approvedApplicantTeamId: ids.awayTeam,
        title: 'Roster link match',
        status: 'matched',
        startAt: new Date(Date.now() - 60_000),
        competitionConfigVersionId: config.id,
      },
    });
    await prisma.v1TournamentMatchDetails.create({
      data: {
        teamMatchId: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        legNumber: 1,
        homeRegistrationId: ids.hostRegistration,
        awayRegistrationId: ids.awayRegistration,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Roster link host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Roster link away' },
      ],
      participants: [
        {
          sourceParticipantId: 'source-roster-member',
          userId: ids.memberUser,
          sideKey: V1GameSideKey.HOME,
          displayNameSnapshot: 'Source roster member',
          jerseyNumber: 6,
        },
      ],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('roster-link-source', input)),
    );
    gameId = created.gameId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('source creation links a roster user in the same transaction', async () => {
    const participant = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { gameId, displayNameSnapshot: 'Source roster member' },
    });
    expect(participant.userId).toBe(ids.memberUser);

    const event = await prisma.v1ParticipantIdentityLinkEvent.findFirstOrThrow({
      where: { participantId: participant.id },
    });
    expect(event).toEqual(
      expect.objectContaining({
        action: 'ROSTER_ASSERTED',
        userId: ids.memberUser,
        actorType: 'USER',
        actorUserId: ids.platformOps,
        reason: 'source_roster',
      }),
    );
    expect(
      await prisma.v1ParticipantIdentityLinkCurrent.findUnique({
        where: { participantId: participant.id },
      }),
    ).toEqual(expect.objectContaining({ userId: ids.memberUser, linkId: event.linkId }));
  });
});
