import { lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { V1SessionCookieInterceptor } from './v1-session.interceptor';
import { V1_SESSION_COOKIE_NAME, readV1Session } from './v1-session';

const SECRET = 'interceptor-spec-session-secret-0123456789abcdef';

describe('V1SessionCookieInterceptor', () => {
  const original = process.env.V1_SESSION_SECRET;
  beforeAll(() => {
    process.env.V1_SESSION_SECRET = SECRET;
  });
  afterAll(() => {
    process.env.V1_SESSION_SECRET = original;
  });

  function run(body: unknown, sessionEpoch = 4) {
    const prisma = { v1User: { findUniqueOrThrow: jest.fn().mockResolvedValue({ sessionEpoch }) } };
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const context = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(body) };
    const result = lastValueFrom(new V1SessionCookieInterceptor(prisma as unknown as PrismaService).intercept(context, next));
    return { prisma, response, result };
  }

  it("signs the cookie with the user's current session epoch and returns the body untouched", async () => {
    const body = { session: { userId: 'user-1', userEmail: null } };
    const { prisma, response, result } = run(body);

    await expect(result).resolves.toBe(body);
    expect(prisma.v1User.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { sessionEpoch: true } });
    const token = response.cookie.mock.calls[0][1] as string;
    expect(readV1Session(`${V1_SESSION_COOKIE_NAME}=${token}`, { secret: SECRET })).toEqual({ userId: 'user-1', sessionEpoch: 4 });
  });

  it('signs with the epoch a password login read with the credentials, without a second read, and keeps it out of the body', async () => {
    const { prisma, response, result } = run({ session: { userId: 'user-1', userEmail: null, sessionEpoch: 2 }, next: undefined }, 9);

    await expect(result).resolves.toEqual({ session: { userId: 'user-1', userEmail: null }, next: undefined });
    expect(prisma.v1User.findUniqueOrThrow).not.toHaveBeenCalled();
    const token = response.cookie.mock.calls[0][1] as string;
    expect(readV1Session(`${V1_SESSION_COOKIE_NAME}=${token}`, { secret: SECRET })).toEqual({ userId: 'user-1', sessionEpoch: 2 });
  });

  it('writes nothing for a response without a session', async () => {
    const { prisma, response, result } = run({ ok: true });

    await expect(result).resolves.toEqual({ ok: true });
    expect(prisma.v1User.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });
});
