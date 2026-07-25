import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const ERROR_LOG_SOURCES = ['server', 'client'] as const;
export type ErrorLogSourceFilter = (typeof ERROR_LOG_SOURCES)[number];

export const ERROR_LOG_LEVELS = ['error', 'warn'] as const;
export type ErrorLogLevelFilter = (typeof ERROR_LOG_LEVELS)[number];

/**
 * GET /admin/ops/errors 쿼리. cursor 페이지네이션은 다른 어드민 목록(예:
 * AdminRegistrationListQueryDto)과 동일하게 `cursor`(마지막으로 받은 id) + `limit` 조합.
 */
export class AdminErrorLogListQueryDto {
  @IsOptional()
  @IsIn(ERROR_LOG_SOURCES)
  source?: ErrorLogSourceFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  statusCode?: number;

  @IsOptional()
  @IsIn(ERROR_LOG_LEVELS)
  level?: ErrorLogLevelFilter;

  /** lastSeenAt >= from */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** lastSeenAt <= to */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** message · route 부분일치 검색어 (대소문자 무시) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
