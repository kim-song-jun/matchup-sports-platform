// Unified Dispute types for Task 70.
// Replaces the team-match-only Dispute interface in types/api.ts.
// Admin pages that still reference the old Dispute shape will be migrated to this type
// as part of the admin UI update (separate wave).

/** Maps to Prisma DisputeStatus enum (migration 20260418070000). */
export type DisputeStatus =
  | 'filed'
  | 'seller_responded'
  | 'admin_reviewing'
  | 'resolved_refund'
  | 'resolved_release'
  | 'resolved_partial'
  | 'dismissed'
  | 'withdrawn';

/** Maps to Prisma DisputeTargetType enum. */
export type DisputeTargetType = 'marketplace_order' | 'team_match';

/** Maps to Prisma DisputeActorRole enum. */
export type DisputeActorRole = 'buyer' | 'seller' | 'admin' | 'system';

/** Admin resolve action values (ResolveDisputeDto.action). */
export type DisputeResolveAction = 'refund' | 'release' | 'partial' | 'dismiss';

/** Chronological event on a dispute (audit trail). Maps to Prisma DisputeEvent. */
export interface DisputeEvent {
  id: string;
  disputeId: string;
  actorUserId: string | null;
  actorRole: DisputeActorRole;
  message: string;
  attachmentUrls: string[];
  createdAt: string;
  actor?: { id: string; nickname: string; profileImageUrl: string | null } | null;
}

/** Unified dispute — covers both marketplace_order and team_match target types. */
export interface Dispute {
  id: string;
  targetType: DisputeTargetType;
  /** FK to MarketplaceOrder. Present when targetType = marketplace_order. */
  orderId: string | null;
  /** FK to TeamMatch. Present when targetType = team_match. */
  teamMatchId: string | null;
  reporterUserId: string;
  respondentUserId: string | null;
  /** Only set for team_match disputes. */
  reporterTeamId: string | null;
  reportedTeamId: string | null;
  type: string;
  reason: string;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  resolutionAmount: number | null;
  adminNotes: string | null;
  sellerRespondedAt: string | null;
  adminReviewingAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reporter?: { id: string; nickname: string; profileImageUrl: string | null };
  respondent?: { id: string; nickname: string; profileImageUrl: string | null } | null;
  events?: DisputeEvent[];
}

export interface RespondDisputeInput {
  message: string;
  attachmentUrls?: string[];
}

export interface AddDisputeMessageInput {
  message: string;
  attachmentUrls?: string[];
}

export interface WithdrawDisputeInput {
  reason?: string;
}

export interface ResolveDisputeInput {
  action: DisputeResolveAction;
  /** Required when action = partial. Amount in KRW won (integer). */
  amount?: number;
  note: string;
}

export interface ReviewDisputeInput {
  note?: string;
}
