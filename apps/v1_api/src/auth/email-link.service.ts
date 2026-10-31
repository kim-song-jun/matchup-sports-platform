import { ConflictException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationService } from '../verification/verification.service';
import type { LinkEmailCompleteDto, LinkEmailRequestDto, LinkEmailVerifyDto } from './dto/link-email.dto';
import { EMAIL_LINK_TOKEN_TTL_SECONDS, issueEmailLinkToken, readEmailLinkToken } from './email-link-token';
import { assertLinkableCaller, assertRecentLogin, LINK_CALLER_SELECT } from './link-caller-guards';
import { normalizeEmail } from './normalize-email';
import { hashPassword } from './password-hash';

/** `Prisma.TransactionClient` and `PrismaService` both satisfy this, so the conflict check runs inside or outside a transaction. */
type EmailLookupClient = Pick<Prisma.TransactionClient, 'v1User'>;

/**
 * Adds an email + password login to the account the caller is signed in as (the reverse of `AccountLinkService`).
 *
 * Ownership of the account is proven by the session; ownership of the address by a code mailed to it. A phone number
 * takes no part, so a reassigned number cannot hand the account to anyone.
 *
 * Request -> verify -> complete. `request` is the only step that checks how recent the sign-in is; the 10 minutes the
 * `emailLinkToken` lives bound the window for `complete`.
 */
@Injectable()
export class EmailLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationService,
  ) {}

  /** `sessionAgeSeconds` is null when the request has no cookie session (non-production header identity). */
  async requestCode(callerId: string, dto: LinkEmailRequestDto, sessionAgeSeconds: number | null) {
    assertRecentLogin(sessionAgeSeconds);
    const email = normalizeEmail(dto.email);

    const caller = await this.prisma.v1User.findUnique({
      where: { id: callerId },
      select: { ...LINK_CALLER_SELECT, authIdentities: { where: { status: 'active' }, select: { provider: true } } },
    });
    if (!caller) throw userNotFound();
    assertLinkableCaller(caller, 'email');
    if (caller.authIdentities.some((identity) => identity.provider === V1AuthProvider.email)) throw emailLoginExists();
    await assertEmailFree(this.prisma, callerId, email);

    return this.verification.requestEmailLinkCode(callerId, email);
  }

  async verifyCode(callerId: string, dto: LinkEmailVerifyDto) {
    const email = await this.verification.consumeEmailLinkCode(callerId, dto.code);
    return { emailLinkToken: issueEmailLinkToken(callerId, email), expiresInSeconds: EMAIL_LINK_TOKEN_TTL_SECONDS };
  }

  async complete(callerId: string, dto: LinkEmailCompleteDto) {
    // No recent-login check on purpose: the token exists only after a mailed code was entered and lasts 10 minutes.
    const email = readEmailLinkToken(dto.emailLinkToken, callerId);
    if (!email) throw emailLinkTokenInvalid();
    const passwordHash = await hashPassword(dto.password);

    try {
      await this.prisma.$transaction((tx) => this.completeInTransaction(tx, callerId, email, passwordHash));
    } catch (error) {
      // Another account took the address between the check and the write (unique index on users.email or on the identity key).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw emailConflict();
      throw error;
    }
    return { linked: true as const, email };
  }

  private async completeInTransaction(tx: Prisma.TransactionClient, callerId: string, email: string, passwordHash: string) {
    // Same two locks, caller first, as `AccountLinkService`: one account adds one email login at a time, and two
    // accounts cannot claim the same address at once. Signup takes no lock; the unique indexes cover that race.
    const callerScope = JSON.stringify(['account-link-caller', callerId, V1AuthProvider.email]);
    const identityScope = JSON.stringify(['account-link-identity', V1AuthProvider.email, email]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${callerScope}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identityScope}, 0))`;

    // Lock the caller's row so a suspension or deletion committing meanwhile is seen, not raced.
    await tx.$queryRaw`SELECT id FROM "v1_users" WHERE id = ${callerId} FOR UPDATE`;
    const caller = await tx.v1User.findUnique({
      where: { id: callerId },
      select: { ...LINK_CALLER_SELECT, authIdentities: { where: { status: 'active' }, select: { provider: true } } },
    });
    if (!caller) throw userNotFound();
    assertLinkableCaller(caller, 'email');
    if (caller.authIdentities.some((identity) => identity.provider === V1AuthProvider.email)) throw emailLoginExists();
    await assertEmailFree(tx, callerId, email);

    const now = new Date();
    const identity = await tx.v1AuthIdentity.create({
      data: {
        userId: callerId,
        provider: V1AuthProvider.email,
        providerUserKey: email,
        email,
        passwordHash,
        status: 'active',
        lastLoginAt: now,
      },
      select: { id: true },
    });
    // The address that proved itself becomes the account's email, replacing a contact email the account carried.
    await tx.v1User.update({ where: { id: callerId }, data: { email, emailVerifiedAt: now } });
    await tx.v1StatusChangeLog.create({
      data: {
        targetType: 'auth_identity',
        targetId: identity.id,
        fromStatus: 'unlinked',
        toStatus: 'linked',
        actorType: 'user',
        actorUserId: callerId,
        reason: 'email_login_added',
      },
    });
  }
}

/** Refuses an address another account holds as its email or as its email login key; says nothing else about that account. */
async function assertEmailFree(db: EmailLookupClient, callerId: string, email: string) {
  const holder = await db.v1User.findFirst({
    where: {
      id: { not: callerId },
      OR: [{ email }, { authIdentities: { some: { provider: V1AuthProvider.email, providerUserKey: email } } }],
    },
    select: { id: true },
  });
  if (holder) throw emailConflict();
}

function userNotFound() {
  return new NotFoundException({ code: 'NOT_FOUND', message: 'V1 user was not found' });
}

function emailLoginExists() {
  return new ConflictException({
    code: 'SOCIAL_LINK_PROVIDER_EXISTS',
    message: '이 계정에는 이미 이메일 로그인이 연결돼 있어요.',
  });
}

function emailConflict() {
  return new ConflictException({ code: 'EMAIL_CONFLICT', message: '이미 다른 계정에서 쓰는 이메일이에요.' });
}

function emailLinkTokenInvalid() {
  return new BadRequestException({
    code: 'EMAIL_LINK_TOKEN_INVALID',
    message: '이메일 인증이 만료됐거나 올바르지 않아요. 인증번호를 다시 받아 주세요.',
  });
}
