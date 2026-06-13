import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const TOURNAMENT_PAYMENT_METHODS = ['pg', 'bank_transfer'] as const;
export type TournamentPaymentMethod = (typeof TOURNAMENT_PAYMENT_METHODS)[number];

export class CreateRegistrationDto {
  @IsUUID()
  teamId!: string;
}

/**
 * 신청 제출 — 결제수단 택1(PG/계좌이체) + 필수 동의. 계좌이체 선택 시 입금자명 필수
 * (서비스 계층 검증). 제출 시 draft → awaiting_payment 로 전이하며 결제 레코드 생성.
 */
export class SubmitRegistrationDto {
  @IsIn(TOURNAMENT_PAYMENT_METHODS)
  paymentMethod!: TournamentPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  depositorName?: string;

  @IsBoolean()
  agreedRules!: boolean;

  @IsBoolean()
  agreedPrivacy!: boolean;

  @IsBoolean()
  agreedRefund!: boolean;

  @IsOptional()
  @IsBoolean()
  agreedMediaConsent?: boolean;
}

export class CancelRegistrationRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
