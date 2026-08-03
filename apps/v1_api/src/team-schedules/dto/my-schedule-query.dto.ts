import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class MyScheduleQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // W10 fix: 'completed' is now reachable — TeamSchedulesService.complete() (see its docblock)
  // is the versioned mutation that transitions a schedule from SCHEDULED to COMPLETED, so this
  // filter is a live query path, not forward-compat-only as it was before.
  @IsOptional()
  @IsIn(['scheduled', 'cancelled', 'completed'])
  status?: 'scheduled' | 'cancelled' | 'completed';
}
