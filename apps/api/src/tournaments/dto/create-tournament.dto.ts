import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';

export class CreateTournamentDto {
  @ApiProperty({ enum: SportType, enumName: 'SportType', description: '종목' })
  @IsEnum(SportType)
  sportType!: SportType;

  @ApiProperty({ description: '대회 제목', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: '대회 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: '시작일 (ISO8601)' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: '종료일 (ISO8601)' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ description: '참가비', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  entryFee?: number;

  @ApiPropertyOptional({ description: '최대 참가 팀/인원', minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxParticipants?: number;

  @ApiPropertyOptional({ description: '소속 팀 ID' })
  @IsString()
  @IsOptional()
  teamId?: string;

  @ApiPropertyOptional({ description: '소속 장소 ID' })
  @IsString()
  @IsOptional()
  venueId?: string;
}
