import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma, V1AuthProvider } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { withoutKakaoPrefill } from './kakao-profile';
import { describeError, readKakaoAdminKey } from './kakao-unlink.service';

/**
 * Kakao's "unlink" notification: the member disconnected Teameet from their Kakao account's connected services.
 *
 * Only the Kakao login method counts as cut. The login row stays active, because Kakao accepts the same member
 * number again at the next login, and the account, session and profile are untouched. What changes is one
 * status-change row and the Kakao values kept in the member's unfinished signup draft.
 */

export const KAKAO_APP_ID_ENV = 'KAKAO_APP_ID';

const KNOWN_REFERRER_TYPES: ReadonlySet<string> = new Set([
  'ACCOUNT_DELETE',
  'FORCED_ACCOUNT_DELETE',
  'UNLINK_FROM_ADMIN',
  'UNLINK_FROM_APPS',
  'INCOMPLETE_SIGN_UP',
]);
const OTHER_REFERRER_TYPE = 'other';
/** Kakao app ids and member numbers are int64 values sent as decimal strings. */
const DECIMAL_ID = /^\d{1,20}$/;

type UnlinkNotice = { appId: string; memberNumber: string; referrerType: string };

@Injectable()
export class KakaoWebhookService {
  private readonly logger = new Logger(KakaoWebhookService.name);
  private warnedOff = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws only for a request that is not Kakao's well-formed call (503, 401, 400 in that order). Past those checks
   * it always returns, because Kakao does not resend an unlink notification and a failed one is only counted against us.
   */
  async receiveUnlink(authorization: string | undefined, body: unknown): Promise<void> {
    const adminKey = readKakaoAdminKey();
    const appId = process.env[KAKAO_APP_ID_ENV]?.trim() || null;
    // Without the app id every notification would count as another app's and be dropped silently.
    if (!adminKey || !appId) {
      this.warnOnce();
      throw new ServiceUnavailableException({
        code: 'KAKAO_WEBHOOK_NOT_CONFIGURED',
        message: 'The Kakao unlink webhook is not configured',
      });
    }
    if (!matchesAdminKey(authorization, adminKey)) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'The Kakao admin key does not match' });
    }
    const notice = readNotice(body);
    if (!notice) {
      throw new BadRequestException({ code: 'KAKAO_WEBHOOK_INVALID_BODY', message: 'The unlink notification is malformed' });
    }
    if (notice.appId !== appId) {
      this.logger.warn('Kakao unlink webhook ignored result=app_mismatch');
      return;
    }

    try {
      await this.record(notice);
    } catch (err) {
      this.logger.error(`Kakao unlink webhook failed result=failed error=${describeError(err)}`);
    }
  }

  private async record(notice: UnlinkNotice): Promise<void> {
    const identity = await this.prisma.v1AuthIdentity.findUnique({
      where: { provider_providerUserKey: { provider: V1AuthProvider.kakao, providerUserKey: notice.memberNumber } },
      select: { id: true, userId: true, status: true },
    });
    if (!identity) {
      this.logger.log('Kakao unlink webhook result=unknown_user');
      return;
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.v1StatusChangeLog.create({
        data: {
          targetType: 'auth_identity',
          targetId: identity.id,
          fromStatus: identity.status,
          toStatus: 'provider_unlinked',
          actorType: 'system',
          reason: `kakao_unlink_webhook:${notice.referrerType}`,
        },
      });
      await this.dropKakaoDraftValues(transaction, identity.userId);
    });
    this.logger.log(`Kakao unlink webhook user=${identity.userId} referrer=${notice.referrerType} result=recorded`);
  }

  /** Written only when a Kakao key is actually present, so a repeated notification changes nothing. */
  private async dropKakaoDraftValues(transaction: Prisma.TransactionClient, userId: string): Promise<void> {
    const progress = await transaction.v1UserOnboardingProgress.findUnique({ where: { userId }, select: { draftJson: true } });
    const draft = progress?.draftJson;
    if (!isRecord(draft)) return;
    const stripped = withoutKakaoPrefill(draft);
    if (Object.keys(stripped).length === Object.keys(draft).length) return;
    await transaction.v1UserOnboardingProgress.update({ where: { userId }, data: { draftJson: stripped as Prisma.InputJsonObject } });
  }

  private warnOnce(): void {
    if (this.warnedOff) return;
    this.warnedOff = true;
    this.logger.warn(`Kakao unlink webhook is off — both ${KAKAO_APP_ID_ENV} and the admin key must be set.`);
  }
}

function matchesAdminKey(authorization: string | undefined, adminKey: string): boolean {
  if (typeof authorization !== 'string') return false;
  const expected = Buffer.from(`KakaoAK ${adminKey}`);
  const received = Buffer.from(authorization);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** The body is read by hand: the global ValidationPipe answers 400 to fields it does not know, such as group_user_token. */
function readNotice(body: unknown): UnlinkNotice | null {
  if (!isRecord(body)) return null;
  const { app_id: appId, user_id: memberNumber, referrer_type: referrerType } = body;
  if (typeof appId !== 'string' || !DECIMAL_ID.test(appId)) return null;
  if (typeof memberNumber !== 'string' || !DECIMAL_ID.test(memberNumber)) return null;
  return {
    appId,
    memberNumber,
    referrerType: typeof referrerType === 'string' && KNOWN_REFERRER_TYPES.has(referrerType) ? referrerType : OTHER_REFERRER_TYPE,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
