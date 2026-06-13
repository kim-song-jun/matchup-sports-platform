import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const ADMIN_REGISTRATION_STATUSES = [
  'draft',
  'submitted',
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
  'waitlisted',
  'cancel_requested',
  'cancelled',
] as const;
export type AdminRegistrationStatus = (typeof ADMIN_REGISTRATION_STATUSES)[number];

export class AdminRegistrationListQueryDto {
  @IsOptional()
  @IsIn(ADMIN_REGISTRATION_STATUSES)
  status?: AdminRegistrationStatus;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** PATCH confirm-payment — 입금 확인 시작. 추가 body 없음(registrationId로 충분). */
export class AdminConfirmPaymentDto {
  /** 운영 메모 옵션 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** PATCH confirm — 참가 확정 또는 대기 */
export class AdminConfirmRegistrationDto {
  @IsIn(['confirm', 'waitlist'])
  decision!: 'confirm' | 'waitlist';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** PATCH cancel — 취소 처리 */
export class AdminCancelRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** POST roster-lock — 명단 잠금 메모 */
export class AdminRosterLockDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
