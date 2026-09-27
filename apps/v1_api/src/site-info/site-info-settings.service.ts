import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService, V1ActiveAdmin } from '../common/admin-context.service';
import { UpdateSiteInfoDto } from './dto/site-info.dto';

const SETTINGS_ROW_ID = 'singleton';
/** 스키마 기본값과 같다 — 행이 아직 없을 때 읽는 값. */
export const DEFAULT_GUEST_INQUIRY_RETENTION_DAYS = 365;

const SITE_INFO_FIELDS = [
  'companyName',
  'representativeName',
  'businessRegistrationNumber',
  'address',
  'mailOrderSalesNumber',
  'contactEmail',
] as const;
type SiteInfoField = (typeof SITE_INFO_FIELDS)[number];
type SiteInfoValues = Record<SiteInfoField, string | null>;
type SiteInfoChanges = Partial<SiteInfoValues> & { guestInquiryRetentionDays?: number };
type SiteInfoRow = Partial<SiteInfoValues> & { guestInquiryRetentionDays?: number };

export type PublicSiteInfo = SiteInfoValues & { guestInquiryRetentionDays: number };

export type AdminSiteInfo = PublicSiteInfo & {
  updatedByAdminUserId: string | null;
  updatedAt: string | null;
};

/** 공개 페이지 사업자 정보(V1SiteInfoSettings singleton)의 단일 소스. */
@Injectable()
export class SiteInfoSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  /** 인증 없는 공개 응답 — 편집자 식별자·수정 시각은 싣지 않는다. */
  async getPublic(): Promise<PublicSiteInfo> {
    const row = await this.getRow();
    return toPublic(row);
  }

  async getForAdmin(): Promise<AdminSiteInfo> {
    const row = await this.getRow();
    return {
      ...toPublic(row),
      updatedByAdminUserId: row?.updatedByAdminUserId ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async update(admin: V1ActiveAdmin, dto: UpdateSiteInfoDto): Promise<AdminSiteInfo> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.v1SiteInfoSettings.findUnique({ where: { id: SETTINGS_ROW_ID } });

      const data: SiteInfoChanges = {};
      const beforeJson: SiteInfoChanges = {};
      const afterJson: SiteInfoChanges = {};
      for (const field of SITE_INFO_FIELDS) {
        if (dto[field] === undefined) continue;
        const next = nonEmpty(dto[field]);
        data[field] = next;
        const prev = before?.[field] ?? null;
        if (prev !== next) {
          beforeJson[field] = prev;
          afterJson[field] = next;
        }
      }
      const nextDays = dto.guestInquiryRetentionDays;
      if (nextDays !== undefined) {
        data.guestInquiryRetentionDays = nextDays;
        const prevDays = before?.guestInquiryRetentionDays ?? DEFAULT_GUEST_INQUIRY_RETENTION_DAYS;
        if (prevDays !== nextDays) {
          beforeJson.guestInquiryRetentionDays = prevDays;
          afterJson.guestInquiryRetentionDays = nextDays;
        }
      }

      // 바뀐 값이 없으면 쓰지 않는다 — "마지막 수정자" 가 감사 기록 없이 바뀌면 안 된다.
      if (Object.keys(afterJson).length === 0) return;

      await tx.v1SiteInfoSettings.upsert({
        where: { id: SETTINGS_ROW_ID },
        create: { id: SETTINGS_ROW_ID, updatedByAdminUserId: admin.id, ...data },
        update: { updatedByAdminUserId: admin.id, ...data },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'site_info_settings.update',
          targetType: 'site_info_settings',
          targetId: SETTINGS_ROW_ID,
          beforeJson,
          afterJson,
        },
        tx,
      );
    });

    return this.getForAdmin();
  }

  private getRow() {
    return this.prisma.v1SiteInfoSettings.findUnique({ where: { id: SETTINGS_ROW_ID } });
  }
}

/** 제출 기록·파기 대상 판정이 폼 고지와 같은 저장값을 읽게 한다. */
export async function readGuestInquiryRetentionDays(
  prisma: Pick<PrismaService, 'v1SiteInfoSettings'>,
): Promise<number> {
  const row = await prisma.v1SiteInfoSettings.findUnique({
    where: { id: SETTINGS_ROW_ID },
    select: { guestInquiryRetentionDays: true },
  });
  return toPublic(row).guestInquiryRetentionDays;
}

/**
 * 보관 기간 고지 문구. 웹 `formatGuestInquiryRetention`(lib/public-site/site-info.ts)과 같은 규칙이어야 한다 —
 * 폼이 고지한 문구와 제출 기록에 남는 문구가 달라지면 무엇에 동의했는지 흐려진다.
 */
export function formatGuestInquiryRetention(days: number): string {
  return `문의 처리 완료 후 ${days % 365 === 0 ? `${days / 365}년` : `${days}일`}`;
}

function toPublic(row: SiteInfoRow | null): PublicSiteInfo {
  return {
    companyName: nonEmpty(row?.companyName),
    representativeName: nonEmpty(row?.representativeName),
    businessRegistrationNumber: nonEmpty(row?.businessRegistrationNumber),
    address: nonEmpty(row?.address),
    mailOrderSalesNumber: nonEmpty(row?.mailOrderSalesNumber),
    contactEmail: nonEmpty(row?.contactEmail),
    guestInquiryRetentionDays: row?.guestInquiryRetentionDays ?? DEFAULT_GUEST_INQUIRY_RETENTION_DAYS,
  };
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
