import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsUUID, ValidateIf } from 'class-validator';

export const GUEST_INQUIRY_PURGE_MAX_IDS = 500;
export const guestInquiryPurgeScopes = ['selected', 'all'] as const;
export type GuestInquiryPurgeScope = (typeof guestInquiryPurgeScopes)[number];

/**
 * POST /admin/guest-inquiries/purge. `all` 은 서버가 지금 계산한 파기 대상 전체,
 * `selected` 는 그 안에서 고른 id 들이다 — 어느 쪽이든 서버가 대상 조건을 다시 건다.
 */
export class PurgeGuestInquiriesDto {
  @IsIn(guestInquiryPurgeScopes)
  scope!: GuestInquiryPurgeScope;

  @ValidateIf((dto: PurgeGuestInquiriesDto) => dto.scope === 'selected' || dto.inquiryIds !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(GUEST_INQUIRY_PURGE_MAX_IDS)
  @IsUUID('all', { each: true })
  inquiryIds?: string[];
}
