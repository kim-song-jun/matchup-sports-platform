import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  MaxLength,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportType, ListingType, ItemCondition } from '@prisma/client';

export class CreateListingDto {
  @ApiProperty({ description: '매물 제목', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: '매물 설명' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ enum: SportType, description: '관련 종목' })
  @IsEnum(SportType)
  sportType!: SportType;

  @ApiProperty({ description: '카테고리 (예: 신발, 장갑, 골대)', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category!: string;

  @ApiProperty({ enum: ItemCondition, description: '상품 상태' })
  @IsEnum(ItemCondition)
  condition!: ItemCondition;

  @ApiProperty({ description: '판매 가격 (원)', minimum: 0 })
  @IsInt()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ enum: ListingType, description: '거래 유형 (기본: sell)' })
  @IsEnum(ListingType)
  @IsOptional()
  listingType?: ListingType;

  @ApiPropertyOptional({ description: '매물 이미지 URL 목록', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional({ description: '거래 희망 도시', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  locationCity?: string;

  @ApiPropertyOptional({ description: '소속 팀 ID (팀 허브 귀속)' })
  @IsString()
  @IsOptional()
  teamId?: string;

  @ApiPropertyOptional({ description: '소속 장소 ID (장소 허브 귀속)' })
  @IsString()
  @IsOptional()
  venueId?: string;

  @ApiPropertyOptional({ description: '거래 희망 구/군', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  locationDistrict?: string;

  @ApiPropertyOptional({ description: '대여료 (원/일, listingType=rent 시)', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  rentalPricePerDay?: number;

  @ApiPropertyOptional({ description: '대여 보증금 (원)', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  rentalDeposit?: number;

  @ApiPropertyOptional({ description: '공동구매 목표 수량 (listingType=group_buy 시)', minimum: 2 })
  @IsInt()
  @Min(2)
  @IsOptional()
  groupBuyTarget?: number;

  @ApiPropertyOptional({ description: '공동구매 마감일 (ISO8601)' })
  @IsDateString()
  @IsOptional()
  groupBuyDeadline?: string;
}
