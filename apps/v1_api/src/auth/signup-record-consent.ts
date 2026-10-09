import { V1ConsentState, type Prisma } from '@prisma/client';
import type { SignupRecordConsentDto } from './dto/required-signup-profile.dto';

/**
 * Persists the signup-time public record choice inside the signup transaction.
 * Writes the same V1UserRecordConsent row as PUT /me/record-consent; no row when omitted.
 */
export async function recordSignupConsent(
  transaction: Pick<Prisma.TransactionClient, 'v1UserRecordConsent'>,
  userId: string,
  consent: SignupRecordConsentDto | undefined,
): Promise<void> {
  if (!consent) return;
  const state = consent.granted ? V1ConsentState.GRANTED : V1ConsentState.REVOKED;
  await transaction.v1UserRecordConsent.upsert({
    where: { userId },
    update: { state, policyHash: consent.policyHash, effectiveAt: new Date() },
    create: { userId, state, policyHash: consent.policyHash },
  });
}
