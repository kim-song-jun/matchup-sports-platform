import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SportType, TournamentStatus } from '@prisma/client';

export class TournamentQueryDto {
  @ApiPropertyOptional({ enum: SportType, enumName: 'SportType', description: '종목 필터' })
  @IsEnum(SportType)
  @IsOptional()
  sportType?: SportType;

  @ApiPropertyOptional({ enum: TournamentStatus, enumName: 'TournamentStatus', description: '상태 필터' })
  @IsEnum(TournamentStatus)
  @IsOptional()
  status?: TournamentStatus;

  @ApiPropertyOptional({ description: '팀 ID 필터' })
  @IsString()
  @IsOptional()
  teamId?: string;

  @ApiPropertyOptional({ description: '장소 ID 필터' })
  @IsString()
  @IsOptional()
  venueId?: string;

  @ApiPropertyOptional({ description: '커서' })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({ description: '페이지 크기', minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
