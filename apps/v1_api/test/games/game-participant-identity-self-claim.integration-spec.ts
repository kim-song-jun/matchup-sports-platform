import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Task 154 P0-5 (사용자 결정 A안).
 *
 * 대회 경기에서 `participant_identity` 는 platform_ops 전용이었다. 그래서 라인업 마감
 * 뒤 연결이 누락된 선수에게 남는 경로가 운영 문의뿐이었다 -- 사실상 복구 수단이 없다.
 * TEAM_MATCH 쪽은 같은 action 을 "두 팀 중 한쪽의 활성 멤버"에게 이미 허용하고 있으므로,
 * 대회에서는 **두 등록팀(homeRegistration/awayRegistration)의 활성 멤버**에게 같은
 * 자격을 준다.
 *
 * 이 스펙이 지키는 계약 세 가지:
 *   1. 참가팀 활성 멤버는 신원 연결을 **신청할 수 있다** (되돌리면 403).
 *   2. 어느 등록팀에도 속하지 않은 사용자는 여전히 **거부된다** (권한이 통째로 열리지 않았다).
 *   3. 열린 것은 *신청 자격*이지 *확정 권한*이 아니다 -- 신청자가 자기 신청을 스스로
 *      확인(attest)하려 하면 "신청자 ≠ 확인자" 규칙에 막힌다. 이게 깨지면 아무나 남의
 *      기록을 자기 것으로 만들 수 있게 된다.
 *
 * Task 14 의 스태프 배제(`game-participant-identity-staff-scope`)는 그대로 유효하다 --
 * 스태프 배정은 등록팀 멤버십이 아니므로 이 경로로 새지 않는다.
 */

const ids = {
  platformOps: '6c000000-0000-4000-8000-000000000001',
  teamMember: '6c000000-0000-4000-8000-000000000002',
  outsider: '6c000000-0000-4000-8000-000000000003',
  attestor: '6c000000-0000-4000-8000-000000000004',
  sport: '6c000000-0000-4000-8000-000000000010',
  region: '6c000000-0000-4000-8000-000000000011',
  hostTeam: '6c000000-0000-4000-8000-000000000020',
  opponentTeam: '6c000000-0000-4000-8000-000000000021',
  tournament: '6c000000-0000-4000-8000-000000000030',
  homeRegistration: '6c000000-0000-4000-8000-000000000031',
  awayRegistration: '6c000000-0000-4000-8000-000000000032',
  fixture: '6c000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

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

describe('Task 154 대회 경기 신원 연결 자가신청 (참가팀 멤버)', () => {
  let configId: string;
  let gameId: string;
  let participantId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 154 P0-5 integration verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('Task 11 football-v1 preset is required');
    }
    configId = config.id;

    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.teamMember, ids.outsider, ids.attestor].map((id, index) => ({
        id,
        email: `task154-self-claim-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: ids.sport, code: 'football', name: 'Task 154 Self Claim Football' },
      update: {},
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK154_SELF_CLAIM_REGION', name: 'Task 154 Self Claim Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 154 Self Claim Host' },
        { id: ids.opponentTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 154 Self Claim Opponent' },
      ],
    });
    // 자가신청 자격의 근거는 "등록팀의 활성 멤버"다. attestor 는 반대편 팀 멤버로 둬서
    // "신청자 ≠ 확인자" 규칙을 실제로 통과할 수 있는 별개 인물이 되게 한다.
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.teamMember, role: 'member', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.attestor, role: 'member', status: 'active' },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Task 154 self claim tournament', competitionConfigVersionId: configId },
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        { id: ids.homeRegistration, tournamentId: ids.tournament, teamId: ids.hostTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
        { id: ids.awayRegistration, tournamentId: ids.tournament, teamId: ids.opponentTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
      ],
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: configId,
        // 이 두 줄이 이 스펙의 전제다 -- 등록이 붙어 있어야 "참가팀 멤버" 판정이 가능하다.
        homeRegistrationId: ids.homeRegistration,
        awayRegistrationId: ids.awayRegistration,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 154 Self Claim Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 154 Self Claim Opponent' },
      ],
      // 계정에 연결되지 않은 채 이름만 올라간 참가자 -- 이 스펙이 다루는 바로 그 상황이다.
      participants: [
        { sourceParticipantId: 'self-claim-guest-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Self Claim Guest' },
      ],
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, creationContext('self-claim-source-create', input)),
    );
    gameId = created.gameId;
    participantId = (await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('등록팀의 활성 멤버는 자기 신원 연결을 신청할 수 있다', async () => {
    await service.requestIdentityLink(
      authUser(ids.teamMember),
      gameId,
      participantId,
      'task154-self-claim-request',
      { expectedVersion: 0, clientCommandId: 'task154-self-claim-request' },
    );

    const events = await prisma.v1ParticipantIdentityLinkEvent.findMany({ where: { participantId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ actorUserId: ids.teamMember }));
  });

  it('어느 등록팀에도 속하지 않은 사용자는 여전히 거부된다', async () => {
    const before = await prisma.v1ParticipantIdentityLinkEvent.count({ where: { participantId } });

    const error = await captureFailure(() =>
      service.requestIdentityLink(
        authUser(ids.outsider),
        gameId,
        participantId,
        'task154-self-claim-outsider',
        { expectedVersion: 1, clientCommandId: 'task154-self-claim-outsider' },
      ),
    );

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(403);
    // 거부는 "이벤트를 남기지 않는" 거부여야 한다 -- 시도 흔적이 원장을 오염시키면
    // 이후 버전 검사가 어긋난다.
    expect(await prisma.v1ParticipantIdentityLinkEvent.count({ where: { participantId } })).toBe(before);
  });

  it('신청자가 자기 신청을 스스로 확인할 수는 없다 (신청자 ≠ 확인자)', async () => {
    // 여기가 이 변경의 안전장치다. 신청 자격을 열어도 혼자서 연결을 완성할 수 없어야
    // 아무나 남의 기록을 자기 것으로 만들지 못한다.
    const request = await prisma.v1ParticipantIdentityLinkEvent.findFirstOrThrow({
      where: { participantId, actorUserId: ids.teamMember },
    });

    const error = await captureFailure(() =>
      service.attestIdentityLink(
        authUser(ids.teamMember),
        gameId,
        participantId,
        request.requestId,
        'task154-self-claim-self-attest',
        { expectedVersion: 1, clientCommandId: 'task154-self-claim-self-attest', decision: 'approve' },
      ),
    );

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).not.toBe(200);
  });
});
