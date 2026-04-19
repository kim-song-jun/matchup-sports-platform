// Unified Dispute types — aligned to Prisma schema (disputes table) and DisputesService.
// Source of truth: apps/api/prisma/schema.prisma model Dispute + DisputeMessage + DisputeEvent.

/** Maps to Prisma DisputeStatus enum. */
export type DisputeStatus =
  | 'filed'
  | 'seller_responded'
  | 'admin_reviewing'
  | 'resolved_refund'
  | 'resolved_release'
  | 'withdrawn'
  | 'dismissed';

/** Maps to Prisma DisputeTargetType enum. */
export type DisputeTargetType = 'marketplace_order' | 'team_match';

/** Maps to Prisma DisputeActorRole enum. */
export type DisputeActorRole = 'buyer' | 'seller' | 'admin';

/** Admin resolve action tokens (ResolveDisputeDto.action). */
export type DisputeResolveAction = 'refund' | 'release' | 'dismiss';

/**
 * Chronological audit event on a dispute.
 * Serialized from DisputeMessage by DisputesService (messages → events alias).
 * Field mapping: authorId → actorUserId, role → actorRole, body → message.
 * Note: actor user object is NOT returned by the API; senderName must be derived client-side.
 */
export interface DisputeEvent {
  id: string;
  disputeId: string;
  actorUserId: string | null;
  actorRole: DisputeActorRole;
  message: string;
  attachmentUrls: string[];
  createdAt: string;
}

/**
 * Unified dispute — covers both marketplace_order and team_match target types.
 * Both target types use buyerId (disputing party / host) and sellerId (responding party).
 * buyer / seller are joined User objects returned by getDispute.
 */
export interface Dispute {
  id: string;
  targetType: DisputeTargetType;
  /** FK to MarketplaceOrder. Present when targetType = marketplace_order. */
  orderId: string | null;
  /** FK to TeamMatch. Present when targetType = team_match. */
  teamMatchId: string | null;
  /** Reason code string (e.g. "not_as_described", "no_show"). */
  type: string;
  status: DisputeStatus;
  /** Disputing party (buyer for marketplace, host team rep for team_match). */
  buyerId: string;
  /** Responding party (seller for marketplace, opponent team rep for team_match). */
  sellerId: string;
  buyer?: { id: string; nickname: string; profileImageUrl: string | null } | null;
  seller?: { id: string; nickname: string; profileImageUrl: string | null } | null;
  description: string;
  resolution: string | null;
  resolvedByAdminId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: DisputeEvent[];
}

/** POST /marketplace/orders/:id/dispute */
export interface FileDisputeInput {
  type: 'not_delivered' | 'not_as_described' | 'damaged' | 'other';
  description: string;
  attachmentUrls?: string[];
}

/** POST /disputes/:id/respond — seller submits rebuttal. Maps to RespondDisputeDto.response. */
export interface SellerRespondInput {
  response: string;
  attachmentUrls?: string[];
}

/** POST /disputes/:id/messages — buyer or seller adds a thread message. Maps to DisputeMessageDto.body. */
export interface AddDisputeMessageInput {
  body: string;
  attachmentUrls?: string[];
}

/** PATCH /admin/disputes/:id/resolve */
export interface ResolveDisputeInput {
  action: DisputeResolveAction;
  note?: string;
}

/** POST /admin/disputes/:id/review */
export interface ReviewDisputeInput {
  note?: string;
}

/** POST /disputes/:id/withdraw */
export interface WithdrawDisputeInput {
  reason?: string;
}
