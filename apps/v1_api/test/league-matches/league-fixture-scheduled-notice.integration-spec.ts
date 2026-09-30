import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { formatKstMonthDayTime } from '../../src/common/kst-datetime';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const id = (key: string) => `g7-fixture-notice-${key}-${suiteId}`;
const adminUserId = id('admin');

/** 알림은 응답 뒤에 fire-and-forget 으로 만들어져서, 기대 상태가 될 때까지 짧게 기다린다. */
async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 8_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('리그 대진 확정 알림 — 팀장·매니저 현행 문구 + 시즌 참가 명단 선수의 첫 경기 일정', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const userKeys = ['captain-m', 'player-m1', 'player-m2-removed', 'bench-m', 'captain-h', 'player-h1-muted', 'player-h2'];
    await prisma.v1User.createMany({
      data: [
        { id: adminUserId, email: `${adminUserId}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'), accountStatus: 'active' },
        ...userKeys.map((key) => ({ id: id(key), email: `${id(key)}@integration.test`, onboardingStatus: 'completed' as const, accountStatus: 'active' as const })),
      ],
    });
    await prisma.v1UserProfile.createMany({
      data: userKeys.map((key) => ({ userId: id(key), nickname: `g7-${key}-${suiteId}` })),
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    await termsService.acceptSignupTerms(
      adminUserId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
    await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner' } });
  });

  afterAll(async () => cleanup?.());

  it('팀장·매니저는 현행 "N경기 배정" 문구, 참가 명단 선수는 첫 경기 일정, 빠진 선수·명단 밖 팀원·알림 끈 선수는 받지 않는다', async () => {
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    const region = await prisma.v1Region.create({ data: { code: `g7-region-${suiteId}`, name: 'G7 지역', level: 2 } });
    const teamM = await prisma.v1Team.create({ data: { ownerUserId: id('captain-m'), sportId: sport.id, regionId: region.id, name: `마포 FC ${suiteId}` } });
    const teamH = await prisma.v1Team.create({ data: { ownerUserId: id('captain-h'), sportId: sport.id, regionId: region.id, name: `합정 유나이티드 ${suiteId}` } });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: teamM.id, userId: id('captain-m'), role: 'owner' },
        { teamId: teamM.id, userId: id('player-m1') },
        { teamId: teamM.id, userId: id('player-m2-removed') },
        { teamId: teamM.id, userId: id('bench-m') },
        { teamId: teamH.id, userId: id('captain-h'), role: 'owner' },
        { teamId: teamH.id, userId: id('player-h1-muted') },
        { teamId: teamH.id, userId: id('player-h2') },
      ],
    });
    await prisma.v1NotificationPreference.create({ data: { userId: id('player-h1-muted'), teamMatchEnabled: false } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', adminUserId)
      .send({
        title: '마포 주말 리그',
        sportId: sport.id,
        regionId: region.id,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 7 * 86_400_000).toISOString(),
        teamIds: [teamM.id, teamH.id],
      });
    expect(createRes.status).toBe(201);
    const leagueId = createRes.body.data.leagueId as string;

    const registrations = await prisma.v1TournamentRegistration.findMany({ where: { tournamentId: leagueId } });
    const registrationOf = (teamId: string) => registrations.find((row) => row.teamId === teamId)!.id;
    await prisma.v1TournamentPlayer.createMany({
      data: [
        // 팀장도 시즌 참가 명단 선수 — 팀장 문구 1건만 받아야 한다.
        { registrationId: registrationOf(teamM.id), userId: id('captain-m'), realName: '마포 팀장' },
        { registrationId: registrationOf(teamM.id), userId: id('player-m1'), realName: '마포 선수' },
        { registrationId: registrationOf(teamM.id), userId: id('player-m2-removed'), realName: '빠진 선수', removedAt: new Date() },
        { registrationId: registrationOf(teamH.id), userId: id('player-h1-muted'), realName: '알림 끈 선수' },
        { registrationId: registrationOf(teamH.id), userId: id('player-h2'), realName: '합정 선수' },
      ],
    });

    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + 7 * 86_400_000));
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', adminUserId)
      .send({ weeksCount: 1, schedule: { dates: [day], time: '01:10' } });
    expect(fixturesRes.status).toBe(201);
    const fixture = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixturesRes.body.data.teamMatchIds[0] } });
    const firstGameAt = formatKstMonthDayTime(fixture.startAt!);

    const notificationsOf = (userId: string) =>
      prisma.v1Notification.findMany({ where: { recipientUserId: userId, targetId: leagueId } });
    const expectedRecipients = [id('captain-m'), id('captain-h'), id('player-m1'), id('player-h2')];
    await waitFor(
      () => prisma.v1Notification.count({ where: { targetId: leagueId, recipientUserId: { in: expectedRecipients } } }),
      (count) => count >= expectedRecipients.length,
    );
    // 못 받아야 하는 사람은 잠시 더 기다린 뒤에 확인한다 — 늦게 도착하는 알림을 놓치지 않으려는 것이다.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const captainM = await notificationsOf(id('captain-m'));
    expect(captainM).toHaveLength(1);
    expect(captainM[0]).toMatchObject({
      title: '리그 대진이 확정됐어요',
      body: '"마포 주말 리그" 리그 대진이 확정됐어요. 이번 시즌 1경기가 배정됐어요.',
      deepLink: `/league-matches/${leagueId}`,
    });

    const playerM1 = await notificationsOf(id('player-m1'));
    expect(playerM1).toHaveLength(1);
    expect(playerM1[0].title).toBe('리그 대진이 확정됐어요');
    expect(playerM1[0].body).toContain(`"마포 주말 리그" 첫 경기는 ${firstGameAt}, 합정 유나이티드 ${suiteId}`);
    expect(playerM1[0].deepLink).toBe(`/league-matches/${leagueId}`);

    const playerH2 = await notificationsOf(id('player-h2'));
    expect(playerH2).toHaveLength(1);
    expect(playerH2[0].body).toContain(`첫 경기는 ${firstGameAt}, 마포 FC ${suiteId}`);

    expect(await notificationsOf(id('captain-h'))).toHaveLength(1);
    expect(await notificationsOf(id('player-m2-removed'))).toHaveLength(0); // 명단에서 빠진 선수
    expect(await notificationsOf(id('bench-m'))).toHaveLength(0); // 참가 명단에 없는 팀원
    expect(await notificationsOf(id('player-h1-muted'))).toHaveLength(0); // 경기·대회 알림을 끈 선수
  });
});
