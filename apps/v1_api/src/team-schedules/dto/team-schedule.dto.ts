import { V1ScheduleState, V1ScheduleType, V1ScheduleVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ScheduleListQueryDto {
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

  @IsOptional()
  @IsEnum(V1ScheduleType)
  type?: V1ScheduleType;

  @IsOptional()
  @IsEnum(V1ScheduleState)
  state?: V1ScheduleState;
}

export class CreateScheduleDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsEnum(V1ScheduleType)
  type!: V1ScheduleType;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsString()
  @MaxLength(64)
  timezone!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsDateString()
  rsvpDeadlineAt?: string;

  @IsOptional()
  @IsEnum(V1ScheduleVisibility)
  visibility?: V1ScheduleVisibility;

  @IsOptional()
  @IsUUID()
  teamMatchId?: string;
}

export class UpdateScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsDateString()
  rsvpDeadlineAt?: string;

  @IsOptional()
  @IsEnum(V1ScheduleVisibility)
  visibility?: V1ScheduleVisibility;
}
