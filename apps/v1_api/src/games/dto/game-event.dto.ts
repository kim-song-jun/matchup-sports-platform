import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { V1GameEventType } from '@prisma/client';

export class ListGameEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  afterSequence = 0;
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
