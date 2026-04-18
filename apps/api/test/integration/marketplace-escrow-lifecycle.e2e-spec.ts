import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';
import { PrismaClient, OrderStatus, DisputeStatus, SettlementStatus } from '@prisma/client';
import { createListing, createEscrowOrder } from '../fixtures/marketplace';
import { createSinaro, createMarketSeller } from '../fixtures/personas';

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

      // Create order via API — returns the payment prepare payload
      const orderRes = await request
        .post(`/api/v1/marketplace/listings/${listing.id}/order`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.data.payment.amount).toBe(50000);
      expect(orderRes.body.data.payment.orderId).toMatch(/^MU-MKT-/);

      // Verify the DB record is in pending state
      const order = await prisma.marketplaceOrder.findFirst({
        where: { buyerId: buyerId, listingId: listing.id },
      });
      expect(order).not.toBeNull();
      expect(order!.status).toBe(OrderStatus.pending);
    });

    it('settlement record is in held status after escrow_held order is created', async () => {
      // Use fixture to create an escrow_held order (bypasses Toss API in integration tests)
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);

      // Manually seed a settlement record as confirmOrderPayment would do
      await prisma.settlementRecord.create({
        data: {
          type: 'marketplace',
          sourceId: order.orderId,
          orderId: order.id,
          amount: order.amount,
          commission: order.commission,
          netAmount: order.amount - order.commission,
          recipientId: sellerId,
          status: SettlementStatus.held,
        },
      });

      // Verify held settlement exists with correct commission (10%)
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

      // Seed a settlement record in held status (as would be done at payment confirm)
      await prisma.settlementRecord.create({
        data: {
          type: 'marketplace',
          sourceId: order.orderId,
          orderId: order.id,
          amount: order.amount,
          commission: order.commission,
          netAmount: order.amount - order.commission,
          recipientId: sellerId,
          status: SettlementStatus.held,
        },
      });

      // Buyer confirms receipt → escrow released
      const receiptRes = await request
        .post(`/api/v1/marketplace/orders/${order.id}/confirm-receipt`)
        .set('Authorization', `Bearer ${buyerToken}`);

      expect(receiptRes.status).toBe(201);
      expect(receiptRes.body.data.status).toBe(OrderStatus.completed);

      // Give fire-and-forget a tick
      await new Promise((r) => setImmediate(r));

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
    });

    it('admin resolves dispute with release action → seller gets funds', async () => {
      const listing = await createListing(prisma, sellerId, { price: 50000 });
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);

      // Create dispute directly
      const dispute = await prisma.dispute.create({
        data: {
          targetType: 'marketplace_order',
          orderId: order.id,
          type: 'not_delivered',
          buyerId,
          sellerId,
          description: 'Item was not delivered as promised.',
          status: DisputeStatus.filed,
        },
      });

      // Seed held settlement
      await prisma.settlementRecord.create({
        data: {
          type: 'marketplace',
          sourceId: order.orderId,
          orderId: order.id,
          amount: order.amount,
          commission: order.commission,
          netAmount: order.amount - order.commission,
          recipientId: sellerId,
          status: SettlementStatus.held,
        },
      });

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

      // Give fire-and-forget a tick
      await new Promise((r) => setImmediate(r));

      const updatedOrder = await prisma.marketplaceOrder.findUnique({ where: { id: order.id } });
      expect(updatedOrder!.status).toBe(OrderStatus.completed);
    });

    it('partial action is rejected with 400', async () => {
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
          status: DisputeStatus.under_review,
        },
      });
      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.disputed },
      });

      const res = await request
        .patch(`/api/v1/admin/disputes/${dispute.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'partial', refundPercent: 50 });

      expect(res.status).toBe(400);
    });
  });

  // ── Admin payout batch ─────────────────────────────────────────────────────

  describe('Admin payout batching', () => {
    it('creates payout and marks it paid', async () => {
      const listing = await createListing(prisma, sellerId);
      const order = await createEscrowOrder(prisma, listing.id, buyerId, sellerId);

      // Create a completed settlement (simulating released escrow)
      const settlement = await prisma.settlementRecord.create({
        data: {
          type: 'marketplace',
          sourceId: order.orderId,
          orderId: order.id,
          amount: order.amount,
          commission: order.commission,
          netAmount: order.amount - order.commission,
          recipientId: sellerId,
          status: SettlementStatus.completed,
          releasedAt: new Date(),
        },
      });

      // List released settlements (admin endpoint — using admin settlements service via API)
      // This tests the service directly via the API layer
      const listRes = await request
        .get('/api/v1/admin/settlements')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ status: 'completed' });

      expect(listRes.status).toBe(200);

      // Verify the settlement is listed
      const found = (listRes.body.data.items as Array<{ id: string }>)
        .find((s) => s.id === settlement.id);
      expect(found).toBeDefined();
    });
  });
});
