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
import { NotificationsService, type DeliveredNotification } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  buildDeletedEmail,
  buildDeletedPhone,
  clearDeletedAccountData,
} from '../users/final-account-deletion';
import { AppleIdentityService } from './apple-identity.service';
import { AppleTokenService } from './apple-token.service';
import { AuthService, kakaoVerifiedEmail, type KakaoProfile } from './auth.service';
import type { AppleLoginDto } from './dto/apple-login.dto';
import type { LinkKakaoDto } from './dto/link-kakao.dto';
import type { LinkPendingDto } from './dto/link-pending.dto';
import { normalizeEmail } from './normalize-email';
import { SOCIAL_PROVIDER_LABELS } from './social-link-conflict';
import { readSocialLinkToken, socialLinkAccountDigest, type LinkableSocialProvider } from './social-link-token';
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
  /** Digest of the unfinished signup account the identity may be taken from; held anywhere else it is refused. */
  heldByAccount?: string;
};

type LinkOutcome = {
  result: AccountLinkResult;
  /** The in-app notice created with a new link (not for an idempotent repeat); pushed once the link has committed. */
  notification: DeliveredNotification | null;
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
      email: kakaoVerifiedEmail(profile),
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

  /**
   * Attaches the provider identity a rejected social sign-in or signup left behind (`linkToken` from its 409), now
   * that the person has signed in to the account that sign-in collided with. The token names the accounts it may go
   * to, so a session of any other account is refused: the token alone is not proof of who is holding it.
   */
  async linkPending(callerId: string, dto: LinkPendingDto, sessionAgeSeconds: number | null): Promise<AccountLinkResult> {
    assertRecentLogin(sessionAgeSeconds);
    const token = readSocialLinkToken(dto.linkToken);
    if (!token) throw socialLinkTokenInvalid();
    if (!token.allowedAccounts.includes(socialLinkAccountDigest(callerId))) throw socialLinkTokenAccountMismatch();
    return this.link(
      callerId,
      token.kind === 'pending_account'
        ? { provider: token.provider, providerUserKey: token.providerUserKey, email: null, heldByAccount: token.pendingAccount }
        : { provider: token.provider, providerUserKey: token.providerUserKey, email: token.email },
    );
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
    if (outcome.notification) this.notifications.deliverCreated(callerId, 'social_identity_linked', outcome.notification);
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

    // Lock the caller's row so a suspension or deletion committing meanwhile is seen, not raced.
    await tx.$queryRaw`SELECT id FROM "v1_users" WHERE id = ${callerId} FOR UPDATE`;
    const caller = await tx.v1User.findUnique({
      where: { id: callerId },
      select: {
        accountStatus: true,
        deletedAt: true,
        onboardingStatus: true,
        adminUser: { select: { status: true } },
        authIdentities: {
          where: { status: 'active' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, provider: true, providerUserKey: true },
        },
      },
    });
    if (!caller) throw new NotFoundException({ code: 'NOT_FOUND', message: 'V1 user was not found' });
    if (caller.accountStatus !== 'active' || caller.deletedAt !== null) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '이용이 제한된 계정이에요.' });
    }
    // An operator's account is not changed by a link made from a browser session.
    if (caller.adminUser && caller.adminUser.status !== 'revoked') {
      throw new ForbiddenException({
        code: 'SOCIAL_LINK_ADMIN_FORBIDDEN',
        message: '운영 권한이 있는 계정에는 소셜 로그인을 연결할 수 없어요.',
      });
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
        notification: null,
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
            _count: { select: ACTIVITY_RELATION_COUNTS },
          },
        },
      },
    });

    if (identity.heldByAccount !== undefined) {
      // The token described an unfinished signup holding this identity; anything else means that moved on.
      if (!holder) throw socialLinkTokenInvalid();
      if (socialLinkAccountDigest(holder.user.id) !== identity.heldByAccount) throw providerInUse();
    }

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
    // A security notice, so it ignores notification settings and is stored with the link or not at all.
    const notification = await this.notifications.createInTransaction(tx, callerId, 'social_identity_linked', {
      vars: { name: SOCIAL_PROVIDER_LABELS[identity.provider] },
      businessKey: `social-link:${linkedIdentityId}`,
    });
    return {
      result: {
        provider: identity.provider,
        alreadyLinked: false,
        mergedPendingAccount: mergedUserId !== null,
        authProviders: distinctProviders(after),
      },
      notification,
      mergedUserId,
    };
  }

  /**
   * A team can invite a signup by its email before the signup is finished; those waiting invitations belong to the
   * person, so they move to the account that takes over. Where the caller is already a member or already has a
   * waiting invitation from the same team (one per team and person), or the caller sent it, the invitation is
   * cancelled instead of duplicated.
   */
  private async handOverTeamInvitations(tx: Prisma.TransactionClient, fromUserId: string, toUserId: string, now: Date) {
    const waiting = await tx.v1TeamInvitation.findMany({
      where: { invitedUserId: fromUserId, status: 'pending' },
      select: { id: true, teamId: true, invitedByUserId: true },
    });
    if (waiting.length === 0) return;

    const teamIds = [...new Set(waiting.map((invitation) => invitation.teamId))];
    const [memberships, callerInvitations] = await Promise.all([
      tx.v1TeamMembership.findMany({ where: { userId: toUserId, status: 'active', teamId: { in: teamIds } }, select: { teamId: true } }),
      tx.v1TeamInvitation.findMany({ where: { invitedUserId: toUserId, status: 'pending', teamId: { in: teamIds } }, select: { teamId: true } }),
    ]);
    const covered = new Set([...memberships, ...callerInvitations].map((row) => row.teamId));
    const moved: string[] = [];
    const redundant: string[] = [];
    for (const invitation of waiting) {
      // One move per team: two waiting invitations from the same team cannot both exist, but stay safe.
      const duplicate = covered.has(invitation.teamId) || invitation.invitedByUserId === toUserId;
      (duplicate ? redundant : moved).push(invitation.id);
      covered.add(invitation.teamId);
    }
    if (moved.length > 0) {
      await tx.v1TeamInvitation.updateMany({ where: { id: { in: moved }, status: 'pending' }, data: { invitedUserId: toUserId } });
    }
    if (redundant.length > 0) {
      await tx.v1TeamInvitation.updateMany({
        where: { id: { in: redundant }, status: 'pending' },
        data: { status: 'cancelled', respondedAt: now },
      });
    }
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
        // Out of the signup steps too, so a signup request still in flight finds nothing to complete.
        onboardingStatus: 'not_started',
        deletedAt: now,
        email: empty.email ? buildDeletedEmail(empty.id) : null,
        phone: empty.phone ? buildDeletedPhone(empty.id) : null,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
      },
    });
    if (retired.count !== 1) throw providerInUse();

    await clearDeletedAccountData(tx, empty.id, now);

    await tx.v1Inquiry.updateMany({ where: { userId: empty.id }, data: { userId: callerId } });
    await tx.v1UploadAsset.updateMany({ where: { ownerUserId: empty.id }, data: { ownerUserId: callerId } });
    await this.handOverTeamInvitations(tx, empty.id, callerId, now);
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

/**
 * Counts of the relations that mean an account has been used. A signup that was never used has none; it may still
 * hold inquiries and uploads, which move to the account it merges into.
 */
const ACTIVITY_RELATION_COUNTS = {
  teamMemberships: true,
  ownedTeams: true,
  teamJoinApplications: true,
  hostedMatches: true,
  matchApplications: true,
  matchParticipants: true,
  createdTeamMatches: true,
  teamMatchApplications: true,
  chatParticipations: true,
  chatMessages: true,
  tournamentRegistrationsApplied: true,
  tournamentPlayerEntries: true,
  tournamentStaffAssignments: true,
  tournamentReviews: true,
  postEventReviewsWritten: true,
} as const;

/** A signup nobody finished: on the signup steps, no admin role, no password, no login but this one, and no activity. */
function isEmptySignupAccount(holder: {
  id: string;
  status: string;
  passwordHash: string | null;
  user: {
    accountStatus: string;
    onboardingStatus: string;
    adminUser: { id: string } | null;
    authIdentities: { id: string }[];
    _count: Record<string, number>;
  };
}): boolean {
  return (
    holder.status === 'active' &&
    holder.passwordHash === null &&
    holder.user.accountStatus === 'active' &&
    isUnfinishedSocialSignup(holder.user.onboardingStatus) &&
    holder.user.adminUser === null &&
    holder.user.authIdentities.length === 1 &&
    holder.user.authIdentities[0]?.id === holder.id &&
    Object.values(holder.user._count).every((count) => count === 0)
  );
}

function distinctProviders(identities: { provider: V1AuthProvider }[]): V1AuthProvider[] {
  return [...new Set(identities.map((identity) => identity.provider))];
}

/** No session age is only possible with a non-production header identity; production never lets it through. */
function assertRecentLogin(sessionAgeSeconds: number | null) {
  if (sessionAgeSeconds === null ? process.env.NODE_ENV === 'production' : sessionAgeSeconds > RECENT_LOGIN_MAX_AGE_SECONDS) {
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

function socialLinkTokenInvalid() {
  return new BadRequestException({
    code: 'SOCIAL_LINK_TOKEN_INVALID',
    message: '연결 정보가 만료됐거나 올바르지 않아요. 카카오·Apple 로그인을 처음부터 다시 시도해 주세요.',
  });
}

function socialLinkTokenAccountMismatch() {
  return new ConflictException({
    code: 'SOCIAL_LINK_TOKEN_ACCOUNT_MISMATCH',
    message: '안내받은 계정과 다른 계정으로 로그인했어요. 설정 › 로그인 방법에서 직접 연결할 수 있어요.',
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
