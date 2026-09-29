import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const GAME_ROSTER_ADJUSTMENT_REASONS = ['INJURY', 'PERSONAL', 'LATE_OR_EARLY', 'OTHER'] as const;
export type GameRosterAdjustmentReason = (typeof GAME_ROSTER_ADJUSTMENT_REASONS)[number];

export class CreateGameRosterAdjustmentDto {
  @ApiProperty({ description: '이번 경기에서 뺄 선수의 계정 id(기준 명단 안이어야 한다)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId!: string;

  @ApiPropertyOptional({ enum: GAME_ROSTER_ADJUSTMENT_REASONS, description: '팀·운영자에게만 보이는 사유' })
  @IsOptional()
  @IsIn(GAME_ROSTER_ADJUSTMENT_REASONS)
  reason?: GameRosterAdjustmentReason;
}
