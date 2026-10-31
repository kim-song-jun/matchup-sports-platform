import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1AuthProvider } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  buildDeletedEmail,
  buildDeletedPhone,
  buildDeletedProfileData,
} from '../users/deleted-account-values';
import { AppleIdentityService } from './apple-identity.service';
import { AppleTokenService } from './apple-token.service';
import { AuthService, type KakaoProfile } from './auth.service';
import type { AppleLoginDto } from './dto/apple-login.dto';
import type { LinkKakaoDto } from './dto/link-kakao.dto';
import { normalizeEmail } from './normalize-email';
import {
  SOCIAL_PROVIDER_LABELS,
  type LinkableSocialProvider,
} from './social-link-conflict';
import {
  ACTIVITY_PROFILE_ROUTE,
  getPendingSocialSignupRoute,
  isUnfinishedSocialSignup,
} from './social-signup-access';

/** A session older than this must sign in again before it can attach a login method. */
export const RECENT_LOGIN_MAX_AGE_SECONDS = 30 * 60;

export type AccountLinkResult = {
  provider: LinkableSocialProvider;
  /** The caller already had this exact provider identity; nothing was written. */
  alreadyLinked: boolean;
  /** The identity sat on an empty signup account, which was retired and its leftovers moved to the caller. */
  mergedPendingAccount: boolean;
  authProviders: V1AuthProvider[];
};

type VerifiedProviderIdentity = {
  provider: LinkableSocialProvider;
  providerUserKey: string;
  /** Only a provider-verified address; never a self-declared one. */
  email: string | null;
};

type LinkOutcome = {
  result: AccountLinkResult;
  /** Set when a new link was written (not for an idempotent repeat). */
  linkedIdentityId: string | null;
  mergedUserId: string | null;
};

const UNFINISHED_SIGNUP_STATUSES = ['social_terms_required', 'social_profile_required', 'social_profile_deferred'] as const;

/**
 * Attaches a Kakao or Apple login to the account the caller is signed in as.
 *
 * Ownership of the target account is proven by the session (the caller signed in with that account's own login
 * method); ownership of the provider identity is proven by the provider token verified here. Neither a phone
 * number nor an email address takes part, so neither can open a way into someone else's account.
 */
@Injectable()
export class AccountLinkService {
  private readonly logger = new Logger(AccountLinkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly appleIdentity: AppleIdentityService,
    private readonly appleTokens: AppleTokenService,
    private readonly notifications: NotificationsService,
    @Inject(RealtimeGateway)
    private readonly realtimeGateway: Pick<RealtimeGateway, 'forceDisconnectUser'>,
  ) {}

  /** `sessionAgeSeconds` is null when the request has no cookie session (non-production header identity). */
  async linkKakao(callerId: string, dto: LinkKakaoDto, sessionAgeSeconds: number | null): Promise<AccountLinkResult> {
    assertRecentLogin(sessionAgeSeconds);
    const profile = await this.verifyKakao(dto);
    return this.link(callerId, {
      provider: V1AuthProvider.kakao,
      providerUserKey: profile.providerUserKey,
      email: profile.email && profile.emailValid && profile.emailVerified ? normalizeEmail(profile.email) : null,
    });
  }

  async linkApple(callerId: string, dto: AppleLoginDto, sessionAgeSeconds: number | null): Promise<AccountLinkResult> {
    assertRecentLogin(sessionAgeSeconds);
    const claims = await this.appleIdentity.verifyIdentityToken(dto.identityToken, dto.nonce);
    const result = await this.link(callerId, {
      provider: V1AuthProvider.apple,
      providerUserKey: claims.subject,
      email: claims.email && claims.emailVerified ? normalizeEmail(claims.email) : null,
    });
    if (dto.authorizationCode) {
      await this.appleTokens.storeFromAuthorizationCode({
        subject: claims.subject,
        clientId: claims.audience,
        authorizationCode: dto.authorizationCode,
      });
    }
    return result;
  }

  private verifyKakao(dto: LinkKakaoDto): Promise<KakaoProfile> {
    if (dto.accessToken !== undefined) {
      if (dto.code !== undefined || dto.redirectUri !== undefined) throw invalidKakaoForm();
      return this.auth.fetchKakaoProfileForToken(dto.accessToken);
    }
    if (dto.code === undefined || dto.redirectUri === undefined) throw invalidKakaoForm();
    return this.auth.fetchKakaoProfileForCode(dto.code, dto.redirectUri);
  }

  private async link(callerId: string, identity: VerifiedProviderIdentity): Promise<AccountLinkResult> {
    let outcome: LinkOutcome;
    try {
      outcome = await this.prisma.$transaction((tx) => this.linkInTransaction(tx, callerId, identity));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw providerInUse();
      }
      throw error;
    }

    if (outcome.mergedUserId) {
      try {
        this.realtimeGateway.forceDisconnectUser(outcome.mergedUserId);
      } catch (error) {
        this.logger.warn(`socket disconnect after account merge failed: ${errorText(error)}`);
      }
    }
    if (outcome.linkedIdentityId) {
      try {
        await this.notifications.emitNotification(callerId, 'social_identity_linked', null, undefined, {
          vars: { name: SOCIAL_PROVIDER_LABELS[identity.provider] },
          businessKey: `social-link:${outcome.linkedIdentityId}`,
        });
      } catch (error) {
        this.logger.warn(`social link notification failed: ${errorText(error)}`);
      }
    }
    return outcome.result;
  }

  private async linkInTransaction(
    tx: Prisma.TransactionClient,
    callerId: string,
    identity: VerifiedProviderIdentity,
  ): Promise<LinkOutcome> {
    // Two locks, always taken caller-first: one caller cannot attach two identities of a provider at once, and two
    // callers cannot claim the same external identity at once. The unique index alone would not stop the first.
    const callerScope = JSON.stringify(['account-link-caller', callerId, identity.provider]);
    const identityScope = JSON.stringify(['account-link-identity', identity.provider, identity.providerUserKey]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${callerScope}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identityScope}, 0))`;

    const caller = await tx.v1User.findUnique({
      where: { id: callerId },
      select: {
        accountStatus: true,
        onboardingStatus: true,
        authIdentities: {
          where: { status: 'active' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, provider: true, providerUserKey: true },
        },
      },
    });
    if (!caller) throw new NotFoundException({ code: 'NOT_FOUND', message: 'V1 user was not found' });
    if (caller.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '이용이 제한된 계정이에요.' });
    }
    if (isUnfinishedSocialSignup(caller.onboardingStatus)) throw signupIncomplete(caller.onboardingStatus);

    const sameProvider = caller.authIdentities.find((existing) => existing.provider === identity.provider);
    if (sameProvider) {
      if (sameProvider.providerUserKey !== identity.providerUserKey) throw providerExists(identity.provider);
      return {
        result: {
          provider: identity.provider,
          alreadyLinked: true,
          mergedPendingAccount: false,
          authProviders: distinctProviders(caller.authIdentities),
        },
        linkedIdentityId: null,
        mergedUserId: null,
      };
    }

    const now = new Date();
    const holder = await tx.v1AuthIdentity.findUnique({
      where: { provider_providerUserKey: { provider: identity.provider, providerUserKey: identity.providerUserKey } },
      select: {
        id: true,
        status: true,
        passwordHash: true,
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            accountStatus: true,
            onboardingStatus: true,
            adminUser: { select: { id: true } },
            authIdentities: { where: { status: 'active' }, select: { id: true } },
          },
        },
      },
    });

    let linkedIdentityId: string;
    let mergedUserId: string | null = null;
    if (!holder) {
      const created = await tx.v1AuthIdentity.create({
        data: {
          userId: callerId,
          provider: identity.provider,
          providerUserKey: identity.providerUserKey,
          email: identity.email,
          status: 'active',
          lastLoginAt: now,
        },
        select: { id: true },
      });
      linkedIdentityId = created.id;
    } else {
      if (!isEmptySignupAccount(holder)) throw providerInUse();
      await this.retireEmptyAccount(tx, holder.user, callerId, now);
      const moved = await tx.v1AuthIdentity.updateMany({
        where: { id: holder.id, userId: holder.user.id, status: 'active' },
        data: { userId: callerId, lastLoginAt: now },
      });
      if (moved.count !== 1) throw providerInUse();
      linkedIdentityId = holder.id;
      mergedUserId = holder.user.id;
    }

    await tx.v1StatusChangeLog.create({
      data: {
        targetType: 'auth_identity',
        targetId: linkedIdentityId,
        fromStatus: mergedUserId ? 'pending_social_account' : 'unlinked',
        toStatus: 'linked',
        actorType: 'user',
        actorUserId: callerId,
        reason: `account_link:${identity.provider}${mergedUserId ? ';merged_pending_user' : ''}`,
      },
    });

    const after = await tx.v1AuthIdentity.findMany({
      where: { userId: callerId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { provider: true },
    });
    return {
      result: {
        provider: identity.provider,
        alreadyLinked: false,
        mergedPendingAccount: mergedUserId !== null,
        authProviders: distinctProviders(after),
      },
      linkedIdentityId,
      mergedUserId,
    };
  }

  /**
   * Retires an abandoned signup the same way an operator deletion does (placeholders free the unique email, phone and
   * nickname) and hands what it left behind to the caller. The guarded update doubles as the row lock: if the
   * account finished signup in the meantime it no longer matches and the link is refused.
   */
  private async retireEmptyAccount(
    tx: Prisma.TransactionClient,
    empty: { id: string; email: string | null; phone: string | null },
    callerId: string,
    now: Date,
  ) {
    const retired = await tx.v1User.updateMany({
      where: { id: empty.id, accountStatus: 'active', onboardingStatus: { in: [...UNFINISHED_SIGNUP_STATUSES] } },
      data: {
        accountStatus: 'deleted',
        deletedAt: now,
        email: empty.email ? buildDeletedEmail(empty.id) : null,
        phone: empty.phone ? buildDeletedPhone(empty.id) : null,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
      },
    });
    if (retired.count !== 1) throw providerInUse();

    await tx.v1UserProfile.updateMany({ where: { userId: empty.id }, data: buildDeletedProfileData(empty.id, now) });
    await tx.v1UserRecordConsent.updateMany({
      where: { userId: empty.id, state: 'GRANTED' },
      data: { state: 'REVOKED', effectiveAt: now },
    });
    await tx.v1PushSubscription.deleteMany({ where: { userId: empty.id } });
    await tx.v1PushDevice.deleteMany({ where: { userId: empty.id } });
    await tx.v1ChatUserBlock.deleteMany({ where: { OR: [{ blockerUserId: empty.id }, { blockedUserId: empty.id }] } });
    await tx.v1UserRegion.deleteMany({ where: { userId: empty.id } });
    await tx.v1UserSportPreference.deleteMany({ where: { userId: empty.id } });
    await tx.v1SearchHistory.deleteMany({ where: { userId: empty.id } });
    await tx.v1VerificationToken.deleteMany({ where: { userId: empty.id } });

    await tx.v1Inquiry.updateMany({ where: { userId: empty.id }, data: { userId: callerId } });
    await tx.v1UploadAsset.updateMany({ where: { ownerUserId: empty.id }, data: { ownerUserId: callerId } });
    await tx.v1StatusChangeLog.create({
      data: {
        targetType: 'user',
        targetId: empty.id,
        fromStatus: 'active',
        toStatus: 'deleted',
        actorType: 'user',
        actorUserId: callerId,
        reason: 'account_link:merged_into_existing_user',
      },
    });
  }
}

/** A signup nobody finished: still on the signup steps, no admin role, no password, and no login but this one. */
function isEmptySignupAccount(holder: {
  id: string;
  status: string;
  passwordHash: string | null;
  user: {
    accountStatus: string;
    onboardingStatus: string;
    adminUser: { id: string } | null;
    authIdentities: { id: string }[];
  };
}): boolean {
  return (
    holder.status === 'active' &&
    holder.passwordHash === null &&
    holder.user.accountStatus === 'active' &&
    isUnfinishedSocialSignup(holder.user.onboardingStatus) &&
    holder.user.adminUser === null &&
    holder.user.authIdentities.length === 1 &&
    holder.user.authIdentities[0]?.id === holder.id
  );
}

function distinctProviders(identities: { provider: V1AuthProvider }[]): V1AuthProvider[] {
  return [...new Set(identities.map((identity) => identity.provider))];
}

function assertRecentLogin(sessionAgeSeconds: number | null) {
  if (sessionAgeSeconds !== null && sessionAgeSeconds > RECENT_LOGIN_MAX_AGE_SECONDS) {
    throw new ForbiddenException({
      code: 'RECENT_LOGIN_REQUIRED',
      message: '보안을 위해 다시 로그인한 뒤 연결해 주세요.',
      details: { maxAgeSeconds: RECENT_LOGIN_MAX_AGE_SECONDS },
    });
  }
}

function signupIncomplete(onboardingStatus: string) {
  return new ForbiddenException({
    code: 'SIGNUP_INCOMPLETE',
    message: '가입을 먼저 마무리해 주세요.',
    details: { next: { route: getPendingSocialSignupRoute(onboardingStatus) ?? ACTIVITY_PROFILE_ROUTE } },
  });
}

function providerExists(provider: LinkableSocialProvider) {
  const label = SOCIAL_PROVIDER_LABELS[provider];
  return new ConflictException({
    code: 'SOCIAL_LINK_PROVIDER_EXISTS',
    message: `이 계정에는 이미 다른 ${label} 계정이 연결돼 있어요.`,
  });
}

function providerInUse() {
  return new ConflictException({
    code: 'SOCIAL_LINK_PROVIDER_IN_USE',
    message: '이미 다른 팀밋 계정에 연결된 로그인이에요. 그 계정으로 로그인해 주세요.',
  });
}

function invalidKakaoForm() {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: '카카오 로그인 정보가 올바르지 않아요. 다시 시도해 주세요.',
  });
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
