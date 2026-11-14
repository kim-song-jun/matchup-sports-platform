import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { AdminService } from '../src/admin/admin.service';
import { KAKAO_ADMIN_KEY_ENV, KAKAO_UNLINK_URL } from '../src/auth/kakao-unlink.service';
import { LoginMethodService } from '../src/auth/login-method.service';
import type { V1AuthUser } from '../src/auth/v1-auth-user';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProfileController } from '../src/profile/profile.controller';
import { createV1IntegrationApp } from './integration/integration-app';

class KakaoUnlinkFixtureError extends Error {}

const asActor = (id: string): V1AuthUser => ({ id, email: null, accountStatus: 'active', onboardingStatus: 'completed' });

/** The service reads its key once per app, so each key setting gets its own app. */
function useApp(adminKey: string | undefined) {
  const prefix = `kakao-unlink-${randomUUID().slice(0, 8)}`;
  const userIds: string[] = [];
  const identityIds: string[] = [];
  const savedKey = process.env[KAKAO_ADMIN_KEY_ENV];
  let seq = 0;
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  const ctx = {} as {
    prisma: PrismaService;
    loginMethods: LoginMethodService;
    profile: ProfileController;
    admin: AdminService;
    operator: V1AuthUser;
    member: () => Promise<{ id: string; memberNumber: string; kakaoIdentityId: string }>;
  };

  beforeAll(async () => {
    if (adminKey === undefined) delete process.env[KAKAO_ADMIN_KEY_ENV];
    else process.env[KAKAO_ADMIN_KEY_ENV] = adminKey;
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    ctx.prisma = app.get(PrismaService);
    ctx.loginMethods = app.get(LoginMethodService);
    ctx.profile = app.get(ProfileController);
    ctx.admin = app.get(AdminService);

    const operatorRow = await ctx.prisma.v1User.create({ data: { adminUser: { create: { adminRole: 'owner' } } } });
    userIds.push(operatorRow.id);
    ctx.operator = asActor(operatorRow.id);

    ctx.member = async () => {
      seq += 1;
      // Invented member numbers: they never match a real Kakao account.
      const memberNumber = `9${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
      const email = `${prefix}-${seq}@example.test`;
      const row = await ctx.prisma.v1User.create({
        data: {
          email,
          phone: `010${String(randomInt(0, 100_000_000)).padStart(8, '0')}`,
          emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
          phoneVerifiedAt: new Date('2026-09-01T00:00:00Z'),
          onboardingStatus: 'completed',
          profile: { create: { nickname: `${prefix}-${seq}` } },
          authIdentities: {
            create: [
              { provider: 'kakao', providerUserKey: memberNumber },
              { provider: 'email', providerUserKey: email, email, passwordHash: 'hash' },
            ],
          },
        },
        include: { authIdentities: true },
      });
      const kakao = row.authIdentities.find((identity) => identity.provider === 'kakao');
      if (!kakao) throw new KakaoUnlinkFixtureError('The Kakao login row was not created');
      userIds.push(row.id);
      identityIds.push(...row.authIdentities.map((identity) => identity.id));
      return { id: row.id, memberNumber, kakaoIdentityId: kakao.id };
    };
  }, 60_000);

  afterAll(async () => {
    try {
      const { prisma } = ctx;
      if (prisma) {
        await prisma.v1AdminActionLog.deleteMany({ where: { adminUser: { userId: { in: userIds } } } });
        await prisma.v1StatusChangeLog.deleteMany({
          where: { OR: [{ targetId: { in: [...userIds, ...identityIds] } }, { actorUserId: { in: userIds } }] },
        });
        await prisma.v1Notification.deleteMany({ where: { recipientUserId: { in: userIds } } });
        await prisma.v1AdminUser.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.v1User.deleteMany({ where: { id: { in: userIds } } });
      }
      await cleanupApp?.();
    } finally {
      if (savedKey === undefined) delete process.env[KAKAO_ADMIN_KEY_ENV];
      else process.env[KAKAO_ADMIN_KEY_ENV] = savedKey;
    }
  });

  return ctx;
}

/** Calls to Kakao are answered by `answer`; every other request goes where it would have gone. */
function interceptKakao(answer: () => Response) {
  const realFetch = globalThis.fetch.bind(globalThis);
  const spy = jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
    String(input) === KAKAO_UNLINK_URL ? Promise.resolve(answer()) : realFetch(input, init),
  );
  return () => spy.mock.calls.filter(([input]) => String(input) === KAKAO_UNLINK_URL).map(([, init]) => init ?? {});
}

function captureLogs() {
  const lines: string[] = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation((message: unknown, ...rest: unknown[]) => {
      lines.push([message, ...rest].map(String).join(' '));
    });
  }
  return lines;
}

async function eventually(done: () => boolean | Promise<boolean>, what: string) {
  const deadline = Date.now() + 5_000;
  while (!(await done())) {
    if (Date.now() > deadline) throw new KakaoUnlinkFixtureError(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const settled = (lines: string[], userId: string) => () => lines.some((line) => line.includes(`user=${userId}`) && line.includes('result='));

describe('Kakao unlink without KAKAO_ADMIN_KEY (PostgreSQL)', () => {
  const ctx = useApp(undefined);
  let lines: string[];
  let kakaoCalls: () => RequestInit[];

  beforeEach(() => {
    lines = captureLogs();
    kakaoCalls = interceptKakao(() => new Response('{}', { status: 200 }));
  });

  afterEach(() => jest.restoreAllMocks());

  it('removes the Kakao login as before and sends nothing to Kakao', async () => {
    const member = await ctx.member();

    await expect(ctx.loginMethods.unlink(member.id, 'kakao', null)).resolves.toMatchObject({ provider: 'kakao', authProviders: ['email'] });

    await eventually(settled(lines, member.id), 'the skipped unlink to be logged');
    expect(lines.some((line) => line.includes('skipped_disabled') && line.includes('reason=login_method_removed'))).toBe(true);
    expect(kakaoCalls()).toEqual([]);
    expect(await ctx.prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: member.kakaoIdentityId } })).toMatchObject({ status: 'unlinked', providerUserKey: member.memberNumber });
  });

  it('accepts the withdrawal as before and sends nothing to Kakao', async () => {
    const member = await ctx.member();

    await expect(ctx.profile.withdrawalRequest(asActor(member.id), {})).resolves.toMatchObject({ userId: member.id, accountStatus: 'withdrawal_pending' });

    await eventually(settled(lines, member.id), 'the skipped unlink to be logged');
    expect(lines.some((line) => line.includes('skipped_disabled') && line.includes('reason=withdrawal_request'))).toBe(true);
    expect(kakaoCalls()).toEqual([]);
  });

  it('lets the operator delete the account as before and sends nothing to Kakao', async () => {
    const member = await ctx.member();

    await expect(ctx.admin.deleteUser(ctx.operator, member.id, { reason: '계정 삭제 요청 처리' })).resolves.toMatchObject({ userId: member.id, status: 'deleted' });

    await eventually(settled(lines, member.id), 'the skipped unlink to be logged');
    expect(lines.some((line) => line.includes('skipped_disabled') && line.includes('reason=account_deleted'))).toBe(true);
    expect(kakaoCalls()).toEqual([]);
  });
});

describe('Kakao unlink with KAKAO_ADMIN_KEY (PostgreSQL)', () => {
  const ADMIN_KEY = 'integration-kakao-admin-key';
  const ctx = useApp(ADMIN_KEY);
  let lines: string[];
  let kakaoCalls: () => RequestInit[];
  let answer: () => Response;

  beforeEach(() => {
    lines = captureLogs();
    answer = () => new Response('{}', { status: 200 });
    kakaoCalls = interceptKakao(() => answer());
  });

  afterEach(() => jest.restoreAllMocks());

  const failureRows = (identityId: string) => ctx.prisma.v1StatusChangeLog.findMany({ where: { targetId: identityId, toStatus: 'provider_unlink_failed' } });

  function expectRequestFor(memberNumber: string) {
    expect(kakaoCalls()).toHaveLength(1);
    const [init] = kakaoCalls();
    expect(new Headers(init.headers).get('authorization')).toBe(`KakaoAK ${ADMIN_KEY}`);
    expect(String(init.body)).toBe(`target_id_type=user_id&target_id=${memberNumber}`);
  }

  it('removing the Kakao login asks Kakao once and, when Kakao accepts, records nothing', async () => {
    const member = await ctx.member();

    await ctx.loginMethods.unlink(member.id, 'kakao', null);

    await eventually(settled(lines, member.id), 'the unlink result');
    expectRequestFor(member.memberNumber);
    expect(lines.some((line) => line.includes(`user=${member.id}`) && line.includes('result=ok'))).toBe(true);
    expect(await failureRows(member.kakaoIdentityId)).toEqual([]);
  });

  it('a withdrawal request asks Kakao for the member number and, when Kakao is down, still succeeds and leaves a countable record', async () => {
    const member = await ctx.member();
    answer = () => new Response('{}', { status: 503 });

    await expect(ctx.profile.withdrawalRequest(asActor(member.id), {})).resolves.toMatchObject({ userId: member.id, accountStatus: 'withdrawal_pending' });

    await eventually(async () => (await failureRows(member.kakaoIdentityId)).length === 1, 'the failure record');
    expectRequestFor(member.memberNumber);
    const [row] = await failureRows(member.kakaoIdentityId);
    expect(row).toMatchObject({ targetType: 'auth_identity', fromStatus: 'active', actorType: 'system', reason: 'withdrawal_request:failed' });
    expect(JSON.stringify([row, lines])).not.toContain(member.memberNumber);
    expect(JSON.stringify([row, lines])).not.toContain(ADMIN_KEY);
  });

  it('an operator delete asks Kakao for the member number the login held before it was replaced, and keeps it out of the response', async () => {
    const member = await ctx.member();
    answer = () => new Response('{"msg":"unavailable","code":-9}', { status: 503 });

    const result = await ctx.admin.deleteUser(ctx.operator, member.id, { reason: '계정 삭제 요청 처리' });

    expect(result).toMatchObject({ userId: member.id, status: 'deleted' });
    expect(JSON.stringify(result)).not.toContain(member.memberNumber);
    await eventually(async () => (await failureRows(member.kakaoIdentityId)).length === 1, 'the failure record');
    expectRequestFor(member.memberNumber);
    const stored = await ctx.prisma.v1AuthIdentity.findUniqueOrThrow({ where: { id: member.kakaoIdentityId } });
    expect(stored.providerUserKey).toBe(`deleted:${member.id}:${member.kakaoIdentityId}`);
    const [row] = await failureRows(member.kakaoIdentityId);
    expect(row).toMatchObject({ fromStatus: 'unlinked', actorType: 'system', reason: 'account_deleted:failed' });
  });
});
