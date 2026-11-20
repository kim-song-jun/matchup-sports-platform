import { Controller, Get, INestApplication, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request = require('supertest');
import { CurrentUser } from '../auth/current-user.decorator';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { MemberAccessGuard } from '../auth/member-access.guard';
import { createV1SessionToken, resolveV1RequestIdentity, V1_SESSION_COOKIE_NAME } from '../auth/v1-session';
import { MEMBER_ACCESS_COOKIE } from '../auth/member-access-token';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { MemberAccessController } from './member-access.controller';
import { MemberAccessService } from './member-access.service';
import { ChatController } from '../chat/chat.controller';
import { ChatService } from '../chat/chat.service';
import { TeamContactsController } from '../team-contacts/team-contacts.controller';
import { TeamContactsService } from '../team-contacts/team-contacts.service';

const ACTOR = '10000000-0000-4000-8000-000000000001';
const TARGET = '20000000-0000-4000-8000-000000000002';
const SECRET = 'member-access-controller-test-secret-0123456789';

@Controller()
@UseGuards(V1AuthGuard)
class ProtectedMemberProbe {
  @Get('me') me(@CurrentUser() user: V1AuthUser) { return { userId: user.id }; }
  @Post('me') write(@CurrentUser() user: V1AuthUser) { return { changedUserId: user.id }; }
  @Post('auth/dev-session') devSession(@CurrentUser() user: V1AuthUser) { return { session: { userId: user.id } }; }
  @Get('admin/me') admin(@CurrentUser() user: V1AuthUser) { return { operatorId: user.id }; }
}

type Log = { id: string; adminUserId: string; action: string; targetType: string; targetId: string;
  reason: string; afterJson: Record<string, unknown> };

describe('member access actual HTTP authentication boundary', () => {
  let app: INestApplication;
  let logs: Log[];
  let actorRole: string;
  let actorEpoch: number;
  let targetEpoch: number;
  let targetAdmin: boolean;
  let chatWrites: number;
  const previousSecret = process.env.V1_SESSION_SECRET;
  const previousNodeEnv = process.env.NODE_ENV;
  function cookie(userId = ACTOR, issuedAtMs = Date.now()) {
    return `${V1_SESSION_COOKIE_NAME}=${createV1SessionToken({ userId, sessionEpoch: 0, secret: SECRET, issuedAtMs })}`;
  }
  async function begin(original = cookie()) {
    const response = await request(app.getHttpServer()).post(`/api/v1/admin/users/${TARGET}/member-access`)
      .set('Cookie', original).send({ reason: '문의 재현을 위한 조회' }).expect(201);
    const setCookies = response.headers['set-cookie'] as unknown as string[];
    expect(response.body).not.toHaveProperty('token');
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain('HttpOnly');
    expect(setCookies[0]).toContain('SameSite=Lax');
    expect(setCookies[0]).not.toContain(`${V1_SESSION_COOKIE_NAME}=`);
    const accessCookie = setCookies[0].split(';')[0];
    return { original, accessCookie, combined: `${original}; ${accessCookie}`, response };
  }

  beforeAll(async () => {
    process.env.V1_SESSION_SECRET = SECRET;
    process.env.NODE_ENV = 'test';
    const user = (id: string) => ({ id, email: null, accountStatus: 'active', onboardingStatus: 'completed',
      sessionEpoch: id === ACTOR ? actorEpoch : targetEpoch, phoneVerifiedAt: new Date(),
      adminUser: id === ACTOR || targetAdmin ? { status: 'active' } : null, profile: { nickname: id === ACTOR ? '운영자' : '대상 회원' } });
    const prisma = {
      v1User: {
        findUniqueOrThrow: jest.fn(({ where }) => Promise.resolve(user(where.id))),
        findUnique: jest.fn(({ where }) => Promise.resolve(user(where.id))),
        findFirst: jest.fn(({ where }) => {
          const row = user(where.id);
          return Promise.resolve(where.sessionEpoch !== undefined && row.sessionEpoch !== where.sessionEpoch ? null : row);
        }),
      },
      v1AdminUser: { findUnique: jest.fn(({ where }) => Promise.resolve(where.userId !== ACTOR ? null : {
        id: 'admin-record', userId: ACTOR, adminRole: actorRole, status: 'active', user: { accountStatus: 'active' },
      })) },
      v1AdminActionLog: {
        create: jest.fn(({ data }) => { const row = { id: randomUUID(), ...data }; logs.push(row); return Promise.resolve(row); }),
        findUnique: jest.fn(({ where }) => Promise.resolve(logs.find((row) => row.id === where.id) ?? null)),
        findFirst: jest.fn(({ where }) => Promise.resolve(logs.find((row) => row.action === where.action
          && row.targetId === where.targetId && row.afterJson.accessId === where.afterJson.equals) ?? null)),
      },
      v1TeamContact: {
        updateMany: jest.fn(async () => { chatWrites++; return { count: 1 }; }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      v1ChatRoom: {
        updateMany: jest.fn(async () => { chatWrites++; return { count: 1 }; }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue([{ teamId: 'target-team' }]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const client = { ...prisma, $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(prisma) };
    const chat = new ChatService(client as unknown as PrismaService, {} as never, {} as never, {} as never);
    const contacts = new TeamContactsService(client as unknown as PrismaService, {} as never, chat);
    const module = await Test.createTestingModule({ controllers: [MemberAccessController, ProtectedMemberProbe, ChatController, TeamContactsController], providers: [
      { provide: ChatService, useValue: chat },
      { provide: TeamContactsService, useValue: contacts },
      MemberAccessService, AdminContextService, V1AuthGuard,
      { provide: PrismaService, useValue: client },
      { provide: ManagedTermsRuntimeService, useValue: { signupCompliance: async () => ({ compliant: true }) } },
      { provide: APP_GUARD, useClass: MemberAccessGuard },
    ] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  beforeEach(() => { logs = []; actorRole = 'owner'; actorEpoch = 0; targetEpoch = 0; targetAdmin = false; chatWrites = 0; });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
    if (previousSecret === undefined) delete process.env.V1_SESSION_SECRET; else process.env.V1_SESSION_SECRET = previousSecret;
    process.env.NODE_ENV = previousNodeEnv;
  });

  it('audits a grant, reads as the member, blocks all writes and admin access, and restores the original account', async () => {
    const { original, combined } = await begin();
    expect(logs[0]).toMatchObject({ action: 'user.member_access.start', targetId: TARGET, reason: '문의 재현을 위한 조회', afterJson: { operatorUserId: ACTOR, mode: 'read_only' } });
    expect(JSON.stringify(logs)).not.toContain(original.split('=')[1]);
    await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', combined).expect(200, { userId: TARGET });
    const blocked = await request(app.getHttpServer()).post('/api/v1/me').set('Cookie', combined).send({}).expect(403);
    expect(blocked.body.code).toBe('MEMBER_ACCESS_READ_ONLY');
    await request(app.getHttpServer()).post('/api/v1/auth/dev-session').set('Cookie', combined).send({}).expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/me').set('Cookie', combined).expect(403);
    const stop = await request(app.getHttpServer()).post('/api/v1/admin/member-access/stop').set('Cookie', combined).send({}).expect(201);
    expect(stop.body.returnPath).toBe(`/admin/users/${TARGET}`);
    expect(String(stop.headers['set-cookie'])).not.toContain(`${V1_SESSION_COOKIE_NAME}=`);
    expect(logs[1]).toMatchObject({ action: 'user.member_access.end', afterJson: { accessId: logs[0].id } });
    await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', original).expect(200, { userId: ACTOR });
    await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', combined).expect(403);
  });

  it('rejects Socket.IO identity resolution when the member access cookie is present', async () => {
    const { combined } = await begin();
    expect(resolveV1RequestIdentity({ headers: { cookie: combined }, header: () => undefined }, { nodeEnv: 'production', sessionSecret: SECRET })).toBeNull();
  });

  it('blocks the real chat GET before lazy contact writes, while ordinary chat still works', async () => {
    const { original, combined } = await begin();
    const blocked = await request(app.getHttpServer()).get('/api/v1/chat/rooms').set('Cookie', combined).expect(403);
    expect(blocked.body.code).toBe('MEMBER_ACCESS_CHAT_DENIED');
    expect(chatWrites).toBe(0);
    await request(app.getHttpServer()).get('/api/v1/chat/rooms').set('Cookie', original).expect(200);
    expect(chatWrites).toBe(2);
  });

  it('reads the real contact summary without expiry or archive writes during member access', async () => {
    const { original, combined } = await begin();
    await request(app.getHttpServer()).get('/api/v1/me/team-contacts/summary').set('Cookie', combined)
      .expect(200, { pendingInbound: 0, byTeam: [{ teamId: 'target-team', pendingInbound: 0 }] });
    expect(chatWrites).toBe(0);
    await request(app.getHttpServer()).get('/api/v1/me/team-contacts/summary').set('Cookie', original).expect(200);
    expect(chatWrites).toBe(2);
  });

  it.each(['/api/v1/chat/rooms/room', '/api/v1/chat/rooms/room/messages',
    '/api/v1/chat/rooms/room/messages/message/file', '/api/v1/CHAT/rooms'])
  ('blocks member chat access including alternate route spelling: %s', async (path) => {
    const { combined } = await begin();
    const blocked = await request(app.getHttpServer()).get(path).set('Cookie', combined).expect(403);
    expect(blocked.body.code).toBe('MEMBER_ACCESS_CHAT_DENIED');
    expect(chatWrites).toBe(0);
  });

  it('denies dev headers, ordinary users, support admins, and old administrator logins', async () => {
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${TARGET}/member-access`).set('x-v1-user-id', ACTOR).send({ reason: '문의 재현 목적' }).expect(401);
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${TARGET}/member-access`).set('Cookie', cookie(TARGET)).send({ reason: '문의 재현 목적' }).expect(403);
    actorRole = 'support';
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${TARGET}/member-access`).set('Cookie', cookie()).send({ reason: '문의 재현 목적' }).expect(403);
    actorRole = 'owner';
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${TARGET}/member-access`).set('Cookie', cookie(ACTOR, Date.now() - 31 * 60_000)).send({ reason: '문의 재현 목적' }).expect(403);
    expect(logs).toHaveLength(0);
  });

  it('denies access to another admin account and rejects missing or short reasons', async () => {
    targetAdmin = true;
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${TARGET}/member-access`).set('Cookie', cookie()).send({ reason: '운영자 계정 대상' }).expect(403);
    targetAdmin = false;
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${TARGET}/member-access`).set('Cookie', cookie()).send({ reason: '짧음' }).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/admin/users/${TARGET}/member-access`).set('Cookie', cookie()).send({ reason: '정상적인 사유', userId: ACTOR }).expect(400);
    expect(logs).toHaveLength(0);
  });

  it('refuses expired, tampered, or session-rebound grants without silently returning the administrator identity', async () => {
    const { original, combined, accessCookie } = await begin();
    const tampered = accessCookie.slice(0, -1) + (accessCookie.endsWith('a') ? 'b' : 'a');
    await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', `${original}; ${tampered}`).expect(403);
    await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', `${cookie(ACTOR, Date.now() - 60_000)}; ${accessCookie}`).expect(403);
    const future = Date.now() + 11 * 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(future);
    const expired = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', combined).expect(403);
    expect(expired.body.code).toBe('MEMBER_ACCESS_EXPIRED');
    expect(logs.some((row) => row.afterJson.endReason === 'expired')).toBe(true);
    const status = await request(app.getHttpServer()).get('/api/v1/admin/member-access').set('Cookie', combined).expect(200);
    expect(status.body).toMatchObject({ active: true, unavailable: true });
  });

  it.each(['actor_epoch', 'target_epoch', 'role_revoked', 'target_promoted'])('revokes the grant when %s changes', async (change) => {
    const { combined } = await begin();
    if (change === 'actor_epoch') actorEpoch = 1;
    if (change === 'target_epoch') targetEpoch = 1;
    if (change === 'role_revoked') actorRole = 'support';
    if (change === 'target_promoted') targetAdmin = true;
    await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', combined).expect(403);
    expect(logs.some((row) => row.afterJson.endReason === 'authorization_changed')).toBe(true);
  });
});
