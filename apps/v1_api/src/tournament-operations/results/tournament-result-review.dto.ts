import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { GameResultParticipantDto, GameScoreDto } from '../../games/dto/game-result.dto';

/**
 * `POST /games/:gameId/result-revisions/:revisionId/review-decision` body.
 * tournament_director/platform_ops only; reject/request_supplement always
 * require a reason since both close the current review SLA.
 */
export class ReviewDecisionGameResultRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsIn(['reject', 'request_supplement'])
  decision!: 'reject' | 'request_supplement';

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/**
 * `POST /games/:gameId/result-revisions/:revisionId/supersede-and-submit`
 * body. Base revision must be REJECTED or SUPPLEMENT_REQUESTED; creates and
 * submits the successor atomically with a fresh review SLA.
 */
export class SupersedeAndSubmitGameResultRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @ValidateNested()
  @Type(() => GameScoreDto)
  score!: GameScoreDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameResultParticipantDto)
  actualParticipants!: GameResultParticipantDto[];

  @IsString()
  @IsNotEmpty()
  eventsHash!: string;

  @IsOptional()
  @IsUUID()
  mvpParticipantId?: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/**
 * `POST /games/:gameId/result-revisions/:revisionId/officialize` body.
 * `projectionPreviewHash` must equal the SHA-256 hex digest of the frozen
 * revision content (score + eventsHash + mvpParticipantId), independently
 * reconstructable by the caller from `GET .../result-revisions` -- this is
 * the "projection preview" confirmation: it proves the caller is
 * officializing the exact content they inspected, not a hash pinned to
 * `officialAt` (which does not exist before this call assigns it).
 */
export class OfficializeGameResultRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsString()
  @IsNotEmpty()
  projectionPreviewHash!: string;
}

/** `POST /games/:gameId/result-revisions/:revisionId/void` body. */
export class VoidGameResultRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** Nested `changes` object of `POST /games/:gameId/corrections`. */
export class GameResultCorrectionChangesDto {
  @ValidateNested()
  @Type(() => GameScoreDto)
  score!: GameScoreDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameResultParticipantDto)
  actualParticipants!: GameResultParticipantDto[];

  @IsString()
  @IsNotEmpty()
  eventsHash!: string;

  @IsOptional()
  @IsUUID()
  mvpParticipantId?: string;
}

/**
 * `POST /games/:gameId/corrections` body. platform_ops/tournament_director
 * only (not flag-gated). Creates a same-game superseding DRAFT revision
 * pointing at `baseRevisionId`, which must be the game's CURRENT official
 * revision (not merely any revision whose stored `state` happens to be
 * `OFFICIAL` -- a superseded-but-still-`OFFICIAL`-tagged row is rejected,
 * see `TournamentResultReviewService.createResultCorrection`). The prior
 * official pointer stays authoritative until the correction is separately
 * officialized through `POST .../officialize`.
 */
export class CreateGameResultCorrectionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsUUID()
  baseRevisionId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ValidateNested()
  @Type(() => GameResultCorrectionChangesDto)
  changes!: GameResultCorrectionChangesDto;
}
