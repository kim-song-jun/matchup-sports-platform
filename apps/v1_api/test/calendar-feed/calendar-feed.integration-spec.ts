import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const DAY = 24 * 60 * 60 * 1_000;

/** 폰 캘린더 구독: 내 일정만, 불참은 빼고, 취소는 취소로, 주소를 다시 만들면 옛 주소는 못 쓴다. */
describe('캘린더 구독 주소 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  const tag = randomUUID().slice(0, 8);
  const id = (name: string) => `${name}-${tag}`;
  const userA = id('user-a'); // 두 팀 소속
  const userB = id('user-b'); // 팀1만
  const userC = id('user-c'); // 팀 없음
  const users = [userA, userB, userC];
  let team1: string;
  let team2: string;
  let sportId: string;
  let regionId: string;
  const sched: Record<string, string> = {};
  let previousSecret: string | undefined;

  const as = (userId: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('x-v1-user-id', userId),
    post: (url: string) => request(app.getHttpServer()).post(`/api/v1${url}`).set('x-v1-user-id', userId),
  });
  const feedPath = (feedUrl: string) => new URL(feedUrl).pathname;
  const readFeed = (feedUrl: string) => request(app.getHttpServer()).get(feedPath(feedUrl));

  beforeAll(async () => {
    previousSecret = process.env.V1_SESSION_SECRET;
    process.env.V1_SESSION_SECRET = 'calendar-feed-test-secret-0123456789abcdef';
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    await db.v1User.createMany({
      data: users.map((userId) => ({
        id: userId, email: `${userId}@example.test`, accountStatus: 'active', onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    });
    await db.v1UserProfile.createMany({ data: users.map((userId) => ({ userId, nickname: `닉-${userId.slice(0, 6)}` })) });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await Promise.all(users.map((userId) => terms.acceptSignupTerms(userId, required)));
    sportId = (await db.v1Sport.create({ data: { code: `cal-${tag}`, name: '풋살' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `cal-${tag}`, name: '지역', level: 2 } })).id;
    team1 = (await db.v1Team.create({ data: { ownerUserId: userA, sportId, regionId, name: `팀하나-${tag}` } })).id;
    team2 = (await db.v1Team.create({ data: { ownerUserId: userA, sportId, regionId, name: `팀둘-${tag}` } })).id;
    await db.v1TeamMembership.createMany({
      data: [
        { teamId: team1, userId: userA, role: 'owner', status: 'active' },
        { teamId: team1, userId: userB, role: 'member', status: 'active' },
        { teamId: team2, userId: userA, role: 'owner', status: 'active' },
      ],
    });

    const now = Date.now();
    const make = async (key: string, teamId: string, data: { title: string; startOffsetDays: number; state?: 'SCHEDULED' | 'CANCELLED'; type?: 'TRAINING' | 'EVENT' | 'MATCH'; teamMatchId?: string; cancelReason?: string }) => {
      const startAt = new Date(now + data.startOffsetDays * DAY);
      sched[key] = (await db.v1TeamSchedule.create({
        data: {
          teamId, title: data.title, type: data.type ?? 'TRAINING', startAt, endAt: new Date(startAt.getTime() + 2 * 60 * 60 * 1_000),
          timezone: 'Asia/Seoul', state: data.state ?? 'SCHEDULED', teamMatchId: data.teamMatchId ?? null, cancelReason: data.cancelReason ?? null,
        },
      })).id;
    };
    const teamMatch = await db.v1TeamMatch.create({
      data: {
        sportId, regionId, title: `매치-${tag}`, hostTeamId: team1, createdByUserId: userA,
        placeName: '마포 풋살장', startAt: new Date(now + 3 * DAY), status: 'matched',
      },
    });
    await make('training', team1, { title: `팀하나 훈련-${tag}`, startOffsetDays: 2 });
    await make('cancelled', team1, { title: `팀하나 취소-${tag}`, startOffsetDays: 4, state: 'CANCELLED', type: 'EVENT', cancelReason: '우천' });
    await make('notGoing', team1, { title: `팀하나 불참-${tag}`, startOffsetDays: 5 });
    await make('far', team1, { title: `팀하나 먼미래-${tag}`, startOffsetDays: 400 });
    await make('match', team1, { title: `팀하나 경기-${tag}`, startOffsetDays: 3, type: 'MATCH', teamMatchId: teamMatch.id });
    await make('team2', team2, { title: `팀둘 훈련-${tag}`, startOffsetDays: 6 });
    await db.v1ScheduleAttendance.create({ data: { scheduleId: sched.notGoing, userId: userA, status: 'NOT_GOING' } });
    await db.v1ScheduleAttendance.create({ data: { scheduleId: sched.training, userId: userA, status: 'GOING' } });

    const personal = await db.v1Match.create({
      data: { hostUserId: userB, sportId, regionId, title: `개인매치-${tag}`, placeName: '상암 구장', startAt: new Date(now + 7 * DAY), maxParticipants: 10, status: 'recruiting' },
    });
    const cancelledPersonal = await db.v1Match.create({
      data: { hostUserId: userB, sportId, regionId, title: `취소참가-${tag}`, placeName: '상암 구장', startAt: new Date(now + 8 * DAY), maxParticipants: 10, status: 'recruiting' },
    });
    await db.v1MatchParticipant.createMany({
      data: [
        { matchId: personal.id, userId: userA, role: 'participant', status: 'active' },
        { matchId: cancelledPersonal.id, userId: userA, role: 'participant', status: 'cancelled' },
      ],
    });
  });

  afterAll(async () => {
    await db.v1AccessToken.deleteMany({ where: { userId: { in: users } } });
    await db.v1MatchParticipant.deleteMany({ where: { userId: { in: users } } });
    await db.v1Match.deleteMany({ where: { hostUserId: { in: users } } });
    await db.v1TeamSchedule.deleteMany({ where: { teamId: { in: [team1, team2] } } });
    await db.v1TeamMatch.deleteMany({ where: { hostTeamId: team1 } });
    await db.v1Team.deleteMany({ where: { id: { in: [team1, team2] } } });
    await db.v1UserProfile.deleteMany({ where: { userId: { in: users } } });
    await db.v1User.deleteMany({ where: { id: { in: users } } });
    await db.v1Region.delete({ where: { id: regionId } });
    await db.v1Sport.delete({ where: { id: sportId } });
    if (previousSecret === undefined) delete process.env.V1_SESSION_SECRET;
    else process.env.V1_SESSION_SECRET = previousSecret;
    await cleanup?.();
  });

  it('연결 전에는 주소가 없고, 연결하면 .ics 와 webcal 주소가 생기며 몇 번을 눌러도 같은 주소다', async () => {
    const before = await as(userA).get('/me/calendar-feed').expect(200);
    expect(before.body.data).toMatchObject({ connected: false, feedUrl: null, webcalUrl: null });
    const first = (await as(userA).post('/me/calendar-feed').expect(201)).body.data;
    expect(first.connected).toBe(true);
    expect(first.feedUrl).toMatch(/\/api\/v1\/calendar\/feed\/[^/]+\.ics$/);
    expect(first.webcalUrl.startsWith('webcal://')).toBe(true);
    const second = (await as(userA).post('/me/calendar-feed').expect(201)).body.data;
    expect(feedPath(second.feedUrl)).toBe(feedPath(first.feedUrl)); // 요청마다 임시 포트가 달라 경로만 비교한다
    expect(feedPath((await as(userA).get('/me/calendar-feed').expect(200)).body.data.feedUrl)).toBe(feedPath(first.feedUrl));
    await request(app.getHttpServer()).get('/api/v1/me/calendar-feed').expect(401);
  });

  it('로그인 없이 구독 주소로 읽으면 내 일정만 들어 있다: 불참·범위 밖·다른 사람 일정은 빠지고 취소는 취소로 남는다', async () => {
    const { feedUrl } = (await as(userA).post('/me/calendar-feed').expect(201)).body.data;
    const res = await readFeed(feedUrl).expect(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    const ics = res.text;
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    // 두 팀 소속이라 팀 이름이 제목 앞에 붙는다.
    expect(ics).toContain(`SUMMARY:[팀하나-${tag}] 팀하나 훈련-${tag}`);
    expect(ics).toContain(`SUMMARY:[팀둘-${tag}] 팀둘 훈련-${tag}`);
    expect(ics).toContain(`UID:schedule-${sched.training}@teameet.co.kr`);
    expect(ics).not.toContain(`팀하나 불참-${tag}`);
    expect(ics).not.toContain(`팀하나 먼미래-${tag}`);
    const cancelled = ics.split('BEGIN:VEVENT').find((block) => block.includes(`schedule-${sched.cancelled}@`));
    expect(cancelled).toContain('STATUS:CANCELLED');
    expect(cancelled).toContain('우천');
    // 팀 매치 일정은 경기장을 장소로 싣는다.
    expect(ics.split('BEGIN:VEVENT').find((block) => block.includes(`schedule-${sched.match}@`))).toContain('LOCATION:마포 풋살장');
    // 참가 확정한 개인 매치만 들어간다(취소한 참가는 제외).
    expect(ics).toContain(`개인매치-${tag}`);
    expect(ics).not.toContain(`취소참가-${tag}`);
  });

  it('팀 하나뿐인 사람의 구독에는 자기 팀 일정만 있고 팀 이름 머리말은 없다. 불참 표시가 없는 일정은 들어간다', async () => {
    const { feedUrl } = (await as(userB).post('/me/calendar-feed').expect(201)).body.data;
    const ics = (await readFeed(feedUrl).expect(200)).text;
    expect(ics).toContain(`SUMMARY:팀하나 훈련-${tag}`);
    expect(ics).toContain(`SUMMARY:팀하나 불참-${tag}`);
    expect(ics).not.toContain(`팀둘 훈련-${tag}`);
    expect(ics).not.toContain(`개인매치-${tag}`); // 호스트일 뿐 참가자 행이 없다
  });

  it('팀을 나가면 그 팀 일정은 구독에서 빠진다', async () => {
    const { feedUrl } = (await as(userA).post('/me/calendar-feed').expect(201)).body.data;
    await db.v1TeamMembership.updateMany({ where: { teamId: team2, userId: userA }, data: { status: 'left' } });
    const ics = (await readFeed(feedUrl).expect(200)).text;
    expect(ics).not.toContain(`팀둘 훈련-${tag}`);
    expect(ics).toContain(`SUMMARY:팀하나 훈련-${tag}`); // 이제 팀 하나뿐이라 머리말도 없다
    await db.v1TeamMembership.updateMany({ where: { teamId: team2, userId: userA }, data: { status: 'active' } });
  });

  it('주소를 고치거나 다시 만들면 옛 주소는 404, 새 주소는 200 이다', async () => {
    const { feedUrl } = (await as(userC).post('/me/calendar-feed').expect(201)).body.data;
    await readFeed(feedUrl).expect(200);
    await readFeed(feedUrl.replace(/\.[^.]+\.ics$/, '.x.ics')).expect(404);
    await request(app.getHttpServer()).get('/api/v1/calendar/feed/not-a-token.ics').expect(404);
    await request(app.getHttpServer()).get(feedPath(feedUrl).replace(/\.ics$/, '')).expect(404);
    const next = (await as(userC).post('/me/calendar-feed/regenerate').expect(201)).body.data;
    expect(feedPath(next.feedUrl)).not.toBe(feedPath(feedUrl));
    await readFeed(feedUrl).expect(404);
    const fresh = await readFeed(next.feedUrl).expect(200);
    expect(fresh.text).not.toContain('BEGIN:VEVENT'); // 팀도 매치도 없는 사람의 빈 캘린더
    expect(await db.v1AccessToken.count({ where: { userId: userC, revokedAt: null } })).toBe(1);
  });

  it('일정 한 건 내려받기: 팀원은 파일을 받고 외부인은 404, 비로그인은 401', async () => {
    const path = `/teams/${team1}/schedules/${sched.training}/calendar.ics`;
    const res = await as(userB).get(path).expect(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain(`SUMMARY:팀하나 훈련-${tag}`);
    expect(res.text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    await as(userC).get(path).expect(404);
    await request(app.getHttpServer()).get(`/api/v1${path}`).expect(401);
  });
});
