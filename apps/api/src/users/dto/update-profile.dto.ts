import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nickname?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  profileImageUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other'] })
  @IsEnum(['male', 'female', 'other'])
  @IsOptional()
  gender?: 'male' | 'female' | 'other';

  @ApiPropertyOptional()
  @IsInt()
  @Min(1950)
  @Max(2015)
  @IsOptional()
  birthYear?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationCity?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationDistrict?: string;
}
