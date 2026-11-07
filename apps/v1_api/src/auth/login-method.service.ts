import { ConflictException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, V1AuthProvider } from '@prisma/client';
import { NotificationsService, type DeliveredNotification } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { buildDeletedProviderUserKey } from '../users/final-account-deletion';
import { AppleTokenService } from './apple-token.service';
import type { UnlinkableLoginProvider } from './dto/unlink-login-method.dto';
import { EMAIL_LOGIN_LABEL } from './email-link.service';
import { assertLinkableCaller, assertRecentLogin, LINK_CALLER_SELECT } from './link-caller-guards';
import { SOCIAL_PROVIDER_LABELS } from './social-link-conflict';
import type { V1SessionProof } from './v1-session';

const LOGIN_METHOD_LABELS: Record<UnlinkableLoginProvider, string> = {
  kakao: SOCIAL_PROVIDER_LABELS.kakao,
  apple: SOCIAL_PROVIDER_LABELS.apple,
  email: EMAIL_LOGIN_LABEL,
};

export type UnlinkResult = {
  provider: UnlinkableLoginProvider;
  /** The account's login methods after the removal. */
  authProviders: V1AuthProvider[];
  /** The epoch cookies must carry from now on; the controller re-signs the caller's cookie with it. */
  sessionEpoch: number;
};

/**
 * Lets the signed-in user remove a login method from, or sign out every other device of, their own account.
 *
 * Both bump `sessionEpoch`, which revokes every cookie issued before; the caller's own cookie is re-signed by the
 * controller so this device stays signed in. `proof` is what the request's cookie session proves (null for a
 * non-production header identity): its epoch is checked under the user's row lock, so a request that was already
 * revoked by a racing bump cannot mint a fresh cookie out of its own stale one.
 */
@Injectable()
export class LoginMethodService {
  private readonly logger = new Logger(LoginMethodService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly appleTokens: AppleTokenService,
    @Inject(RealtimeGateway)
    private readonly realtimeGateway: Pick<RealtimeGateway, 'forceDisconnectUser'>,
  ) {}

  async unlink(callerId: string, provider: UnlinkableLoginProvider, proof: V1SessionProof | null): Promise<UnlinkResult> {
    assertRecentLogin(proof?.ageSeconds ?? null, 'unlink');
    const { result, notification } = await this.prisma.$transaction((tx) => this.unlinkInTransaction(tx, callerId, provider, proof));
    this.closeOpenSockets(callerId);
    if (notification) this.notifications.deliverCreated(callerId, 'social_identity_unlinked', notification);
    // Sign in with Apple expects an app to revoke the grant when the person disconnects it; a failure is logged and
    // leaves the sealed token on the row, where account deletion revokes it.
    if (provider === V1AuthProvider.apple) void this.appleTokens.revokeForUser(callerId);
    return result;
  }

  /** `proof` as in `unlink`; no recent sign-in is required, since this only ever narrows who can act as the account. */
  async revokeOtherSessions(callerId: string, proof: V1SessionProof | null): Promise<{ sessionEpoch: number }> {
    const { sessionEpoch } = await this.prisma.$transaction(async (tx) => {
      await lockSession(tx, callerId, proof);
      const bumped = await tx.v1User.update({
        where: { id: callerId },
        data: { sessionEpoch: { increment: 1 } },
        select: { sessionEpoch: true },
      });
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'user_session',
          targetId: callerId,
          fromStatus: 'active',
          toStatus: 'revoked',
          actorType: 'user',
          actorUserId: callerId,
          reason: 'sessions_revoked',
        },
      });
      return { sessionEpoch: bumped.sessionEpoch };
    });
    this.closeOpenSockets(callerId);
    return { sessionEpoch };
  }

  /**
   * An open socket checks the session only at its handshake, so the bump alone leaves other devices connected. Closing
   * every socket of the account makes each one reconnect: this device with the cookie the response re-signs, the others
   * with a revoked cookie the handshake refuses. The removal has committed, so a failure here is logged, not raised.
   */
  private closeOpenSockets(userId: string): void {
    try {
      this.realtimeGateway.forceDisconnectUser(userId);
    } catch (error) {
      this.logger.warn(`socket disconnect after a session revoke failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async unlinkInTransaction(
    tx: Prisma.TransactionClient,
    callerId: string,
    provider: UnlinkableLoginProvider,
    proof: V1SessionProof | null,
  ): Promise<{ result: UnlinkResult; notification: DeliveredNotification | null }> {
    // The row lock also orders two removals of one account: each decides "is this the last method" on the other's result.
    await lockSession(tx, callerId, proof);
    const caller = await tx.v1User.findUnique({
      where: { id: callerId },
      select: {
        ...LINK_CALLER_SELECT,
        authIdentities: {
          where: { status: 'active' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, provider: true, passwordHash: true },
        },
      },
    });
    if (!caller) throw userNotFound();
    assertLinkableCaller(caller, 'unlink');

    const targets = caller.authIdentities.filter((identity) => identity.provider === provider);
    if (targets.length === 0) throw loginMethodNotFound();
    const remaining = caller.authIdentities.filter((identity) => identity.provider !== provider);
    if (!remaining.some(canSignIn)) throw lastLoginMethod();

    const now = new Date();
    for (const target of targets) {
      await tx.v1AuthIdentity.update({
        where: { id: target.id },
        // An address is not an external identity that must stay reserved: freeing the key lets the next email login
        // (this account's or another's) claim it, and the row is reused when this account adds one again.
        data:
          provider === V1AuthProvider.email
            ? { status: 'unlinked', unlinkedAt: now, passwordHash: null, email: null, providerUserKey: buildDeletedProviderUserKey(callerId, target.id) }
            : { status: 'unlinked', unlinkedAt: now },
      });
      await tx.v1StatusChangeLog.create({
        data: {
          targetType: 'auth_identity',
          targetId: target.id,
          fromStatus: 'linked',
          toStatus: 'unlinked',
          actorType: 'user',
          actorUserId: callerId,
          reason: 'login_method_removed',
        },
      });
    }
    const bumped = await tx.v1User.update({
      where: { id: callerId },
      data: { sessionEpoch: { increment: 1 } },
      select: { sessionEpoch: true },
    });

    // A security notice, so it ignores notification settings and is stored with the removal or not at all.
    const notification = await this.notifications.createInTransaction(tx, callerId, 'social_identity_unlinked', {
      vars: { name: LOGIN_METHOD_LABELS[provider] },
      businessKey: `login-method-removed:${targets[0].id}:${bumped.sessionEpoch}`,
    });
    return {
      result: {
        provider,
        authProviders: [...new Set(remaining.map((identity) => identity.provider))],
        sessionEpoch: bumped.sessionEpoch,
      },
      notification,
    };
  }
}

/** Whether the identity can open a session: Naver has no login route, and an email login needs its password. */
function canSignIn(identity: { provider: V1AuthProvider; passwordHash: string | null }): boolean {
  if (identity.provider === V1AuthProvider.email) return identity.passwordHash !== null;
  return identity.provider === V1AuthProvider.kakao || identity.provider === V1AuthProvider.apple;
}

/** Locks the caller's row and refuses a cookie session another epoch bump has already revoked. */
async function lockSession(tx: Prisma.TransactionClient, callerId: string, proof: V1SessionProof | null) {
  const rows = await tx.$queryRaw<{ session_epoch: number }[]>`SELECT session_epoch FROM "v1_users" WHERE id = ${callerId} FOR UPDATE`;
  if (rows.length === 0) throw userNotFound();
  if (proof !== null && rows[0].session_epoch !== proof.sessionEpoch) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: '로그인이 만료됐어요. 다시 로그인해 주세요.' });
  }
}

function userNotFound() {
  return new NotFoundException({ code: 'NOT_FOUND', message: 'V1 user was not found' });
}

function loginMethodNotFound() {
  return new NotFoundException({ code: 'LOGIN_METHOD_NOT_FOUND', message: '연결돼 있지 않은 로그인 수단이에요.' });
}

function lastLoginMethod() {
  return new ConflictException({
    code: 'LAST_LOGIN_METHOD',
    message: '마지막 남은 로그인 수단은 해제할 수 없어요. 다른 로그인 수단을 먼저 연결해 주세요.',
  });
}
