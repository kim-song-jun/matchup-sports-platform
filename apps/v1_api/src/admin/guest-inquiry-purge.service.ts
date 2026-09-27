import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { V1ActiveAdmin } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { readGuestInquiryRetentionDays } from '../site-info/site-info-settings.service';
import type { PurgeGuestInquiriesDto } from './dto/guest-inquiry-purge.dto';

export const PURGED_INQUIRY_TEXT = '[보관 기간이 지나 파기된 문의]';
export const PURGED_INQUIRY_REPLY_TEXT = '[보관 기간이 지나 파기된 답변]';
/** 화면 목록 상한. 전체 파기(scope=all)는 이 상한과 무관하게 서버가 대상 전부를 처리한다. */
export const GUEST_INQUIRY_PURGE_LIST_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const COMPLETED_STATUSES = ['answered', 'closed'] as const;

type PurgeCheckRow = {
  id: string;
  userId: string | null;
  status: string;
  closedAt: Date | null;
  updatedAt: Date;
  guestRetentionDays: number | null;
  purgedAt: Date | null;
};
const PURGE_CHECK_SELECT = {
  id: true,
  userId: true,
  category: true,
  status: true,
  closedAt: true,
  updatedAt: true,
  guestRetentionDays: true,
  purgedAt: true,
} as const;

/**
 * 처리 완료 = answered·closed. 완료 시각은 closed 면 closedAt, answered 는 전용 필드가 없어
 * 마지막 상태 전이 시각(updatedAt)이다 — v1Inquiry 를 갱신하는 경로는 답변·상태 변경뿐이다.
 * closedAt 이 빈 closed 행(상태 변경 경로 밖에서 만든 행)도 updatedAt 으로 판정해 영구 보관되지 않게 한다.
 */
export function inquiryCompletedAt(row: Pick<PurgeCheckRow, 'status' | 'closedAt' | 'updatedAt'>): Date {
  return row.status === 'closed' && row.closedAt ? row.closedAt : row.updatedAt;
}

/**
 * 제출 때 동의한 일수와 현재 설정 중 짧은 쪽. 설정을 늘려도 동의받은 기간을 넘겨 보관하지 않고,
 * 줄이면 이미 받은 문의에도 바로 적용된다.
 */
export function effectiveRetentionDays(row: Pick<PurgeCheckRow, 'guestRetentionDays'>, currentDays: number): number {
  return row.guestRetentionDays === null ? currentDays : Math.min(row.guestRetentionDays, currentDays);
}

function retentionExpiresAt(row: PurgeCheckRow, currentDays: number): number {
  return inquiryCompletedAt(row).getTime() + effectiveRetentionDays(row, currentDays) * DAY_MS;
}

/** 파기 대상 = 비회원 + 처리 완료 + (완료 시각 + 보관 일수) < now + 아직 파기 안 됨. */
export function isGuestInquiryPurgeCandidate(row: PurgeCheckRow, now: Date, currentDays: number): boolean {
  if (row.userId !== null || row.purgedAt !== null) return false;
  if (!(COMPLETED_STATUSES as readonly string[]).includes(row.status)) return false;
  return retentionExpiresAt(row, currentDays) < now.getTime();
}

// 판정은 isGuestInquiryPurgeCandidate 가 한다. 이 조건은 읽는 행을 줄이는 1차 필터일 뿐이다.
const COMPLETED_GUEST_WHERE: Prisma.V1InquiryWhereInput = {
  userId: null,
  purgedAt: null,
  status: { in: [...COMPLETED_STATUSES] },
};

@Injectable()
export class GuestInquiryPurgeService {
  constructor(private readonly prisma: PrismaService) {}

  /** 파기 대상 목록 — 개인정보(연락처·제목·본문)는 싣지 않는다. */
  async listCandidates(now: Date = new Date()) {
    const retentionDays = await readGuestInquiryRetentionDays(this.prisma);
    const rows = await this.prisma.v1Inquiry.findMany({ where: COMPLETED_GUEST_WHERE, select: PURGE_CHECK_SELECT });
    const candidates = rows
      .filter((row) => isGuestInquiryPurgeCandidate(row, now, retentionDays))
      .map((row) => ({
        inquiryId: row.id,
        category: row.category,
        completedAt: inquiryCompletedAt(row),
        expiresAt: retentionExpiresAt(row, retentionDays),
      }))
      .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    return {
      retentionDays,
      total: candidates.length,
      items: candidates.slice(0, GUEST_INQUIRY_PURGE_LIST_LIMIT).map((row) => ({
        inquiryId: row.inquiryId,
        category: row.category,
        completedAt: row.completedAt.toISOString(),
        retentionExpiredAt: new Date(row.expiresAt).toISOString(),
      })),
    };
  }

  /**
   * 연락처는 비우고 제목·본문·답변은 고정 문구로 바꾼다. 요청 id 는 대상 조건을 다시 통과한 것만
   * 처리하고, 이미 파기된 행은 조건에서 빠지므로 재처리하지 않는다.
   */
  async purge(admin: V1ActiveAdmin, dto: PurgeGuestInquiriesDto, now: Date = new Date()) {
    if (dto.scope === 'all' && dto.inquiryIds !== undefined) {
      throw new BadRequestException({
        code: 'INVALID_PURGE_REQUEST',
        message: '전체 파기에는 문의를 따로 고르지 않아요.',
      });
    }
    const requestedIds = dto.scope === 'selected' ? [...new Set(dto.inquiryIds ?? [])] : null;
    const retentionDays = await readGuestInquiryRetentionDays(this.prisma);

    const purgedIds = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.v1Inquiry.findMany({
        where: requestedIds ? { id: { in: requestedIds } } : COMPLETED_GUEST_WHERE,
        select: PURGE_CHECK_SELECT,
      });
      const targets = rows.filter((row) => isGuestInquiryPurgeCandidate(row, now, retentionDays));
      const targetIds = targets.map((row) => row.id);
      if (targetIds.length === 0) return [];
      const daysById = new Map(targets.map((row) => [row.id, effectiveRetentionDays(row, retentionDays)]));

      // 동시에 도는 다른 파기가 먼저 커밋한 행은 purgedAt 조건에서 0건으로 빠진다.
      const { count } = await tx.v1Inquiry.updateMany({
        where: { ...COMPLETED_GUEST_WHERE, id: { in: targetIds } },
        data: {
          guestEmail: null,
          guestPhone: null,
          contact: null,
          title: PURGED_INQUIRY_TEXT,
          body: PURGED_INQUIRY_TEXT,
          purgedAt: now,
          purgedByAdminUserId: admin.id,
        },
      });
      const ids =
        count === targetIds.length
          ? targetIds
          : (
              await tx.v1Inquiry.findMany({
                where: { id: { in: targetIds }, purgedAt: now, purgedByAdminUserId: admin.id },
                select: { id: true },
              })
            ).map((row) => row.id);
      if (ids.length === 0) return [];

      // 답변은 운영자가 쓰지만 문의자 이름·단체명을 인용할 수 있다.
      await tx.v1InquiryReply.updateMany({
        where: { inquiryId: { in: ids } },
        data: { body: PURGED_INQUIRY_REPLY_TEXT },
      });
      await redactReplyEditPreviews(tx, ids);
      await tx.v1AdminActionLog.createMany({
        data: ids.map((inquiryId) => ({
          adminUserId: admin.id,
          action: 'inquiry.guest_purge',
          targetType: 'inquiry',
          targetId: inquiryId,
          reason: '보관 기간이 지난 비회원 문의 개인정보 파기',
          afterJson: { purgedAt: now.toISOString(), retentionDays: daysById.get(inquiryId) ?? retentionDays },
        })),
      });
      return ids;
    });

    return {
      purgedCount: purgedIds.length,
      skippedCount: requestedIds ? requestedIds.length - purgedIds.length : 0,
      inquiryIds: purgedIds,
    };
  }
}

/** 답변 수정 감사 로그의 bodyPreview 는 답변 본문 사본이다 — 누가·언제 고쳤는지만 남기고 내용은 지운다. */
async function redactReplyEditPreviews(tx: Prisma.TransactionClient, inquiryIds: string[]) {
  const replies = await tx.v1InquiryReply.findMany({ where: { inquiryId: { in: inquiryIds } }, select: { id: true } });
  if (replies.length === 0) return;
  const logs = await tx.v1AdminActionLog.findMany({
    where: { action: 'inquiry.reply.update', targetType: 'inquiry_reply', targetId: { in: replies.map((reply) => reply.id) } },
    select: { id: true, beforeJson: true, afterJson: true },
  });
  for (const log of logs) {
    await tx.v1AdminActionLog.update({
      where: { id: log.id },
      data: { beforeJson: redactPreview(log.beforeJson), afterJson: redactPreview(log.afterJson) },
    });
  }
}

function redactPreview(json: Prisma.JsonValue): Prisma.InputJsonValue {
  const base = json && typeof json === 'object' && !Array.isArray(json) ? json : {};
  return { ...base, bodyPreview: PURGED_INQUIRY_REPLY_TEXT } as Prisma.InputJsonValue;
}
