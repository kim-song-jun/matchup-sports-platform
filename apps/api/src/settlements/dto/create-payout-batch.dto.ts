import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO for POST /admin/payouts/batch.
 * Either `recipientIds` or `settlementIds` must be provided (at least one).
 * If `recipientIds` is provided, server queries eligible settlements for those recipients
 * (optionally filtered by cutoffDate) and derives settlementIds server-side.
 * If `settlementIds` is provided directly, the explicit list is used.
 */
export class CreatePayoutBatchDto {
  @ApiPropertyOptional({
    description: '수신자 ID 목록 — 서버가 각 수신자의 eligible 정산 내역을 조회해 배치 생성',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  recipientIds?: string[];

  @ApiPropertyOptional({
    description: '명시적 정산 ID 목록 — recipientIds 대신 직접 지정',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  settlementIds?: string[];

  @ApiPropertyOptional({
    description: '기준 날짜 (ISO 8601) — 이 날짜 이전에 릴리즈된 정산만 포함 (recipientIds 사용 시)',
    example: '2026-04-18',
  })
  @IsOptional()
  @IsDateString()
  cutoffDate?: string;

  @ApiPropertyOptional({ description: '관리자 메모', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
