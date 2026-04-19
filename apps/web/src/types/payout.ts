// Payout types for Task 70 admin payout batching.
// Maps to Prisma Payout model (migration 20260418070000).

/** Maps to Prisma PayoutStatus enum. */
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';

/** A payout record grouping N settlements for one recipient into a single bank transfer. */
export interface Payout {
  id: string;
  /** UUID shared across all payouts created in the same admin batch run. */
  batchId: string;
  recipientId: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  status: PayoutStatus;
  note: string | null;
  failureReason: string | null;
  paidAt: string | null;
  processedAt: string | null;
  markedPaidByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  recipient?: { id: string; nickname: string; email?: string | null; profileImageUrl: string | null };
  settlements?: EligibleSettlement[];
}

/** Settlement preview row returned by GET /admin/payouts/eligible — grouped by recipient. */
export interface EligibleSettlement {
  recipientId: string;
  recipientName: string;
  settlementCount: number;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  oldestReleasedAt: string;
}

export interface CreatePayoutBatchInput {
  /** Explicit settlement IDs — server uses this list directly when provided. */
  settlementIds?: string[];
  /** Recipient user IDs — server resolves all eligible settlements per recipient. */
  recipientIds?: string[];
  /** ISO date string. Server includes only settlements released at or before this date (used with recipientIds). */
  cutoffDate?: string;
}

export interface CreatePayoutBatchResponse {
  batchId: string;
  payouts: Payout[];
  totalNet: number;
}

export interface MarkPayoutPaidInput {
  externalRef?: string;
  note?: string;
}

export interface MarkPayoutFailedInput {
  reason: string;
}
