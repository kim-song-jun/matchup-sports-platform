import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService, V1ActiveAdmin } from '../common/admin-context.service';
import { UpdateSiteInfoDto } from './dto/site-info.dto';

const SETTINGS_ROW_ID = 'singleton';
export const DEFAULT_GUEST_INQUIRY_RETENTION = '문의 처리 완료 후 1년';

const SITE_INFO_FIELDS = [
  'companyName',
  'representativeName',
  'businessRegistrationNumber',
  'address',
  'mailOrderSalesNumber',
  'contactEmail',
  'guestInquiryRetention',
] as const;
type SiteInfoField = (typeof SITE_INFO_FIELDS)[number];
type SiteInfoValues = Record<SiteInfoField, string | null>;

export type PublicSiteInfo = SiteInfoValues & { guestInquiryRetention: string };

export type AdminSiteInfo = PublicSiteInfo & {
  guestInquiryRetentionIsDefault: boolean;
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
      guestInquiryRetentionIsDefault: !nonEmpty(row?.guestInquiryRetention),
      updatedByAdminUserId: row?.updatedByAdminUserId ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async update(admin: V1ActiveAdmin, dto: UpdateSiteInfoDto): Promise<AdminSiteInfo> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.v1SiteInfoSettings.findUnique({ where: { id: SETTINGS_ROW_ID } });

      const data: Partial<SiteInfoValues> = {};
      const beforeJson: Partial<SiteInfoValues> = {};
      const afterJson: Partial<SiteInfoValues> = {};
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

/** 폼이 고지하는 보관 기간과 제출 기록에 남기는 보관 기간이 같은 규칙을 쓰게 한다. */
export async function readGuestInquiryRetention(
  prisma: Pick<PrismaService, 'v1SiteInfoSettings'>,
): Promise<string> {
  const row = await prisma.v1SiteInfoSettings.findUnique({
    where: { id: SETTINGS_ROW_ID },
    select: { guestInquiryRetention: true },
  });
  return toPublic(row).guestInquiryRetention;
}

function toPublic(row: Partial<SiteInfoValues> | null): PublicSiteInfo {
  return {
    companyName: nonEmpty(row?.companyName),
    representativeName: nonEmpty(row?.representativeName),
    businessRegistrationNumber: nonEmpty(row?.businessRegistrationNumber),
    address: nonEmpty(row?.address),
    mailOrderSalesNumber: nonEmpty(row?.mailOrderSalesNumber),
    contactEmail: nonEmpty(row?.contactEmail),
    guestInquiryRetention: nonEmpty(row?.guestInquiryRetention) ?? DEFAULT_GUEST_INQUIRY_RETENTION,
  };
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
