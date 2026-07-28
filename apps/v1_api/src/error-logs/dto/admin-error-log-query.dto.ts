import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const ERROR_LOG_SOURCES = ['server', 'client'] as const;
export type ErrorLogSourceFilter = (typeof ERROR_LOG_SOURCES)[number];

export const ERROR_LOG_LEVELS = ['error', 'warn'] as const;
export type ErrorLogLevelFilter = (typeof ERROR_LOG_LEVELS)[number];

/**
 * GET /admin/ops/errors 쿼리. 페이지네이션은 다른 어드민 목록과 동일하게 `page`(우선) 또는
 * `cursor`(마지막으로 받은 id) + `limit` 조합.
 */
export class AdminErrorLogListQueryDto {
  @IsOptional()
  @IsIn(ERROR_LOG_SOURCES)
  source?: ErrorLogSourceFilter;

  // HTTP status code 필터이므로 실제 범위 밖 값은 경계에서 막는다.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
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

  // 어드민 표는 "몇 번째 페이지인지"가 보여야 운영자가 위치를 잃지 않는다. cursor 도 계속
  // 받아 기존 호출자를 깨뜨리지 않고, 둘 다 오면 page 가 이긴다 — paginationArgs 참고.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
