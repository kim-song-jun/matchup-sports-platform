import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';

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

  /**
   * 등번호(정본 §3 "명단은 등번호와 이름"). **선택 입력**이라 없어도 명단에 들어간다.
   *
   * 범위는 정수 `0~99` 다. **`0` 은 유효한 등번호다** — 하한을 1 로 잡으면 안 된다.
   * 종목마다 세 자리를 쓰는 곳도 있지만 지금은 넓히지 않는다(넓혀야 하면 종목 설정으로 올린다).
   */
  @IsOptional()
  @IsInt({ message: '등번호는 정수로 입력해 주세요.' })
  @Min(0, { message: '등번호는 0에서 99 사이로 입력해 주세요.' })
  @Max(99, { message: '등번호는 0에서 99 사이로 입력해 주세요.' })
  jerseyNumber?: number;

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

/**
 * 등번호만 고친다.
 *
 * 기존 `UpdatePlayerEligibilityDto` 에 얹지 않은 이유: 그건 **자격 상태가 필수**라
 * 등번호만 바꾸려 해도 자격을 함께 보내야 하고, 그러면 팀장이 어드민 판정을 덮어쓸 위험이
 * 생긴다. 축이 다른 두 값을 한 요청에 묶지 않는다.
 *
 * `null` 은 **번호를 지운다**(번호 없는 선수로 되돌린다) — 생략과 구분해야 해서
 * `@IsOptional()` 이 아니라 명시적으로 nullable 이다.
 */
export class UpdatePlayerJerseyDto {
  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: '등번호는 정수로 입력해 주세요.' })
  @Min(0, { message: '등번호는 0에서 99 사이로 입력해 주세요.' })
  @Max(99, { message: '등번호는 0에서 99 사이로 입력해 주세요.' })
  jerseyNumber!: number | null;
}
