import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1OpsDisputeStatus, V1OpsReportStatus, V1PaymentOrderStatus, V1SettlementBatchStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmPaymentDto,
  CreatePaymentOrderDto,
  DisputeActionDto,
  OpsQueueQueryDto,
  PayoutRequestDto,
  RefundPaymentDto,
  ReportActionDto,
  SettlementActionDto,
  TossWebhookDto,
} from './dto/admin.dto';
import { TossPaymentsService } from './toss-payments.service';

type ActiveAdmin = {
  id: string;
  userId: string;
  adminRole: 'owner' | 'ops' | 'support';
  status: 'active';
};

const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
const DISPUTE_STATUSES = ['open', 'assigned', 'waiting_party', 'resolved', 'rejected'] as const;
const PAYMENT_STATUSES = ['pending', 'confirmed', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'expired'] as const;
const SETTLEMENT_STATUSES = ['draft', 'reviewing', 'approved', 'payout_requested', 'partially_paid', 'paid', 'failed', 'held'] as const;

@Injectable()
export class AdminOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tossPayments: TossPaymentsService,
  ) {}

  async overview(user: V1AuthUser) {
    await this.getActiveAdmin(user.id);
    const [
      openReports,
      activeDisputes,
      pendingPayments,
      refundRequests,
      settlementReviews,
      payoutFailures,
      recentEvents,
    ] = await Promise.all([
      this.prisma.v1OpsReport.count({ where: { status: { in: ['open', 'reviewing'] } } }),
      this.prisma.v1OpsDispute.count({ where: { status: { in: ['open', 'assigned', 'waiting_party'] } } }),
      this.prisma.v1PaymentOrder.count({ where: { status: { in: ['pending', 'failed'] } } }),
      this.prisma.v1PaymentRefund.count({ where: { status: { in: ['requested', 'reviewing', 'failed'] } } }),
      this.prisma.v1SettlementBatch.count({ where: { status: { in: ['draft', 'reviewing', 'held', 'failed'] } } }),
      this.prisma.v1PayoutAttempt.count({ where: { status: 'failed' } }),
      this.prisma.v1OpsCaseEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    ]);

    return {
      queues: { openReports, activeDisputes, pendingPayments, refundRequests, settlementReviews, payoutFailures },
      recentEvents: recentEvents.map(mapCaseEvent),
    };
  }

  async reports(user: V1AuthUser, query: OpsQueueQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = pageLimit(query.limit);
    const status = optionalStatus(query.status, REPORT_STATUSES);
    const items = await this.prisma.v1OpsReport.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return cursorPage(items, limit, mapReport);
  }

  async reportDetail(user: V1AuthUser, reportId: string) {
    await this.getActiveAdmin(user.id);
    const report = await this.prisma.v1OpsReport.findUnique({
      where: { id: reportId },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!report) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report was not found' });
    return { report: mapReport(report), events: report.events.map(mapCaseEvent) };
  }

  async reportAction(user: V1AuthUser, reportId: string, dto: ReportActionDto) {
    const admin = await this.getMutationAdmin(user.id);
    const current = await this.prisma.v1OpsReport.findUnique({ where: { id: reportId } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report was not found' });
    const next = nextReportState(current.status, dto.action);
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const report = await tx.v1OpsReport.update({
        where: { id: reportId },
        data: {
          status: next,
          assignedAdminUserId: dto.action === 'assign' || dto.action === 'review' ? admin.id : current.assignedAdminUserId,
          resolvedAdminUserId: next === 'resolved' || next === 'dismissed' ? admin.id : current.resolvedAdminUserId,
          resolutionNote: dto.resolutionNote ?? current.resolutionNote,
          resolvedAt: next === 'resolved' || next === 'dismissed' ? now : current.resolvedAt,
        },
      });
      await writeAction(tx, admin, {
        action: `ops.report.${dto.action}`,
        targetType: 'ops_report',
        targetId: reportId,
        reason: dto.reason,
        beforeState: { status: current.status },
        afterState: { status: report.status },
      });
      await tx.v1OpsCaseEvent.create({
        data: {
          reportId,
          actorAdminUserId: admin.id,
          eventType: 'report_status_changed',
          fromStatus: current.status,
          toStatus: report.status,
          reason: dto.reason,
          metadataJson: toJson({ action: dto.action, resolutionNote: dto.resolutionNote }),
        },
      });
      return report;
    });
    return { report: mapReport(updated) };
  }

  async disputes(user: V1AuthUser, query: OpsQueueQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = pageLimit(query.limit);
    const status = optionalStatus(query.status, DISPUTE_STATUSES);
    const items = await this.prisma.v1OpsDispute.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return cursorPage(items, limit, mapDispute);
  }

  async disputeDetail(user: V1AuthUser, disputeId: string) {
    await this.getActiveAdmin(user.id);
    const dispute = await this.prisma.v1OpsDispute.findUnique({
      where: { id: disputeId },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!dispute) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dispute was not found' });
    return { dispute: mapDispute(dispute), events: dispute.events.map(mapCaseEvent) };
  }

  async disputeAction(user: V1AuthUser, disputeId: string, dto: DisputeActionDto) {
    const admin = await this.getMutationAdmin(user.id);
    const current = await this.prisma.v1OpsDispute.findUnique({ where: { id: disputeId } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dispute was not found' });
    const next = nextDisputeState(current.status, dto.action);
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const dispute = await tx.v1OpsDispute.update({
        where: { id: disputeId },
        data: {
          status: next,
          assignedAdminUserId: dto.action === 'assign' ? admin.id : current.assignedAdminUserId,
          resolvedAdminUserId: next === 'resolved' || next === 'rejected' ? admin.id : current.resolvedAdminUserId,
          resolutionNote: dto.resolutionNote ?? current.resolutionNote,
          resolvedAt: next === 'resolved' || next === 'rejected' ? now : current.resolvedAt,
        },
      });
      await writeAction(tx, admin, {
        action: `ops.dispute.${dto.action}`,
        targetType: 'ops_dispute',
        targetId: disputeId,
        reason: dto.reason,
        beforeState: { status: current.status },
        afterState: { status: dispute.status },
      });
      await tx.v1OpsCaseEvent.create({
        data: {
          disputeId,
          actorAdminUserId: admin.id,
          eventType: 'dispute_status_changed',
          fromStatus: current.status,
          toStatus: dispute.status,
          reason: dto.reason,
          metadataJson: toJson({ action: dto.action, resolutionNote: dto.resolutionNote }),
        },
      });
      return dispute;
    });
    return { dispute: mapDispute(updated) };
  }

  async payments(user: V1AuthUser, query: OpsQueueQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = pageLimit(query.limit);
    const status = optionalStatus(query.status, PAYMENT_STATUSES);
    const items = await this.prisma.v1PaymentOrder.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(query.targetType ? { sourceType: query.targetType } : {}),
        ...(query.targetId ? { sourceId: query.targetId } : {}),
      },
      include: { refunds: { orderBy: { createdAt: 'desc' }, take: 3 } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return cursorPage(items, limit, mapPaymentOrder);
  }

  async createPaymentOrder(user: V1AuthUser, dto: CreatePaymentOrderDto) {
    const admin = await this.getMutationAdmin(user.id);
    const orderId = `tm_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1PaymentOrder.create({
        data: {
          orderId,
          buyerUserId: dto.buyerUserId,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          amount: dto.amount,
          orderName: dto.orderName,
          requestedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          metadataJson: toJson({ createdBy: 'admin_ops' }),
        },
      });
      await writeAction(tx, admin, {
        action: 'ops.payment.order.create',
        targetType: 'payment_order',
        targetId: created.id,
        reason: 'payment order created by internal ops',
        beforeState: {},
        afterState: { status: created.status, orderId: created.orderId, amount: created.amount },
      });
      await tx.v1OpsCaseEvent.create({
        data: {
          paymentOrderId: created.id,
          actorAdminUserId: admin.id,
          eventType: 'payment_order_created',
          toStatus: created.status,
          reason: 'payment order created by internal ops',
          metadataJson: toJson({ orderId: created.orderId, amount: created.amount }),
        },
      });
      return created;
    });
    return { order: mapPaymentOrder({ ...order, refunds: [] }) };
  }

  async confirmPayment(user: V1AuthUser, dto: ConfirmPaymentDto) {
    const admin = await this.getMutationAdmin(user.id);
    const order = await this.prisma.v1PaymentOrder.findUnique({ where: { orderId: dto.orderId }, include: { refunds: true } });
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment order was not found' });
    if (order.amount !== dto.amount) {
      throw new BadRequestException({ code: 'PAYMENT_AMOUNT_MISMATCH', message: 'Payment amount does not match the local order' });
    }
    if (order.status === 'confirmed' && order.providerPaymentKey === dto.paymentKey) {
      return { order: mapPaymentOrder(order), idempotent: true };
    }
    if (order.status !== 'pending') {
      throw new BadRequestException({ code: 'PAYMENT_ORDER_NOT_CONFIRMABLE', message: `Payment order is ${order.status}` });
    }
    if (order.expiresAt && order.expiresAt.getTime() < Date.now()) {
      await this.markPaymentFailure(order.id, admin.id, order.status, 'PAYMENT_ORDER_EXPIRED', 'Payment order is expired', 'expired', 'ops.payment.confirm.expired');
      throw new BadRequestException({ code: 'PAYMENT_ORDER_EXPIRED', message: 'Payment order is expired' });
    }

    try {
      const provider = await this.tossPayments.confirmPayment(dto);
      const providerStatus = providerPaymentStatus(provider.status, order.status);
      if (provider.orderId !== order.orderId || provider.totalAmount !== order.amount || providerStatus !== 'confirmed') {
        throw new BadRequestException({
          code: 'TOSS_CONFIRM_RESULT_INVALID',
          message: 'Toss confirm response did not match the local order or confirmed status',
        });
      }
      const updated = await this.prisma.$transaction(async (tx) => {
        const confirmed = await tx.v1PaymentOrder.update({
          where: { id: order.id },
          data: {
            status: 'confirmed',
            providerPaymentKey: provider.paymentKey,
            providerOrderId: provider.orderId,
            approvedAt: provider.approvedAt ? new Date(provider.approvedAt) : new Date(),
            failureCode: null,
            failureMessage: null,
          },
          include: { refunds: true },
        });
        await tx.v1PaymentTransaction.create({
          data: {
            paymentOrderId: order.id,
            paymentKey: provider.paymentKey,
            orderId: provider.orderId,
            amount: provider.totalAmount,
            status: 'done',
            approvedAt: confirmed.approvedAt,
            rawPayloadJson: toJson(provider.raw),
          },
        });
        await writeAction(tx, admin, {
          action: 'ops.payment.confirm',
          targetType: 'payment_order',
          targetId: order.id,
          reason: 'Toss payment confirmed',
          beforeState: { status: order.status },
          afterState: { status: confirmed.status, providerPaymentKey: confirmed.providerPaymentKey },
        });
        await tx.v1OpsCaseEvent.create({
          data: {
            paymentOrderId: order.id,
            actorAdminUserId: admin.id,
            eventType: 'payment_confirmed',
            fromStatus: order.status,
            toStatus: confirmed.status,
            reason: 'Toss payment confirmed',
            metadataJson: toJson({ paymentKey: provider.paymentKey, orderId: provider.orderId }),
          },
        });
        return confirmed;
      });
      return { order: mapPaymentOrder(updated) };
    } catch (error) {
      await this.markPaymentFailure(order.id, admin.id, order.status, providerErrorCode(error), providerErrorMessage(error));
      throw error;
    }
  }

  async tossWebhook(dto: TossWebhookDto) {
    const order = dto.orderId
      ? await this.prisma.v1PaymentOrder.findUnique({ where: { orderId: dto.orderId }, include: { refunds: true } })
      : dto.paymentKey
        ? await this.prisma.v1PaymentOrder.findUnique({ where: { providerPaymentKey: dto.paymentKey }, include: { refunds: true } })
        : null;
    if (!order) {
      return { received: true, linked: false };
    }
    let provider;
    try {
      provider = await this.tossPayments.retrievePayment({
        paymentKey: dto.paymentKey ?? order.providerPaymentKey ?? undefined,
        orderId: dto.orderId ?? order.orderId,
      });
    } catch (error) {
      const providerError = { code: providerErrorCode(error), message: providerErrorMessage(error) };
      await this.prisma.v1OpsCaseEvent.create({
        data: {
          paymentOrderId: order.id,
          eventType: 'payment_webhook_received',
          fromStatus: order.status,
          toStatus: order.status,
          reason: dto.eventType,
          metadataJson: toJson({
            verified: false,
            providerError,
            paymentKey: dto.paymentKey,
            orderId: dto.orderId,
            amount: dto.amount,
            payload: dto.payload,
          }),
        },
      });
      return { received: true, linked: true, verified: false, providerError };
    }
    if (provider.orderId !== order.orderId || provider.totalAmount !== order.amount) {
      const providerError = { code: 'TOSS_WEBHOOK_ORDER_MISMATCH', message: 'Toss webhook verification did not match the local order' };
      await this.prisma.v1OpsCaseEvent.create({
        data: {
          paymentOrderId: order.id,
          eventType: 'payment_webhook_received',
          fromStatus: order.status,
          toStatus: order.status,
          reason: dto.eventType,
          metadataJson: toJson({
            verified: false,
            providerError,
            paymentKey: dto.paymentKey,
            orderId: dto.orderId,
            amount: dto.amount,
            providerStatus: provider.status,
            providerOrderId: provider.orderId,
            providerAmount: provider.totalAmount,
            payload: dto.payload,
          }),
        },
      });
      return { received: true, linked: true, verified: false, providerError };
    }
    const nextStatus = providerPaymentStatus(provider.status, order.status);
    const updated = await this.prisma.$transaction(async (tx) => {
      const paymentOrder = await tx.v1PaymentOrder.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          providerPaymentKey: provider.paymentKey || dto.paymentKey || order.providerPaymentKey,
          providerOrderId: provider.orderId || dto.orderId || order.providerOrderId,
          approvedAt: nextStatus === 'confirmed' ? order.approvedAt ?? (provider.approvedAt ? new Date(provider.approvedAt) : new Date()) : order.approvedAt,
          failedAt: nextStatus === 'failed' || nextStatus === 'expired' ? order.failedAt ?? new Date() : order.failedAt,
        },
        include: { refunds: true },
      });
      await tx.v1OpsCaseEvent.create({
        data: {
          paymentOrderId: order.id,
          eventType: 'payment_webhook_received',
          fromStatus: order.status,
          toStatus: paymentOrder.status,
          reason: dto.eventType,
          metadataJson: toJson({
            verified: true,
            paymentKey: provider.paymentKey,
            orderId: provider.orderId,
            amount: provider.totalAmount,
            providerStatus: provider.status,
            payload: dto.payload,
          }),
        },
      });
      return paymentOrder;
    });
    return { received: true, linked: true, verified: true, order: mapPaymentOrder(updated) };
  }

  async refundPayment(user: V1AuthUser, paymentOrderId: string, dto: RefundPaymentDto) {
    const admin = await this.getMutationAdmin(user.id);
    const order = await this.prisma.v1PaymentOrder.findUnique({ where: { id: paymentOrderId }, include: { refunds: true } });
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment order was not found' });
    if (!order.providerPaymentKey || (order.status !== 'confirmed' && order.status !== 'partially_refunded')) {
      throw new BadRequestException({ code: 'PAYMENT_ORDER_NOT_REFUNDABLE', message: `Payment order is ${order.status}` });
    }
    const completedAmount = (order.refunds as Array<{ status: string; amount: number }>)
      .filter((refund) => refund.status === 'completed')
      .reduce((sum, refund) => sum + refund.amount, 0);
    if (dto.amount > order.amount - completedAmount) {
      throw new BadRequestException({ code: 'REFUND_AMOUNT_EXCEEDS_REMAINING', message: 'Refund amount exceeds remaining payment amount' });
    }

    const refund = await this.prisma.v1PaymentRefund.create({
      data: {
        paymentOrderId,
        reviewedByAdminUserId: admin.id,
        amount: dto.amount,
        reason: dto.reason,
        status: 'processing',
        reviewedAt: new Date(),
      },
    });

    try {
      const provider = await this.tossPayments.cancelPayment({
        paymentKey: order.providerPaymentKey,
        cancelAmount: dto.amount,
        cancelReason: dto.reason,
        idempotencyKey: `v1-refund-${refund.id}`,
      });
      const updated = await this.prisma.$transaction(async (tx) => {
        const refundStatus = await tx.v1PaymentRefund.update({
          where: { id: refund.id },
          data: {
            status: 'completed',
            providerRefundId: provider.transactionKey ?? provider.paymentKey,
            providerStatus: provider.status,
            completedAt: new Date(),
          },
        });
        const nextOrderStatus = completedAmount + dto.amount >= order.amount ? 'refunded' : 'partially_refunded';
        const paymentOrder = await tx.v1PaymentOrder.update({
          where: { id: order.id },
          data: { status: nextOrderStatus },
          include: { refunds: true },
        });
        await writeAction(tx, admin, {
          action: 'ops.payment.refund',
          targetType: 'payment_order',
          targetId: order.id,
          reason: dto.reason,
          beforeState: { status: order.status },
          afterState: { status: paymentOrder.status, refundId: refund.id, refundStatus: refundStatus.status },
        });
        await tx.v1OpsCaseEvent.create({
          data: {
            paymentOrderId: order.id,
            refundId: refund.id,
            actorAdminUserId: admin.id,
            eventType: 'refund_status_changed',
            fromStatus: 'processing',
            toStatus: refundStatus.status,
            reason: dto.reason,
            metadataJson: toJson(provider.raw),
          },
        });
        return { refund: refundStatus, order: paymentOrder };
      });
      return { refund: mapRefund(updated.refund), order: mapPaymentOrder(updated.order) };
    } catch (error) {
      const failed = await this.prisma.$transaction(async (tx) => {
        const refundStatus = await tx.v1PaymentRefund.update({
          where: { id: refund.id },
          data: {
            status: 'failed',
            failureCode: providerErrorCode(error),
            failureMessage: providerErrorMessage(error),
          },
        });
        await writeAction(tx, admin, {
          action: 'ops.payment.refund.failed',
          targetType: 'payment_order',
          targetId: order.id,
          reason: dto.reason,
          beforeState: { refundStatus: 'processing' },
          afterState: { refundStatus: refundStatus.status, failureCode: refundStatus.failureCode },
        });
        await tx.v1OpsCaseEvent.create({
          data: {
            paymentOrderId: order.id,
            refundId: refund.id,
            actorAdminUserId: admin.id,
            eventType: 'refund_status_changed',
            fromStatus: 'processing',
            toStatus: 'failed',
            reason: dto.reason,
            metadataJson: toJson({ code: refundStatus.failureCode, message: refundStatus.failureMessage }),
          },
        });
        return refundStatus;
      });
      return { refund: mapRefund(failed), providerError: { code: providerErrorCode(error), message: providerErrorMessage(error) } };
    }
  }

  async settlements(user: V1AuthUser, query: OpsQueueQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = pageLimit(query.limit);
    const status = optionalStatus(query.status, SETTLEMENT_STATUSES);
    const items = await this.prisma.v1SettlementBatch.findMany({
      where: { ...(status ? { status } : {}) },
      include: {
        items: { take: 3, orderBy: { createdAt: 'desc' } },
        payoutAttempts: { take: 3, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return cursorPage(items, limit, mapSettlementBatch);
  }

  async settlementDetail(user: V1AuthUser, settlementBatchId: string) {
    await this.getActiveAdmin(user.id);
    const batch = await this.prisma.v1SettlementBatch.findUnique({
      where: { id: settlementBatchId },
      include: {
        items: { orderBy: { createdAt: 'desc' }, take: 50 },
        payoutAttempts: { orderBy: { createdAt: 'desc' }, take: 10 },
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Settlement batch was not found' });
    return {
      settlement: mapSettlementBatch(batch),
      events: batch.events.map(mapCaseEvent),
    };
  }

  async settlementAction(user: V1AuthUser, settlementBatchId: string, dto: SettlementActionDto) {
    const admin = await this.getMutationAdmin(user.id);
    const current = await this.prisma.v1SettlementBatch.findUnique({ where: { id: settlementBatchId } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Settlement batch was not found' });
    const next = nextSettlementState(current.status, dto.action);
    const updated = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.v1SettlementBatch.update({
        where: { id: settlementBatchId },
        data: {
          status: next,
          reviewedByAdminUserId: admin.id,
          holdReason: dto.action === 'hold' || dto.action === 'fail' ? dto.reason : current.holdReason,
          approvedAt: dto.action === 'approve' ? new Date() : current.approvedAt,
        },
        include: { items: true, payoutAttempts: true },
      });
      await writeAction(tx, admin, {
        action: `ops.settlement.${dto.action}`,
        targetType: 'settlement_batch',
        targetId: settlementBatchId,
        reason: dto.reason,
        beforeState: { status: current.status },
        afterState: { status: batch.status },
      });
      await tx.v1OpsCaseEvent.create({
        data: {
          settlementBatchId,
          actorAdminUserId: admin.id,
          eventType: 'settlement_status_changed',
          fromStatus: current.status,
          toStatus: batch.status,
          reason: dto.reason,
          metadataJson: toJson({ action: dto.action }),
        },
      });
      return batch;
    });
    return { settlement: mapSettlementBatch(updated) };
  }

  async requestPayout(user: V1AuthUser, settlementBatchId: string, dto: PayoutRequestDto) {
    const admin = await this.getMutationAdmin(user.id);
    const batch = await this.prisma.v1SettlementBatch.findUnique({ where: { id: settlementBatchId }, include: { payoutAttempts: true, items: true } });
    if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Settlement batch was not found' });
    if (batch.status !== 'approved') {
      throw new BadRequestException({ code: 'SETTLEMENT_NOT_APPROVED', message: `Settlement batch is ${batch.status}` });
    }
    const amount = dto.amount ?? batch.totalAmount;
    const providerError = this.tossPayments.payoutContractUnavailable();
    const result = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.v1PayoutAttempt.create({
        data: {
          settlementBatchId,
          requestedByAdminUserId: admin.id,
          amount,
          status: 'failed',
          failureCode: providerError.code,
          failureMessage: providerError.message,
          rawPayloadJson: toJson({ reason: 'contract_or_jwe_not_ready' }),
        },
      });
      const updatedBatch = await tx.v1SettlementBatch.update({
        where: { id: settlementBatchId },
        data: { status: 'failed', payoutRequestedAt: new Date() },
        include: { items: true, payoutAttempts: true },
      });
      await writeAction(tx, admin, {
        action: 'ops.settlement.payout.request',
        targetType: 'settlement_batch',
        targetId: settlementBatchId,
        reason: dto.reason,
        beforeState: { status: batch.status },
        afterState: { status: updatedBatch.status, payoutStatus: payout.status, failureCode: payout.failureCode },
      });
      await tx.v1OpsCaseEvent.create({
        data: {
          settlementBatchId,
          payoutAttemptId: payout.id,
          actorAdminUserId: admin.id,
          eventType: 'payout_status_changed',
          fromStatus: 'requested',
          toStatus: payout.status,
          reason: dto.reason,
          metadataJson: toJson(providerError),
        },
      });
      return { payout, batch: updatedBatch };
    });
    return { payout: mapPayoutAttempt(result.payout), settlement: mapSettlementBatch(result.batch), providerError };
  }

  async audit(user: V1AuthUser, query: OpsQueueQueryDto) {
    await this.getActiveAdmin(user.id);
    const limit = pageLimit(query.limit);
    const [actionLogs, caseEvents] = await Promise.all([
      this.prisma.v1AdminActionLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      this.prisma.v1OpsCaseEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
    ]);
    return {
      actionLogs: (actionLogs as Array<{
        id: string;
        adminUserId: string;
        action: string;
        targetType: string;
        targetId: string;
        reason: string | null;
        beforeJson: unknown;
        afterJson: unknown;
        createdAt: Date;
      }>).map((log) => ({
        actionLogId: log.id,
        adminUserId: log.adminUserId,
        actionType: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        reason: log.reason,
        beforeState: log.beforeJson,
        afterState: log.afterJson,
        createdAt: log.createdAt,
      })),
      caseEvents: caseEvents.map(mapCaseEvent),
    };
  }

  private async markPaymentFailure(
    paymentOrderId: string,
    adminUserId: string,
    fromStatus: string,
    code: string,
    message: string,
    nextStatus: V1PaymentOrderStatus = 'failed',
    action = 'ops.payment.confirm.failed',
  ) {
    await this.prisma.$transaction(async (tx) => {
      const failed = await tx.v1PaymentOrder.update({
        where: { id: paymentOrderId },
        data: { status: nextStatus, failedAt: new Date(), failureCode: code, failureMessage: message },
      });
      await tx.v1AdminActionLog.create({
        data: {
          adminUserId,
          action,
          targetType: 'payment_order',
          targetId: paymentOrderId,
          reason: message,
          beforeJson: toJson({ status: fromStatus }),
          afterJson: toJson({ status: failed.status, failureCode: code }),
        },
      });
      await tx.v1OpsCaseEvent.create({
        data: {
          paymentOrderId,
          actorAdminUserId: adminUserId,
          eventType: 'payment_failed',
          fromStatus,
          toStatus: failed.status,
          reason: message,
          metadataJson: toJson({ code }),
        },
      });
    });
  }

  private async getActiveAdmin(userId: string): Promise<ActiveAdmin> {
    const admin = await this.prisma.v1AdminUser.findUnique({ where: { userId } });
    if (!admin || admin.status !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Active admin access is required' });
    }
    return admin as ActiveAdmin;
  }

  private async getMutationAdmin(userId: string): Promise<ActiveAdmin> {
    const admin = await this.getActiveAdmin(userId);
    if (admin.adminRole === 'support') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate ops actions' });
    }
    return admin;
  }
}

async function writeAction(
  tx: Prisma.TransactionClient,
  admin: ActiveAdmin,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
  },
) {
  await tx.v1AdminActionLog.create({
    data: {
      adminUserId: admin.id,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      beforeJson: toJson(input.beforeState),
      afterJson: toJson(input.afterState),
    },
  });
}

function pageLimit(limit?: number) {
  return Math.min(Math.max(limit ?? 20, 1), 50);
}

function cursorPage<T extends { id: string }, R>(items: T[], limit: number, mapper: (item: T) => R) {
  const pageItems = items.slice(0, limit);
  const hasNext = items.length > limit;
  return {
    items: pageItems.map(mapper),
    pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
  };
}

function optionalStatus<const T extends readonly string[]>(status: string | undefined, allowed: T): T[number] | undefined {
  if (!status) return undefined;
  if (!allowed.includes(status)) {
    throw new BadRequestException({ code: 'INVALID_STATUS', message: `Unsupported status: ${status}` });
  }
  return status;
}

function nextReportState(current: V1OpsReportStatus, action: ReportActionDto['action']): V1OpsReportStatus {
  if (action === 'assign' || action === 'review') return 'reviewing';
  if (action === 'resolve') return 'resolved';
  if (action === 'dismiss') return 'dismissed';
  return current;
}

function nextDisputeState(current: V1OpsDisputeStatus, action: DisputeActionDto['action']): V1OpsDisputeStatus {
  if (action === 'assign') return 'assigned';
  if (action === 'wait') return 'waiting_party';
  if (action === 'resolve') return 'resolved';
  if (action === 'reject') return 'rejected';
  return current;
}

function nextSettlementState(current: V1SettlementBatchStatus, action: SettlementActionDto['action']): V1SettlementBatchStatus {
  if (action === 'review') return 'reviewing';
  if (action === 'approve') return 'approved';
  if (action === 'hold') return 'held';
  if (action === 'fail') return 'failed';
  return current;
}

function providerPaymentStatus(providerStatus: string, current: V1PaymentOrderStatus): V1PaymentOrderStatus {
  const normalized = providerStatus.toUpperCase();
  if (normalized === 'DONE') return 'confirmed';
  if (normalized === 'CANCELED') return 'cancelled';
  if (normalized === 'PARTIAL_CANCELED') return 'partially_refunded';
  if (normalized === 'EXPIRED') return 'expired';
  if (normalized === 'ABORTED') return 'failed';
  if (normalized === 'WAITING_FOR_DEPOSIT' || normalized === 'IN_PROGRESS' || normalized === 'READY') return 'pending';
  return current;
}

function providerErrorCode(error: unknown) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { code?: unknown } }).response;
    if (typeof response?.code === 'string') return response.code;
  }
  return 'PROVIDER_ERROR';
}

function providerErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { message?: unknown } }).response;
    if (typeof response?.message === 'string') return response.message;
  }
  if (error instanceof Error) return error.message;
  return 'Provider request failed';
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function mapReport(report: {
  id: string;
  reporterUserId: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  description: string | null;
  status: string;
  priority: number;
  assignedAdminUserId: string | null;
  resolvedAdminUserId: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}) {
  return {
    reportId: report.id,
    reporterUserId: report.reporterUserId,
    targetType: report.targetType,
    targetId: report.targetId,
    reason: report.reason,
    description: report.description,
    status: report.status,
    priority: report.priority,
    assignedAdminUserId: report.assignedAdminUserId,
    resolvedAdminUserId: report.resolvedAdminUserId,
    resolutionNote: report.resolutionNote,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    resolvedAt: report.resolvedAt,
  };
}

function mapDispute(dispute: {
  id: string;
  reporterUserId: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  title: string;
  description: string | null;
  status: string;
  amount: number | null;
  currency: string;
  assignedAdminUserId: string | null;
  resolvedAdminUserId: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}) {
  return {
    disputeId: dispute.id,
    reporterUserId: dispute.reporterUserId,
    targetType: dispute.targetType,
    targetId: dispute.targetId,
    reason: dispute.reason,
    title: dispute.title,
    description: dispute.description,
    status: dispute.status,
    amount: dispute.amount,
    currency: dispute.currency,
    assignedAdminUserId: dispute.assignedAdminUserId,
    resolvedAdminUserId: dispute.resolvedAdminUserId,
    resolutionNote: dispute.resolutionNote,
    createdAt: dispute.createdAt,
    updatedAt: dispute.updatedAt,
    resolvedAt: dispute.resolvedAt,
  };
}

function mapPaymentOrder(order: {
  id: string;
  orderId: string;
  buyerUserId: string | null;
  sourceType: string;
  sourceId: string;
  amount: number;
  currency: string;
  orderName: string;
  status: string;
  provider: string;
  providerPaymentKey: string | null;
  requestedAt: Date | null;
  approvedAt: Date | null;
  failedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  refunds?: Array<Parameters<typeof mapRefund>[0]>;
}) {
  return {
    paymentOrderId: order.id,
    orderId: order.orderId,
    buyerUserId: order.buyerUserId,
    sourceType: order.sourceType,
    sourceId: order.sourceId,
    amount: order.amount,
    currency: order.currency,
    orderName: order.orderName,
    status: order.status,
    provider: order.provider,
    providerPaymentKey: order.providerPaymentKey,
    requestedAt: order.requestedAt,
    approvedAt: order.approvedAt,
    failedAt: order.failedAt,
    failureCode: order.failureCode,
    failureMessage: order.failureMessage,
    refunds: order.refunds?.map(mapRefund) ?? [],
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function mapRefund(refund: {
  id: string;
  paymentOrderId: string;
  requesterUserId: string | null;
  reviewedByAdminUserId: string | null;
  providerRefundId: string | null;
  amount: number;
  reason: string;
  status: string;
  providerStatus: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  requestedAt: Date;
  reviewedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    refundId: refund.id,
    paymentOrderId: refund.paymentOrderId,
    requesterUserId: refund.requesterUserId,
    reviewedByAdminUserId: refund.reviewedByAdminUserId,
    providerRefundId: refund.providerRefundId,
    amount: refund.amount,
    reason: refund.reason,
    status: refund.status,
    providerStatus: refund.providerStatus,
    failureCode: refund.failureCode,
    failureMessage: refund.failureMessage,
    requestedAt: refund.requestedAt,
    reviewedAt: refund.reviewedAt,
    completedAt: refund.completedAt,
    createdAt: refund.createdAt,
    updatedAt: refund.updatedAt,
  };
}

function mapSettlementBatch(batch: {
  id: string;
  batchKey: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  totalAmount: number;
  holdReason: string | null;
  approvedAt: Date | null;
  payoutRequestedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items?: Array<{ id: string; status: string; netAmount: number }>;
  payoutAttempts?: Array<Parameters<typeof mapPayoutAttempt>[0]>;
}) {
  return {
    settlementBatchId: batch.id,
    batchKey: batch.batchKey,
    status: batch.status,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
    currency: batch.currency,
    totalAmount: batch.totalAmount,
    holdReason: batch.holdReason,
    approvedAt: batch.approvedAt,
    payoutRequestedAt: batch.payoutRequestedAt,
    completedAt: batch.completedAt,
    itemCount: batch.items?.length ?? 0,
    pendingAmount: batch.items?.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + item.netAmount, 0) ?? batch.totalAmount,
    payoutAttempts: batch.payoutAttempts?.map(mapPayoutAttempt) ?? [],
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
  };
}

function mapPayoutAttempt(payout: {
  id: string;
  settlementBatchId: string;
  requestedByAdminUserId: string;
  providerPayoutId: string | null;
  status: string;
  amount: number;
  requestedAt: Date;
  providerConfirmedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    payoutAttemptId: payout.id,
    settlementBatchId: payout.settlementBatchId,
    requestedByAdminUserId: payout.requestedByAdminUserId,
    providerPayoutId: payout.providerPayoutId,
    status: payout.status,
    amount: payout.amount,
    requestedAt: payout.requestedAt,
    providerConfirmedAt: payout.providerConfirmedAt,
    failureCode: payout.failureCode,
    failureMessage: payout.failureMessage,
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
  };
}

function mapCaseEvent(event: {
  id: string;
  eventType: string;
  reportId: string | null;
  disputeId: string | null;
  paymentOrderId: string | null;
  refundId: string | null;
  settlementBatchId: string | null;
  payoutAttemptId: string | null;
  actorAdminUserId: string | null;
  actorUserId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  metadataJson: unknown;
  createdAt: Date;
}) {
  return {
    caseEventId: event.id,
    eventType: event.eventType,
    reportId: event.reportId,
    disputeId: event.disputeId,
    paymentOrderId: event.paymentOrderId,
    refundId: event.refundId,
    settlementBatchId: event.settlementBatchId,
    payoutAttemptId: event.payoutAttemptId,
    actorAdminUserId: event.actorAdminUserId,
    actorUserId: event.actorUserId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reason: event.reason,
    metadata: event.metadataJson,
    createdAt: event.createdAt,
  };
}
