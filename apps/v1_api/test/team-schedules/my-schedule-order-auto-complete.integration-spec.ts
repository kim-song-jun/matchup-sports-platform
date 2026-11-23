import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request = require('supertest');
import { completeEndedSchedules } from '../../src/jobs/team-schedule-auto-complete/team-schedule-auto-complete.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const DAY = 24 * 60 * 60 * 1_000;
const HOUR = 60 * 60 * 1_000;

/** 내 일정: 예정(가까운 순) → 완료(최근 순) → 취소됨(최근 순). 끝난 지 24시간 지난 「예정」 훈련·모임은 알림 없이 완료로 바뀐다. */
describe('내 일정 정렬과 지난 예정 자동 완료', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let db: PrismaService;
  const tag = randomUUID().slice(0, 8);
  const userOrder = `ord-${tag}`;
  const userAuto = `auto-${tag}`;
  const users = [userOrder, userAuto];
  let teamOrder: string;
  let teamAuto: string;
  let sportId: string;
  let regionId: string;
  const ids: Record<string, string> = {};

  const as = (userId: string) => ({ get: (url: string) => request(app.getHttpServer()).get(`/api/v1${url}`).set('x-v1-user-id', userId) });
  const make = async (key: string, teamId: string, offsetMs: number, state: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED', extra: Partial<Prisma.V1TeamScheduleUncheckedCreateInput> = {}) => {
    const startAt = new Date(Date.now() + offsetMs);
    ids[key] = (await db.v1TeamSchedule.create({
      data: { teamId, title: `${key}-${tag}`, type: 'TRAINING', startAt, endAt: new Date(startAt.getTime() + 2 * HOUR), timezone: 'Asia/Seoul', state, ...extra },
    })).id;
  };
  const titles = (items: Array<{ title: string }>) => items.map((item) => item.title.replace(`-${tag}`, ''));

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    db = app.get(PrismaService);
    await db.v1User.createMany({
      data: users.map((userId) => ({ id: userId, email: `${userId}@example.test`, accountStatus: 'active', onboardingStatus: 'completed', phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z') })),
    });
    await db.v1UserProfile.createMany({ data: users.map((userId) => ({ userId, nickname: `닉-${userId.slice(0, 6)}` })) });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await Promise.all(users.map((userId) => terms.acceptSignupTerms(userId, required)));
    sportId = (await db.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    regionId = (await db.v1Region.create({ data: { code: `ord-${tag}`, name: '지역', level: 2 } })).id;
    teamOrder = (await db.v1Team.create({ data: { ownerUserId: userOrder, sportId, regionId, name: `정렬팀-${tag}` } })).id;
    teamAuto = (await db.v1Team.create({ data: { ownerUserId: userAuto, sportId, regionId, name: `자동팀-${tag}` } })).id;
    await db.v1TeamMembership.createMany({
      data: [
        { teamId: teamOrder, userId: userOrder, role: 'owner', status: 'active' },
        { teamId: teamAuto, userId: userAuto, role: 'owner', status: 'active' },
      ],
    });
    // 정렬: 섞어서 만든다(만든 순서와 보이는 순서가 달라야 의미가 있다).
    await make('cancel-old', teamOrder, -8 * DAY, 'CANCELLED');
    await make('up-3d', teamOrder, 3 * DAY, 'SCHEDULED');
    await make('done-old', teamOrder, -10 * DAY, 'COMPLETED');
    await make('up-1d', teamOrder, 1 * DAY, 'SCHEDULED');
    await make('cancel-new', teamOrder, -1 * DAY, 'CANCELLED');
    await make('done-new', teamOrder, -2 * DAY, 'COMPLETED');
    await make('up-2d', teamOrder, 2 * DAY, 'SCHEDULED');
    // 자동 완료: 오래전에 끝난 훈련·모임 / 끝난 지 24시간이 안 된 훈련 / 오래전 팀 매치형 일정 / 이미 취소된 것.
    await make('old-training', teamAuto, -5 * DAY, 'SCHEDULED');
    await make('old-event', teamAuto, -4 * DAY, 'SCHEDULED', { type: 'EVENT' });
    await make('recent-training', teamAuto, -3 * HOUR, 'SCHEDULED');
    await make('old-match', teamAuto, -6 * DAY, 'SCHEDULED', { type: 'MATCH' });
    await make('old-cancelled', teamAuto, -7 * DAY, 'CANCELLED');
    await db.v1ScheduleGuestRecruitment.create({ data: { scheduleId: ids['old-training'], slots: 2, closesAt: new Date(Date.now() - 6 * DAY) } });
  });

  afterAll(async () => {
    await db.v1TeamSchedule.deleteMany({ where: { teamId: { in: [teamOrder, teamAuto] } } });
    await db.v1Team.deleteMany({ where: { id: { in: [teamOrder, teamAuto] } } });
    await db.v1UserProfile.deleteMany({ where: { userId: { in: users } } });
    await db.v1User.deleteMany({ where: { id: { in: users } } });
    await db.v1Region.delete({ where: { id: regionId } });
    await cleanup?.();
  });

  it('전체: 예정은 가까운 순 → 완료는 최근 순 → 취소됨은 최근 순', async () => {
    const res = await as(userOrder).get('/me/schedule?limit=50').expect(200);
    expect(titles(res.body.data.items)).toEqual(['up-1d', 'up-2d', 'up-3d', 'done-new', 'done-old', 'cancel-new', 'cancel-old']);
    expect(res.body.data.nextCursor).toBeNull();
  });

  it('쪽을 넘겨 가며 읽어도 같은 순서이고 묶음 경계에서 빠지거나 겹치지 않는다', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const res: request.Response = await as(userOrder).get(`/me/schedule?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`).expect(200);
      seen.push(...titles(res.body.data.items));
      cursor = res.body.data.nextCursor;
      if (cursor === null) break;
    }
    expect(seen).toEqual(['up-1d', 'up-2d', 'up-3d', 'done-new', 'done-old', 'cancel-new', 'cancel-old']);
  });

  it('상태 탭: 예정은 가까운 순, 완료·취소됨은 최근 순, 옛 커서(id 만)도 받는다', async () => {
    expect(titles((await as(userOrder).get('/me/schedule?status=scheduled').expect(200)).body.data.items)).toEqual(['up-1d', 'up-2d', 'up-3d']);
    expect(titles((await as(userOrder).get('/me/schedule?status=completed').expect(200)).body.data.items)).toEqual(['done-new', 'done-old']);
    expect(titles((await as(userOrder).get('/me/schedule?status=cancelled').expect(200)).body.data.items)).toEqual(['cancel-new', 'cancel-old']);
    const first = await as(userOrder).get('/me/schedule?status=scheduled&limit=1').expect(200);
    const legacy = await as(userOrder).get(`/me/schedule?status=scheduled&limit=5&cursor=${ids['up-1d']}`).expect(200);
    expect(titles(first.body.data.items)).toEqual(['up-1d']);
    expect(titles(legacy.body.data.items)).toEqual(['up-2d', 'up-3d']);
  });

  it('끝난 지 24시간이 지난 훈련·모임만 알림 없이 완료로 바꾸고, 팀 매치형·최근 일정·취소는 그대로 둔다', async () => {
    const outboxBefore = await db.v1OutboxEvent.count();
    const guestBefore = await db.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { scheduleId: ids['old-training'] } });
    expect(guestBefore.state).toBe('OPEN');

    const done = await db.$transaction((tx) => completeEndedSchedules(tx, new Date()));
    expect(done).toBe(2);
    const state = async (key: string) => (await db.v1TeamSchedule.findUniqueOrThrow({ where: { id: ids[key] } }));
    expect((await state('old-training')).state).toBe('COMPLETED');
    expect((await state('old-event')).state).toBe('COMPLETED');
    expect((await state('old-training')).version).toBe(1);
    expect((await state('recent-training')).state).toBe('SCHEDULED');
    expect((await state('old-match')).state).toBe('SCHEDULED');
    expect((await state('old-cancelled')).state).toBe('CANCELLED');
    // 직접 완료 처리할 때처럼 열린 용병 모집은 닫는다. 알림 행은 만들지 않는다.
    expect((await db.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { scheduleId: ids['old-training'] } })).state).toBe('CLOSED');
    expect(await db.v1OutboxEvent.count()).toBe(outboxBefore);

    // 다시 돌려도 더 바뀌지 않는다.
    expect(await db.$transaction((tx) => completeEndedSchedules(tx, new Date()))).toBe(0);
    // 내 일정에서도 완료 묶음으로 내려간다.
    const items = (await as(userAuto).get('/me/schedule').expect(200)).body.data.items as Array<{ title: string; state: string }>;
    expect(titles(items)).toEqual(['old-match', 'recent-training', 'old-event', 'old-training', 'old-cancelled']);
    expect(items.map((item) => item.state)).toEqual(['SCHEDULED', 'SCHEDULED', 'COMPLETED', 'COMPLETED', 'CANCELLED']);
  });
});
