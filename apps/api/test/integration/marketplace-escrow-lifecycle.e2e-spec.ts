import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';
import { PrismaClient, OrderStatus, DisputeStatus, SettlementStatus } from '@prisma/client';
import {
  createListing,
  createEscrowOrder,
  createHeldSettlement,
  createReleasedSettlement,
} from '../fixtures/marketplace';
import { createSinaro, createMarketSeller } from '../fixtures/personas';
import { MarketplaceCron } from '../../src/marketplace/marketplace.cron';

// ---------------------------------------------------------------------------
// Marketplace escrow lifecycle integration tests
// buy → (escrow_held) → ship → deliver → confirmReceipt → (completed)
// buy → (escrow_held) → fileDispute → (disputed) → admin resolve → (refund/release)
// ---------------------------------------------------------------------------

describe('Marketplace Escrow Lifecycle (e2e)', () => {
  let app: INestApplication;
  let request: ReturnType<typeof import('supertest')['agent']>;
  let prisma: PrismaClient;
  let closeApp: () => Promise<void>;
  let cron: MarketplaceCron;

  // Tokens
  let buyerToken: string;
  let sellerToken: string;
  let adminToken: string;

  // User IDs
  let buyerId: string;
  let sellerId: string;

  beforeAll(async () => {
    prisma = getPrismaTestClient();
    const testApp = await createTestApp();
    app = testApp.app;
    request = testApp.request;
    closeApp = testApp.close;
    cron = app.get(MarketplaceCron);
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    // Create personas
    const buyer = await createSinaro(prisma);
    const seller = await createMarketSeller(prisma);
    buyerId = buyer.id;
    sellerId = seller.id;

    buyerToken = await devLoginToken(request, buyer.nickname);
    sellerToken = await devLoginToken(request, seller.nickname);

    // Create admin persona directly
    const admin = await prisma.user.create({
      data: {
        nickname: 'admin_escrow_test',
        role: 'admin',
        oauthProvider: 'email',
        oauthId: 'email_admin_escrow_test',
      },
    });
    adminToken = await devLoginToken(request, admin.nickname);
  });

  afterAll(async () => {
    await closeApp();
    await disconnectPrismaTestClient();
  });

  // ── Buy → escrow_held ───────────────────────────────────────────────────────

  describe('POST /marketplace/listings/:id/order', () => {
    it('creates a pending order for a buyer, returning orderId + amount', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });

      const orderRes = await request
        .post(`/api/v1/marketplace/listings/${listing.id}/order`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.data.payment.amount).toBe(50000);
      expect(orderRes.body.data.payment.orderId).toMatch(/^MU-MKT-/);

      const order = await prisma.marketplaceOrder.findFirst({
        where: { buyerId: buyerId, listingId: listing.id },
      });
      expect(order).not.toBeNull();
      expect(order!.status).toBe(OrderStatus.pending);
    });

    it('settlement record is in held status after escrow_held order is created', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);

      await createHeldSettlement(prisma, order.id, order.orderId, sellerId, order.amount);

      const settlement = await prisma.settlementRecord.findFirst({
        where: { recipientId: sellerId, status: SettlementStatus.held },
      });
      expect(settlement).not.toBeNull();
      expect(settlement!.commission).toBe(5000); // 10% of 50000
    });
  });

  // ── escrow_held → shipped → delivered → completed ──────────────────────────

  describe('Escrow state machine: ship → deliver → confirm receipt', () => {
    it('buyer confirms receipt after delivery, releasing funds', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);

      // Seller ships
      const shipRes = await request
        .post(`/api/v1/marketplace/orders/${order.id}/ship`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(shipRes.status).toBe(201);
      expect(shipRes.body.data.status).toBe(OrderStatus.shipped);

      // Seller marks as delivered
      const deliverRes = await request
        .post(`/api/v1/marketplace/orders/${order.id}/deliver`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(deliverRes.status).toBe(201);
      expect(deliverRes.body.data.status).toBe(OrderStatus.delivered);

      // Seed held settlement
      await createHeldSettlement(prisma, order.id, order.orderId, sellerId, order.amount);

      // Buyer confirms receipt → escrow released
      const receiptRes = await request
        .post(`/api/v1/marketplace/orders/${order.id}/confirm-receipt`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(receiptRes.status).toBe(201);
      expect(receiptRes.body.data.status).toBe(OrderStatus.completed);

      // Verify settlement released
      const settlement = await prisma.settlementRecord.findFirst({
        where: { orderId: order.id },
      });
      expect(settlement!.status).toBe(SettlementStatus.completed);
      expect(settlement!.releasedAt).not.toBeNull();
    });

    it('non-buyer cannot confirm receipt', async () => {
      const listing = await createListing(prisma, sellerId);
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        status: OrderStatus.delivered,
      });

      const res = await request
        .post(`/api/v1/marketplace/orders/${order.id}/confirm-receipt`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ── Dispute lifecycle ────────────────────────────────────────────────────────

  describe('Dispute lifecycle: file → seller respond → admin resolve', () => {
    it('buyer files dispute, order freezes in disputed state', async () => {
      const listing = await createListing(prisma, sellerId, { price: 80000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        amount: 80000,
      });

      const res = await request
        .post(`/api/v1/marketplace/orders/${order.id}/dispute`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          type: 'not_as_described',
          description: '상품이 사진과 전혀 달랐습니다. 심각한 파손이 있습니다.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(DisputeStatus.filed);

      const frozen = await prisma.marketplaceOrder.findUnique({ where: { id: order.id } });
      expect(frozen!.status).toBe(OrderStatus.disputed);

      // priorOrderStatus must be captured at filing time
      const dispute = await prisma.dispute.findFirst({ where: { orderId: order.id } });
      expect(dispute!.priorOrderStatus).toBe(OrderStatus.escrow_held);
    });

    it('admin resolves dispute with release action → seller gets funds', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);

      // Create dispute with priorOrderStatus
      const dispute = await prisma.dispute.create({
        data: {
          targetType: 'marketplace_order',
          orderId: order.id,
          type: 'not_delivered',
          buyerId,
          sellerId,
          description: 'Item was not delivered as promised.',
          status: DisputeStatus.filed,
          priorOrderStatus: OrderStatus.escrow_held,
        },
      });

      // Seed held settlement
      await createHeldSettlement(prisma, order.id, order.orderId, sellerId, order.amount);

      // Update order to disputed
      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.disputed },
      });

      // Admin resolves with release
      const resolveRes = await request
        .patch(`/api/v1/admin/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'release', note: '판매자 귀책 없음, 대금 지급 처리' });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.status).toBe(DisputeStatus.resolved_release);

      const updatedOrder = await prisma.marketplaceOrder.findUnique({ where: { id: order.id } });
      expect(updatedOrder!.status).toBe(OrderStatus.completed);

      // Settlement should be released inside the transaction
      const settlement = await prisma.settlementRecord.findFirst({ where: { orderId: order.id } });
      expect(settlement!.status).toBe(SettlementStatus.completed);
    });

    it('partial action is rejected with 400 at DTO validation level', async () => {
      const listing = await createListing(prisma, sellerId);
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);
      const dispute = await prisma.dispute.create({
        data: {
          targetType: 'marketplace_order',
          orderId: order.id,
          type: 'damaged',
          buyerId,
          sellerId,
          description: 'Item arrived with damage to the packaging.',
          status: DisputeStatus.admin_reviewing,
          priorOrderStatus: OrderStatus.escrow_held,
        },
      });
      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.disputed },
      });

      const res = await request
        .patch(`/api/v1/admin/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'partial' });

      expect(res.status).toBe(400);
    });

    // MP-E4: Buyer withdraws dispute → order restored to priorOrderStatus + autoReleaseAt preserved
    it('buyer withdraws dispute → order restored to prior status, no completedAt, autoReleaseAt unchanged', async () => {
      const originalAutoReleaseAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        status: OrderStatus.delivered,
        autoReleaseAt: originalAutoReleaseAt,
      });

      const dispute = await prisma.dispute.create({
        data: {
          targetType: 'marketplace_order',
          orderId: order.id,
          type: 'not_as_described',
          buyerId,
          sellerId,
          description: 'Dispute filed in error.',
          status: DisputeStatus.filed,
          priorOrderStatus: OrderStatus.delivered,
        },
      });
      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.disputed },
      });

      const res = await request
        .post(`/api/v1/disputes/${dispute.id}/withdraw`)
        .set('Authorization', `Bearer ${buyerToken}`);

      // Endpoint may be 200 or 201 depending on controller; verify DB state regardless
      const updatedDispute = await prisma.dispute.findUnique({ where: { id: dispute.id } });
      expect(updatedDispute!.status).toBe(DisputeStatus.withdrawn);

      const updatedOrder = await prisma.marketplaceOrder.findUnique({ where: { id: order.id } });
      // Order must be restored to delivered — NOT forced to completed
      expect(updatedOrder!.status).toBe(OrderStatus.delivered);
      expect(updatedOrder!.completedAt).toBeNull();
      // autoReleaseAt must be preserved (not overwritten to null or now)
      expect(updatedOrder!.autoReleaseAt?.getTime()).toBe(originalAutoReleaseAt.getTime());
    });

    // MP-R1: Admin dismiss → order restored to priorOrderStatus
    it('admin dismiss → order restored to prior status, not forced to completed', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        status: OrderStatus.shipped,
      });

      const dispute = await prisma.dispute.create({
        data: {
          targetType: 'marketplace_order',
          orderId: order.id,
          type: 'damaged',
          buyerId,
          sellerId,
          description: 'Minor damage, easily fixable.',
          status: DisputeStatus.admin_reviewing,
          priorOrderStatus: OrderStatus.shipped,
        },
      });
      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.disputed },
      });

      const res = await request
        .patch(`/api/v1/admin/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'dismiss', note: '근거 불충분, 기각' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(DisputeStatus.dismissed);

      const updatedOrder = await prisma.marketplaceOrder.findUnique({ where: { id: order.id } });
      // Must restore to shipped, not force complete
      expect(updatedOrder!.status).toBe(OrderStatus.shipped);
      expect(updatedOrder!.completedAt).toBeNull();
    });
  });

  // ── Admin payout batch ─────────────────────────────────────────────────────

  describe('Admin payout batching', () => {
    it('creates payout and marks it paid', async () => {
      const listing = await createListing(prisma, sellerId);
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);

      // Create a completed settlement (simulating released escrow)
      const settlement = await createReleasedSettlement(
        prisma,
        order.id,
        order.orderId,
        sellerId,
        order.amount,
      );

      // List released settlements
      const listRes = await request
        .get('/api/v1/admin/settlements')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ status: 'completed' });

      expect(listRes.status).toBe(200);

      const found = (listRes.body.data.items as Array<{ id: string }>)
        .find((s) => s.id === settlement.id);
      expect(found).toBeDefined();
    });

    // MP-R2: createPayoutBatch groups by recipient and uses batchId
    it('createPayoutBatch creates one payout per recipient with batchId', async () => {
      const listing = await createListing(prisma, sellerId);
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        amount: 50000,
      });

      const settlement = await createReleasedSettlement(
        prisma,
        order.id,
        order.orderId,
        sellerId,
        order.amount,
      );

      const batchRes = await request
        .post('/api/v1/admin/payouts/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ settlementIds: [settlement.id], note: 'Test batch' });

      expect(batchRes.status).toBe(201);
      const payouts = batchRes.body.data as Array<{
        id: string;
        batchId: string;
        grossAmount: number;
        platformFee: number;
        netAmount: number;
        status: string;
      }>;
      expect(payouts).toHaveLength(1);
      expect(payouts[0].batchId).toBeTruthy();
      expect(payouts[0].grossAmount).toBe(50000);
      expect(payouts[0].platformFee).toBe(5000);
      expect(payouts[0].netAmount).toBe(45000);
      expect(payouts[0].status).toBe('pending');
    });

    // MP-R3: markPayoutPaid
    it('markPayoutPaid transitions payout to paid and cascades processedAt', async () => {
      const listing = await createListing(prisma, sellerId);
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        amount: 50000,
      });
      const settlement = await createReleasedSettlement(
        prisma,
        order.id,
        order.orderId,
        sellerId,
        order.amount,
      );

      const batchRes = await request
        .post('/api/v1/admin/payouts/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ settlementIds: [settlement.id] });

      expect(batchRes.status).toBe(201);
      const payoutId = batchRes.body.data[0].id as string;

      const paidRes = await request
        .patch(`/api/v1/admin/payouts/${payoutId}/mark-paid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Wire transfer ref #12345' });

      expect(paidRes.status).toBe(200);
      expect(paidRes.body.data.status).toBe('paid');

      // Cascade: settlement processedAt should be set
      const updatedSettlement = await prisma.settlementRecord.findUnique({
        where: { id: settlement.id },
      });
      expect(updatedSettlement!.processedAt).not.toBeNull();
    });
  });

  // ── MP-E1: confirmOrderPayment idempotency ──────────────────────────────────

  describe('MP-E1: confirmOrderPayment race guard', () => {
    it('second call on already-processed order returns 409', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);
      // Order is already escrow_held — simulates second confirm call
      const res = await request
        .post(`/api/v1/marketplace/orders/${order.orderId}/confirm`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ paymentKey: 'test-pk', orderId: order.orderId, amount: order.amount });

      // Should return 400/409 since order is already escrow_held
      expect([400, 409]).toContain(res.status);
    });
  });

  // ── MP-E2: fileDispute twice on same order ──────────────────────────────────

  describe('MP-E2: duplicate dispute rejection', () => {
    it('filing dispute twice on same order returns 409', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);

      // First dispute
      await prisma.dispute.create({
        data: {
          targetType: 'marketplace_order',
          orderId: order.id,
          type: 'not_as_described',
          buyerId,
          sellerId,
          description: 'First dispute.',
          status: DisputeStatus.filed,
          priorOrderStatus: OrderStatus.escrow_held,
        },
      });
      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.disputed },
      });

      const res = await request
        .post(`/api/v1/marketplace/orders/${order.id}/dispute`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          type: 'not_as_described',
          description: 'Trying to file a second dispute on the same order.',
        });

      expect(res.status).toBe(409);
    });
  });

  // ── Cron auto-release sweeper (real DB) ────────────────────────────────────

  describe('Cron auto-release sweeper', () => {
    // MP-E1: Cron auto-release happy path — hit real DB, call handler directly
    it('auto-releases orders whose autoReleaseAt has passed and no open dispute', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      // autoReleaseAt is in the past
      const pastDate = new Date(Date.now() - 60 * 1000);
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        status: OrderStatus.escrow_held,
        autoReleaseAt: pastDate,
      });
      await createHeldSettlement(prisma, order.id, order.orderId, sellerId, order.amount);

      // Ensure cron is not disabled
      const prevDisable = process.env.DISABLE_MARKETPLACE_CRON;
      process.env.DISABLE_MARKETPLACE_CRON = 'false';

      try {
        await cron.autoReleaseEscrow();
      } finally {
        process.env.DISABLE_MARKETPLACE_CRON = prevDisable ?? '';
      }

      const updatedOrder = await prisma.marketplaceOrder.findUnique({ where: { id: order.id } });
      expect(updatedOrder!.status).toBe(OrderStatus.auto_released);
      expect(updatedOrder!.releasedAt).not.toBeNull();
    });

    // Open dispute blocks cron auto-release
    it('does NOT auto-release when an open dispute exists on the order', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const pastDate = new Date(Date.now() - 60 * 1000);
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        status: OrderStatus.escrow_held,
        autoReleaseAt: pastDate,
      });

      // Create an open dispute (not in a terminal state)
      await prisma.dispute.create({
        data: {
          targetType: 'marketplace_order',
          orderId: order.id,
          type: 'not_delivered',
          buyerId,
          sellerId,
          description: 'Order not delivered, blocking auto-release.',
          status: DisputeStatus.filed,
          priorOrderStatus: OrderStatus.escrow_held,
        },
      });
      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.disputed },
      });

      const prevDisable = process.env.DISABLE_MARKETPLACE_CRON;
      process.env.DISABLE_MARKETPLACE_CRON = 'false';

      await cron.autoReleaseEscrow();

      process.env.DISABLE_MARKETPLACE_CRON = prevDisable ?? '';

      const unchangedOrder = await prisma.marketplaceOrder.findUnique({ where: { id: order.id } });
      // Must remain disputed — cron must NOT have touched it
      expect(unchangedOrder!.status).toBe(OrderStatus.disputed);
    });
  });

  // ── Concurrent confirmReceipt race ─────────────────────────────────────────

  describe('Concurrent confirmReceipt race guard', () => {
    // MP-R2: One wins, one gets 409 (updateMany race guard)
    it('second concurrent confirmReceipt on same order returns 409', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        status: OrderStatus.delivered,
      });
      await createHeldSettlement(prisma, order.id, order.orderId, sellerId, order.amount);

      // Fire two concurrent requests
      const [res1, res2] = await Promise.all([
        request
          .post(`/api/v1/marketplace/orders/${order.id}/confirm-receipt`)
          .set('Authorization', `Bearer ${buyerToken}`),
        request
          .post(`/api/v1/marketplace/orders/${order.id}/confirm-receipt`)
          .set('Authorization', `Bearer ${buyerToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // One must succeed (201), the other must be rejected (409)
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);
    });
  });

  // ── Payout batch edge cases ────────────────────────────────────────────────

  describe('Payout batch edge cases', () => {
    // MP-R10: Empty batch → 400
    it('createPayoutBatch with empty settlementIds returns 400', async () => {
      const res = await request
        .post('/api/v1/admin/payouts/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ settlementIds: [] });

      expect(res.status).toBe(400);
    });

    // MP-R11: Mark-paid on already-paid payout is idempotent (service returns early)
    it('markPayoutPaid on already-paid payout returns 200 (idempotent)', async () => {
      const listing = await createListing(prisma, sellerId);
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, {
        amount: 50000,
      });
      const settlement = await createReleasedSettlement(
        prisma,
        order.id,
        order.orderId,
        sellerId,
        order.amount,
      );

      // Create payout batch
      const batchRes = await request
        .post('/api/v1/admin/payouts/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ settlementIds: [settlement.id] });
      expect(batchRes.status).toBe(201);

      const payoutId = batchRes.body.data[0].id as string;

      // Mark paid once
      const firstPaidRes = await request
        .patch(`/api/v1/admin/payouts/${payoutId}/mark-paid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'First payment' });
      expect(firstPaidRes.status).toBe(200);
      expect(firstPaidRes.body.data.status).toBe('paid');

      // Mark paid again — service short-circuits with early return, not 409
      const secondPaidRes = await request
        .patch(`/api/v1/admin/payouts/${payoutId}/mark-paid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ note: 'Duplicate attempt' });
      expect(secondPaidRes.status).toBe(200);
      expect(secondPaidRes.body.data.status).toBe('paid');
    });
  });

  // ── Orders endpoints ───────────────────────────────────────────────────────

  describe('GET /marketplace/orders/me', () => {
    it('returns buyer orders list with pagination', async () => {
      const listing = await createListing(prisma, sellerId, { price: 40000 });
      await createEscrowOrder(prisma, listing.id, buyerId, sellerId, { amount: 40000 });

      const res = await request
        .get('/api/v1/marketplace/orders/me')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data).toHaveProperty('nextCursor');
    });

    it('returns only buyer orders when role=buyer (default)', async () => {
      const listing = await createListing(prisma, sellerId, { price: 40000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, { amount: 40000 });

      const res = await request
        .get('/api/v1/marketplace/orders/me')
        .query({ role: 'buyer' })
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data.items as Array<{ id: string }>).map((i) => i.id);
      expect(ids).toContain(order.id);
    });

    it('returns only seller orders when role=seller', async () => {
      const listing = await createListing(prisma, sellerId, { price: 40000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, { amount: 40000 });

      const res = await request
        .get('/api/v1/marketplace/orders/me')
        .query({ role: 'seller' })
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.status).toBe(200);
      const ids = (res.body.data.items as Array<{ id: string }>).map((i) => i.id);
      expect(ids).toContain(order.id);
    });

    it('returns 401 without auth token', async () => {
      const res = await request.get('/api/v1/marketplace/orders/me');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /marketplace/orders/:id', () => {
    it('returns order detail for buyer', async () => {
      const listing = await createListing(prisma, sellerId, { price: 40000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, { amount: 40000 });

      const res = await request
        .get(`/api/v1/marketplace/orders/${order.id}`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(order.id);
      expect(res.body.data.status).toBe(OrderStatus.escrow_held);
    });

    it('returns 403 for non-participant', async () => {
      const listing = await createListing(prisma, sellerId, { price: 40000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId, { amount: 40000 });

      // Third-party user
      const thirdParty = await prisma.user.create({
        data: {
          nickname: 'third_party_order_test',
          role: 'user',
          oauthProvider: 'email',
          oauthId: 'email_third_party_order_test',
        },
      });
      const thirdPartyToken = await devLoginToken(request, thirdParty.nickname);

      const res = await request
        .get(`/api/v1/marketplace/orders/${order.id}`)
        .set('Authorization', `Bearer ${thirdPartyToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent order', async () => {
      const res = await request
        .get('/api/v1/marketplace/orders/non-existent-id')
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(res.status).toBe(404);
    });
  });
});
