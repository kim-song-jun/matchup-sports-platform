import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const TOURNAMENT_STATUSES = [
  'draft',
  'open',
  'closed',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export class AdminTournamentListQueryDto {
  @IsOptional()
  @IsIn(TOURNAMENT_STATUSES)
  status?: TournamentStatus;

  @IsOptional()
  @IsUUID()
  sportId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  // 어드민 표는 "몇 번째 페이지인지"가 보여야 운영자가 위치를 잃지 않는다. cursor 도 계속
  // 받아 기존 호출자를 깨뜨리지 않고, 둘 다 오면 page 가 이긴다 — paginationArgs 참고.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 번호는 정수여야 해요.' })
  @Min(1, { message: '페이지 번호는 1 이상이어야 해요.' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 크기는 정수여야 해요.' })
  @Min(1, { message: '페이지 크기는 1 이상이어야 해요.' })
  @Max(50, { message: '페이지 크기는 50을 넘을 수 없어요.' })
  limit?: number;
}

export const TOURNAMENT_FORMATS = ['league', 'knockout', 'group_knockout'] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];
export const TOURNAMENT_GENDER_CATEGORIES = ['mixed', 'male', 'female'] as const;
export type TournamentGenderCategory = (typeof TOURNAMENT_GENDER_CATEGORIES)[number];
export const TOURNAMENT_RULES_TEXT_MAX_LENGTH = 10_000;

export class CreateTournamentDto {
  @IsUUID(undefined, { message: '올바른 종목 ID를 입력해 주세요.' })
  sportId!: string;

  @IsString({ message: '대회 이름을 입력해 주세요.' })
  @MaxLength(120, { message: '대회 이름은 120자를 넘을 수 없어요.' })
  title!: string;

  @IsOptional()
  @IsIn(TOURNAMENT_FORMATS)
  format?: TournamentFormat;

  /** 리그 방식에서 각 팀이 최소 몇 경기를 보장받아야 하는지. 비워두면 검증하지 않는다. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '최소 경기 수는 정수여야 해요.' })
  @Min(1, { message: '최소 경기 수는 1경기 이상이어야 해요.' })
  @Max(50, { message: '최소 경기 수는 50경기를 넘을 수 없어요.' })
  minMatchesPerTeam?: number;

  @IsOptional()
  @IsDateString()
  registrationDeadlineAt?: string;

  /** 선수(명단) 제출 마감 시각. 폼에서는 필수 입력을 유도하되(대회 시작 D-7 23:59 자동 제안), API/스키마 레벨은 optional 유지. */
  @IsOptional()
  @IsDateString()
  rosterDeadlineAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledEndAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '장소명은 200자를 넘을 수 없어요.' })
  venue?: string;

  /** 목록 카드 썸네일용 커버 이미지 URL (/uploads 업로드 후 전달) */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coverImageUrl?: string | null;

  @IsDefined({ message: '참가 팀 수를 입력해 주세요.' })
  @Type(() => Number)
  @IsInt({ message: '참가 팀 수는 정수여야 해요.' })
  @Min(2, { message: '참가 팀 수는 2개 이상이어야 해요.' })
  @Max(64, { message: '참가 팀 수는 64개를 넘을 수 없어요.' })
  teamCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '최소 선수 수는 정수여야 해요.' })
  @Min(1, { message: '최소 선수 수는 1명 이상이어야 해요.' })
  @Max(50, { message: '최소 선수 수는 50명을 넘을 수 없어요.' })
  minPlayers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '최대 선수 수는 정수여야 해요.' })
  @Min(1, { message: '최대 선수 수는 1명 이상이어야 해요.' })
  @Max(50, { message: '최대 선수 수는 50명을 넘을 수 없어요.' })
  maxPlayers?: number;

  @IsOptional()
  @IsIn(TOURNAMENT_GENDER_CATEGORIES, { message: '성별 카테고리가 올바르지 않아요.' })
  genderCategory?: TournamentGenderCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '남성 최소 인원은 정수여야 해요.' })
  @Min(0, { message: '남성 최소 인원은 0명 이상이어야 해요.' })
  @Max(50, { message: '남성 최소 인원은 50명을 넘을 수 없어요.' })
  genderMinMale?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '남성 최대 인원은 정수여야 해요.' })
  @Min(0, { message: '남성 최대 인원은 0명 이상이어야 해요.' })
  @Max(50, { message: '남성 최대 인원은 50명을 넘을 수 없어요.' })
  genderMaxMale?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '여성 최소 인원은 정수여야 해요.' })
  @Min(0, { message: '여성 최소 인원은 0명 이상이어야 해요.' })
  @Max(50, { message: '여성 최소 인원은 50명을 넘을 수 없어요.' })
  genderMinFemale?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '여성 최대 인원은 정수여야 해요.' })
  @Min(0, { message: '여성 최대 인원은 0명 이상이어야 해요.' })
  @Max(50, { message: '여성 최대 인원은 50명을 넘을 수 없어요.' })
  genderMaxFemale?: number;

  /**
   * "출전 인원"(경기장에 서는 라인업 상한, GK 포함) — `V1CompetitionConfigVersion.lineup.maxPlayers`로
   * 옮겨진다. 위 `minPlayers`/`maxPlayers`(대회 "등록" 로스터 크기)와는 완전히 다른 값이니
   * 혼동하지 말 것. 생략하면 종목의 canonical 기본값을 그대로 쓴다(football 11명 / futsal 6명).
   * 선택 가능한 값은 종목마다 다르며 `LineupSizeConfigResolver`가 서버에서 검증한다
   * (지원하지 않는 값은 422 LINEUP_SIZE_UNSUPPORTED).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '출전 인원은 정수여야 해요.' })
  @Min(1, { message: '출전 인원은 1명 이상이어야 해요.' })
  @Max(50, { message: '출전 인원은 50명을 넘을 수 없어요.' })
  lineupMaxPlayers?: number;

  /**
   * "교체 방식"(후보 → 주전 교체를 제한할지, 무제한 롤링으로 둘지) —
   * `V1CompetitionConfigVersion.lineup.substitutions`로 옮겨진다. 생략하면 종목의
   * canonical 기본값을 그대로 쓴다(football: 제한 5회 / futsal: 무제한). 두 값 모두 모든
   * 종목에서 항상 선택 가능하다(`LineupSizeConfigResolver.selectableSubstitutionModes()`)
   * — 라인업 인원처럼 종목마다 후보가 달라지지 않는다.
   */
  @IsOptional()
  @IsIn(['limited', 'rolling'], { message: '교체 방식은 limited 또는 rolling이어야 해요.' })
  substitutionMode?: 'limited' | 'rolling';

  /**
   * "교체 횟수" — `substitutionMode`가 'limited'일 때만 의미가 있다. 'rolling'과 함께
   * 보내면 400으로 거절된다(TournamentsAdminService#assertSubstitutionPolicyPair).
   * 'limited'인데 이 값을 생략하면 canonical이 이미 제한형인 종목(football)만 그 기본
   * 횟수를 쓰고, canonical이 무제한인 종목(futsal)을 제한형으로 바꾸려면 반드시 함께
   * 보내야 한다(422 SUBSTITUTION_LIMIT_REQUIRED) — 라인업 인원과 달리 파생시킬 실제
   * 후보 카탈로그가 없어 지어내지 않는다.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '교체 횟수는 정수여야 해요.' })
  @Min(0, { message: '교체 횟수는 0회 이상이어야 해요.' })
  @Max(50, { message: '교체 횟수는 50회를 넘을 수 없어요.' })
  maxSubstitutions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '참가비는 정수여야 해요.' })
  @Min(0, { message: '참가비는 0원 이상이어야 해요.' })
  @Max(100_000_000, { message: '참가비는 1억 원을 넘을 수 없어요.' })
  entryFee?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankHolder?: string;

  /**
   * 경고 누적 출전정지 — 옐로 몇 장이 쌓이면 다음 1경기 출전이 막히는가.
   * **생략·null = 이 대회에는 규정을 적용하지 않는다.** 기본값을 두지 않은 것이
   * 안전장치다(schema.prisma 의 같은 필드 주석 참고 — 값이 있으면 이미 끝난 대회에
   * 소급 적용된다). 2026-08-23 사용자 결정 Q4-A.
   */
  @IsOptional()
  @IsInt({ message: '경고 누적 기준은 정수여야 해요.' })
  @Min(1, { message: '경고 누적 기준은 1장 이상이어야 해요.' })
  @Max(20, { message: '경고 누적 기준이 20장을 넘으면 사실상 규정이 없는 것과 같아요.' })
  yellowAccumulationLimit?: number | null;

  /** 레드카드(퇴장) 1장당 출전정지 경기 수. 생략·null = 퇴장 정지 미적용. */
  @IsOptional()
  @IsInt({ message: '퇴장 정지 경기 수는 정수여야 해요.' })
  @Min(1, { message: '퇴장 정지 경기 수는 1경기 이상이어야 해요.' })
  @Max(20, { message: '퇴장 정지 경기 수는 20경기를 넘을 수 없어요.' })
  redCardSuspensionMatches?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(TOURNAMENT_RULES_TEXT_MAX_LENGTH, {
    message: '대회 규정은 10,000자를 넘을 수 없어요.',
  })
  rulesText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  refundPolicyText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  prizePool?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prizeSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prizeBreakdown?: string;

  @IsOptional()
  @IsBoolean()
  promoHomeEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHomeTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  promoHomeSubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  promoHomeImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  promoHomeBadgeText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHomeDateText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHomeTeamsText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHomeLocationText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  promoHomePrizeText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  promoHomePriority?: number;

  @IsOptional()
  @IsBoolean()
  promoListEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoListTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  promoListSubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  promoListImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  promoListBadgeText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoListDateText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoListTeamsText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoListLocationText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  promoListPrizeText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  promoListPriority?: number;
}

/** 모든 필드 optional — 부분 수정(PATCH). status는 별도 엔드포인트로 분리. */
export class UpdateTournamentDto {
  @IsOptional()
  @IsUUID(undefined, { message: '올바른 종목 ID를 입력해 주세요.' })
  sportId?: string;

  @IsOptional()
  @IsString({ message: '대회 이름을 입력해 주세요.' })
  @MaxLength(120, { message: '대회 이름은 120자를 넘을 수 없어요.' })
  title?: string;

  @IsOptional()
  @IsIn(TOURNAMENT_FORMATS)
  format?: TournamentFormat;

  /** 리그 방식에서 각 팀이 최소 몇 경기를 보장받아야 하는지. 비워두면 검증하지 않는다. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '최소 경기 수는 정수여야 해요.' })
  @Min(1, { message: '최소 경기 수는 1경기 이상이어야 해요.' })
  @Max(50, { message: '최소 경기 수는 50경기를 넘을 수 없어요.' })
  minMatchesPerTeam?: number;

  @IsOptional()
  @IsDateString()
  registrationDeadlineAt?: string | null;

  /** 선수(명단) 제출 마감 시각. 폼에서는 필수 입력을 유도하되(대회 시작 D-7 23:59 자동 제안), API/스키마 레벨은 optional 유지. */
  @IsOptional()
  @IsDateString()
  rosterDeadlineAt?: string | null;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsDateString()
  scheduledEndAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '장소명은 200자를 넘을 수 없어요.' })
  venue?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '주차 안내는 500자를 넘을 수 없어요.' })
  parkingInfo?: string | null;

  /** 목록 카드 썸네일용 커버 이미지 URL (/uploads 업로드 후 전달) */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  coverImageUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '참가 팀 수는 정수여야 해요.' })
  @Min(2, { message: '참가 팀 수는 2개 이상이어야 해요.' })
  @Max(64, { message: '참가 팀 수는 64개를 넘을 수 없어요.' })
  teamCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '최소 선수 수는 정수여야 해요.' })
  @Min(1, { message: '최소 선수 수는 1명 이상이어야 해요.' })
  @Max(50, { message: '최소 선수 수는 50명을 넘을 수 없어요.' })
  minPlayers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '최대 선수 수는 정수여야 해요.' })
  @Min(1, { message: '최대 선수 수는 1명 이상이어야 해요.' })
  @Max(50, { message: '최대 선수 수는 50명을 넘을 수 없어요.' })
  maxPlayers?: number;

  @IsOptional()
  @IsIn(TOURNAMENT_GENDER_CATEGORIES, { message: '성별 카테고리가 올바르지 않아요.' })
  genderCategory?: TournamentGenderCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '남성 최소 인원은 정수여야 해요.' })
  @Min(0, { message: '남성 최소 인원은 0명 이상이어야 해요.' })
  @Max(50, { message: '남성 최소 인원은 50명을 넘을 수 없어요.' })
  genderMinMale?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '남성 최대 인원은 정수여야 해요.' })
  @Min(0, { message: '남성 최대 인원은 0명 이상이어야 해요.' })
  @Max(50, { message: '남성 최대 인원은 50명을 넘을 수 없어요.' })
  genderMaxMale?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '여성 최소 인원은 정수여야 해요.' })
  @Min(0, { message: '여성 최소 인원은 0명 이상이어야 해요.' })
  @Max(50, { message: '여성 최소 인원은 50명을 넘을 수 없어요.' })
  genderMinFemale?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '여성 최대 인원은 정수여야 해요.' })
  @Min(0, { message: '여성 최대 인원은 0명 이상이어야 해요.' })
  @Max(50, { message: '여성 최대 인원은 50명을 넘을 수 없어요.' })
  genderMaxFemale?: number | null;

  /**
   * "출전 인원"(라인업 상한) 변경. 대회에 아직 완료되지 않은 픽스처만 있고 status가
   * in_progress/completed가 아닐 때만 허용된다 — TournamentsAdminService.update()가
   * TournamentCompetitionConfig.change()(기존 repoint 경로)를 그대로 재사용해 CAS +
   * "완료된 경기는 소급하지 않는다" 불변식을 지킨다. 자세한 제약은 CreateTournamentDto의
   * 같은 필드 주석 참고.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '출전 인원은 정수여야 해요.' })
  @Min(1, { message: '출전 인원은 1명 이상이어야 해요.' })
  @Max(50, { message: '출전 인원은 50명을 넘을 수 없어요.' })
  lineupMaxPlayers?: number;

  /**
   * "교체 방식" 변경. 대회에 아직 완료되지 않은 픽스처만 있고 status가
   * in_progress/completed가 아닐 때만 허용된다(위 lineupMaxPlayers와 동일한 잠금 정책 —
   * 같은 화면의 두 설정이 서로 다른 규칙을 갖지 않게 한다). 자세한 제약은
   * CreateTournamentDto의 같은 필드 주석 참고.
   */
  @IsOptional()
  @IsIn(['limited', 'rolling'], { message: '교체 방식은 limited 또는 rolling이어야 해요.' })
  substitutionMode?: 'limited' | 'rolling';

  /** "교체 횟수" 변경. 제약은 CreateTournamentDto의 같은 필드 주석 참고. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '교체 횟수는 정수여야 해요.' })
  @Min(0, { message: '교체 횟수는 0회 이상이어야 해요.' })
  @Max(50, { message: '교체 횟수는 50회를 넘을 수 없어요.' })
  maxSubstitutions?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '참가비는 정수여야 해요.' })
  @Min(0, { message: '참가비는 0원 이상이어야 해요.' })
  @Max(100_000_000, { message: '참가비는 1억 원을 넘을 수 없어요.' })
  entryFee?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankAccount?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankHolder?: string | null;

  /**
   * 경고 누적 출전정지 — 옐로 몇 장이 쌓이면 다음 1경기 출전이 막히는가.
   * **생략·null = 이 대회에는 규정을 적용하지 않는다.** 기본값을 두지 않은 것이
   * 안전장치다(schema.prisma 의 같은 필드 주석 참고 — 값이 있으면 이미 끝난 대회에
   * 소급 적용된다). 2026-08-23 사용자 결정 Q4-A.
   */
  @IsOptional()
  @IsInt({ message: '경고 누적 기준은 정수여야 해요.' })
  @Min(1, { message: '경고 누적 기준은 1장 이상이어야 해요.' })
  @Max(20, { message: '경고 누적 기준이 20장을 넘으면 사실상 규정이 없는 것과 같아요.' })
  yellowAccumulationLimit?: number | null;

  /** 레드카드(퇴장) 1장당 출전정지 경기 수. 생략·null = 퇴장 정지 미적용. */
  @IsOptional()
  @IsInt({ message: '퇴장 정지 경기 수는 정수여야 해요.' })
  @Min(1, { message: '퇴장 정지 경기 수는 1경기 이상이어야 해요.' })
  @Max(20, { message: '퇴장 정지 경기 수는 20경기를 넘을 수 없어요.' })
  redCardSuspensionMatches?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(TOURNAMENT_RULES_TEXT_MAX_LENGTH, {
    message: '대회 규정은 10,000자를 넘을 수 없어요.',
  })
  rulesText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  refundPolicyText?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  prizePool?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prizeSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prizeBreakdown?: string;

  @IsOptional()
  @IsBoolean()
  promoHomeEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHomeTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  promoHomeSubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  promoHomeImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  promoHomeBadgeText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHomeDateText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHomeTeamsText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoHomeLocationText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  promoHomePrizeText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  promoHomePriority?: number;

  @IsOptional()
  @IsBoolean()
  promoListEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoListTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  promoListSubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  promoListImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  promoListBadgeText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoListDateText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoListTeamsText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promoListLocationText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  promoListPrizeText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  promoListPriority?: number;
}

export class ChangeTournamentStatusDto {
  @IsIn(TOURNAMENT_STATUSES)
  status!: TournamentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PublishBracketDto {
  /**
   * 공개 예약 시각(ISO). 생략하면 즉시 공개한다. 과거 시각은 서비스에서 거부한다
   * (즉시 공개와 구분되지 않아 운영자가 의도를 확인할 수 없다).
   */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
