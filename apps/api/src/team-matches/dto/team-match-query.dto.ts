import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { SportType } from '@prisma/client';

export class TeamMatchQueryDto {
  @ApiProperty({ required: false, enum: SportType }) @IsOptional() @IsEnum(SportType) sportType?: SportType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() city?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() teamId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() cursor?: string;
  @ApiProperty({ required: false, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
