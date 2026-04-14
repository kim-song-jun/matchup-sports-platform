import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class LessonFilterDto {
  @ApiPropertyOptional({ description: 'Filter by sport type (e.g. futsal, basketball)' })
  @IsOptional()
  @IsString()
  sportType?: string;

  @ApiPropertyOptional({ description: 'Filter by lesson type (group/private/clinic/match_practice/free_practice)' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by team ID' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Filter by venue ID' })
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiPropertyOptional({ description: 'Cursor for pagination (lesson ID)' })
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
}
