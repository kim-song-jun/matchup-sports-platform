import { createHash, randomBytes, randomInt } from 'node:crypto';
import {
  BadRequestException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Prisma, type V1LoginStepUpChallenge } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VerificationDispatcherService } from '../../verification/verification-dispatcher.service';
import { maskEmail } from '../account-recovery.service';
import { hashPassword, verifyPassword } from '../password-hash';
import { LOGIN_SECURITY_POLICY } from './login-security.policy';

export interface LoginStepUpChallengeView {
  challengeToken: string;
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
  /** Echo environments only (no real mail transport). A decoy carries one too — its code never verifies — so its presence says nothing. */
  devCode?: string;
}

export interface LoginStepUpResend {
  expiresAt: string;
  resendAvailableAt: string;
  devCode?: string;
}

/**
 * Email-code challenge that follows a correct-or-incorrect password while step-up is required.
 *
 * A challenge is either deliverable (`userId` set: the password matched, a code was mailed) or a decoy
 * (`userId` null: nothing was mailed). The caller can never tell them apart: both are issued, resent and
 * verified through the same steps with the same scrypt work, and a decoy can never verify.
 */
@Injectable()
export class LoginStepUpService implements OnApplicationShutdown {
  private readonly logger = new Logger(LoginStepUpService.name);
  private readonly inFlightSends = new Set<Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: VerificationDispatcherService,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([...this.inFlightSends]);
  }

  async start(input: { email: string; emailKey: string; userId: string | null }): Promise<LoginStepUpChallengeView> {
    const now = new Date();
    await this.assertSendCapacity(input.emailKey, now);

    const token = randomBytes(32).toString('base64url');
    const code = newCode();
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(now.getTime() + LOGIN_SECURITY_POLICY.codeTtlMs);
    const challenge = await this.prisma.v1LoginStepUpChallenge.create({
      data: {
        tokenHash: hashToken(token),
        emailKey: input.emailKey,
        userId: input.userId,
        codeHash,
        sentCount: input.userId ? 1 : 0,
        expiresAt,
        lastSentAt: now,
      },
    });
    if (input.userId) this.sendInBackground(challenge.id, input.userId, code);

    return {
      challengeToken: token,
      maskedEmail: maskEmail(input.email),
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt(now).toISOString(),
      ...(this.dispatcher.devEchoActive ? { devCode: code } : {}),
    };
  }

  async resend(token: string): Promise<LoginStepUpResend> {
    const now = new Date();
    const challenge = await this.findUsable(token, now);

    // After a failed delivery the user must be able to retry at once; otherwise the cooldown would lock them out.
    if (!challenge.sendFailedAt) this.assertCooldownElapsed(challenge.lastSentAt, now);
    await this.assertSendCapacity(challenge.emailKey, now);

    const code = newCode();
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(now.getTime() + LOGIN_SECURITY_POLICY.codeTtlMs);
    // Matching lastSentAt makes two concurrent resends race for one winner; the loser sees the cooldown.
    const claimed = await this.prisma.v1LoginStepUpChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, lastSentAt: challenge.lastSentAt },
      data: {
        codeHash,
        expiresAt,
        attemptCount: 0,
        lastSentAt: now,
        sendFailedAt: null,
        ...(challenge.userId ? { sentCount: { increment: 1 } } : {}),
      },
    });
    if (claimed.count === 0) throw resendCooldown(LOGIN_SECURITY_POLICY.resendCooldownMs);

    if (challenge.userId) {
      if (challenge.sendFailedAt) {
        // The previous mail never left; report this failure instead of hiding it behind a 200.
        await this.send(challenge.id, challenge.userId, code);
      } else {
        this.sendInBackground(challenge.id, challenge.userId, code);
      }
    }
    return {
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt(now).toISOString(),
      ...(this.dispatcher.devEchoActive ? { devCode: code } : {}),
    };
  }

  /** Resolves to the account the challenge was issued for. Decoys and wrong codes never resolve. */
  async verify(token: string, code: string): Promise<{ userId: string; emailKey: string }> {
    const now = new Date();
    const challenge = await this.findUsable(token, now, { codeMustBeLive: true });

    // Reserve the attempt before comparing so concurrent guesses cannot exceed the limit.
    let attemptCount: number;
    try {
      ({ attemptCount } = await this.prisma.v1LoginStepUpChallenge.update({
        where: { id: challenge.id, attemptCount: { lt: LOGIN_SECURITY_POLICY.maxCodeAttempts } },
        data: { attemptCount: { increment: 1 } },
        select: { attemptCount: true },
      }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw tooManyAttempts();
      throw error;
    }

    const matches = await verifyPassword(code, challenge.codeHash);
    if (matches && challenge.userId) {
      const consumed = await this.prisma.v1LoginStepUpChallenge.updateMany({
        where: { id: challenge.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count === 0) throw stepUpExpired();
      return { userId: challenge.userId, emailKey: challenge.emailKey };
    }

    if (attemptCount >= LOGIN_SECURITY_POLICY.maxCodeAttempts) throw tooManyAttempts();
    throw new BadRequestException({ code: 'STEP_UP_CODE_INVALID', message: '인증번호가 올바르지 않아요.' });
  }

  private async findUsable(
    token: string,
    now: Date,
    options: { codeMustBeLive?: boolean } = {},
  ): Promise<V1LoginStepUpChallenge> {
    const challenge = await this.prisma.v1LoginStepUpChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
    const tooOld =
      challenge !== null && now.getTime() - challenge.createdAt.getTime() > LOGIN_SECURITY_POLICY.challengeMaxAgeMs;
    const codeExpired = options.codeMustBeLive === true && challenge !== null && challenge.expiresAt <= now;
    if (!challenge || challenge.usedAt || tooOld || codeExpired) throw stepUpExpired();
    return challenge;
  }

  private assertCooldownElapsed(lastSentAt: Date, now: Date): void {
    const remainingMs = lastSentAt.getTime() + LOGIN_SECURITY_POLICY.resendCooldownMs - now.getTime();
    if (remainingMs > 0) throw resendCooldown(remainingMs);
  }

  /** The cap is per email and counts mails actually sent, so decoys (0 mails) never eat a real user's quota. */
  private async assertSendCapacity(emailKey: string, now: Date): Promise<void> {
    const since = new Date(now.getTime() - LOGIN_SECURITY_POLICY.sendCapWindowMs);
    const sent = await this.prisma.v1LoginStepUpChallenge.aggregate({
      _sum: { sentCount: true },
      where: { emailKey, lastSentAt: { gt: since } },
    });
    if ((sent._sum.sentCount ?? 0) >= LOGIN_SECURITY_POLICY.sendCapPerDay) {
      throw new HttpException(
        {
          code: 'STEP_UP_SEND_LIMIT',
          message: '인증번호를 너무 많이 요청했어요. 내일 다시 시도해 주세요.',
          details: { retryAfterSeconds: LOGIN_SECURITY_POLICY.sendCapWindowMs / 1000 },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Mail delivery stays off the request path so a real challenge answers as fast as a decoy. A failure is
   * logged and persisted by `send`, and surfaces to the user on the next resend.
   */
  private sendInBackground(challengeId: string, userId: string, code: string): void {
    const delivery = this.send(challengeId, userId, code).then(
      () => undefined,
      () => undefined,
    );
    this.inFlightSends.add(delivery);
    void delivery.finally(() => this.inFlightSends.delete(delivery));
  }

  private async send(challengeId: string, userId: string, code: string): Promise<void> {
    try {
      const identity = await this.prisma.v1AuthIdentity.findFirst({
        where: { userId, provider: 'email' },
        select: { providerUserKey: true },
      });
      if (!identity) throw new Error('email identity not found for step-up challenge');
      await this.dispatcher.send('email', identity.providerUserKey, code, 'login_step_up');
    } catch (error) {
      await this.recordSendFailure(challengeId, error);
      throw error;
    }
  }

  private async recordSendFailure(challengeId: string, error: unknown): Promise<void> {
    this.logger.error(
      `login step-up mail failed (challenge ${challengeId}): ${error instanceof Error ? error.message : String(error)}`,
    );
    try {
      await this.prisma.v1LoginStepUpChallenge.update({
        where: { id: challengeId },
        data: { sendFailedAt: new Date() },
      });
    } catch (persistError) {
      this.logger.error(
        `could not persist step-up send failure (challenge ${challengeId}): ${persistError instanceof Error ? persistError.message : String(persistError)}`,
      );
    }
  }
}

function newCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** The token is 256 random bits, so an unsalted digest is enough; the DB never holds the usable value. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function resendAvailableAt(now: Date): Date {
  return new Date(now.getTime() + LOGIN_SECURITY_POLICY.resendCooldownMs);
}

function stepUpExpired(): GoneException {
  return new GoneException({ code: 'STEP_UP_EXPIRED', message: '인증 시간이 지났어요. 처음부터 다시 로그인해 주세요.' });
}

function tooManyAttempts(): HttpException {
  return new HttpException(
    { code: 'STEP_UP_TOO_MANY_ATTEMPTS', message: '인증번호를 너무 많이 틀렸어요. 인증번호를 다시 받아 주세요.' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

function resendCooldown(remainingMs: number): HttpException {
  const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return new HttpException(
    {
      code: 'STEP_UP_RESEND_COOLDOWN',
      message: `잠시 후 다시 받을 수 있어요. (${retryAfterSeconds}초 뒤)`,
      details: { retryAfterSeconds },
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
