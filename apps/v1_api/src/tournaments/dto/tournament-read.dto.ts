import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 소비자 대회 목록 쿼리 — 공개 노출 status(open/closed/in_progress/completed)만 필터.
 * draft/cancelled는 노출 제외(서비스 계층 고정).
 */
export const PUBLIC_TOURNAMENT_STATUSES = [
  'open',
  'closed',
  'in_progress',
  'completed',
] as const;
export type PublicTournamentStatus = (typeof PUBLIC_TOURNAMENT_STATUSES)[number];

export class TournamentListQueryDto {
  @IsOptional()
  @IsIn(PUBLIC_TOURNAMENT_STATUSES)
  status?: PublicTournamentStatus;

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

/**
 * 어드민 공지 생성 DTO.
 * audience는 현재 메타 저장 용도(실제 발송 로직은 후속 task).
 * publish=true이면 publishedAt=now()로 즉시 공개 처리.
 */
export const ANNOUNCEMENT_AUDIENCES = [
  'all_registered',
  'confirmed_only',
  'waitlist',
] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_AUDIENCES)
  audience?: AnnouncementAudience;

  @IsOptional()
  publish?: boolean;
}
