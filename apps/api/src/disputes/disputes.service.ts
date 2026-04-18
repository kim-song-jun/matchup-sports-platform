import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DisputeActorRole,
  DisputeStatus,
  DisputeTargetType,
  NotificationType,
  OrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Seller responds to a filed dispute.
   * Status transitions: filed → seller_responded
   */
  async sellerRespond(disputeId: string, sellerId: string, body: string) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('분쟁을 찾을 수 없습니다.');
    if (dispute.sellerId !== sellerId) {
      throw new ForbiddenException('판매자만 응답할 수 있습니다.');
    }
    if (dispute.status !== DisputeStatus.filed) {
      throw new BadRequestException('접수 상태의 분쟁에만 응답할 수 있습니다.');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.dispute.update({
        where: { id: disputeId },
        data: { status: DisputeStatus.seller_responded },
        include: { messages: true },
      }),
      this.prisma.disputeMessage.create({
        data: {
          disputeId,
          authorId: sellerId,
          role: DisputeActorRole.seller,
          body,
        },
      }),
    ]);

    // Notify buyer (fire-and-forget — notification failure must not fail this operation)
    this.notificationsService
      .create({
        userId: dispute.buyerId,
        type: NotificationType.marketplace_dispute_message,
        title: '판매자가 분쟁에 답변했어요',
        body: '분쟁에 판매자 답변이 등록되었습니다.',
        data: { disputeId },
        fromUserId: sellerId,
      })
      .catch(() => void 0);

    return updated;
  }

  /**
   * Add a message to an open dispute.
   * Any party (buyer/seller/admin) may add messages while the dispute is not resolved/dismissed.
   */
  async addMessage(
    disputeId: string,
    authorId: string,
    role: DisputeActorRole,
    body: string,
  ) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('분쟁을 찾을 수 없습니다.');

    const closedStatuses: DisputeStatus[] = [
      DisputeStatus.resolved_refund,
      DisputeStatus.resolved_release,
      DisputeStatus.withdrawn,
      DisputeStatus.dismissed,
    ];
    if (closedStatuses.includes(dispute.status)) {
      throw new BadRequestException('종결된 분쟁에는 메시지를 추가할 수 없습니다.');
    }

    // Access check: buyer or seller of this dispute, or admin role
    if (role !== DisputeActorRole.admin) {
      if (role === DisputeActorRole.buyer && dispute.buyerId !== authorId) {
        throw new ForbiddenException('해당 분쟁의 구매자만 구매자 역할로 메시지를 작성할 수 있습니다.');
      }
      if (role === DisputeActorRole.seller && dispute.sellerId !== authorId) {
        throw new ForbiddenException('해당 분쟁의 판매자만 판매자 역할로 메시지를 작성할 수 있습니다.');
      }
    }

    const message = await this.prisma.disputeMessage.create({
      data: { disputeId, authorId, role, body },
    });

    // Notify the other party
    const recipientId =
      role === DisputeActorRole.buyer ? dispute.sellerId : dispute.buyerId;
    this.notificationsService
      .create({
        userId: recipientId,
        type: NotificationType.marketplace_dispute_message,
        title: '분쟁 메시지가 도착했어요',
        body: body.length > 60 ? `${body.slice(0, 60)}…` : body,
        data: { disputeId },
        fromUserId: authorId,
      })
      .catch(() => void 0);

    return message;
  }

  /**
   * Returns a single dispute with messages.
   * Access: buyer, seller, or admin.
   */
  async getDispute(disputeId: string, requesterId: string, isAdmin: boolean) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        buyer: { select: { id: true, nickname: true, profileImageUrl: true } },
        seller: { select: { id: true, nickname: true, profileImageUrl: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        order: {
          include: {
            listing: { select: { id: true, title: true, imageUrls: true, price: true } },
          },
        },
      },
    });
    if (!dispute) throw new NotFoundException('분쟁을 찾을 수 없습니다.');

    if (
      !isAdmin &&
      dispute.buyerId !== requesterId &&
      dispute.sellerId !== requesterId
    ) {
      throw new ForbiddenException('분쟁 당사자 또는 관리자만 조회할 수 있습니다.');
    }

    return dispute;
  }

  /**
   * Lists disputes involving the requester (as buyer or seller).
   */
  async listMyDisputes(
    userId: string,
    filter: { status?: DisputeStatus; cursor?: string; limit?: number },
  ) {
    const take = Math.min(filter.limit ?? 20, 100);
    const where = {
      OR: [{ buyerId: userId }, { sellerId: userId }],
      ...(filter.status ? { status: filter.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dispute.findMany({
        where,
        include: {
          order: {
            include: { listing: { select: { id: true, title: true, imageUrls: true } } },
          },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      this.prisma.dispute.count({ where }),
    ]);

    const hasMore = items.length > take;
    if (hasMore) items.pop();

    return {
      items,
      total,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * Admin resolves a dispute.
   * Actions:
   *  - 'refund'   → refund buyer via Toss, set order=refunded, settlement=refunded
   *  - 'release'  → release funds to seller, set order=completed, settlement released inside tx
   *  - 'partial'  → not supported (throws 400)
   *  - 'dismiss'  → no financial action, restore order to priorOrderStatus
   */
  async resolveDispute(
    disputeId: string,
    action: 'refund' | 'release' | 'dismiss',
    resolution: string,
    adminId?: string,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: { select: { id: true, paymentKey: true, amount: true, sellerId: true } },
        buyer: { select: { id: true, nickname: true } },
        seller: { select: { id: true, nickname: true } },
      },
    });
    if (!dispute) throw new NotFoundException('분쟁을 찾을 수 없습니다.');

    const closedStatuses: DisputeStatus[] = [
      DisputeStatus.resolved_refund,
      DisputeStatus.resolved_release,
      DisputeStatus.withdrawn,
      DisputeStatus.dismissed,
    ];
    if (closedStatuses.includes(dispute.status)) {
      throw new BadRequestException('이미 해결된 분쟁입니다.');
    }

    const now = new Date();

    if (action === 'refund') {
      if (!dispute.order) throw new BadRequestException('주문 정보를 찾을 수 없습니다.');

      // Execute Toss cancel outside transaction — network call
      if (dispute.order.paymentKey) {
        await this.paymentsService.cancelByPaymentKey(
          dispute.order.paymentKey,
          '분쟁 해결: 환불 처리',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        const result = await tx.dispute.updateMany({
          where: { id: disputeId, status: { notIn: closedStatuses } },
          data: {
            status: DisputeStatus.resolved_refund,
            resolution,
            resolvedAt: now,
            ...(adminId ? { resolvedByAdminId: adminId } : {}),
          },
        });
        if (result.count === 0) {
          throw new ConflictException('DISPUTE_CONCURRENT_UPDATE: 분쟁 상태가 동시에 변경되었습니다.');
        }
        await tx.marketplaceOrder.update({
          where: { id: dispute.orderId! },
          data: { status: OrderStatus.refunded },
        });
        await tx.settlementRecord.updateMany({
          where: { orderId: dispute.orderId! },
          data: { status: 'refunded' },
        });
      });

      // Notify parties (fire-and-forget)
      this.notificationsService
        .create({
          userId: dispute.buyerId,
          type: NotificationType.marketplace_order_refunded,
          title: '분쟁이 해결되었어요 — 환불 처리',
          body: '분쟁이 환불 처리로 해결되었습니다.',
          data: { disputeId, orderId: dispute.orderId },
        })
        .catch(() => void 0);
      this.notificationsService
        .create({
          userId: dispute.sellerId,
          type: NotificationType.marketplace_dispute_resolved,
          title: '분쟁 해결 결과',
          body: '분쟁이 환불 처리로 해결되었습니다.',
          data: { disputeId, orderId: dispute.orderId },
        })
        .catch(() => void 0);
    } else if (action === 'release') {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.dispute.updateMany({
          where: { id: disputeId, status: { notIn: closedStatuses } },
          data: {
            status: DisputeStatus.resolved_release,
            resolution,
            resolvedAt: now,
            ...(adminId ? { resolvedByAdminId: adminId } : {}),
          },
        });
        if (result.count === 0) {
          throw new ConflictException('DISPUTE_CONCURRENT_UPDATE: 분쟁 상태가 동시에 변경되었습니다.');
        }
        await tx.marketplaceOrder.update({
          where: { id: dispute.orderId! },
          data: { status: OrderStatus.completed, releasedAt: now, completedAt: now },
        });
        // Release held settlement inside transaction to ensure atomicity
        if (dispute.orderId) {
          await tx.settlementRecord.updateMany({
            where: { orderId: dispute.orderId, status: 'held' },
            data: { status: 'completed', releasedAt: now, processedAt: now },
          });
        }
      });

      this.notificationsService
        .create({
          userId: dispute.sellerId,
          type: NotificationType.marketplace_dispute_resolved,
          title: '분쟁이 해결되었어요 — 대금 지급',
          body: '분쟁이 대금 지급으로 해결되었습니다.',
          data: { disputeId, orderId: dispute.orderId },
        })
        .catch(() => void 0);
      this.notificationsService
        .create({
          userId: dispute.buyerId,
          type: NotificationType.marketplace_dispute_resolved,
          title: '분쟁 해결 결과',
          body: '분쟁이 판매자 대금 지급으로 해결되었습니다.',
          data: { disputeId, orderId: dispute.orderId },
        })
        .catch(() => void 0);
    } else {
      // dismiss — no financial action; restore order to state before dispute was filed
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.dispute.updateMany({
          where: { id: disputeId, status: { notIn: closedStatuses } },
          data: {
            status: DisputeStatus.dismissed,
            resolution,
            resolvedAt: now,
            ...(adminId ? { resolvedByAdminId: adminId } : {}),
          },
        });
        if (result.count === 0) {
          throw new ConflictException('DISPUTE_CONCURRENT_UPDATE: 분쟁 상태가 동시에 변경되었습니다.');
        }
        if (dispute.orderId) {
          await tx.marketplaceOrder.update({
            where: { id: dispute.orderId },
            data: { status: dispute.priorOrderStatus },
          });
        }
      });

      this.notificationsService
        .create({
          userId: dispute.buyerId,
          type: NotificationType.marketplace_dispute_resolved,
          title: '분쟁이 기각되었어요',
          body: '분쟁 신청이 기각 처리되었습니다.',
          data: { disputeId, orderId: dispute.orderId },
        })
        .catch(() => void 0);
    }

    return this.prisma.dispute.findUniqueOrThrow({
      where: { id: disputeId },
      include: { messages: true },
    });
  }

  // ── Controller-facing aliases ─────────────────────────────────────────────

  /** Alias for listMyDisputes — used by DisputesController. */
  findMine(userId: string, filter: { status?: string; cursor?: string; limit?: number }) {
    const status = filter.status ? (filter.status as DisputeStatus) : undefined;
    return this.listMyDisputes(userId, { ...filter, status });
  }

  /** Alias for getDispute (participant access) — used by DisputesController. */
  findOneAsParticipant(id: string, requesterId: string) {
    return this.getDispute(id, requesterId, false);
  }

  /** Alias for sellerRespond — maps RespondDisputeDto to sellerRespond. */
  respond(id: string, sellerId: string, dto: { response: string; attachmentUrls?: string[] }) {
    return this.sellerRespond(id, sellerId, dto.response);
  }

  /** Alias for addMessage — used by DisputesController. Caller role inferred from participation. */
  async postMessage(id: string, authorId: string, dto: { body: string }) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException('분쟁을 찾을 수 없습니다.');

    let role: DisputeActorRole;
    if (dispute.buyerId === authorId) {
      role = DisputeActorRole.buyer;
    } else if (dispute.sellerId === authorId) {
      role = DisputeActorRole.seller;
    } else {
      throw new ForbiddenException('해당 분쟁의 참여자만 메시지를 작성할 수 있습니다.');
    }

    return this.addMessage(id, authorId, role, dto.body);
  }

  /** Buyer withdraws a filed/seller_responded dispute. Restores order to priorOrderStatus. */
  async withdraw(id: string, buyerId: string) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException('분쟁을 찾을 수 없습니다.');
    if (dispute.buyerId !== buyerId) throw new ForbiddenException('구매자만 분쟁을 철회할 수 있습니다.');

    const withdrawableStatuses: DisputeStatus[] = [DisputeStatus.filed, DisputeStatus.seller_responded];
    if (!withdrawableStatuses.includes(dispute.status)) {
      throw new BadRequestException('접수 또는 판매자 소명 상태의 분쟁만 철회할 수 있습니다.');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.dispute.updateMany({
        where: { id, status: { in: withdrawableStatuses } },
        data: { status: DisputeStatus.withdrawn, resolution: '구매자 자발 철회', resolvedAt: now },
      });
      if (updateResult.count === 0) {
        throw new ConflictException('DISPUTE_CONCURRENT_UPDATE: 분쟁 상태가 동시에 변경되었습니다.');
      }
      if (dispute.orderId) {
        // Restore order to the state it was in before the dispute was filed.
        // Do NOT set completedAt — cron handles auto-release naturally.
        await tx.marketplaceOrder.update({
          where: { id: dispute.orderId },
          data: { status: dispute.priorOrderStatus },
        });
      }
      return tx.dispute.findUniqueOrThrow({ where: { id }, include: { messages: true } });
    });

    return result;
  }

  /** Admin alias for findAllAdmin. */
  findAllAdmin(filter: { status?: string; type?: string; cursor?: string; limit?: number }) {
    return this.listForAdmin({
      status: filter.status as DisputeStatus | undefined,
      cursor: filter.cursor,
      limit: filter.limit,
    });
  }

  /** Admin finds a single dispute without participant restriction. */
  findOneAdmin(id: string) {
    return this.getDispute(id, '', true);
  }

  /** Admin moves dispute to admin_reviewing status. */
  async startReview(id: string, adminId: string) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException('분쟁을 찾을 수 없습니다.');

    if (
      dispute.status !== DisputeStatus.filed &&
      dispute.status !== DisputeStatus.seller_responded
    ) {
      throw new BadRequestException('검토 전환이 불가한 상태입니다.');
    }

    const result = await this.prisma.dispute.updateMany({
      where: { id, status: { in: [DisputeStatus.filed, DisputeStatus.seller_responded] } },
      data: { status: DisputeStatus.admin_reviewing },
    });
    if (result.count === 0) {
      throw new ConflictException('DISPUTE_CONCURRENT_UPDATE: 분쟁 상태가 동시에 변경되었습니다.');
    }

    return this.prisma.dispute.findUniqueOrThrow({
      where: { id },
      include: { messages: true },
    });
  }

  /** Admin resolves a dispute — wraps resolveDispute with DTO shape. */
  resolve(
    id: string,
    adminId: string,
    dto: { action: 'refund' | 'release' | 'dismiss'; note?: string },
  ) {
    return this.resolveDispute(id, dto.action, dto.note ?? '', adminId);
  }

  /**
   * Admin list view with full filtering support.
   */
  async listForAdmin(filter: {
    status?: DisputeStatus;
    targetType?: DisputeTargetType;
    cursor?: string;
    limit?: number;
  }) {
    const take = Math.min(filter.limit ?? 20, 100);
    const where = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.targetType ? { targetType: filter.targetType } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dispute.findMany({
        where,
        include: {
          buyer: { select: { id: true, nickname: true } },
          seller: { select: { id: true, nickname: true } },
          order: {
            include: { listing: { select: { id: true, title: true } } },
          },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        take: take + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      this.prisma.dispute.count({ where }),
    ]);

    const hasMore = items.length > take;
    if (hasMore) items.pop();

    return {
      items,
      total,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }
}
