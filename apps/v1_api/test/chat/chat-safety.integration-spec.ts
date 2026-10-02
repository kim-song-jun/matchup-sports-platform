import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { RealtimeGateway } from '../../src/realtime/realtime.gateway';
import { WebPushService } from '../../src/notifications/web-push.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createChatSafetyFixture, chatSafetyIds as ids } from '../fixtures/chat-safety';

describe('chat safety HTTP with PostgreSQL', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let prisma: PrismaService;
  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await createChatSafetyFixture(prisma);
  });
  afterAll(async () => { await cleanup?.(); });
  const base = `/api/v1/chat/rooms/${ids.room}/messages`;

  it('authenticates, validates report input, rejects nonmembers and self reports', async () => {
    await request(app.getHttpServer()).post(`${base}/${ids.message}/report`).send({ reason: 'spam' }).expect(401);
    await request(app.getHttpServer()).post(`${base}/${ids.message}/report`).set('x-v1-user-id', ids.a).send({ reason: 'bogus' }).expect(400);
    await request(app.getHttpServer()).post(`${base}/${ids.message}/block`).set('x-v1-user-id', ids.outsider).send({}).expect(403);
    await request(app.getHttpServer()).post(`${base}/${ids.message}/report`).set('x-v1-user-id', ids.b).send({ reason: 'spam' }).expect(400);
  });
  it('persists a server-owned report snapshot and operator delivery outbox', async () => {
    const result = await request(app.getHttpServer()).post(`${base}/${ids.message}/report`).set('x-v1-user-id', ids.a).send({ reason: 'harassment', detail: 'QA 접수 테스트' }).expect(201);
    const inquiry = await prisma.v1Inquiry.findUniqueOrThrow({ where: { id: result.body.data.inquiryId } });
    expect(inquiry.relatedId).toBe(ids.b);
    expect(inquiry.body).toContain('이번 주 토요일 풋살');
    expect(inquiry.reportReason).toBe('harassment');
    expect(await prisma.v1OutboxEvent.count({ where: { aggregateId: inquiry.id } })).toBe(1);
  });
  it('blocks both directions for history, previews, unread counts, realtime and push; other members still receive', async () => {
    await request(app.getHttpServer()).post(`${base}/${ids.message}/block`).set('x-v1-user-id', ids.a).send({}).expect(201);
    const hidden = await request(app.getHttpServer()).get(base).set('x-v1-user-id', ids.a).expect(200);
    expect(hidden.body.data.items).toHaveLength(0);
    const rooms = await request(app.getHttpServer()).get('/api/v1/chat/rooms').set('x-v1-user-id', ids.a).expect(200);
    expect(rooms.body.data.items[0]).toMatchObject({ lastMessage: null, unreadCount: 0 });
    const events = jest.spyOn(app.get(RealtimeGateway), 'emitToUser');
    const pushes = jest.spyOn(app.get(WebPushService), 'sendToUser');
    await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ content: '차단 후 새 메시지' }).expect(201);
    expect(events.mock.calls.some(([id, event]) => id === ids.a && event === 'chat:message')).toBe(false);
    expect(events.mock.calls.some(([id, event]) => id === ids.c && event === 'chat:message')).toBe(true);
    expect(pushes.mock.calls.some(([id]) => id === ids.a)).toBe(false);
    expect(await prisma.v1Notification.count({ where: { recipientUserId: ids.a, targetId: ids.room } })).toBe(0);
    await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.a).send({ content: '반대 방향 메시지' }).expect(201);
    const reverse = await request(app.getHttpServer()).get(base).set('x-v1-user-id', ids.b).expect(200);
    expect(reverse.body.data.items.some((m: { content: string }) => m.content === '반대 방향 메시지')).toBe(false);
    expect(reverse.body.data.items.find((m: { content: string }) => m.content === '차단 후 새 메시지').unreadCount).toBe(1);
    events.mockRestore(); pushes.mockRestore();
  });
  it('only permits the blocking user to undo their block and restores history after unblock', async () => {
    await request(app.getHttpServer()).delete(`/api/v1/chat/blocked-users/${ids.b}`).set('x-v1-user-id', ids.c).expect(200);
    expect(await prisma.v1ChatUserBlock.count()).toBe(1);
    const list = await request(app.getHttpServer()).get('/api/v1/chat/blocked-users').set('x-v1-user-id', ids.a).expect(200);
    expect(list.body.data.items[0].userId).toBe(ids.b);
    const events = jest.spyOn(app.get(RealtimeGateway), 'emitToUser');
    await request(app.getHttpServer()).delete(`/api/v1/chat/blocked-users/${ids.b}`).set('x-v1-user-id', ids.a).expect(200);
    expect(events).toHaveBeenCalledWith(ids.a, 'chat:safety-changed', {});
    expect(events).toHaveBeenCalledWith(ids.b, 'chat:safety-changed', {});
    events.mockRestore();
    const restored = await request(app.getHttpServer()).get(base).set('x-v1-user-id', ids.a).expect(200);
    expect(restored.body.data.items.some((m: { messageId: string }) => m.messageId === ids.message)).toBe(true);
  });
});
