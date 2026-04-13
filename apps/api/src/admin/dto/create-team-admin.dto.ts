import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  IsArray,
  IsBoolean,
  IsUrl,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';

export class CreateTeamAdminDto {
  @ApiProperty({ description: '팀 소유자 사용자 ID', format: 'uuid' })
  @IsUUID()
  ownerId!: string;

  @ApiProperty({ description: '팀 이름', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: SportType, enumName: 'SportType', isArray: true, description: '종목 목록 (최소 1개, 최대 11개)' })
  @IsArray()
  @IsEnum(SportType, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(11)
  sportTypes!: SportType[];

  @ApiPropertyOptional({ description: '팀 소개' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '로고 이미지 URL' })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ description: '커버 이미지 URL' })
  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: '팀 사진 URL 목록', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];

  @ApiPropertyOptional({ description: '활동 도시', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  city?: string;

  @ApiPropertyOptional({ description: '활동 구/군', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  district?: string;

  @ApiPropertyOptional({ description: '팀 멤버 수', minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  memberCount?: number;

  @ApiPropertyOptional({ description: '팀 평균 레벨 (1~5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  level?: number;

  @ApiPropertyOptional({ description: '멤버 모집 중 여부' })
  @IsBoolean()
  @IsOptional()
  isRecruiting?: boolean;

  @ApiPropertyOptional({ description: '연락처 (오픈카톡 링크 등)', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  contactInfo?: string;

  @ApiPropertyOptional({ description: '인스타그램 URL' })
  @IsUrl()
  @IsOptional()
  instagramUrl?: string;

  @ApiPropertyOptional({ description: '유튜브 URL' })
  @IsUrl()
  @IsOptional()
  youtubeUrl?: string;

  @ApiPropertyOptional({ description: '쇼츠/릴스 URL' })
  @IsUrl()
  @IsOptional()
  shortsUrl?: string;

  @ApiPropertyOptional({ description: '카카오 오픈채팅 URL' })
  @IsString()
  @IsOptional()
  kakaoOpenChat?: string;

  @ApiPropertyOptional({ description: '팀 웹사이트 URL' })
  @IsUrl()
  @IsOptional()
  websiteUrl?: string;
}
