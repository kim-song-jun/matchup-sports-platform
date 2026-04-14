import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TeamFilterDto {
  @ApiPropertyOptional({ description: 'Filter by sport type (e.g. futsal, basketball)' })
  @IsOptional()
  @IsString()
  sportType?: string;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filter by recruiting status ("true" | "false")' })
  @IsOptional()
  @IsString()
  recruiting?: string;

  @ApiPropertyOptional({ description: 'Cursor for pagination (team ID)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Number of results to return (1-100, default 20)', minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => {
    const parsed = parseInt(value as string, 10);
    if (Number.isNaN(parsed)) return 20;
    return Math.min(Math.max(1, parsed), 100);
  })
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Search query for team name' })
  @IsOptional()
  @IsString()
  search?: string;
}
