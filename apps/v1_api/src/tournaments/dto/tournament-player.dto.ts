import { Equals, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export const PLAYER_ELIGIBILITY_STATUSES = ['non_pro', 'pro', 'needs_review'] as const;
export type PlayerEligibilityStatus = (typeof PLAYER_ELIGIBILITY_STATUSES)[number];

/**
 * 운영진이 선출 여부를 **무엇으로** 확인했는가(MD-QA #192). Prisma enum
 * `V1TournamentPlayerEligibilityMethod` 와 같은 값이다. 서버는 JoinKFA 에 요청을 보내지 않는다 —
 * `joinkfa` 는 사람이 JoinKFA 화면을 직접 보고 확인했다는 기록일 뿐이다.
 */
export const PLAYER_ELIGIBILITY_METHODS = ['joinkfa', 'certificate', 'self_presented', 'self_declared', 'other'] as const;
export type PlayerEligibilityMethod = (typeof PLAYER_ELIGIBILITY_METHODS)[number];

/** 선수 본인이 신고할 수 있는 값 — "확인 중" 은 신고값이 아니다. */
export const PLAYER_SELF_DECLARABLE_STATUSES = ['non_pro', 'pro'] as const;

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

  /** 골키퍼 여부. 생략 시 일반 선수로 등록한다. */
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  goalkeeper?: boolean;

  /** 미지정 시 needs_review 로 저장. */
  @IsOptional()
  @IsIn(PLAYER_ELIGIBILITY_STATUSES)
  eligibilityStatus?: PlayerEligibilityStatus;
}

/**
 * 어드민 선출여부 판정 — 판정 + 확인 방법 + 메모를 한 번에 저장한다(MD-QA #192).
 *
 * `note` 는 **보낸 경우에만** 덮어쓴다. 예전엔 생략하면 `null` 로 지워져, 판정만 다시 저장해도
 * 앞서 남긴 근거 메모가 사라졌다. 지우려면 빈 문자열을 보낸다.
 * `verificationMethod` 는 `non_pro`·`pro` 판정에 필수다 — "무엇으로 확인했는지" 없는 확정을 막는다.
 * `needs_review` 로 되돌릴 때는 보내지 않아도 되고, 보내지 않으면 방법이 비워진다.
 */
export class UpdatePlayerEligibilityDto {
  @IsIn(PLAYER_ELIGIBILITY_STATUSES)
  eligibilityStatus!: PlayerEligibilityStatus;

  @ValidateIf((dto: UpdatePlayerEligibilityDto) => dto.eligibilityStatus !== 'needs_review' || dto.verificationMethod !== undefined)
  @IsIn(PLAYER_ELIGIBILITY_METHODS, { message: '무엇으로 확인했는지 골라 주세요.' })
  verificationMethod?: PlayerEligibilityMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * 팀장·매니저의 선출 여부 선택. 판정 근거·메모는 운영진만 쓰므로 **이 DTO 에는 없다** —
 * 어드민 DTO 를 같이 쓰면 팀 경로가 `verificationMethod` 를 실어 보낼 수 있게 된다.
 */
export class UpdateTeamPlayerEligibilityDto {
  @IsIn(PLAYER_ELIGIBILITY_STATUSES)
  eligibilityStatus!: PlayerEligibilityStatus;
}

/** 이전 대회·리그 판정 유지(MD-QA #192 ②). 서버가 원본이 같은 사용자의 운영진 판정인지 다시 확인한다. */
export class CarryOverPlayerEligibilityDto {
  @IsUUID()
  sourcePlayerId!: string;
}

/**
 * 선수 본인 선출 여부 신고(MD-QA #192 ③). 판정을 바꾸지 않는 **참고 기록**이다.
 * 허위 신고 고지에 동의해야 저장한다 — 화면 체크박스와 같은 조건을 서버도 본다.
 */
export class SelfDeclarePlayerEligibilityDto {
  @IsIn(PLAYER_SELF_DECLARABLE_STATUSES, { message: '아마추어 또는 선출 중에서 골라 주세요.' })
  selfDeclaredStatus!: (typeof PLAYER_SELF_DECLARABLE_STATUSES)[number];

  @Equals(true, { message: '허위 신고 안내에 동의해야 신고할 수 있어요.' })
  consent!: boolean;
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

/** 참가 명단 공통 설정. 자격 심사와 별개로 저장하며 생략한 값은 보존한다. */
export class UpdatePlayerRosterSettingsDto {
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber?: number | null;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  goalkeeper?: boolean;
}

/** 번호는 명시적으로 저장하고, GK는 바꾼 경우에만 보내 기존 경기 역할을 보존한다. */
export class UpdateAdminPlayerSettingsDto extends UpdatePlayerJerseyDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  goalkeeper?: boolean;
}
