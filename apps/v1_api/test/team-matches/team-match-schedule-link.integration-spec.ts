import { Test, type TestingModule } from '@nestjs/testing';
import { V1GameState } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamSchedulesService } from '../../src/team-schedules/team-schedules.service';
import type { MutateTeamMatchDto, UpdateTeamMatchDto } from '../../src/team-matches/dto/mutate-team-match.dto';
import { TeamMatchesService } from '../../src/team-matches/team-matches.service';

// 레인 schedule — 매치 ↔ 팀일정 연동. team-matches.service.ts의 create()/approveApplication()/
// cancel()/update()가 team-schedules.service.ts의 평문 함수(createTeamMatchScheduleInTx/
// syncTeamMatchScheduleInTx/cascadeCancelTeamMatchSchedulesInTx)를, games.service.ts의
// submitResultRevision()이 cascadeCompleteTeamMatchSchedulesInTx를 각각 같은 트랜잭션 안에서
// 실제로 호출하는지 — 그리고 TeamSchedulesService의 조회 응답이 matchConfirmed 파생 필드를
// 정확히 계산하는지 — end-to-end로 증명한다.

const ids = {
  hostUser: '65000000-0000-4000-8000-000000000001',
  opponentUser: '65000000-0000-4000-8000-000000000002',
  sport: '65000000-0000-4000-8000-000000000010',
  region: '65000000-0000-4000-8000-000000000011',
  hostTeam: '65000000-0000-4000-8000-000000000020',
  opponentTeam: '65000000-0000-4000-8000-000000000021',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const teamSchedules = new TeamSchedulesService(prisma);
const notifications = {
  emitNotification: async () => undefined,
  emitToManyDeferred: () => undefined,
};
const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function baseDto(overrides: Partial<MutateTeamMatchDto> = {}): MutateTeamMatchDto {
  return {
    hostTeamId: ids.hostTeam,
    sportId: ids.sport,
    regionId: ids.region,
    title: 'Schedule-link fixture match',
    startsAt: '2026-09-10T10:00:00.000Z',
    endsAt: '2026-09-10T12:00:00.000Z',
    manualPlaceName: 'Schedule-link ground',
    ...overrides,
  };
}

describe('레인 schedule — 매치 ↔ 팀일정 연동 (TeamMatch 생명주기 전체)', () => {
  let teamMatches: TeamMatchesService;
  let moduleRef: TestingModule | undefined;
  let sportId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the match-schedule link integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: [
        { id: ids.hostUser, email: 'schedule-link-host@example.test', phone: '01065000001', accountStatus: 'active', onboardingStatus: 'completed' },
        { id: ids.opponentUser, email: 'schedule-link-opponent@example.test', phone: '01065000002', accountStatus: 'active', onboardingStatus: 'completed' },
      ],
    });
    await prisma.v1UserProfile.createMany({
      data: [
        { userId: ids.hostUser, nickname: 'Link Host', displayName: 'Link Host', realName: 'Link Host Real', gender: 'male' },
        { userId: ids.opponentUser, nickname: 'Link Opponent', displayName: 'Link Opponent', realName: 'Link Opponent Real', gender: 'female' },
      ],
    });
    const football = await prisma.v1Sport.upsert({
      where: { code: 'football' },
      update: {},
      create: { id: ids.sport, code: 'football', name: 'Schedule-link Football' },
      select: { id: true },
    });
    sportId = football.id;
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'SCHEDULE_LINK_REGION', name: 'Schedule-link Region', level: 2 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostUser, sportId, regionId: ids.region, name: 'Schedule-link Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentUser, sportId, regionId: ids.region, name: 'Schedule-link Opponent' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentUser, role: 'owner', status: 'active' },
      ],
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        TeamMatchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: GamesService, useValue: games },
      ],
    }).compile();
    teamMatches = moduleRef.get(TeamMatchesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma.$disconnect();
  });

  it('TeamMatch 생성 시 같은 트랜잭션에서 호스트 팀에 가확정(SCHEDULED) 스케줄이 생기고, matchConfirmed는 false로 조회된다', async () => {
    const created = await teamMatches.create(authUser(ids.hostUser), baseDto({ title: 'Create-flow match' }), 'schedule-link-create');

    const schedule = await prisma.v1TeamSchedule.findFirstOrThrow({
      where: { teamId: ids.hostTeam, teamMatchId: created.teamMatchId },
    });
    expect(schedule.type).toBe('MATCH');
    expect(schedule.state).toBe('SCHEDULED');
    expect(schedule.title).toBe('Create-flow match');
    expect(schedule.startAt.toISOString()).toBe('2026-09-10T10:00:00.000Z');
    expect(schedule.endAt.toISOString()).toBe('2026-09-10T12:00:00.000Z');

    const detail = await teamSchedules.detail(authUser(ids.hostUser), ids.hostTeam, schedule.id);
    expect(detail.matchConfirmed).toBe(false);

    // 재시도(같은 durableCommandId)는 idempotent replay 경로를 타므로 스케줄을 두 번 만들지 않는다
    // — @@unique([teamId, teamMatchId])가 그 마지막 방어선이다.
    await teamMatches.create(authUser(ids.hostUser), baseDto({ title: 'Create-flow match' }), 'schedule-link-create');
    expect(await prisma.v1TeamSchedule.count({ where: { teamId: ids.hostTeam, teamMatchId: created.teamMatchId } })).toBe(1);
  });

  it('신청 승인 시 상대팀에도 스케줄이 생기고, 양쪽 모두 matchConfirmed가 true로 뒤집힌다', async () => {
    const created = await teamMatches.create(authUser(ids.hostUser), baseDto({ title: 'Approve-flow match' }), 'schedule-link-approve-create');
    const application = await prisma.v1TeamMatchApplication.create({
      data: {
        teamMatchId: created.teamMatchId,
        applicantTeamId: ids.opponentTeam,
        appliedByUserId: ids.opponentUser,
        status: 'requested',
      },
    });

    await teamMatches.approveApplication(authUser(ids.hostUser), application.id, {});

    const opponentSchedule = await prisma.v1TeamSchedule.findFirstOrThrow({
      where: { teamId: ids.opponentTeam, teamMatchId: created.teamMatchId },
    });
    expect(opponentSchedule.type).toBe('MATCH');
    expect(opponentSchedule.state).toBe('SCHEDULED');
    expect(opponentSchedule.title).toBe('Approve-flow match');

    const hostSchedule = await prisma.v1TeamSchedule.findFirstOrThrow({
      where: { teamId: ids.hostTeam, teamMatchId: created.teamMatchId },
    });
    const hostDetail = await teamSchedules.detail(authUser(ids.hostUser), ids.hostTeam, hostSchedule.id);
    const opponentDetail = await teamSchedules.detail(authUser(ids.opponentUser), ids.opponentTeam, opponentSchedule.id);
    expect(hostDetail.matchConfirmed).toBe(true);
    expect(opponentDetail.matchConfirmed).toBe(true);
  });

  it('TeamMatch 취소 시 연결된 SCHEDULED 스케줄(호스트+상대)이 모두 CANCELLED로 cascade되고 row는 삭제되지 않는다', async () => {
    const created = await teamMatches.create(authUser(ids.hostUser), baseDto({ title: 'Cancel-flow match' }), 'schedule-link-cancel-create');
    const application = await prisma.v1TeamMatchApplication.create({
      data: {
        teamMatchId: created.teamMatchId,
        applicantTeamId: ids.opponentTeam,
        appliedByUserId: ids.opponentUser,
        status: 'requested',
      },
    });
    await teamMatches.approveApplication(authUser(ids.hostUser), application.id, {});
    const before = await prisma.v1TeamSchedule.count({ where: { teamMatchId: created.teamMatchId } });
    expect(before).toBe(2);

    await teamMatches.cancel(authUser(ids.hostUser), created.teamMatchId, { reason: 'schedule-link cancel test' });

    const schedulesAfter = await prisma.v1TeamSchedule.findMany({ where: { teamMatchId: created.teamMatchId } });
    expect(schedulesAfter).toHaveLength(2);
    for (const schedule of schedulesAfter) {
      expect(schedule.state).toBe('CANCELLED');
      expect(schedule.cancelReason).toBe('schedule-link cancel test');
      expect(schedule.version).toBe(1);
    }
  });

  it('recruiting 단계에서 TeamMatch를 수정하면 호스트 스케줄의 title/startAt/endAt이 같은 트랜잭션에서 동기화된다', async () => {
    const created = await teamMatches.create(authUser(ids.hostUser), baseDto({ title: 'Update-flow match, before' }), 'schedule-link-update-create');
    const detail = await teamMatches.edit(authUser(ids.hostUser), created.teamMatchId);

    const updateDto: UpdateTeamMatchDto = {
      ...baseDto({
        title: 'Update-flow match, after',
        startsAt: '2026-09-11T09:00:00.000Z',
        endsAt: '2026-09-11T10:30:00.000Z',
      }),
      version: detail.version,
    };
    await teamMatches.update(authUser(ids.hostUser), created.teamMatchId, updateDto);

    const schedule = await prisma.v1TeamSchedule.findFirstOrThrow({
      where: { teamId: ids.hostTeam, teamMatchId: created.teamMatchId },
    });
    expect(schedule.title).toBe('Update-flow match, after');
    expect(schedule.startAt.toISOString()).toBe('2026-09-11T09:00:00.000Z');
    expect(schedule.endAt.toISOString()).toBe('2026-09-11T10:30:00.000Z');
    expect(schedule.version).toBe(1);
  });

  it('결과 제출로 Game이 ENDED/TeamMatch가 completed로 전이되는 같은 트랜잭션에서 연결된 스케줄도 COMPLETED로 cascade된다', async () => {
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    const created = await teamMatches.create(authUser(ids.hostUser), baseDto({ title: 'Complete-flow match' }), 'schedule-link-complete-create');
    const application = await prisma.v1TeamMatchApplication.create({
      data: {
        teamMatchId: created.teamMatchId,
        applicantTeamId: ids.opponentTeam,
        appliedByUserId: ids.opponentUser,
        status: 'requested',
      },
    });
    await teamMatches.approveApplication(authUser(ids.hostUser), application.id, {});

    const draft = await games.createResultRevision(authUser(ids.hostUser), created.gameId, 'schedule-link-result-draft', {
      expectedVersion: 0,
      clientCommandId: 'schedule-link-result-draft',
      score: { home: 1, away: 0 },
      actualParticipants: [],
      eventsHash: 'schedule-link-result-events',
    });
    const submitted = await games.submitResultRevision(authUser(ids.hostUser), created.gameId, draft.revisionId, 'schedule-link-result-submit', {
      expectedVersion: draft.version,
      clientCommandId: 'schedule-link-result-submit',
    });
    expect(submitted.state).toBe(V1GameState.ENDED);

    const teamMatchAfter = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: created.teamMatchId } });
    expect(teamMatchAfter.status).toBe('completed');

    const schedulesAfter = await prisma.v1TeamSchedule.findMany({ where: { teamMatchId: created.teamMatchId } });
    expect(schedulesAfter).toHaveLength(2);
    for (const schedule of schedulesAfter) {
      expect(schedule.state).toBe('COMPLETED');
      expect(schedule.version).toBe(1);
    }
  });
});
