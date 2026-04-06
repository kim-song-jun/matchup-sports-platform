import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CursorQueryDto {
  @ApiPropertyOptional({ description: 'Cursor (message ID) for pagination' })
  @IsOptional()
  @IsString()
  before?: string;

  @ApiPropertyOptional({ description: 'Number of items to return (1-100)', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 30;
}
