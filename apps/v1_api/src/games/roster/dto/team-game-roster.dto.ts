import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { GAME_ROSTER_ADJUSTMENT_REASONS, type GameRosterAdjustmentReason } from './game-roster-adjustment.dto';

export const GAME_ROSTER_BATCH_OPS = ['EXCLUDE', 'REVOKE'] as const;
export type GameRosterBatchOp = (typeof GAME_ROSTER_BATCH_OPS)[number];

export class GameRosterBatchChangeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  gameId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId!: string;

  @ApiProperty({ enum: GAME_ROSTER_BATCH_OPS })
  @IsIn(GAME_ROSTER_BATCH_OPS)
  op!: GameRosterBatchOp;

  @ApiPropertyOptional({ enum: GAME_ROSTER_ADJUSTMENT_REASONS, description: 'EXCLUDE 에만 쓴다' })
  @IsOptional()
  @IsIn(GAME_ROSTER_ADJUSTMENT_REASONS)
  reason?: GameRosterAdjustmentReason;
}

export class GameRosterBatchDto {
  @ApiProperty({ type: [GameRosterBatchChangeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GameRosterBatchChangeDto)
  changes!: GameRosterBatchChangeDto[];
}

export const MEMBER_UNAVAILABILITY_REASONS = ['INJURY', 'PERSONAL', 'OTHER'] as const;
export type MemberUnavailabilityReason = (typeof MEMBER_UNAVAILABILITY_REASONS)[number];

export class CreateMemberUnavailabilityDto {
  @ApiProperty({ description: '결장 시작(포함). 이 시각 이후 시작하는 경기부터 빠진다' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ description: '결장 끝(제외). startsAt 보다 뒤여야 한다' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ enum: MEMBER_UNAVAILABILITY_REASONS })
  @IsOptional()
  @IsIn(MEMBER_UNAVAILABILITY_REASONS)
  reason?: MemberUnavailabilityReason;
}
