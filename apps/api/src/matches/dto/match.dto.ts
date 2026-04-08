import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const MATCH_SPORT_TYPES = [
  'soccer',
  'futsal',
  'basketball',
  'badminton',
  'ice_hockey',
  'figure_skating',
  'short_track',
  'swimming',
  'tennis',
  'baseball',
  'volleyball',
] as const;

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

  @ApiProperty({ enum: MATCH_SPORT_TYPES })
  @IsEnum(MATCH_SPORT_TYPES)
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
  q?: string;

  @ApiPropertyOptional()
  @IsEnum(MATCH_SPORT_TYPES)
  @IsOptional()
  sportType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  district?: string;

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
  @IsInt()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  maxFee?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  freeOnly?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  availableOnly?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  beginnerFriendly?: boolean;

  @ApiPropertyOptional({ enum: ['upcoming', 'latest', 'deadline'] })
  @IsIn(['upcoming', 'latest', 'deadline'])
  @IsOptional()
  sort?: 'upcoming' | 'latest' | 'deadline';

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

export class UpdateMatchDto {
  @ApiPropertyOptional({ description: '매치 제목' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: '매치 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '매치 날짜 (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  matchDate?: string;

  @ApiPropertyOptional({ description: '최대 인원' })
  @IsInt()
  @Min(2)
  @IsOptional()
  maxPlayers?: number;

  @ApiPropertyOptional({ description: '참가비' })
  @IsInt()
  @Min(0)
  @IsOptional()
  fee?: number;

  @ApiPropertyOptional({ description: '시설 ID' })
  @IsString()
  @IsOptional()
  venueId?: string;
}

export class CancelMatchDto {
  @ApiPropertyOptional({ description: '취소 사유' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class ArriveMatchDto {
  @ApiProperty({ description: 'GPS 위도' })
  lat: number;

  @ApiProperty({ description: 'GPS 경도' })
  lng: number;

  @ApiProperty({ description: '도착 인증 사진 URL' })
  @IsString()
  photoUrl: string;
}
