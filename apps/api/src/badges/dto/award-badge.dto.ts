import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AwardBadgeDto {
  @ApiProperty({ description: 'Badge type identifier (e.g. newcomer, punctual)', example: 'newcomer' })
  @IsString()
  @MaxLength(50)
  type!: string;

  @ApiProperty({ description: 'Badge display name', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ description: 'Badge description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
