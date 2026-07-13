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

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 크기는 정수여야 해요.' })
  @Min(1, { message: '페이지 크기는 1 이상이어야 해요.' })
  @Max(50, { message: '페이지 크기는 50을 넘을 수 없어요.' })
  limit?: number;
}

export const TOURNAMENT_FORMATS = ['league', 'knockout', 'group_knockout'] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export class CreateTournamentDto {
  @IsUUID(undefined, { message: '올바른 종목 ID를 입력해 주세요.' })
  sportId!: string;

  @IsString({ message: '대회 이름을 입력해 주세요.' })
  @MaxLength(120, { message: '대회 이름은 120자를 넘을 수 없어요.' })
  title!: string;

  @IsOptional()
  @IsIn(TOURNAMENT_FORMATS)
  format?: TournamentFormat;

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

  @IsOptional()
  @IsString()
  @MaxLength(5000)
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

  @IsOptional()
  @IsString()
  @MaxLength(5000)
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

export class ChangeTournamentStatusDto {
  @IsIn(TOURNAMENT_STATUSES)
  status!: TournamentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
