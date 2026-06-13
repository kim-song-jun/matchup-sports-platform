import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const PLAYER_ELIGIBILITY_STATUSES = ['non_pro', 'pro', 'needs_review'] as const;
export type PlayerEligibilityStatus = (typeof PLAYER_ELIGIBILITY_STATUSES)[number];

/** 선수 추가 — PII(realName, birthDate)는 V1TournamentPlayer 에만 저장, 글로벌 프로필 미반영. */
export class AddPlayerDto {
  @IsUUID()
  userId!: string;

  /** PII — 실명. V1TournamentPlayer.realName 에만 저장. */
  @IsString()
  @MaxLength(40)
  realName!: string;

  /** PII — 생년월일(YYYY-MM-DD 형식 권장). 엄격 검증 미적용. */
  @IsOptional()
  @IsString()
  birthDate?: string;

  /** 미지정 시 needs_review 로 저장. */
  @IsOptional()
  @IsIn(PLAYER_ELIGIBILITY_STATUSES)
  eligibilityStatus?: PlayerEligibilityStatus;
}

/** 어드민 선출여부 확정 — needs_review → non_pro | pro. */
export class UpdatePlayerEligibilityDto {
  @IsIn(PLAYER_ELIGIBILITY_STATUSES)
  eligibilityStatus!: PlayerEligibilityStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
