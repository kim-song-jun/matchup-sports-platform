import { V1ScheduleState, V1ScheduleType, V1ScheduleVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
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

// 매치 ↔ 팀일정 연동(레인 schedule): `type: MATCH`는 TeamMatchesService가 트랜잭션 안에서만 만들 수
// 있다(TeamSchedulesService.create()가 SCHEDULE_MATCH_TYPE_SYSTEM_ONLY로 거부). 이 DTO는 이제
// MATCH 스케줄을 절대 만들지 못하므로 `teamMatchId` 필드는 두지 않는다 — 남겨두면 어떤 값을 넣어도
// 항상 거부만 되는 죽은 입력 경로가 된다.
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

  /**
   * CP1 fix: the type is explicitly `string | null` because `null` and "omitted" are two
   * different, meaningful signals TeamSchedulesService.update() must distinguish — omitted means
   * "leave the existing rsvpDeadlineAt unchanged", `null` means "explicitly clear it to SQL NULL".
   * `@IsOptional()` already skips `@IsDateString()` for both `undefined` and `null` (that is
   * exactly what makes `null` a valid explicit-clear value here, not a validation bug) — a real,
   * non-null value is still required to pass `@IsDateString()`.
   */
  @IsOptional()
  @IsDateString()
  rsvpDeadlineAt?: string | null;

  @IsOptional()
  @IsEnum(V1ScheduleVisibility)
  visibility?: V1ScheduleVisibility;
}
