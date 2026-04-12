import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  IsObject,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportType, VenueType } from '@prisma/client';

export class CreateVenueAdminDto {
  @ApiProperty({ description: '구장 이름', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: VenueType, description: '구장 유형' })
  @IsEnum(VenueType)
  type!: VenueType;

  @ApiProperty({ enum: SportType, isArray: true, description: '지원 종목 목록' })
  @IsArray()
  @IsEnum(SportType, { each: true })
  sportTypes!: SportType[];

  @ApiProperty({ description: '주소', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address!: string;

  @ApiPropertyOptional({ description: '상세 주소', maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  addressDetail?: string;

  @ApiProperty({ description: '위도', example: 37.5 })
  @IsNumber()
  lat!: number;

  @ApiProperty({ description: '경도', example: 127.0 })
  @IsNumber()
  lng!: number;

  @ApiProperty({ description: '도시', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  city!: string;

  @ApiProperty({ description: '구/군', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  district!: string;

  @ApiPropertyOptional({ description: '전화번호', maxLength: 20 })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '구장 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '시설 소유자 userId' })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ description: '구장 이미지 URL 목록', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional({ description: '시설 목록 (예: ["샤워실", "주차장"])', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  facilities?: string[];

  @ApiPropertyOptional({ description: '운영 시간 (JSON 객체)', example: { mon: '09:00-22:00' } })
  @IsObject()
  @IsOptional()
  operatingHours?: Record<string, string>;

  @ApiPropertyOptional({ description: '시간당 대여료 (원)', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  pricePerHour?: number;

  @ApiPropertyOptional({ description: '빙상 링크 구분 (full_rink / half_rink)', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  rinkSubType?: string;
}

export class UpdateVenueAdminDto {
  @ApiPropertyOptional({ description: '구장 이름', maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: VenueType, description: '구장 유형' })
  @IsEnum(VenueType)
  @IsOptional()
  type?: VenueType;

  @ApiPropertyOptional({ enum: SportType, isArray: true, description: '지원 종목 목록' })
  @IsArray()
  @IsEnum(SportType, { each: true })
  @IsOptional()
  sportTypes?: SportType[];

  @ApiPropertyOptional({ description: '주소', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: '상세 주소', maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  addressDetail?: string;

  @ApiPropertyOptional({ description: '위도' })
  @IsNumber()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ description: '경도' })
  @IsNumber()
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ description: '도시', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  city?: string;

  @ApiPropertyOptional({ description: '구/군', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  district?: string;

  @ApiPropertyOptional({ description: '전화번호', maxLength: 20 })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '구장 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '시설 소유자 userId' })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({ description: '구장 이미지 URL 목록', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional({ description: '시설 목록', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  facilities?: string[];

  @ApiPropertyOptional({ description: '운영 시간 (JSON 객체)' })
  @IsObject()
  @IsOptional()
  operatingHours?: Record<string, string>;

  @ApiPropertyOptional({ description: '시간당 대여료 (원)', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  pricePerHour?: number;

  @ApiPropertyOptional({ description: '빙상 링크 구분', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  rinkSubType?: string;
}
