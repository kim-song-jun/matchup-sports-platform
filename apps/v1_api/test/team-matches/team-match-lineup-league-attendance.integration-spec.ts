import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchLineupService } from '../../src/team-matches/team-match-lineup.service';

/**
 * 리그 대진의 라인업 저장에는 **참석 응답 게이트를 걸지 않는다.**
 *
 * ## 무엇이 결함이었나
 *
 * 리그 대진은 운영자가 일괄 생성하고(`league-fixture-creation.ts`), 그때 양 팀에
 * `V1TeamSchedule` 이 **함께 깔린다**. 그런데 선수들에게 그 일정의 참석을 묻는 입구가
 * 없다. 그래서 `GOING` 인 사람이 0명이고, 팀장이 연동된 팀원을 명단에 넣으면 **전원이
 * 422 `LINEUP_PARTICIPANT_INELIGIBLE`** 로 튕겼다.
 *
 * 팀장에게 남는 유일한 길은 **이름만 적어 넣는 것**이고, 그렇게 저장된 참가자 행에는
 * `userId` 가 없다 — alpha 실측에서 제출된 리그 라인업 참가자 14명이 **전원** 그랬다.
 * 연결이 없으면 개인 기록·상호평가·징계(정지) 추적이 전부 그 사람을 못 찾는다.
 *
 * ## 왜 유닛으로는 못 잡나
 *
 * 이 계약은 **세 테이블의 관계**(팀 매치의 `leagueId` · 그 매치에 딸린 팀 일정 · 그
 * 일정의 참석 응답)로만 성립한다. Prisma 를 mock 하면 그 관계를 내가 직접 지어내는
 * 것이라 아무것도 증명하지 못한다.
 *
 * ## 참고 — 왜 새 파일인가
 *
 * 같은 서비스의 기존 통합 스펙(`team-match-lineup.integration-spec.ts`)은
 * `jest.config.ts` 의 `testPathIgnorePatterns` 에 올라가 있어 **CI 에서 한 번도 돌지
 * 않는다**(Idempotency-Key 필수화·인원 게이트 제거 이후의 bit-rot). 거기에 새 계약을
 * 얹으면 green 처럼 보이지만 실제로는 실행되지 않으므로, 실행되는 자리에 따로 둔다.
 */

const ids = {
  hostOwner: '6a000000-0000-4000-8000-000000000001',
  hostP2: '6a000000-0000-4000-8000-000000000002',
  hostNotAttending: '6a000000-0000-4000-8000-000000000003',
  opponentOwner: '6a000000-0000-4000-8000-000000000004',
  stranger: '6a000000-0000-4000-8000-000000000005',
  sport: '6a000000-0000-4000-8000-000000000010',
  region: '6a000000-0000-4000-8000-000000000011',
  hostTeam: '6a000000-0000-4000-8000-000000000020',
  opponentTeam: '6a000000-0000-4000-8000-000000000021',
  league: '6a000000-0000-4000-8000-000000000030',
  leagueMatch: '6a000000-0000-4000-8000-000000000031',
  leagueSchedule: '6a000000-0000-4000-8000-000000000032',
  friendlyMatch: '6a000000-0000-4000-8000-000000000041',
  friendlySchedule: '6a000000-0000-4000-8000-000000000042',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const service = new TeamMatchLineupService(prisma, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.hostOwner, role: 'team_owner' },
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

async function currentVersion(teamMatchId: string): Promise<number> {
  const view = await service.getLineup(authUser(ids.hostOwner), teamMatchId);
  return view.version;
}

describe('리그 대진 라인업 — 참석 응답 게이트 예외', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the league lineup attendance spec');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('futsal-v1 preset is required');
    }
    const configId = config.id;

    await prisma.v1User.createMany({
      data: [ids.hostOwner, ids.hostP2, ids.hostNotAttending, ids.opponentOwner, ids.stranger].map(
        (id, index) => ({
          id,
          email: `league-lineup-attendance-${index}@example.test`,
          accountStatus: 'active' as const,
          onboardingStatus: 'completed' as const,
        }),
      ),
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'futsal', name: 'League Lineup Futsal' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'LEAGUE_LINEUP_REGION', name: 'League Lineup Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostOwner, sportId: ids.sport, regionId: ids.region, name: 'League Lineup Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentOwner, sportId: ids.sport, regionId: ids.region, name: 'League Lineup Away' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostOwner, role: 'owner', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostP2, role: 'member', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostNotAttending, role: 'member', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentOwner, role: 'owner', status: 'active' },
      ],
    });

    // 리그는 `V1Tournament(kind='regular_league')` 행이고, 그 대진은 `leagueId` 가 채워진
    // 팀 매치다 — 친선과 같은 테이블, 다른 판별자(team-record-category.ts).
    await prisma.v1Tournament.create({
      data: {
        id: ids.league,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'League Lineup 리그',
        kind: 'regular_league',
        competitionConfigVersionId: configId,
      },
    });

    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await prisma.v1TeamMatch.createMany({
      data: [
        {
          id: ids.leagueMatch,
          hostTeamId: ids.hostTeam,
          createdByUserId: ids.hostOwner,
          sportId: ids.sport,
          regionId: ids.region,
          title: 'League fixture',
          placeName: 'Futsal court',
          startAt,
          approvedApplicantTeamId: ids.opponentTeam,
          competitionConfigVersionId: configId,
          leagueId: ids.league,
          tournamentId: ids.league,
        },
        {
          // 대조군 — 같은 팀·같은 시각·같은 참석 상태인데 `leagueId` 만 없다. 이 행이
          // 없으면 "리그라서 통과" 와 "게이트가 통째로 죽음" 을 구분할 수 없다.
          id: ids.friendlyMatch,
          hostTeamId: ids.hostTeam,
          createdByUserId: ids.hostOwner,
          sportId: ids.sport,
          regionId: ids.region,
          title: 'Friendly match',
          placeName: 'Futsal court',
          startAt,
          approvedApplicantTeamId: ids.opponentTeam,
          competitionConfigVersionId: configId,
        },
      ],
    });

    for (const teamMatchId of [ids.leagueMatch, ids.friendlyMatch]) {
      const input: GameSourceCreationInput = {
        sourceType: V1GameSourceType.TEAM_MATCH,
        sourceId: teamMatchId,
        competitionConfigVersionId: configId,
        sides: [
          { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'League Lineup Host' },
          { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'League Lineup Away' },
        ],
        participants: [],
      };
      await prisma.$transaction((tx) =>
        games.createFromSourceInTransaction(tx, input, creationContext(`league-lineup-${teamMatchId}`, input)),
      );
    }

    // 프로덕션이 만드는 모양 그대로 — 리그 대진에도 팀 일정이 깔린다.
    await prisma.v1TeamSchedule.createMany({
      data: [
        {
          id: ids.leagueSchedule,
          teamId: ids.hostTeam,
          teamMatchId: ids.leagueMatch,
          title: 'League schedule',
          type: 'MATCH',
          startAt,
          endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
          timezone: 'Asia/Seoul',
        },
        {
          id: ids.friendlySchedule,
          teamId: ids.hostTeam,
          teamMatchId: ids.friendlyMatch,
          title: 'Friendly schedule',
          type: 'MATCH',
          startAt,
          endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
          timezone: 'Asia/Seoul',
        },
      ],
    });
    // 두 일정에 **똑같은 참석 응답**을 심는다. 리그에서는 참석을 묻지 않으므로 실제로는
    // 행이 없는 것이 보통이지만, `NOT_GOING` 을 명시해야 "행이 없어서 통과한 것" 과
    // "리그라서 게이트를 걸지 않는 것" 이 구분된다 — 전자는 게이트를 되살려도 같은
    // 결과가 나와 변이가 red 로 잡히지 않는다.
    await prisma.v1ScheduleAttendance.createMany({
      data: [
        { scheduleId: ids.leagueSchedule, userId: ids.hostOwner, status: 'GOING' },
        { scheduleId: ids.leagueSchedule, userId: ids.hostP2, status: 'GOING' },
        { scheduleId: ids.leagueSchedule, userId: ids.hostNotAttending, status: 'NOT_GOING' },
        { scheduleId: ids.friendlySchedule, userId: ids.hostOwner, status: 'GOING' },
        { scheduleId: ids.friendlySchedule, userId: ids.hostP2, status: 'GOING' },
        { scheduleId: ids.friendlySchedule, userId: ids.hostNotAttending, status: 'NOT_GOING' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('리그 대진은 참석 응답이 NOT_GOING 인 팀원도 저장되고, 참가자 행에 userId 가 실린다', async () => {
    const saved = await service.saveLineup(
      authUser(ids.hostOwner),
      ids.leagueMatch,
      'league-lineup-attendance-save',
      {
        expectedVersion: await currentVersion(ids.leagueMatch),
        starters: [
          { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
          { userId: ids.hostP2, jerseyNumber: 2 },
          // 친선이었다면 이 사람 때문에 422 였다(아래 대조 테스트가 그 자리를 못박는다).
          { userId: ids.hostNotAttending, jerseyNumber: 3 },
        ],
        bench: [],
      },
    );

    const participants = await prisma.v1GameParticipant.findMany({
      where: { lineupId: saved.lineupId },
      orderBy: { jerseyNumber: 'asc' },
      select: { userId: true, jerseyNumber: true },
    });
    // 저장된 것으로 끝이 아니다 — **사람이 실려야** 개인 기록·징계가 그를 찾는다.
    expect(participants).toEqual([
      { userId: ids.hostOwner, jerseyNumber: 1 },
      { userId: ids.hostP2, jerseyNumber: 2 },
      { userId: ids.hostNotAttending, jerseyNumber: 3 },
    ]);
  });

  it('친선 매치는 그대로 참석 응답을 요구한다 (게이트가 통째로 죽지 않았다)', async () => {
    const version = await currentVersion(ids.friendlyMatch);

    const rejected = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.friendlyMatch, 'friendly-lineup-attendance-save', {
        expectedVersion: version,
        starters: [
          { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
          { userId: ids.hostP2, jerseyNumber: 2 },
          { userId: ids.hostNotAttending, jerseyNumber: 3 },
        ],
        bench: [],
      }),
    );
    expectHttpCode(rejected, 422, 'LINEUP_PARTICIPANT_INELIGIBLE');
  });

  it('리그 대진에서도 팀 소속이 아닌 사용자는 여전히 거부된다 (자격 판정 전체를 끈 것이 아니다)', async () => {
    const version = await currentVersion(ids.leagueMatch);

    const rejected = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.leagueMatch, 'league-lineup-stranger', {
        expectedVersion: version,
        starters: [
          { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
          { userId: ids.hostP2, jerseyNumber: 2 },
          { userId: ids.stranger, jerseyNumber: 3 },
        ],
        bench: [],
      }),
    );
    expectHttpCode(rejected, 422, 'LINEUP_PARTICIPANT_INELIGIBLE');
    // 거부된 시도가 새 리비전을 남기면 안 된다.
    expect(await currentVersion(ids.leagueMatch)).toBe(version);
  });

  it('eligibleMembers 도 같은 규칙을 따른다 — 리그는 전원 attending=true, 친선은 참석 응답 그대로', async () => {
    const league = await service.getLineup(authUser(ids.hostOwner), ids.leagueMatch);
    expect(league.eligibleMembers?.find((m) => m.userId === ids.hostNotAttending)?.attending).toBe(true);
    expect(league.eligibleMembers?.every((m) => m.attending)).toBe(true);

    const friendly = await service.getLineup(authUser(ids.hostOwner), ids.friendlyMatch);
    expect(friendly.eligibleMembers?.find((m) => m.userId === ids.hostNotAttending)?.attending).toBe(false);
    expect(friendly.eligibleMembers?.find((m) => m.userId === ids.hostP2)?.attending).toBe(true);
  });
});
