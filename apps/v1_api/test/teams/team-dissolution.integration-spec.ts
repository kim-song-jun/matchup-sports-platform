/**
 * team-dissolution.integration-spec.ts — Task 180 H3 팀 해체(보관)·복구 계약을 실제 DB 로 본다.
 *
 * 유닛 스펙은 prisma 를 mock 해서 where 절이 틀려도 통과한다. 여기서는 "상대가 정해진 경기는
 * 막고, 혼자 정리할 수 있는 것만 서버가 정리한다"는 경계와 "기록은 남는다"를 행 단위로 확인한다.
 */
import type { INestApplication } from '@nestjs/common';
import { AdminService } from '../../src/admin/admin.service';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { PublicTeamRecordsService } from '../../src/games/public-records/public-team-records.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProfileService } from '../../src/profile/profile.service';
import { TeamDissolutionService } from '../../src/teams/team-dissolution.service';
import { TeamsService } from '../../src/teams/teams.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const PREFIX = 'team-dissolution-it';
const ownerId = `${PREFIX}-owner`;
const managerId = `${PREFIX}-manager`;
const memberId = `${PREFIX}-member`;
const applicantId = `${PREFIX}-applicant`;
const inviteeId = `${PREFIX}-invitee`;
const rivalOwnerId = `${PREFIX}-rival-owner`;
const opsUserId = `${PREFIX}-ops`;
const opsAdminId = `${PREFIX}-ops-admin`;
const userIds = [ownerId, managerId, memberId, applicantId, inviteeId, rivalOwnerId, opsUserId];
const teamId = `${PREFIX}-team`;
const rivalTeamId = `${PREFIX}-rival`;
const regionId = `${PREFIX}-region`;
const recruitingMatchId = `${PREFIX}-tm-recruiting`;
const matchedMatchId = `${PREFIX}-tm-matched`;
const tournamentId = `${PREFIX}-tournament`;
const registrationId = `${PREFIX}-registration`;
const futureScheduleId = `${PREFIX}-schedule-future`;
const pastScheduleId = `${PREFIX}-schedule-past`;
const DAY = 24 * 60 * 60 * 1000;

let sportId = `${PREFIX}-sport`;
let sportOwnedByThisSuite = false;
const asUser = (id: string): V1AuthUser => ({ id, accountStatus: 'active' }) as V1AuthUser;

describe('팀 해체(보관)·복구 계약', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let dissolution: TeamDissolutionService;
  let teams: TeamsService;
  let records: PublicTeamRecordsService;
  let profile: ProfileService;
  let admin: AdminService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    dissolution = app.get(TeamDissolutionService);
    teams = app.get(TeamsService);
    records = app.get(PublicTeamRecordsService);
    profile = app.get(ProfileService);
    admin = app.get(AdminService);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await cleanupApp?.();
    await app?.close();
  });

  beforeEach(async () => {
    await cleanupFixtures();
    await seedFixtures();
  });

  async function cleanupFixtures() {
    await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: userIds } } });
    await prisma.v1TournamentRegistration.deleteMany({ where: { id: registrationId } });
    await prisma.v1Tournament.deleteMany({ where: { id: tournamentId } });
    await prisma.v1TeamSchedule.deleteMany({ where: { teamId: { in: [teamId, rivalTeamId] } } });
    await prisma.v1TeamMatchApplication.deleteMany({ where: { teamMatchId: { in: [recruitingMatchId, matchedMatchId] } } });
    await prisma.v1TeamMatch.deleteMany({ where: { id: { in: [recruitingMatchId, matchedMatchId] } } });
    await prisma.v1ChatRoom.deleteMany({ where: { teamId: { in: [teamId, rivalTeamId] } } });
    await prisma.v1TeamInvitation.deleteMany({ where: { teamId } });
    await prisma.v1TeamJoinApplication.deleteMany({ where: { teamId } });
    await prisma.v1StatusChangeLog.deleteMany({
      where: { OR: [{ actorUserId: { in: userIds } }, { adminUserId: opsAdminId }, { targetId: { in: [teamId, ...userIds] } }] },
    });
    await prisma.v1AdminActionLog.deleteMany({ where: { adminUserId: opsAdminId } });
    await prisma.v1AdminUser.deleteMany({ where: { id: opsAdminId } });
    await prisma.v1TeamMembership.deleteMany({ where: { teamId: { in: [teamId, rivalTeamId] } } });
    await prisma.v1TeamProfile.deleteMany({ where: { teamId: { in: [teamId, rivalTeamId] } } });
    await prisma.v1Team.deleteMany({ where: { id: { in: [teamId, rivalTeamId] } } });
    await prisma.v1UserProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.v1User.deleteMany({ where: { id: { in: userIds } } });
    if (sportOwnedByThisSuite) await prisma.v1Sport.deleteMany({ where: { id: sportId } });
    await prisma.v1Region.deleteMany({ where: { id: regionId } });
  }

  async function seedFixtures() {
    // v1_competition_config_for_sport() 가 실제 종목 코드만 알아서 대회 행을 만들려면 'futsal' 을 쓴다
    // (roster-cleanup.e2e-spec.ts 와 같은 이유). 다른 스위트가 이미 만든 행이면 지우지 않는다.
    const existingSport = await prisma.v1Sport.findUnique({ where: { code: 'futsal' } });
    if (existingSport === null) {
      sportId = (await prisma.v1Sport.create({ data: { id: sportId, code: 'futsal', name: '풋살', isActive: true } })).id;
      sportOwnedByThisSuite = true;
    } else {
      sportId = existingSport.id;
      sportOwnedByThisSuite = false;
    }
    await prisma.v1Region.create({ data: { id: regionId, code: `${PREFIX}-region-code`, name: '테스트지역', level: 1 } });
    await prisma.v1User.createMany({
      data: userIds.map((id) => ({ id, email: `${id}@integration.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const })),
    });
    await prisma.v1AdminUser.create({ data: { id: opsAdminId, userId: opsUserId, adminRole: 'ops' } });
    await prisma.v1Team.createMany({
      data: [
        { id: teamId, name: '해체 테스트팀', sportId, regionId, ownerUserId: ownerId, status: 'active', memberCount: 3, managerCount: 1 },
        { id: rivalTeamId, name: '상대 테스트팀', sportId, regionId, ownerUserId: rivalOwnerId, status: 'active', memberCount: 1 },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId, userId: ownerId, role: 'owner', status: 'active' },
        { teamId, userId: managerId, role: 'manager', status: 'active' },
        { teamId, userId: memberId, role: 'member', status: 'active' },
        { teamId: rivalTeamId, userId: rivalOwnerId, role: 'owner', status: 'active' },
      ],
    });
    await prisma.v1ChatRoom.create({ data: { teamId, status: 'active' } });
    await prisma.v1TeamJoinApplication.create({ data: { teamId, applicantUserId: applicantId, status: 'requested' } });
    await prisma.v1TeamInvitation.create({ data: { teamId, invitedUserId: inviteeId, invitedByUserId: ownerId, status: 'pending' } });
    await prisma.v1TeamMatch.create({
      data: {
        id: recruitingMatchId, sportId, title: '모집 중 친선', hostTeamId: teamId, status: 'recruiting', startAt: new Date(Date.now() + 7 * DAY),
        createdByUserId: ownerId, regionId, placeName: '해체 테스트 구장',
      },
    });
    await prisma.v1TeamMatchApplication.create({
      data: { teamMatchId: recruitingMatchId, applicantTeamId: rivalTeamId, appliedByUserId: rivalOwnerId, status: 'requested' },
    });
    await prisma.v1TeamSchedule.createMany({
      data: [
        { id: futureScheduleId, teamId, title: '다음 주 연습', type: 'TRAINING', startAt: new Date(Date.now() + 3 * DAY), endAt: new Date(Date.now() + 3 * DAY + 2 * 3600_000), timezone: 'Asia/Seoul' },
        { id: pastScheduleId, teamId, title: '지난주 연습', type: 'TRAINING', startAt: new Date(Date.now() - 7 * DAY), endAt: new Date(Date.now() - 7 * DAY + 2 * 3600_000), timezone: 'Asia/Seoul' },
      ],
    });
  }

  async function seedMatchedFriendly() {
    await prisma.v1TeamMatch.create({
      data: {
        id: matchedMatchId, sportId, title: '상대 확정 친선', hostTeamId: teamId, approvedApplicantTeamId: rivalTeamId,
        status: 'matched', startAt: new Date(Date.now() + 10 * DAY), createdByUserId: ownerId, regionId, placeName: '해체 테스트 구장',
      },
    });
  }

  async function seedRegistration(tournamentStatus: 'open' | 'completed') {
    await prisma.v1Tournament.create({
      data: { id: tournamentId, sportId, title: '해체 테스트 대회', status: tournamentStatus, minPlayers: 1, maxPlayers: 12, teamCount: 8 },
    });
    await prisma.v1TournamentRegistration.create({
      data: { id: registrationId, tournamentId, teamId, appliedByUserId: ownerId, status: 'confirmed' },
    });
  }

  const dissolve = (userId = ownerId) => dissolution.dissolve(asUser(userId), teamId, { confirmTeamName: '해체 테스트팀' });

  it('매니저·멤버·비팀원은 해체할 수 없다', async () => {
    for (const userId of [managerId, memberId, rivalOwnerId]) {
      await expect(dissolve(userId)).rejects.toMatchObject({ status: 403 });
    }
    expect((await prisma.v1Team.findUniqueOrThrow({ where: { id: teamId } })).status).toBe('active');
  });

  it('상대가 정해진 친선 경기가 있으면 막고, 모집 중 경기도 그대로 둔다', async () => {
    await seedMatchedFriendly();
    await expect(dissolve()).rejects.toMatchObject({ status: 409, response: { code: 'TEAM_DISSOLVE_BLOCKED' } });
    const preview = await dissolution.preview(asUser(ownerId), teamId);
    expect(preview.canDissolve).toBe(false);
    expect(preview.blockers.map((blocker) => blocker.kind)).toEqual(['matched_team_match']);
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: recruitingMatchId } })).status).toBe('recruiting');
  });

  it('끝나지 않은 대회 참가는 막고, 끝난 대회 참가는 막지 않는다', async () => {
    await seedRegistration('open');
    await expect(dissolve()).rejects.toMatchObject({ response: { code: 'TEAM_DISSOLVE_BLOCKED' } });
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { status: 'completed' } });
    await expect(dissolve()).resolves.toMatchObject({ status: 'archived' });
  });

  it('해체하면 혼자 정리할 수 있는 것만 정리하고, 지난 일정은 남긴다', async () => {
    const preview = await dissolution.preview(asUser(ownerId), teamId);
    expect(preview.cleanup).toMatchObject({
      recruitingTeamMatchCount: 1, joinApplicationCount: 1, invitationCount: 1, notifyMemberCount: 2,
    });
    expect(preview.cleanup.upcomingSchedules.map((schedule) => schedule.scheduleId)).toEqual([futureScheduleId]);

    await dissolve();

    const team = await prisma.v1Team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.status).toBe('archived');
    expect(team.deletedAt).not.toBeNull();
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: recruitingMatchId } })).status).toBe('cancelled');
    expect((await prisma.v1TeamMatchApplication.findFirstOrThrow({ where: { teamMatchId: recruitingMatchId } })).status).toBe('rejected');
    expect((await prisma.v1TeamJoinApplication.findFirstOrThrow({ where: { teamId } })).status).toBe('expired');
    expect((await prisma.v1TeamInvitation.findFirstOrThrow({ where: { teamId } })).status).toBe('cancelled');
    expect((await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: futureScheduleId } })).state).toBe('CANCELLED');
    expect((await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: pastScheduleId } })).state).toBe('SCHEDULED');
    expect((await prisma.v1ChatRoom.findUniqueOrThrow({ where: { teamId } })).status).toBe('archived');
    // 팀원 관계는 그대로 둔다 — 복구하면 같은 팀원으로 돌아온다.
    expect(await prisma.v1TeamMembership.count({ where: { teamId, status: 'active' } })).toBe(3);
  });

  it('해체 알림은 팀원(본인 제외)과 신청자에게 가고, 상대 팀 운영진은 팀매치 취소 알림을 받는다', async () => {
    await dissolve();
    const waitFor = async (userId: string, title: string) => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const found = await prisma.v1Notification.findFirst({ where: { recipientUserId: userId, title } });
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return null;
    };
    for (const userId of [managerId, memberId, applicantId]) {
      expect(await waitFor(userId, '팀이 해체됐어요')).toMatchObject({ targetType: 'team', deepLink: `/teams/${teamId}` });
    }
    expect(await waitFor(rivalOwnerId, '팀매치가 취소됐어요')).not.toBeNull();
    expect(await prisma.v1Notification.count({ where: { recipientUserId: ownerId, title: '팀이 해체됐어요' } })).toBe(0);
  });

  it('해체한 팀의 상세·전적은 계속 열리고 목록·내 팀에서는 빠진다', async () => {
    await dissolve();
    const detail = await teams.detail(null, teamId);
    expect(detail.status).toBe('archived');
    expect(detail.viewer.disabledReason).toBe('TEAM_DISSOLVED');
    await expect(records.getRecords(teamId, {})).resolves.toBeDefined();
    const list = await teams.list(null, { limit: 50 });
    expect(list.items.map((item) => item.id)).not.toContain(teamId);
    expect((await teams.myTeams(asUser(memberId), {})).items.map((item) => item.teamId)).not.toContain(teamId);
  });

  it('보관된 팀의 팀장은 회원 탈퇴 차단이 풀린다', async () => {
    await expect(profile.withdrawalRequest(asUser(ownerId), {})).rejects.toMatchObject({
      response: { code: 'WITHDRAWAL_BLOCKED_TEAM_AUTHORITY' },
    });
    await dissolve();
    await expect(profile.withdrawalRequest(asUser(ownerId), {})).resolves.toBeDefined();
  });

  it('30일 안에는 팀장이 복구하고, 취소된 경기는 되살아나지 않으며 채팅방만 다시 열린다', async () => {
    await dissolve();
    await expect(dissolution.restore(asUser(managerId), teamId)).rejects.toMatchObject({ status: 403 });
    await dissolution.restore(asUser(ownerId), teamId);

    const team = await prisma.v1Team.findUniqueOrThrow({ where: { id: teamId } });
    expect(team.status).toBe('active');
    expect(team.deletedAt).toBeNull();
    expect((await prisma.v1ChatRoom.findUniqueOrThrow({ where: { teamId } })).status).toBe('active');
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: recruitingMatchId } })).status).toBe('cancelled');
    expect((await prisma.v1TeamSchedule.findUniqueOrThrow({ where: { id: futureScheduleId } })).state).toBe('CANCELLED');
  });

  it('30일이 지나면 팀장이 복구할 수 없고 해체한 팀 목록에 복구 불가로 남는다', async () => {
    await dissolve();
    await prisma.v1Team.update({ where: { id: teamId }, data: { deletedAt: new Date(Date.now() - 31 * DAY) } });
    await expect(dissolution.restore(asUser(ownerId), teamId)).rejects.toMatchObject({
      response: { code: 'TEAM_RESTORE_WINDOW_EXPIRED' },
    });
    const mine = await dissolution.myDissolvedTeams(asUser(ownerId));
    expect(mine.items.find((item) => item.teamId === teamId)).toMatchObject({ canRestore: false });
  });

  const archiveByOps = () => admin.changeTeamStatus(asUser(opsUserId), teamId, { status: 'archived', reason: '정책 위반' });

  it('운영팀이 보관한 팀은 기간 안에도 팀장이 복구할 수 없고, 목록·상세에 운영팀 보관으로 보인다', async () => {
    await archiveByOps();
    await expect(dissolution.restore(asUser(ownerId), teamId)).rejects.toMatchObject({
      status: 403,
      response: { code: 'TEAM_RESTORE_ADMIN_ONLY' },
    });
    expect((await prisma.v1Team.findUniqueOrThrow({ where: { id: teamId } })).status).toBe('archived');
    const mine = await dissolution.myDissolvedTeams(asUser(ownerId));
    expect(mine.items.find((item) => item.teamId === teamId)).toMatchObject({ archivedBy: 'admin', canRestore: false });
    expect((await teams.detail(asUser(ownerId), teamId)).dissolution).toMatchObject({ archivedBy: 'admin', canRestore: false });
  });

  it('마지막 보관 기록이 기준이다 — 운영팀이 풀어 준 뒤 팀장이 다시 해체하면 직접 복구할 수 있다', async () => {
    await archiveByOps();
    await admin.changeTeamStatus(asUser(opsUserId), teamId, { status: 'active', reason: '복구 요청' });
    await dissolve();
    await expect(dissolution.restore(asUser(ownerId), teamId)).resolves.toMatchObject({ status: 'active' });
  });

  it('운영팀 보관도 막는 조건이 있으면 409 + details.blockers 이고 아무것도 바꾸지 않는다', async () => {
    await seedMatchedFriendly();
    await expect(archiveByOps()).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'TEAM_DISSOLVE_BLOCKED',
        details: { blockers: [{ kind: 'matched_team_match', items: [{ id: matchedMatchId, opponentName: '상대 테스트팀' }] }] },
      },
    });
    expect((await prisma.v1Team.findUniqueOrThrow({ where: { id: teamId } })).status).toBe('active');
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: recruitingMatchId } })).status).toBe('recruiting');
    expect(await prisma.v1AdminActionLog.count({ where: { adminUserId: opsAdminId } })).toBe(0);
  });
});
