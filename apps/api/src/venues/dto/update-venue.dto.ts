import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateVenueDto {
  @ApiPropertyOptional({ description: '시설명', maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: '주소', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

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

  @ApiPropertyOptional({ description: '상세 주소', maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  addressDetail?: string;

  @ApiPropertyOptional({ description: '전화번호', maxLength: 20 })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '시설 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '이미지 URL 목록', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional({ description: '시설 태그 목록', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  facilities?: string[];

  @ApiPropertyOptional({ description: '운영 시간 JSON' })
  @IsOptional()
  operatingHours?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '시간당 대여료', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  pricePerHour?: number;
}
