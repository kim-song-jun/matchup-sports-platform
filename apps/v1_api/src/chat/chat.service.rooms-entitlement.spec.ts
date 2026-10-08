import { Test } from '@nestjs/testing';
import type { Prisma, V1ChatRoomStatus, V1MatchStatus, V1TeamContact } from '@prisma/client';
import { getLoggerToken } from 'nestjs-pino';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ChatService } from './chat.service';
import { ChatRoomsQueryDto } from './dto/chat.dto';

type Row = Record<string, unknown>;
type RoomType = NonNullable<ChatRoomsQueryDto['roomType']>;
type Room = Row & {
  id: string; status: V1ChatRoomStatus; createdAt: Date; lastMessageAt: Date | null;
  participants: Row[]; messages: Row[];
  match: Row | null; team: Row | null; teamMatch: Row | null; teamContact: Row | null;
};
const viewer = { id: 'viewer', email: null, accountStatus: 'active', onboardingStatus: 'completed' } as const;
const createdAt = new Date('2026-10-01T00:00:00Z');
const sentAt = new Date('2026-10-02T00:00:00Z');
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

// Evaluate Prisma predicate semantics against changing rows, independently of the service's query shape.
// Unknown operators fail loudly rather than silently granting access.
function matches(value: unknown, condition: unknown): boolean {
  if (!isRow(condition)) return condition instanceof Date
    ? value instanceof Date && value.getTime() === condition.getTime() : value === condition;
  return Object.entries(condition).every(([key, expected]) => {
    switch (key) {
      case 'AND': return (Array.isArray(expected) ? expected : [expected]).every((part) => matches(value, part));
      case 'OR': return Array.isArray(expected) && expected.some((part) => matches(value, part));
      case 'NOT': return !(Array.isArray(expected) ? expected : [expected]).some((part) => matches(value, part));
      case 'is': return matches(value, expected);
      case 'some': return Array.isArray(value) && value.some((row) => matches(row, expected));
      case 'none': return Array.isArray(value) && !value.some((row) => matches(row, expected));
      case 'in': return Array.isArray(expected) && expected.includes(value);
      case 'not': return !matches(value, expected);
      case 'gte': return value instanceof Date && expected instanceof Date && value >= expected;
      case 'gt': return value instanceof Date && expected instanceof Date && value > expected;
      default:
        if (!isRow(value)) return false;
        if (!(key in value)) throw new Error(`Unsupported fake predicate field: ${key}`);
        return matches(value[key], expected);
    }
  });
}

function fixture(kind: RoomType, id = 'room-1', platform = false): Room {
  const memberships = [{ id: 'membership', userId: viewer.id, status: 'active', role: 'owner' }];
  const team = { id: `team-${id}`, name: `Title ${id}`, status: 'active', deletedAt: null, memberships };
  const awayTeam = { id: 'away-team', name: 'Away', status: 'active', deletedAt: null, memberships: [] };
  return {
    id, status: 'active', createdAt, updatedAt: createdAt, lastMessageAt: sentAt,
    matchId: kind === 'match' ? `match-${id}` : null,
    teamId: kind === 'team' ? team.id : null,
    teamMatchId: kind === 'team_match' ? `team-match-${id}` : null,
    teamContactId: kind === 'team_contact' ? `contact-${id}` : null,
    match: kind === 'match' ? {
      id: `match-${id}`, title: `Title ${id}`, status: 'recruiting' satisfies V1MatchStatus, deletedAt: null, hostUserId: 'host',
      participants: [{ userId: viewer.id, role: 'participant', status: 'active' }],
    } : null,
    team: kind === 'team' ? team : null,
    teamMatch: kind === 'team_match' ? {
      id: `team-match-${id}`, title: `Title ${id}`, deletedAt: null, status: 'matched', platformManaged: platform,
      hostTeamId: platform ? null : team.id, approvedApplicantTeamId: platform ? null : awayTeam.id,
      hostTeam: platform ? null : team, approvedApplicantTeam: platform ? null : awayTeam,
      createdByUserId: platform ? viewer.id : 'operator',
      createdByUser: { adminUser: { status: 'active', revokedAt: null, adminRole: 'ops', user: { accountStatus: 'active' } } },
    } : null,
    teamContact: kind === 'team_contact' ? {
      ...({ id: `contact-${id}`, fromTeamId: team.id, toTeamId: awayTeam.id, status: 'accepted',
        expiresAt: new Date('2026-10-03T00:00:00Z'), declineReason: null,
      } satisfies Pick<V1TeamContact, 'id' | 'fromTeamId' | 'toTeamId' | 'status' | 'expiresAt' | 'declineReason'>),
      fromTeam: team, toTeam: awayTeam,
    } : null,
    participants: [{ userId: viewer.id, status: 'active', visibleFromAt: createdAt, lastReadMessageId: null, pinnedAt: null, mutedUntil: null }],
    messages: [{ id: `message-${id}`, chatRoomId: id, senderUserId: 'sender', status: 'sent', messageType: 'text',
      sentAt, body: `Preview ${id}`, senderUser: { chatBlocksMade: [], chatBlocksReceived: [] } }],
  };
}

function relation(row: Row, key: string): Row {
  const value = row[key];
  if (!isRow(value)) throw new Error(`Missing fixture relation: ${key}`);
  return value;
}
function firstRelation(row: Row, key: string): Row {
  const value = row[key];
  if (!Array.isArray(value) || !isRow(value[0])) throw new Error(`Missing fixture rows: ${key}`);
  return value[0];
}

async function world(rooms: Room[], afterKeys: () => void = () => {}) {
  let keyRead = false;
  const findMany = jest.fn(async (args: Prisma.V1ChatRoomFindManyArgs) => {
    const selected = rooms.filter((room) => matches(room, args.where ?? {}));
    if (args.select) {
      const keys = selected.map(({ id, lastMessageAt, createdAt }) => ({ id, lastMessageAt, createdAt }));
      if (!keyRead) { keyRead = true; afterKeys(); }
      return keys;
    }
    const messageWhere = isRow(args.include?.messages) ? args.include.messages.where : {};
    return selected.map((room) => ({ ...room, messages: room.messages.filter((message) => matches(message, messageWhere ?? {})).slice(0, 1) }));
  });
  const prisma = {
    v1ChatRoom: { findMany, updateMany: jest.fn(async () => ({ count: 0 })) },
    v1TeamContact: { updateMany: jest.fn(async () => ({ count: 0 })) },
    v1ChatMessage: { count: jest.fn(async () => 1), findUnique: jest.fn(async () => null) },
  };
  const module = await Test.createTestingModule({ providers: [ChatService,
    { provide: PrismaService, useValue: prisma }, { provide: RealtimeGateway, useValue: {} },
    { provide: WebPushService, useValue: {} }, { provide: getLoggerToken(ChatService.name), useValue: {} },
  ] }).compile();
  return { service: module.get(ChatService), findMany };
}

describe('ChatService.rooms current content access', () => {
  it.each<RoomType>(['match', 'team', 'team_match', 'team_contact'])('returns the real title and preview for an entitled %s user', async (kind) => {
    const { service } = await world([fixture(kind)]);
    const result = await service.rooms(viewer, { roomType: kind });
    expect(result.items).toMatchObject([{ roomId: 'room-1', title: kind === 'team_contact' ? 'Title room-1 ↔ Away' : 'Title room-1', lastMessage: { contentPreview: 'Preview room-1' } }]);
    expect(result.pageInfo).toEqual({ hasNext: false, nextCursor: null });
  });

  it.each<RoomType>(['match', 'team', 'team_match', 'team_contact'])('omits title and new preview when %s entitlement is revoked after keys', async (kind) => {
    const room = fixture(kind);
    const { service } = await world([room], () => {
      switch (kind) {
        case 'match': firstRelation(relation(room, 'match'), 'participants').status = 'cancelled'; break;
        case 'team': firstRelation(relation(room, 'team'), 'memberships').status = 'left'; break;
        case 'team_match': firstRelation(relation(relation(room, 'teamMatch'), 'hostTeam'), 'memberships').role = 'member'; break;
        case 'team_contact': firstRelation(relation(relation(room, 'teamContact'), 'fromTeam'), 'memberships').role = 'member'; break;
      }
      room.messages[0].body = 'New secret after revocation';
    });
    expect(await service.rooms(viewer, { roomType: kind })).toEqual({ items: [], pageInfo: { hasNext: false, nextCursor: null } });
  });

  it.each(['revocation', 'support role'])('omits the platform operator room after admin %s', async (change) => {
    const room = fixture('team_match', 'platform', true);
    const { service } = await world([room], () => {
      const admin = relation(relation(relation(room, 'teamMatch'), 'createdByUser'), 'adminUser');
      if (change === 'revocation') admin.revokedAt = sentAt; else admin.adminRole = 'support';
    });
    expect((await service.rooms(viewer, { roomType: 'team_match' })).items).toEqual([]);
  });

  it.each(['participant exit', 'archive', 'platform messages hidden'])('omits content after %s between reads', async (change) => {
    const room = fixture('team_match', 'platform', true);
    const { service } = await world([room], () => {
      if (change === 'participant exit') room.participants[0].status = 'left';
      else if (change === 'archive') room.status = 'archived';
      else room.messages[0].status = 'hidden';
    });
    expect((await service.rooms(viewer, { roomType: 'team_match' })).items).toEqual([]);
  });

  it.each(['first', 'whole batch'])('refills the page after the %s loses access and advances past retained rooms', async (change) => {
    const rooms = [fixture('team', 'c'), fixture('team', 'b'), fixture('team', 'a')];
    const { service } = await world(rooms, () => {
      firstRelation(relation(rooms[0], 'team'), 'memberships').status = 'left';
      if (change === 'whole batch') firstRelation(relation(rooms[1], 'team'), 'memberships').status = 'left';
    });
    const first = await service.rooms(viewer, { roomType: 'team', limit: 1 });
    expect(first.items.map((item) => item.roomId)).toEqual([change === 'first' ? 'b' : 'a']);
    expect(first.pageInfo).toEqual(change === 'first' ? { hasNext: true, nextCursor: 'b' } : { hasNext: false, nextCursor: null });
    if (first.pageInfo.nextCursor) {
      const second = await service.rooms(viewer, { roomType: 'team', limit: 1, cursor: first.pageInfo.nextCursor });
      expect(second.items.map((item) => item.roomId)).toEqual(['a']);
      expect(second.pageInfo).toEqual({ hasNext: false, nextCursor: null });
    }
  });

  it('terminates when every candidate loses access', async () => {
    const rooms = [fixture('team', 'b'), fixture('team', 'a')];
    const { service } = await world(rooms, () => rooms.forEach((room) => { room.status = 'archived'; }));
    expect(await service.rooms(viewer, { roomType: 'team', limit: 1 })).toEqual({ items: [], pageInfo: { hasNext: false, nextCursor: null } });
  });

  it('keeps real-message rooms before null-message rooms across the cursor', async () => {
    const empty = fixture('team', 'new-empty'); empty.lastMessageAt = null; empty.messages = [];
    empty.createdAt = new Date('2026-10-03T00:00:00Z');
    const { service } = await world([empty, fixture('team', 'talked')]);
    const first = await service.rooms(viewer, { roomType: 'team', limit: 1 });
    expect(first.items.map((item) => item.roomId)).toEqual(['talked']);
    expect(first.pageInfo).toEqual({ hasNext: true, nextCursor: 'talked' });
    const second = await service.rooms(viewer, { roomType: 'team', limit: 1, cursor: 'talked' });
    expect(second.items).toMatchObject([{ roomId: 'new-empty', lastMessage: null }]);
    expect(second.pageInfo).toEqual({ hasNext: false, nextCursor: null });
  });

  it('keeps disappeared cursors at the end instead of restarting the list', async () => {
    const { service } = await world([fixture('team')]);
    expect(await service.rooms(viewer, { roomType: 'team', cursor: 'missing' })).toEqual({ items: [], pageInfo: { hasNext: false, nextCursor: null } });
  });

  it('does not expose a preview older than the participant visibility boundary', async () => {
    const room = fixture('team'); room.participants[0].visibleFromAt = new Date('2026-10-03T00:00:00Z');
    const { service } = await world([room]);
    expect((await service.rooms(viewer, { roomType: 'team' })).items).toMatchObject([{ roomId: room.id, lastMessage: null }]);
  });

  it.each([1, 2])('propagates a failure from room query %i', async (queryNumber) => {
    const { service, findMany } = await world([fixture('team')]);
    if (queryNumber === 1) findMany.mockRejectedValueOnce(new Error('Database unavailable'));
    else findMany.mockImplementationOnce(async () => [{ id: 'room-1', createdAt, lastMessageAt: sentAt }]).mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(service.rooms(viewer, { roomType: 'team' })).rejects.toThrow('Database unavailable');
  });
});
