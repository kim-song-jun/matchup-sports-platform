import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createChatSafetyFixture, chatSafetyIds as ids } from '../fixtures/chat-safety';

type RowStatus = 'active' | 'cancelled' | 'removed';

describe('personal-match chat: listed rooms always open, sending is gated separately (PostgreSQL)', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string | null;
  const users = [ids.a, ids.b, ids.c, ids.outsider];

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await createChatSafetyFixture(prisma);
    const team = await prisma.v1Team.findUniqueOrThrow({ where: { id: ids.team } });
    sportId = team.sportId;
    regionId = team.regionId;
  });
  afterAll(async () => { await cleanup?.(); });

  const http = () => request(app.getHttpServer());
  const as = (userId: string) => ({
    list: async () => (await http().get('/api/v1/chat/rooms').set('x-v1-user-id', userId).expect(200)).body.data.items as { roomId: string }[],
    detail: (roomId: string) => http().get(`/api/v1/chat/rooms/${roomId}`).set('x-v1-user-id', userId),
    messages: (roomId: string) => http().get(`/api/v1/chat/rooms/${roomId}/messages`).set('x-v1-user-id', userId),
    send: (roomId: string) => http().post(`/api/v1/chat/rooms/${roomId}/messages`).set('x-v1-user-id', userId).send({ content: '안녕하세요' }),
  });

  /** Host ids.a (own host row unless omitted). `others` are extra match participants who also sit in the chat room. */
  async function room(title: string, opts: {
    status: 'recruiting' | 'cancelled';
    others?: { userId: string; role?: 'participant'; status: RowStatus; application?: 'approved' | 'withdrawn' | 'cancelled_by_host' }[];
  }) {
    const match = await prisma.v1Match.create({ data: {
      hostUserId: ids.a, sportId, regionId, title, placeName: 'Read-only QA Court', startAt: new Date('2030-01-01T12:00:00Z'),
      maxParticipants: 10, status: opts.status,
      participants: { create: { userId: ids.a, role: 'host', status: 'active' } },
    } });
    // MatchesService.cancel leaves the approved application untouched; withdraw/remove set their own status.
    for (const other of opts.others ?? []) {
      const application = other.application
        ? await prisma.v1MatchApplication.create({ data: { matchId: match.id, applicantUserId: other.userId, status: other.application } })
        : null;
      await prisma.v1MatchParticipant.create({ data: {
        matchId: match.id, userId: other.userId, role: 'participant', status: other.status, applicationId: application?.id,
      } });
    }
    const created = await prisma.v1ChatRoom.create({ data: {
      matchId: match.id,
      participants: { create: [ids.a, ...(opts.others ?? []).map((other) => other.userId)]
        .map((userId) => ({ userId, visibleFromAt: new Date('2020-01-01') })) },
    } });
    return created.id;
  }

  let hostAlone: string;
  let hostWithConfirmed: string;
  let cancelledWithConfirmed: string;
  let cancelledNobodyLeft: string;
  let removedParticipant: string;
  let cancelledByMatch: string;
  let cancelledWithdrewBefore: string;
  let cancelledNoRoom: string;
  let recruitingNoRoom: string;

  beforeAll(async () => {
    hostAlone = await room('Host alone', { status: 'recruiting' });
    hostWithConfirmed = await room('Host with confirmed', { status: 'recruiting', others: [{ userId: ids.b, status: 'active' }] });
    cancelledWithConfirmed = await room('Cancelled, b still holds the row', { status: 'cancelled', others: [{ userId: ids.b, status: 'active' }] });
    cancelledNobodyLeft = await room('Cancelled, b withdrew', { status: 'cancelled', others: [{ userId: ids.b, status: 'cancelled', application: 'withdrawn' }] });
    removedParticipant = await room('c was removed', { status: 'recruiting', others: [{ userId: ids.b, status: 'active' }, { userId: ids.c, status: 'removed', application: 'cancelled_by_host' }] });
    cancelledByMatch = await room('Cancelled by host, b cancelled with it, c withdrew first', { status: 'cancelled', others: [
      { userId: ids.b, status: 'cancelled', application: 'approved' },
      { userId: ids.c, status: 'cancelled', application: 'withdrawn' },
    ] });
    cancelledWithdrewBefore = cancelledNobodyLeft;
    cancelledNoRoom = (await prisma.v1Match.create({ data: {
      hostUserId: ids.a, sportId, regionId, title: 'Cancelled without room', placeName: 'Court', startAt: new Date('2030-01-01T12:00:00Z'),
      maxParticipants: 10, status: 'cancelled', participants: { create: { userId: ids.a, role: 'host', status: 'active' } },
    } })).id;
    recruitingNoRoom = (await prisma.v1Match.create({ data: {
      hostUserId: ids.a, sportId, regionId, title: 'Recruiting without room', placeName: 'Court', startAt: new Date('2030-01-01T12:00:00Z'),
      maxParticipants: 10, status: 'recruiting', participants: { create: { userId: ids.a, role: 'host', status: 'active' } },
    } })).id;
  });

  it('every room the list returns opens through detail and messages (pair assertion, all users)', async () => {
    for (const userId of users) {
      const api = as(userId);
      for (const { roomId } of await api.list()) {
        await api.detail(roomId).expect(200);
        await api.messages(roomId).expect(200);
      }
    }
  });

  it('control: each fixture room is listed for exactly the users who may read it', async () => {
    const listed = async (userId: string) => (await as(userId).list()).map((item) => item.roomId);
    const host = await listed(ids.a);
    expect(host).toEqual(expect.arrayContaining([hostAlone, hostWithConfirmed, cancelledWithConfirmed, cancelledNobodyLeft, removedParticipant]));
    const b = await listed(ids.b);
    expect(b).toEqual(expect.arrayContaining([hostWithConfirmed, cancelledWithConfirmed, removedParticipant]));
    expect(b).not.toContain(cancelledNobodyLeft);
    expect(b).not.toContain(hostAlone);
    expect(await listed(ids.c)).not.toContain(removedParticipant);
    expect(await listed(ids.outsider)).toEqual([]);
  });

  it('host without a confirmed participant: opens read-only, send is 409 MATCH_CHAT_PARTICIPANTS_REQUIRED', async () => {
    const api = as(ids.a);
    expect((await api.detail(hostAlone).expect(200)).body.data.composer)
      .toEqual({ canSend: false, blockedReason: 'PARTICIPANTS_NOT_CONFIRMED' });
    await api.messages(hostAlone).expect(200);
    expect((await api.send(hostAlone).expect(409)).body.code).toBe('MATCH_CHAT_PARTICIPANTS_REQUIRED');
  });

  it('host with a confirmed participant: sendable for both sides', async () => {
    for (const userId of [ids.a, ids.b]) {
      expect((await as(userId).detail(hostWithConfirmed).expect(200)).body.data.composer).toEqual({ canSend: true, blockedReason: null });
    }
    await as(ids.b).send(hostWithConfirmed).expect(201);
    await as(ids.a).send(hostWithConfirmed).expect(201);
  });

  it('cancelled match: read-only for the host and for a participant who still holds the row, send is 409 MATCH_CHAT_CLOSED', async () => {
    for (const userId of [ids.a, ids.b]) {
      const api = as(userId);
      expect((await api.detail(cancelledWithConfirmed).expect(200)).body.data.composer)
        .toEqual({ canSend: false, blockedReason: 'MATCH_CANCELLED' });
      await api.messages(cancelledWithConfirmed).expect(200);
      expect((await api.send(cancelledWithConfirmed).expect(409)).body.code).toBe('MATCH_CHAT_CLOSED');
    }
  });

  it('withdrawn, removed and unrelated users: neither listed nor openable', async () => {
    await as(ids.b).detail(cancelledNobodyLeft).expect(403);
    await as(ids.c).detail(removedParticipant).expect(403);
    await as(ids.c).messages(removedParticipant).expect(403);
    await as(ids.c).send(removedParticipant).expect(403);
    await as(ids.outsider).detail(hostWithConfirmed).expect(403);
  });

  it('cancelled match: a guest cancelled together with the match reads read-only; one who withdrew first, and unrelated users, cannot', async () => {
    const b = as(ids.b);
    expect((await b.list()).map((item) => item.roomId)).toContain(cancelledByMatch);
    expect((await b.detail(cancelledByMatch).expect(200)).body.data.composer).toEqual({ canSend: false, blockedReason: 'MATCH_CANCELLED' });
    await b.messages(cancelledByMatch).expect(200);
    expect((await b.send(cancelledByMatch).expect(409)).body.code).toBe('MATCH_CHAT_CLOSED');

    const c = as(ids.c);
    expect((await c.list()).map((item) => item.roomId)).not.toContain(cancelledByMatch);
    await c.detail(cancelledByMatch).expect(403);
    await c.messages(cancelledByMatch).expect(403);
    expect((await as(ids.outsider).list()).map((item) => item.roomId)).not.toContain(cancelledByMatch);
    await as(ids.outsider).detail(cancelledByMatch).expect(403);
    await as(ids.b).detail(cancelledWithdrewBefore).expect(403);
  });

  it('resolve: no room is created for a cancelled match or a host without confirmed participants, but an existing room still opens', async () => {
    const resolve = (targetId: string, userId = ids.a) =>
      http().post('/api/v1/chat/rooms/resolve').set('x-v1-user-id', userId).send({ targetType: 'match', targetId });
    expect((await resolve(cancelledNoRoom).expect(409)).body.code).toBe('MATCH_CHAT_CLOSED');
    expect((await resolve(recruitingNoRoom).expect(409)).body.code).toBe('MATCH_CHAT_PARTICIPANTS_REQUIRED');
    expect(await prisma.v1ChatRoom.count({ where: { matchId: { in: [cancelledNoRoom, recruitingNoRoom] } } })).toBe(0);

    const existing = await prisma.v1ChatRoom.findFirstOrThrow({ where: { id: cancelledByMatch } });
    const reopened = await resolve(existing.matchId!, ids.b).expect(201);
    expect(reopened.body.data).toMatchObject({ roomId: cancelledByMatch, created: false });
  });
});
