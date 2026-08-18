import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService, V1ActiveAdmin } from '../common/admin-context.service';
import { UpdateReviewPolicySettingsDto } from './dto/review-policy-settings.dto';
import {
  DEFAULT_REVIEW_WINDOW_HOURS,
  MAX_REVIEW_WINDOW_HOURS,
  MIN_REVIEW_WINDOW_HOURS,
  formatReviewWindow,
} from './review-deadline';

const SETTINGS_ROW_ID = 'singleton';

/**
 * 리뷰 작성 가능 기간 정책의 단일 소스(V1ReviewPolicySettings singleton row).
 *
 * 행이 없거나 값이 범위를 벗어나면 기본값 168시간(7일)으로 동작한다 — 설정 조회 실패가
 * 리뷰 기능 자체를 막지 않게 하려는 것이며, IntegrationSettingsService의 graceful 폴백과 같은 규칙이다.
 */
@Injectable()
export class ReviewPolicySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  /** 마감 판정에 쓸 시간(시간 단위). 호출자는 이 값을 reviewWindowClosed에 넘긴다. */
  async getWindowHours(): Promise<number> {
    const row = await this.prisma.v1ReviewPolicySettings.findUnique({ where: { id: SETTINGS_ROW_ID } });
    return clamp(row?.reviewWindowHours);
  }

  /** 어드민 설정 화면 조회용. */
  async get() {
    const row = await this.prisma.v1ReviewPolicySettings.findUnique({ where: { id: SETTINGS_ROW_ID } });
    const reviewWindowHours = clamp(row?.reviewWindowHours);
    return {
      reviewWindowHours,
      reviewWindowLabel: formatReviewWindow(reviewWindowHours),
      minHours: MIN_REVIEW_WINDOW_HOURS,
      maxHours: MAX_REVIEW_WINDOW_HOURS,
      defaultHours: DEFAULT_REVIEW_WINDOW_HOURS,
      // 마이그레이션이 싱글턴 행을 미리 시드하므로 "행이 없음"으로는 기본값 상태를 알 수 없다.
      // 어드민이 한 번이라도 저장하면 updatedByAdminUserId 가 채워지므로 그걸로 판정한다.
      isDefault: row == null || row.updatedByAdminUserId == null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async update(admin: V1ActiveAdmin, dto: UpdateReviewPolicySettingsDto) {
    const before = await this.getWindowHours();
    const reviewWindowHours = dto.reviewWindowHours;

    await this.prisma.$transaction(async (tx) => {
      await tx.v1ReviewPolicySettings.upsert({
        where: { id: SETTINGS_ROW_ID },
        create: { id: SETTINGS_ROW_ID, reviewWindowHours, updatedByAdminUserId: admin.id },
        update: { reviewWindowHours, updatedByAdminUserId: admin.id },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'review_policy_settings.update',
          targetType: 'review_policy_settings',
          targetId: SETTINGS_ROW_ID,
          beforeJson: { reviewWindowHours: before },
          afterJson: { reviewWindowHours },
        },
        tx,
      );
    });

    return this.get();
  }
}

/** 범위를 벗어나거나 값이 없으면 기본값으로 되돌린다 — 잘못된 설정이 리뷰를 영구히 막지 않게. */
function clamp(hours: number | null | undefined): number {
  if (hours == null || !Number.isFinite(hours)) return DEFAULT_REVIEW_WINDOW_HOURS;
  if (hours < MIN_REVIEW_WINDOW_HOURS || hours > MAX_REVIEW_WINDOW_HOURS) return DEFAULT_REVIEW_WINDOW_HOURS;
  return hours;
}
