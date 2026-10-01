import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createChatSafetyFixture, chatSafetyIds as ids } from '../fixtures/chat-safety';

/**
 * Task 181 ② 일정·매치 공유 — 새 enum 값(`share`)·JSONB 칼럼(`share_card`)이 실제 PostgreSQL 에서
 * 열람 권한 확인 → 스냅숏 저장 → 목록·미리보기까지 이어지는지 본다.
 */
describe('chat share messages with PostgreSQL', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let prisma: PrismaService;
  const base = `/api/v1/chat/rooms/${ids.room}/messages`;
  const ownSchedule = '9a190000-0000-4000-8000-0000000000a1';
  const otherTeam = '9a190000-0000-4000-8000-0000000000a2';
  const otherSchedule = '9a190000-0000-4000-8000-0000000000a3';
  const matchId = '9a190000-0000-4000-8000-0000000000a4';

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await createChatSafetyFixture(prisma);
    const sport = await prisma.v1Sport.findUniqueOrThrow({ where: { code: 'futsal' } });
    const region = await prisma.v1Region.findUniqueOrThrow({ where: { code: 'qa-play-readiness' } });
    const startAt = new Date('2026-10-10T10:00:00Z');
    const endAt = new Date('2026-10-10T12:00:00Z');
    await prisma.v1TeamSchedule.create({ data: { id: ownSchedule, teamId: ids.team, title: '토요일 팀 훈련', type: 'TRAINING', startAt, endAt, timezone: 'Asia/Seoul' } });
    // 보내는 사람(b)이 팀원이 아닌 다른 팀의 비공개 일정
    await prisma.v1Team.create({ data: { id: otherTeam, ownerUserId: ids.outsider, sportId: sport.id, regionId: region.id, name: '다른 QA 팀', memberCount: 1, memberships: { create: [{ userId: ids.outsider, role: 'owner' }] } } });
    await prisma.v1TeamSchedule.create({ data: { id: otherSchedule, teamId: otherTeam, title: '다른 팀 비공개 훈련', type: 'TRAINING', startAt, endAt, timezone: 'Asia/Seoul' } });
    await prisma.v1Match.create({ data: { id: matchId, hostUserId: ids.a, sportId: sport.id, title: '수요일 저녁 풋살', placeName: '성수 풋살파크', startAt, maxParticipants: 10 } });
  });
  afterAll(async () => { await cleanup?.(); });

  it('자기 팀 일정은 카드로 공유되고, 팀원이 아닌 팀의 비공개 일정은 400', async () => {
    const sent = await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ share: { kind: 'team_schedule', targetId: ownSchedule } }).expect(201);
    expect(sent.body.data).toMatchObject({
      messageType: 'share',
      content: '[일정] 토요일 팀 훈련',
      shareCard: { kind: 'team_schedule', targetId: ownSchedule, title: '토요일 팀 훈련', sub: '심사 준비 QA 풋살팀', route: `/teams/${ids.team}/schedules/${ownSchedule}`, place: null },
    });
    await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ share: { kind: 'team_schedule', targetId: otherSchedule } }).expect(400);
    await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ share: { kind: 'bogus', targetId: ownSchedule } }).expect(400);
    // 객체가 아닌 share 는 검증에서 막힌다 — 빈 배열이 ValidateNested 를 통과해 아무 매치나 카드가 되던 구멍(#1398 리뷰).
    await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ share: [] }).expect(400);
    await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ share: 'x' }).expect(400);
  });

  it('매치는 매치 화면 카드로 공유된다', async () => {
    const sent = await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.c).send({ share: { kind: 'match', targetId: matchId } }).expect(201);
    expect(sent.body.data.shareCard).toMatchObject({ kind: 'match', title: '수요일 저녁 풋살', place: '성수 풋살파크', route: `/matches/${matchId}` });
  });

  it('목록엔 shareCard · 채팅 목록 미리보기는 "[매치] 제목"', async () => {
    const list = await request(app.getHttpServer()).get(base).set('x-v1-user-id', ids.a).expect(200);
    const shares = list.body.data.items.filter((m: { messageType: string }) => m.messageType === 'share');
    expect(shares.map((m: { shareCard: { kind: string } }) => m.shareCard.kind).sort()).toEqual(['match', 'team_schedule']);
    const rooms = await request(app.getHttpServer()).get('/api/v1/chat/rooms').set('x-v1-user-id', ids.a).expect(200);
    expect(rooms.body.data.items[0].lastMessage).toMatchObject({ contentPreview: '[매치] 수요일 저녁 풋살' });
  });
});
