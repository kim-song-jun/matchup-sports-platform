import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  IsBoolean,
  IsUrl,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportType } from '@prisma/client';

export class CreateTeamDto {
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

  @ApiPropertyOptional({ description: '팀 레벨 (1~5)', minimum: 1, maximum: 5, default: 3 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  level?: number;

  @ApiPropertyOptional({ description: '팀원 모집 여부', default: true })
  @IsBoolean()
  @IsOptional()
  isRecruiting?: boolean;

  @ApiPropertyOptional({ description: '연락처 또는 오픈카톡 링크', maxLength: 300 })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  contactInfo?: string;

  @ApiPropertyOptional({ description: '인스타그램 URL' })
  @IsUrl()
  @IsOptional()
  instagramUrl?: string;

  @ApiPropertyOptional({ description: '유튜브 URL' })
  @IsUrl()
  @IsOptional()
  youtubeUrl?: string;

  @ApiPropertyOptional({ description: '홍보 영상 URL (shorts/reels)' })
  @IsUrl()
  @IsOptional()
  shortsUrl?: string;

  @ApiPropertyOptional({ description: '카카오 오픈채팅 URL' })
  @IsUrl()
  @IsOptional()
  kakaoOpenChat?: string;

  @ApiPropertyOptional({ description: '팀 웹사이트 URL' })
  @IsUrl()
  @IsOptional()
  websiteUrl?: string;
}
