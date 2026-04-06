import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsUUID, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { SportType, MercenaryPostStatus } from '@prisma/client';

export class MercenaryQueryDto {
  @ApiProperty({ required: false, enum: SportType, description: 'Filter by sport type' })
  @IsOptional()
  @IsEnum(SportType)
  sportType?: SportType;

  @ApiProperty({ required: false, enum: MercenaryPostStatus, description: 'Filter by post status' })
  @IsOptional()
  @IsEnum(MercenaryPostStatus)
  status?: MercenaryPostStatus;

  @ApiProperty({ required: false, description: 'Filter by team ID' })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiProperty({ required: false, description: 'Cursor for pagination (last seen post ID)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiProperty({ required: false, default: 20, description: 'Number of items per page (1-100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
