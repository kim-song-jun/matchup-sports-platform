import { PrismaClient, Payment, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createMatchWithParticipants } from './matches';

/**
 * Creates a Payment linked to a real MatchParticipant.
 * Automatically creates a match and participant if no participantId is provided.
 */
export async function createPayment(
  prisma: PrismaClient,
  userId: string,
  overrides: Partial<{
    participantId: string;
    amount: number;
    status: PaymentStatus;
  }> = {},
): Promise<Payment> {
  let participantId = overrides.participantId;

  if (!participantId) {
    const { participants } = await createMatchWithParticipants(
      prisma,
      userId,
      [userId],
    );
    participantId = participants[0].id;
  }

  return prisma.payment.create({
    data: {
      userId,
      participantId,
      amount: overrides.amount ?? 15000,
      orderId: `MU-${Date.now()}-${randomUUID().slice(0, 8)}`,
      status: overrides.status ?? PaymentStatus.pending,
    },
  });
}
