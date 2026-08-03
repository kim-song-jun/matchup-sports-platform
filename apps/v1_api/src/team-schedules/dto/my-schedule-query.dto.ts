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

  // 'completed' accepted for forward compatibility only — Task 12 introduces no mechanism
  // that ever transitions a schedule to COMPLETED (see team-schedules.service.ts notes).
  @IsOptional()
  @IsIn(['scheduled', 'cancelled', 'completed'])
  status?: 'scheduled' | 'cancelled' | 'completed';
}
