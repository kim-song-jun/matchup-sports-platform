import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { readWithdrawalCancelToken } from './withdrawal-cancel-token';

/**
 * Takes a withdrawal request back. The only way in is the token a sign-in handed out after verifying the
 * account's own credentials; the response is the one a normal sign-in gives, so the session cookie is written
 * by the same interceptor.
 *
 * Teams and rosters the request released are not restored: the account comes back as an ordinary member
 * without them. Any `withdrawal_pending` account qualifies, including one an admin set that way; operator
 * sanctions are `suspended` / `blocked`, which this never lifts.
 */
@Injectable()
export class WithdrawalRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async cancel(token: string) {
    const claims = readWithdrawalCancelToken(token);
    if (!claims) throw invalidToken();

    const restored = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "v1_users" WHERE id = ${claims.userId} FOR UPDATE
      `;
      const user = await tx.v1User.findUnique({
        where: { id: claims.userId },
        select: { accountStatus: true, sessionEpoch: true },
      });
      if (!user) throw invalidToken();
      if (user.accountStatus === 'deleted') {
        throw new ConflictException({
          code: 'WITHDRAWAL_ALREADY_PROCESSED',
          message: '탈퇴 처리가 이미 끝난 계정이라 되돌릴 수 없어요.',
        });
      }
      // The epoch moves on every cancel, so a token works once; any other status change also voids it.
      if (user.accountStatus !== 'withdrawal_pending' || user.sessionEpoch !== claims.sessionEpoch) {
        throw invalidToken();
      }

      const next = await tx.v1User.update({
        where: { id: claims.userId },
        data: { accountStatus: 'active', sessionEpoch: { increment: 1 }, lastLoginAt: new Date() },
        select: { id: true, email: true, sessionEpoch: true },
      });
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'user',
          targetId: next.id,
          fromStatus: 'withdrawal_pending',
          toStatus: 'active',
          actorType: 'user',
          actorUserId: next.id,
          reason: null,
        },
      });
      return next;
    });

    return this.auth.sessionResponse(restored.id, restored.email, { sessionEpoch: restored.sessionEpoch });
  }
}

function invalidToken(): BadRequestException {
  return new BadRequestException({
    code: 'WITHDRAWAL_CANCEL_TOKEN_INVALID',
    message: '탈퇴 철회 시간이 지났어요. 다시 로그인해 주세요.',
  });
}
