// Marketplace order and escrow lifecycle types for Task 70.
// OrderStatus values extend the generated enum — auto_released is not yet in enums.generated.ts
// because the Prisma migration (20260418070000) is applied by the backend agent in parallel.
// Define the extended union locally to avoid blocking the frontend.

import type { OrderStatus } from './enums.generated';

/** Extended order status including auto_released which lands in enums.generated after migration. */
export type MarketplaceOrderStatus = OrderStatus | 'auto_released';

export interface ShipOrderInput {
  carrier?: string;
  trackingNumber?: string;
}

export interface FileDisputeInput {
  type: 'not_as_described' | 'not_delivered' | 'damaged' | 'other';
  description: string;
  attachmentUrls?: string[];
}

export interface MarketplaceOrder {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  /** Platform commission amount (computed at order creation). */
  commission: number;
  /** Toss Payments order ID (MU-MKT-{uuid}) — distinct from the DB `id`. */
  orderId: string;
  status: MarketplaceOrderStatus;
  /** Toss Payments payment key — unique per successful payment. */
  paymentKey: string | null;
  /** ISO timestamp when payment was confirmed by Toss. */
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  /** ISO timestamp when buyer confirmed receipt or escrow auto-released. */
  completedAt: string | null;
  confirmedReceiptAt: string | null;
  /** ISO timestamp at which the escrow auto-releases (deliveredAt + 7d). Set when status -> delivered. */
  autoReleaseAt: string | null;
  /** ISO timestamp when escrow was released (buyer confirm OR cron auto-release). */
  releasedAt: string | null;
  /** Rental period start (only set for rental listings). */
  rentalStartDate: string | null;
  /** Rental period end (only set for rental listings). */
  rentalEndDate: string | null;
  createdAt: string;
  updatedAt: string;
  listing?: {
    id: string;
    title: string;
    imageUrls: string[];
    price: number;
  };
  buyer?: { id: string; nickname: string; profileImageUrl: string | null };
  seller?: { id: string; nickname: string; profileImageUrl: string | null };
  /** Attached dispute summary (if any). */
  dispute?: {
    id: string;
    status: string;
    type: string;
    createdAt: string;
  } | null;
}

export interface ForceReleaseOrderInput {
  note: string;
}
