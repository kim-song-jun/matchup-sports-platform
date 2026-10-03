import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ensurePlatformTeamMatchChat } from '../../src/chat/platform-team-match-chat';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createChatSafetyFixture, chatSafetyIds as ids } from '../fixtures/chat-safety';

describe('platform team match chat with PostgreSQL', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let prisma: PrismaService;
  let matchId: string;
  let roomId: string;
  let awayTeamId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await createChatSafetyFixture(prisma);
    await prisma.v1AdminUser.create({ data: { userId: ids.outsider, adminRole: 'ops' } });
    const home = await prisma.v1Team.findUniqueOrThrow({ where: { id: ids.team } });
    const away = await prisma.v1Team.create({ data: {
      ownerUserId: ids.b, sportId: home.sportId, regionId: home.regionId, name: 'Chat QA Away',
      memberships: { create: [{ userId: ids.b, role: 'owner' }] },
    } });
    awayTeamId = away.id;
    const match = await prisma.v1TeamMatch.create({ data: {
      title: 'Platform chat QA', sportId: home.sportId, regionId: home.regionId,
      placeName: 'Chat QA Court', startAt: new Date('2030-01-01T12:00:00Z'),
      platformManaged: true, createdByUserId: ids.outsider,
    } });
    matchId = match.id;
  });
  afterAll(async () => { await cleanup?.(); });

  const http = () => request(app.getHttpServer());
  const rooms = (userId: string) => http().get('/api/v1/chat/rooms').set('x-v1-user-id', userId);
  const send = (userId: string) => http().post(`/api/v1/chat/rooms/${roomId}/messages`)
    .set('x-v1-user-id', userId).send({ content: 'Platform chat message' });

  it('creates an operator-only room before any team is assigned and prohibits operator exit', async () => {
    await prisma.$transaction((tx) => ensurePlatformTeamMatchChat(tx, matchId));
    const room = await prisma.v1ChatRoom.findUniqueOrThrow({ where: { teamMatchId: matchId } });
    roomId = room.id;
    expect(await prisma.v1ChatRoomParticipant.findMany({ where: { chatRoomId: roomId } }))
      .toEqual([expect.objectContaining({ userId: ids.outsider, status: 'active' })]);
    expect((await rooms(ids.outsider).expect(200)).body.data.items)
      .toContainEqual(expect.objectContaining({ roomId }));
    await send(ids.outsider).expect(201);
    await http().post(`/api/v1/chat/rooms/${roomId}/leave`).set('x-v1-user-id', ids.outsider)
      .send({}).expect(403);
    await send(ids.a).expect(403);
  });

  it('joins approved HOME before AWAY; after finalization both team owners receive messages', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.v1TeamMatch.update({ where: { id: matchId }, data: { hostTeamId: ids.team } });
      await ensurePlatformTeamMatchChat(tx, matchId);
    });
    await send(ids.a).expect(201);
    await send(ids.b).expect(403);
    await send(ids.c).expect(403);
    await prisma.$transaction(async (tx) => {
      await tx.v1TeamMatch.update({ where: { id: matchId }, data: { approvedApplicantTeamId: awayTeamId, status: 'matched' } });
      await ensurePlatformTeamMatchChat(tx, matchId);
    });
    expect((await rooms(ids.b).expect(200)).body.data.items).toContainEqual(expect.objectContaining({ roomId }));
    await send(ids.outsider).expect(201);
    expect(await prisma.v1Notification.count({ where: { targetId: roomId, recipientUserId: { in: [ids.a, ids.b] } } })).toBeGreaterThanOrEqual(2);
    await send(ids.b).expect(201);
  });

  it('backfills missing rooms twice without changing existing history, preferences or team exits', async () => {
    const original = await prisma.v1ChatRoom.findUniqueOrThrow({ where: { id: roomId } });
    const messages = await prisma.v1ChatMessage.count({ where: { chatRoomId: roomId } });
    const pinnedAt = new Date('2026-01-01');
    await prisma.v1ChatRoomParticipant.update({
      where: { chatRoomId_userId: { chatRoomId: roomId, userId: ids.a } },
      data: { pinnedAt, status: 'left', leftAt: new Date() },
    });
    const legacy = await prisma.v1TeamMatch.create({ data: {
      title: 'Legacy platform chat QA', sportId: (await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: matchId } })).sportId,
      platformManaged: true, createdByUserId: ids.outsider, hostTeamId: ids.team, approvedApplicantTeamId: awayTeamId, status: 'completed',
      regionId: (await prisma.v1Team.findUniqueOrThrow({ where: { id: ids.team } })).regionId,
      placeName: 'Legacy Chat QA Court', startAt: new Date('2026-01-01T12:00:00Z'),
    } });
    const sql = readFileSync(resolve(__dirname, '../../prisma/migrations/20261002110000_v1_platform_team_match_chat_backfill/migration.sql'), 'utf8');
    const statements = sql.replace(/^\s*--.*$/gm, '').split(';').map((s) => s.trim()).filter((s) => s && !['BEGIN', 'COMMIT'].includes(s));
    for (let i = 0; i < 2; i++) await prisma.$transaction(async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });
    expect(await prisma.v1ChatRoom.findUniqueOrThrow({ where: { id: roomId } })).toEqual(original);
    expect(await prisma.v1ChatMessage.count({ where: { chatRoomId: roomId } })).toBe(messages);
    expect(await prisma.v1ChatRoomParticipant.findUniqueOrThrow({ where: { chatRoomId_userId: { chatRoomId: roomId, userId: ids.a } } }))
      .toMatchObject({ status: 'left', pinnedAt });
    const legacyRoom = await prisma.v1ChatRoom.findUniqueOrThrow({ where: { teamMatchId: legacy.id } });
    expect(await prisma.v1ChatRoomParticipant.count({ where: { chatRoomId: legacyRoom.id } })).toBe(3);
  });

  it('revoking operator access removes their room and blocks send/resolve even with a persisted participant', async () => {
    await prisma.v1AdminUser.update({ where: { userId: ids.outsider }, data: { revokedAt: new Date() } });
    expect((await rooms(ids.outsider).expect(200)).body.data.items).not.toContainEqual(expect.objectContaining({ roomId }));
    await send(ids.outsider).expect(403);
    await http().post('/api/v1/chat/rooms/resolve').set('x-v1-user-id', ids.outsider)
      .send({ targetType: 'team_match', targetId: matchId }).expect(403);
    await prisma.v1TeamMatch.update({ where: { id: matchId }, data: { status: 'cancelled' } });
    await send(ids.b).expect(403);
  });
});
