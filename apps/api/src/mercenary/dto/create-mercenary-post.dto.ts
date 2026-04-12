import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsInt, Min, Max, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { SportType } from '@prisma/client';

export class CreateMercenaryPostDto {
  @ApiProperty({ description: 'Team ID to post mercenary for' })
  @IsUUID()
  teamId!: string;

  @ApiProperty({ enum: SportType, enumName: 'SportType', description: 'Sport type' })
  @IsEnum(SportType)
  sportType!: SportType;

  @ApiProperty({ description: 'Match date in ISO 8601 format' })
  @IsDateString()
  matchDate!: string;

  @ApiProperty({ description: 'Venue name or address' })
  @IsString()
  venue!: string;

  @ApiProperty({ description: 'Position or role needed' })
  @IsString()
  position!: string;

  @ApiProperty({ default: 1, description: 'Number of mercenaries needed' })
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;

  @ApiProperty({ default: 3, description: 'Skill level required (1-5)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  level?: number;

  @ApiProperty({ default: 0, description: 'Participation fee in KRW' })
  @IsOptional()
  @IsInt()
  @Min(0)
  fee?: number;

  @ApiProperty({ required: false, description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
