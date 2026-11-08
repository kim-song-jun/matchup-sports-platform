import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  isExpiredSocialSignup,
  isPendingSocialSignup,
  isUnfinishedSocialSignup,
  SOCIAL_SIGNUP_TTL_MS,
  type PendingSocialSignupStatus,
} from './social-signup-access';

/**
 * Counts of the relations that mean an account has been used. A signup that was never used has none; it may still
 * hold inquiries and uploads, which move to the account it merges into.
 */
export const ACTIVITY_RELATION_COUNTS = {
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
export function isEmptySignupAccount(holder: {
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

const SIGNUP_STEP_STATUSES: PendingSocialSignupStatus[] = ['social_terms_required', 'social_profile_required'];

/**
 * Why a signup's number was freed: the person left through logout, the 24h signup window ran out and the owner came
 * back, or someone else proved the number while the expired signup was still holding it.
 */
export type SignupPhoneReleaseReason = 'abandoned_signup' | 'expired_signup' | 'expired_signup_lazy';

/**
 * Frees the phone number a social signup holds while it is still on the terms or profile step. The number is saved
 * the moment Kakao hands it over or an SMS code confirms it, long before the signup is finished, and `v1_users.phone`
 * is unique, so a signup nobody finishes would otherwise keep the number from everyone else.
 *
 * Only an empty signup (see `isEmptySignupAccount`) on one of those two steps is touched; a member who skipped the
 * profile step (`social_profile_deferred`) is already using the account and keeps the number. A release writes a
 * `user_phone` status log in the same client, so call this inside a transaction. Returns whether a number was
 * released.
 */
export async function releaseSignupPhone(
  db: Pick<Prisma.TransactionClient, 'v1AuthIdentity' | 'v1User' | 'v1StatusChangeLog'>,
  userId: string,
  reason: SignupPhoneReleaseReason,
  /** Release only if the signup has not been touched since this instant, so a signup that just moved on keeps its number. */
  idleSince?: Date,
): Promise<boolean> {
  const holder = await db.v1AuthIdentity.findFirst({
    where: { userId, status: 'active' },
    select: {
      id: true,
      status: true,
      passwordHash: true,
      user: {
        select: {
          accountStatus: true,
          onboardingStatus: true,
          phone: true,
          adminUser: { select: { id: true } },
          authIdentities: { where: { status: 'active' }, select: { id: true } },
          _count: { select: ACTIVITY_RELATION_COUNTS },
        },
      },
    },
  });
  if (!holder || holder.user.phone === null) return false;
  if (!isPendingSocialSignup(holder.user.onboardingStatus) || !isEmptySignupAccount(holder)) return false;

  const released = await db.v1User.updateMany({
    where: {
      id: userId,
      accountStatus: 'active',
      onboardingStatus: { in: SIGNUP_STEP_STATUSES },
      phone: { not: null },
      ...(idleSince ? { updatedAt: { lt: idleSince } } : {}),
    },
    data: { phone: null, phoneVerifiedAt: null },
  });
  if (released.count !== 1) return false;

  const byUser = reason === 'abandoned_signup';
  await db.v1StatusChangeLog.create({
    data: {
      targetType: 'user_phone',
      targetId: userId,
      fromStatus: 'signup',
      toStatus: 'released',
      actorType: byUser ? 'user' : 'system',
      actorUserId: byUser ? userId : null,
      reason,
    },
  });
  return true;
}

/**
 * Frees `phone` when its holder is an empty social signup whose 24h window has already run out — nobody is coming back
 * to finish it, and phone-first signup saves a number onto the account before the rest of the form. Call it only after
 * the caller proved they hold the number (SMS code or provider-confirmed): freeing is the same for everyone, but the
 * answer that follows must not tell an unproven caller who holds a number. Returns whether a number was released.
 */
export async function releaseExpiredSignupPhone(
  prisma: Pick<PrismaService, 'v1User' | '$transaction'>,
  phone: string,
  exceptUserId?: string,
): Promise<boolean> {
  const holder = await prisma.v1User.findUnique({
    where: { phone },
    select: { id: true, onboardingStatus: true, createdAt: true, updatedAt: true },
  });
  if (!holder || holder.id === exceptUserId || !isExpiredSocialSignup(holder)) return false;

  const idleSince = new Date(Date.now() - SOCIAL_SIGNUP_TTL_MS);
  return prisma.$transaction((tx) => releaseSignupPhone(tx, holder.id, 'expired_signup_lazy', idleSince));
}
