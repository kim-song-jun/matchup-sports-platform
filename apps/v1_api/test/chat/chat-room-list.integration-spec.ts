import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createChatSafetyFixture, chatSafetyIds as ids } from '../fixtures/chat-safety';

describe('chat room list ordering and visibility with PostgreSQL', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string | null;
  let awayTeamId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await createChatSafetyFixture(prisma);
    const home = await prisma.v1Team.findUniqueOrThrow({ where: { id: ids.team } });
    sportId = home.sportId;
    regionId = home.regionId;
    awayTeamId = (await prisma.v1Team.create({ data: {
      ownerUserId: ids.b, sportId, regionId, name: 'List QA Away',
      memberships: { create: [{ userId: ids.b, role: 'owner' }] },
    } })).id;
  });
  afterAll(async () => { await cleanup?.(); });

  const http = () => request(app.getHttpServer());
  const list = async (query: string) => (await http().get(`/api/v1/chat/rooms?${query}`).set('x-v1-user-id', ids.a).expect(200)).body.data;
  const listIds = async (query: string) => (await list(query)).items.map((item: { roomId: string }) => item.roomId);

  /** ids.a 가 참여자로 들어가 있는 개인매치 방. */
  async function personalMatchRoom(title: string, opts: { status?: 'recruiting' | 'cancelled'; lastMessageAt?: Date | null; createdAt: Date }) {
    const match = await prisma.v1Match.create({ data: {
      hostUserId: ids.b, sportId, regionId, title, placeName: 'List QA Court', startAt: new Date('2030-01-01T12:00:00Z'),
      maxParticipants: 10, status: opts.status ?? 'recruiting',
      participants: { create: [{ userId: ids.a, role: 'participant' }] },
    } });
    const room = await prisma.v1ChatRoom.create({ data: {
      matchId: match.id, lastMessageAt: opts.lastMessageAt ?? null, createdAt: opts.createdAt,
      participants: { create: [{ userId: ids.a, visibleFromAt: new Date('2020-01-01') }] },
    } });
    return room.id;
  }

  async function teamMatchRoom(title: string, opts: { platformManaged: boolean }) {
    const teamMatch = await prisma.v1TeamMatch.create({ data: {
      title, sportId, regionId, placeName: 'List QA Court', startAt: new Date('2030-01-01T12:00:00Z'),
      hostTeamId: ids.team, platformManaged: opts.platformManaged, createdByUserId: ids.a,
      ...(opts.platformManaged ? {} : { approvedApplicantTeamId: awayTeamId, status: 'matched' as const }),
    } });
    const room = await prisma.v1ChatRoom.create({ data: {
      teamMatchId: teamMatch.id,
      participants: { create: [{ userId: ids.a, visibleFromAt: new Date('2020-01-01') }] },
    } });
    return { teamMatchId: teamMatch.id, roomId: room.id };
  }

  const addMessage = (chatRoomId: string, kind: 'system' | 'text') => prisma.v1ChatMessage.create({ data: kind === 'system'
    ? { chatRoomId, senderUserId: ids.a, body: 'joined', messageType: 'system', systemEventType: 'joined' }
    : { chatRoomId, senderUserId: ids.a, body: 'hello' } });

  it('lists rooms with messages first and empty rooms last, with no gap or repeat across page boundaries', async () => {
    const day = (n: number) => new Date(`2026-03-0${n}T00:00:00Z`);
    // 빈 방 두 개를 일부러 가장 최근에 만든다 — createdAt 만 보면 맨 위로 올라오는 배치다.
    const talkedOld = await personalMatchRoom('order-talked-old', { lastMessageAt: day(2), createdAt: day(1) });
    const talkedNew = await personalMatchRoom('order-talked-new', { lastMessageAt: day(4), createdAt: day(1) });
    const emptyOld = await personalMatchRoom('order-empty-old', { createdAt: day(5) });
    const emptyNew = await personalMatchRoom('order-empty-new', { createdAt: day(6) });
    const expected = [talkedNew, talkedOld, emptyNew, emptyOld];

    expect(await listIds('roomType=match&limit=20')).toEqual(expected);

    for (const limit of [1, 2]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 10; guard++) {
        const page: { items: Array<{ roomId: string }>; pageInfo: { nextCursor: string | null; hasNext: boolean } } =
          await list(`roomType=match&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
        seen.push(...page.items.map((item) => item.roomId));
        if (!page.pageInfo.hasNext) break;
        cursor = page.pageInfo.nextCursor;
      }
      expect(seen).toEqual(expected);
    }
  });

  it('hides platform team-match rooms until a real message exists, but keeps resolve and detail working; ordinary rooms stay listed', async () => {
    const platform = await teamMatchRoom('visibility-platform', { platformManaged: true });
    const ordinary = await teamMatchRoom('visibility-ordinary', { platformManaged: false });
    await addMessage(platform.roomId, 'system');

    const before = await listIds('roomType=team_match&limit=20');
    expect(before).not.toContain(platform.roomId);
    expect(before).toContain(ordinary.roomId);

    const resolved = await http().post('/api/v1/chat/rooms/resolve').set('x-v1-user-id', ids.a)
      .send({ targetType: 'team_match', targetId: platform.teamMatchId });
    expect([200, 201]).toContain(resolved.status);
    expect(resolved.body.data.roomId).toBe(platform.roomId);
    await http().get(`/api/v1/chat/rooms/${platform.roomId}`).set('x-v1-user-id', ids.a).expect(200);

    await addMessage(platform.roomId, 'text');
    expect(await listIds('roomType=team_match&limit=20')).toContain(platform.roomId);
  });

  it('keeps a cancelled personal match room listed and flags only that one as cancelled', async () => {
    const cancelled = await personalMatchRoom('flag-cancelled', { status: 'cancelled', createdAt: new Date('2026-04-01T00:00:00Z') });
    const live = await personalMatchRoom('flag-live', { status: 'recruiting', createdAt: new Date('2026-04-02T00:00:00Z') });
    const items: Array<{ roomId: string; linkedTargetCancelled: boolean }> = (await list('roomType=match&limit=50')).items;

    expect(items.find((item) => item.roomId === cancelled)?.linkedTargetCancelled).toBe(true);
    expect(items.find((item) => item.roomId === live)?.linkedTargetCancelled).toBe(false);
    const teamRoom: Array<{ roomId: string; linkedTargetCancelled: boolean }> = (await list('roomType=team&limit=50')).items;
    expect(teamRoom.length).toBeGreaterThan(0);
    expect(teamRoom.every((item) => item.linkedTargetCancelled === false)).toBe(true);
  });
});
