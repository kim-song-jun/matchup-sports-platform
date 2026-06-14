import { Type } from 'class-transformer';
import {
  IsDateString,
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
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export const TOURNAMENT_FORMATS = ['league', 'knockout', 'group_knockout'] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export class CreateTournamentDto {
  @IsUUID()
  sportId!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsIn(TOURNAMENT_FORMATS)
  format?: TournamentFormat;

  @IsOptional()
  @IsDateString()
  registrationDeadlineAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(64)
  teamCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  minPlayers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxPlayers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
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
}

/** 모든 필드 optional — 부분 수정(PATCH). status는 별도 엔드포인트로 분리. */
export class UpdateTournamentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsIn(TOURNAMENT_FORMATS)
  format?: TournamentFormat;

  @IsOptional()
  @IsDateString()
  registrationDeadlineAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(64)
  teamCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  minPlayers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxPlayers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
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
}

export class ChangeTournamentStatusDto {
  @IsIn(TOURNAMENT_STATUSES)
  status!: TournamentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
