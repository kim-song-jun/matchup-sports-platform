import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertEmailFree } from '../auth/email-holder';
import { assertRecentLogin } from '../auth/link-caller-guards';
import { normalizeEmail } from '../auth/normalize-email';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationService } from '../verification/verification.service';
import type { EmailChangeRequestDto, EmailChangeVerifyDto } from './dto/email-change.dto';
import { EMAIL_CHANGE_TOKEN_TTL_SECONDS, issueEmailChangeToken } from './email-change-token';

/**
 * The two steps before `PATCH /me/profile` may change the account email: mail a code to the new address, check it.
 * The session proves the account and the mailed code proves the address; the profile save then spends the token.
 *
 * `request` is the only step that checks how recent the sign-in is; the 10 minutes the `emailChangeToken` lives bound
 * the window for the save.
 */
@Injectable()
export class EmailChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationService,
  ) {}

  /** `sessionAgeSeconds` is null when the request has no cookie session (non-production header identity). */
  async requestCode(user: V1AuthUser, dto: EmailChangeRequestDto, sessionAgeSeconds: number | null) {
    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Account cannot be modified' });
    }
    const email = normalizeEmail(dto.email);

    const caller = await this.prisma.v1User.findUnique({
      where: { id: user.id },
      select: { email: true, authIdentities: { where: { status: 'active' }, select: { passwordHash: true } } },
    });
    if (!caller) throw new NotFoundException({ code: 'NOT_FOUND', message: 'V1 user was not found' });
    // A password account signs in with this address, so a stolen old session must not be able to move it.
    if (caller.authIdentities.some((identity) => Boolean(identity.passwordHash))) assertRecentLogin(sessionAgeSeconds);
    if (caller.email !== null && normalizeEmail(caller.email) === email) {
      throw new BadRequestException({ code: 'EMAIL_UNCHANGED', message: '지금 쓰는 이메일과 같아요.' });
    }
    await assertEmailFree(this.prisma, user.id, email);

    return this.verification.requestEmailChangeCode(user.id, email);
  }

  async verifyCode(userId: string, dto: EmailChangeVerifyDto) {
    const email = await this.verification.consumeEmailChangeCode(userId, dto.code);
    return { emailChangeToken: issueEmailChangeToken(userId, email), expiresInSeconds: EMAIL_CHANGE_TOKEN_TTL_SECONDS };
  }
}
