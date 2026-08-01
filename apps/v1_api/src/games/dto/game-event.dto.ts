import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { V1GameEventType } from '@prisma/client';

export class ListGameEventsQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) {
      return 0;
    }
    if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
      return Number.NaN;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
  })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  afterSequence: string | number = 0;

  get validatedAfterSequence(): number {
    if (
      typeof this.afterSequence !== 'number' ||
      !Number.isSafeInteger(this.afterSequence) ||
      this.afterSequence < 0
    ) {
      throw new TypeError('afterSequence must be a validated safe non-negative integer');
    }
    return this.afterSequence;
  }
}

export class AppendGameEventDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientEventId!: string;

  @IsString()
  @IsNotEmpty()
  takeoverToken!: string;

  @IsEnum(V1GameEventType)
  type!: V1GameEventType;

  @IsOptional()
  @IsUUID()
  sideId?: string;

  @IsOptional()
  @IsUUID()
  participantId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  period!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  clockMs!: number;

  @IsDateString()
  occurredAt!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class ReverseGameEventDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientEventId!: string;

  @IsString()
  @IsNotEmpty()
  takeoverToken!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
