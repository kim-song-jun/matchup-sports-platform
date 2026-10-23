import { V1ConsentState, type Prisma } from '@prisma/client';
import type { SignupRecordConsentDto } from './dto/required-signup-profile.dto';

/**
 * Persists the signup-time public record choice inside the signup transaction.
 * An omitted choice initializes the public product default, without overwriting
 * an existing preference (e.g. a deferred member who already chose private).
 * The default policy marker is distinct from an explicit user consent.
 */
export async function recordSignupConsent(
  transaction: Pick<Prisma.TransactionClient, 'v1UserRecordConsent'>,
  userId: string,
  consent: SignupRecordConsentDto | undefined,
): Promise<void> {
  if (!consent) {
    await transaction.v1UserRecordConsent.upsert({
      where: { userId },
      update: {},
      create: { userId, state: V1ConsentState.GRANTED, policyHash: 'v1-public-record-default-2' },
    });
    return;
  }
  const state = consent.granted ? V1ConsentState.GRANTED : V1ConsentState.REVOKED;
  await transaction.v1UserRecordConsent.upsert({
    where: { userId },
    update: { state, policyHash: consent.policyHash, effectiveAt: new Date() },
    create: { userId, state, policyHash: consent.policyHash },
  });
}
