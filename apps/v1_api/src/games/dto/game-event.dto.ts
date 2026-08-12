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
  ValidateIf,
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

  @IsOptional()
  @IsUUID()
  assistParticipantId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  period!: number;

  // No @Max here on purpose — see the matching comment on
  // `validateEventShape` in `../core/game-invariants.ts` (alpha "452′"
  // incident): a hard upper bound would 422-reject a legitimate late
  // capture instead of just flagging it.
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

/**
 * Issue #376 fix: in-place assist attach/detach for an already-persisted
 * GOAL event. Replaces the old "reverseEvent the GOAL, then re-submit a new
 * GOAL with assistParticipantId set" two-step flow (see
 * `GamesService.assignGoalAssist`'s doc comment for the full root-cause —
 * that flow raced the offline queue's `expectedVersion` and left the
 * original+CORRECTION+resubmitted-GOAL all visible in the event log).
 *
 * `assistParticipantId` is required (not `?:`) — unlike
 * `AppendGameEventDto.assistParticipantId`, this DTO's entire purpose is to
 * set the field, so the caller must say explicitly what they want: a
 * participant id to attach, or `null` to detach a previously-attached
 * assist. Detach shares this same command rather than getting its own
 * endpoint because it is the exact same in-place mutation of the same
 * field on the same row — a separate "unassign" endpoint would just be this
 * one with a narrower body.
 */
export class AssignGoalAssistDto {
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

  @ValidateIf((dto: AssignGoalAssistDto) => dto.assistParticipantId !== null)
  @IsUUID()
  assistParticipantId!: string | null;
}
