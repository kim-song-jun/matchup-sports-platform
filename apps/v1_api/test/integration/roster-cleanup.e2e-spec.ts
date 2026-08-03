/**
 * roster-cleanup.e2e-spec.ts
 *
 * 2026-08-03 프로덕션 사고의 회귀 테스트.
 *
 * 팀 owner 가 멤버를 추방했는데 그 멤버가 **대회 로스터에는 활성으로 남아** 12명 정원 중
 * 한 자리를 계속 차지했다. 팀은 남은 자리가 1개뿐이라 선수 두 명을 추가하지 못했고,
 * 화면에는 원인이 드러나지 않았다. 팀을 벗어나는 경로 세 개(추방·자진이탈·회원탈퇴)가
 * 전부 로스터를 건드리지 않고 있었다.
 *
 * 이 테스트는 **실제 DB 상태**로 계약을 검증한다 — mock 을 검증하면 where 절이 바뀌어도
 * 통과해 버려서 같은 사고를 다시 놓친다.
 */
import type { INestApplication } from '@nestjs/common';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProfileService } from '../../src/profile/profile.service';
import { TeamsService } from '../../src/teams/teams.service';
import { createV1IntegrationApp } from './integration-app';

const PREFIX = 'roster-cleanup-e2e';
const ownerId = `${PREFIX}-owner`;
const memberId = `${PREFIX}-member`;
const teamId = `${PREFIX}-team`;
const sportId = `${PREFIX}-sport`;
const regionId = `${PREFIX}-region`;
const openTournamentId = `${PREFIX}-tournament-open`;
const doneTournamentId = `${PREFIX}-tournament-done`;
const openRegistrationId = `${PREFIX}-reg-open`;
const doneRegistrationId = `${PREFIX}-reg-done`;

const asUser = (id: string): V1AuthUser => ({ id, accountStatus: 'active' }) as V1AuthUser;

describe('대회 로스터 정리 계약 (팀 이탈 경로)', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let teams: TeamsService;
  let profile: ProfileService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    teams = app.get(TeamsService);
    profile = app.get(ProfileService);
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
    await prisma.v1TournamentPlayer.deleteMany({
      where: { registrationId: { in: [openRegistrationId, doneRegistrationId] } },
    });
    await prisma.v1TournamentRegistration.deleteMany({
      where: { id: { in: [openRegistrationId, doneRegistrationId] } },
    });
    await prisma.v1Tournament.deleteMany({
      where: { id: { in: [openTournamentId, doneTournamentId] } },
    });
    await prisma.v1StatusChangeLog.deleteMany({ where: { targetId: { in: [ownerId, memberId] } } });
    await prisma.v1TeamMembership.deleteMany({ where: { teamId } });
    await prisma.v1Team.deleteMany({ where: { id: teamId } });
    await prisma.v1UserProfile.deleteMany({ where: { userId: { in: [ownerId, memberId] } } });
    await prisma.v1User.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
    await prisma.v1Sport.deleteMany({ where: { id: sportId } });
    await prisma.v1Region.deleteMany({ where: { id: regionId } });
  }

  async function seedFixtures() {
    await prisma.v1Sport.create({
      data: { id: sportId, code: `${PREFIX}-futsal`, name: '풋살', isActive: true },
    });
    await prisma.v1Region.create({
      data: { id: regionId, code: `${PREFIX}-region-code`, name: '테스트지역', level: 1 },
    });
    await prisma.v1User.createMany({
      data: [ownerId, memberId].map((id) => ({
        id,
        email: `${id}@integration.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await prisma.v1Team.create({
      data: {
        id: teamId,
        name: '로스터정리 테스트팀',
        sportId,
        regionId,
        ownerUserId: ownerId,
        status: 'active',
        memberCount: 2,
      },
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId, userId: ownerId, role: 'owner', status: 'active' },
        { teamId, userId: memberId, role: 'member', status: 'active' },
      ],
    });

    // 진행 예정 대회(open) — 정리 대상
    await prisma.v1Tournament.create({
      data: {
        id: openTournamentId,
        sportId,
        title: '정리대상 대회',
        status: 'open',
        minPlayers: 1,
        maxPlayers: 12,
        teamCount: 8,
      },
    });
    // 이미 끝난 대회(completed) — 기록 보존 대상
    await prisma.v1Tournament.create({
      data: {
        id: doneTournamentId,
        sportId,
        title: '완료된 대회',
        status: 'completed',
        minPlayers: 1,
        maxPlayers: 12,
        teamCount: 8,
      },
    });

    for (const [registrationId, tournamentId] of [
      [openRegistrationId, openTournamentId],
      [doneRegistrationId, doneTournamentId],
    ] as const) {
      await prisma.v1TournamentRegistration.create({
        data: { id: registrationId, tournamentId, teamId, appliedByUserId: ownerId, status: 'confirmed' },
      });
      await prisma.v1TournamentPlayer.create({
        data: { registrationId, userId: memberId, realName: '테스트멤버' },
      });
    }
  }

  const activeRosterCount = (registrationId: string) =>
    prisma.v1TournamentPlayer.count({ where: { registrationId, userId: memberId, removedAt: null } });

  it('추방하면 진행 예정 대회 로스터에서 빠진다 — 실제 사고 경로', async () => {
    expect(await activeRosterCount(openRegistrationId)).toBe(1);

    const membership = await prisma.v1TeamMembership.findFirstOrThrow({
      where: { teamId, userId: memberId },
    });
    await teams.removeMembership(asUser(ownerId), membership.id, {});

    expect(await activeRosterCount(openRegistrationId)).toBe(0);
  });

  it('추방해도 완료된 대회 기록은 남는다 — 수상·리뷰가 로스터를 참조한다', async () => {
    const membership = await prisma.v1TeamMembership.findFirstOrThrow({
      where: { teamId, userId: memberId },
    });
    await teams.removeMembership(asUser(ownerId), membership.id, {});

    expect(await activeRosterCount(doneRegistrationId)).toBe(1);
  });

  it('자진 팀 탈퇴에서도 로스터가 비워진다', async () => {
    await teams.leaveTeam(asUser(memberId), teamId, {});

    expect(await activeRosterCount(openRegistrationId)).toBe(0);
    expect(await activeRosterCount(doneRegistrationId)).toBe(1);
  });

  it('회원 탈퇴 신청 시 로스터와 팀 멤버십이 함께 정리된다', async () => {
    await profile.withdrawalRequest(asUser(memberId), {});

    expect(await activeRosterCount(openRegistrationId)).toBe(0);
    expect(await activeRosterCount(doneRegistrationId)).toBe(1);

    const membership = await prisma.v1TeamMembership.findFirstOrThrow({
      where: { teamId, userId: memberId },
    });
    expect(membership.status).toBe('left');

    const user = await prisma.v1User.findUniqueOrThrow({ where: { id: memberId } });
    expect(user.accountStatus).toBe('withdrawal_pending');
  });

  it('자리를 비운 뒤에는 정원이 실제로 회복된다 — 사고의 사용자 체감 증상', async () => {
    await prisma.v1Tournament.update({ where: { id: openTournamentId }, data: { maxPlayers: 1 } });

    // 정원 1명에 멤버가 이미 올라가 있으므로 남은 자리는 0.
    expect(await activeRosterCount(openRegistrationId)).toBe(1);

    const membership = await prisma.v1TeamMembership.findFirstOrThrow({
      where: { teamId, userId: memberId },
    });
    await teams.removeMembership(asUser(ownerId), membership.id, {});

    const remaining = await prisma.v1TournamentPlayer.count({
      where: { registrationId: openRegistrationId, removedAt: null },
    });
    expect(remaining).toBe(0);
  });
});
