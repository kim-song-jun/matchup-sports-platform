import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PublicUserRecordsService } from '../../src/games/public-records/public-user-records.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * 이번 작업 전체의 출발 증상 -- "대회가 끝나도 개인 기록이 안 나온다"(GET
 * /users/:id/records가 항상 0건) -- 이 실제로 해소되는지를 끝에서 끝까지
 * 증명하는 스펙. 개별 조각(라인업 자동 연결은
 * game-lineup-roster-identity-link.integration-spec.ts, 사용자 단위 동의
 * 판정은 public-user-records-assist-foul.integration-spec.ts)은 이미 각자
 * 검증돼 있지만, 그 둘이 실제로 이어붙는지 -- 매니저가 라인업에 저장한
 * userId가 자동 연결을 만들고, 그 연결된 사용자가 나중에 동의하면 "이미 끝난
 * 과거 경기"까지 즉시 보이고, 개별로 다시 숨기면 다시 사라지는지 -- 는 어느
 * 기존 스펙도 하나의 흐름으로 잇지 않았다.
 *
 * 흐름: `games.saveLineup`(userId 포함, ROSTER_ASSERTED 자동 연결) ->
 * 결과 확정(officialAt + game.currentOfficialRevisionId -- 실제 command
 * 엔진으로 SCHEDULED->LIVE->ENDED를 다 돌리는 대신, 같은 최종 상태를
 * public-user-records-assist-foul.integration-spec.ts와 동일한 방식으로
 * 직접 구성한다: 이 스펙의 목적은 "결과가 official로 확정된 이후" 구간이므로
 * 그 확정에 이르는 커맨드 시퀀스 자체는 게임 라이프사이클 스펙들이 이미
 * 별도로 커버한다) -> `PublicUserRecordsService.getRecords` 3단 관찰
 * (동의 전 0건 -> 사용자 단위 GRANTED 즉시 소급 노출 -> 개별 REVOKED로 재차
 * 숨김).
 */

const ids = {
  platformOps: '6e000000-0000-4000-8000-000000000001',
  targetUser: '6e000000-0000-4000-8000-000000000002',
  sport: '6e000000-0000-4000-8000-000000000010',
  region: '6e000000-0000-4000-8000-000000000011',
  hostTeam: '6e000000-0000-4000-8000-000000000020',
  awayTeam: '6e000000-0000-4000-8000-000000000021',
  tournament: '6e000000-0000-4000-8000-000000000030',
  fixture: '6e000000-0000-4000-8000-000000000031',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const userRecords = new PublicUserRecordsService(prisma);

const authUser = (id: string) => ({
  id,
  email: `${id}@records-e2e.example.test`,
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

describe('End-to-end: lineup roster link -> official result -> user-consent-gated public records', () => {
  let gameId: string;
  let participantId: string;
  const officialAt = new Date('2026-08-01T00:00:00.000Z'); // 과거 경기 -- 소급 노출을 실제로 증명하려면 "지금"이 아니라 과거여야 한다.

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    const minPlayers = (config.lineup as { minPlayers: number }).minPlayers;

    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.targetUser].map((id, index) => ({
        id,
        email: `records-e2e-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1UserProfile.create({
      data: { userId: ids.targetUser, nickname: 'Records E2E Player' },
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'Records E2E futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'RECORDS_E2E_REGION', name: 'Records E2E region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Records E2E Host' },
        { id: ids.awayTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Records E2E Away' },
      ],
    });
    // targetUser는 호스트 팀의 active 멤버여야 saveLineup의 roster 검증을
    // 통과한다 (LINEUP_USER_NOT_TEAM_MEMBER 게이트).
    await prisma.v1TeamMembership.create({
      data: { teamId: ids.hostTeam, userId: ids.targetUser, role: 'member', status: 'active' },
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Records E2E Cup' },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: config.id,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Records E2E Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Records E2E Away' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, creationContext('records-e2e-source', input)),
    );
    gameId = created.gameId;
    const homeSideId = (
      await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } })
    ).id;

    // 1) 라인업 저장 -- targetUser를 로스터에 지정한다. saveLineup이 같은
    // 트랜잭션에서 ROSTER_ASSERTED 연결을 자동 생성한다(별도 연결 요청/승인
    // 없이 -- 이게 이번 작업이 메운 공백이다).
    const beforeLineup = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const guests = Array.from({ length: Math.max(minPlayers - 1, 0) }, (_, index) => ({
      displayNameSnapshot: `Records E2E guest ${index + 1}`,
      jerseyNumber: 50 + index,
      started: true,
    }));
    const saved = await games.saveLineup(authUser(ids.platformOps), gameId, homeSideId, 'records-e2e-lineup', {
      expectedVersion: beforeLineup.version,
      clientCommandId: 'records-e2e-lineup',
      participants: [
        { displayNameSnapshot: 'Records E2E Player', jerseyNumber: 10, started: true, userId: ids.targetUser },
        ...guests,
      ],
    });
    participantId = (
      await prisma.v1GameParticipant.findFirstOrThrow({
        where: { lineupId: saved.lineupId, displayNameSnapshot: 'Records E2E Player' },
      })
    ).id;
    expect(
      await prisma.v1ParticipantIdentityLinkCurrent.findUniqueOrThrow({ where: { participantId } }),
    ).toEqual(expect.objectContaining({ userId: ids.targetUser }));

    // 2) 결과 확정 -- officialAt + game.currentOfficialRevisionId. (라이브
    // 커맨드 엔진으로 SCHEDULED->LIVE->ENDED를 재현하는 대신, 그 최종 산출물
    // 상태만 직접 구성한다 -- 위 클래스 docstring 참고.)
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId,
        revision: 1,
        state: 'DRAFT',
        score: { home: 2, away: 1 },
        eventsHash: 'records-e2e-events-hash',
        createdByActorType: 'USER',
        createdByUserId: ids.platformOps,
      },
    });
    await prisma.v1GameResultParticipant.create({
      data: {
        resultRevisionId: revision.id,
        participantId,
        sideId: homeSideId,
        started: true,
        goals: 2,
        assists: 0,
        fouls: 0,
        cards: { yellow: 0, red: 0 },
        goalkeeper: false,
      },
    });
    // v1_guard_result_participant_mutation는 revision이 아직 DRAFT일 때만
    // 참가자 행 삽입을 허용한다 -- 삽입 후에야 OFFICIAL로 전환한다.
    await prisma.v1GameResultRevision.update({
      where: { id: revision.id },
      data: { state: 'OFFICIAL', officialAt },
    });
    await prisma.v1Game.update({ where: { id: gameId }, data: { currentOfficialRevisionId: revision.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('is 0 records before any user-level consent, appears retroactively once GRANTED, and hides again on an individual REVOKED override', async () => {
    // -- 0건: 연결은 있지만 사용자 단위 동의가 아직 없다.
    const beforeConsent = await userRecords.getRecords(ids.targetUser, {});
    expect(beforeConsent.summary.appearances).toBe(0);
    expect(beforeConsent.items).toHaveLength(0);

    // -- 사용자 단위 GRANTED: 시간 비교 없이 이 "과거" 경기가 즉시 보인다
    // (소급 허용이 사용자 결정이었다 -- public-consent.ts 문서 참고).
    await prisma.v1UserRecordConsent.create({
      data: { userId: ids.targetUser, state: 'GRANTED', policyHash: 'records-e2e-policy-hash' },
    });
    const afterGrant = await userRecords.getRecords(ids.targetUser, {});
    // 파울 누적치는 공개 요약에 싣지 않는다(개인 프로필 낙인 방지) — 그래서 fouls 는 단언하지 않는다.
    expect(afterGrant.summary).toEqual(expect.objectContaining({ appearances: 1, goals: 2, assists: 0 }));
    expect(afterGrant.items).toHaveLength(1);
    expect(afterGrant.items[0]).toEqual(
      expect.objectContaining({ gameId, goals: 2, officialAt: officialAt.toISOString() }),
    );

    // -- 이 participant만 개별 숨김(REVOKED 스냅샷). 실제 서비스 호출
    // (games.revokeParticipantConsent)로 만든다 -- 사용자 단위 동의는 그대로
    // GRANTED인 채, 이 participant 하나만 override로 다시 숨겨진다.
    const beforeRevoke = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const revoked = await games.revokeParticipantConsent(
      authUser(ids.platformOps),
      gameId,
      participantId,
      'records-e2e-revoke',
      {
        expectedVersion: beforeRevoke.version,
        clientCommandId: 'records-e2e-revoke',
        reason: 'records-e2e individual hide',
      },
    );
    expect(revoked.state).toBe('REVOKED');

    const afterRevoke = await userRecords.getRecords(ids.targetUser, {});
    expect(afterRevoke.summary.appearances).toBe(0);
    expect(afterRevoke.items).toHaveLength(0);

    // 사용자 단위 동의 자체는 여전히 GRANTED다 -- 사라진 건 이 participant
    // 하나뿐이라는 것을 명시적으로 확인한다.
    expect(
      await prisma.v1UserRecordConsent.findUniqueOrThrow({ where: { userId: ids.targetUser } }),
    ).toEqual(expect.objectContaining({ state: 'GRANTED' }));
  });
});
