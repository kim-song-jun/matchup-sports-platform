import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  Min,
  Max,
  IsDateString,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateMatchDto {
  @ApiProperty({ description: '매치 제목' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: '매치 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '대표 이미지 URL' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({ enum: ['futsal', 'basketball', 'badminton', 'ice_hockey', 'figure_skating', 'short_track'] })
  @IsString()
  sportType: string;

  @ApiProperty({ description: '시설 ID' })
  @IsString()
  venueId: string;

  @ApiProperty({ description: '매치 날짜 (YYYY-MM-DD)' })
  @IsDateString()
  matchDate: string;

  @ApiProperty({ description: '시작 시간 (HH:mm)' })
  @IsString()
  startTime: string;

  @ApiProperty({ description: '종료 시간 (HH:mm)' })
  @IsString()
  endTime: string;

  @ApiProperty({ description: '최대 인원' })
  @IsInt()
  @Min(2)
  @Max(30)
  maxPlayers: number;

  @ApiPropertyOptional({ description: '참가비' })
  @IsInt()
  @Min(0)
  @IsOptional()
  fee?: number;

  @ApiPropertyOptional({ description: '최소 레벨 (1-5)' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  levelMin?: number;

  @ApiPropertyOptional({ description: '최대 레벨 (1-5)' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  levelMax?: number;

  @ApiPropertyOptional({ enum: ['any', 'male', 'female'] })
  @IsEnum(['any', 'male', 'female'])
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ description: '팀 구성 설정' })
  @IsObject()
  @IsOptional()
  teamConfig?: Record<string, unknown>;
}

export class MatchFilterDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sportType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  levelMin?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  levelMax?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number;
}
