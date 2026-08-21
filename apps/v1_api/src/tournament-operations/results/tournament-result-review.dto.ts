import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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

export class GameResultGoalEventDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsUUID()
  sideId!: string;

  @IsOptional()
  @IsUUID()
  participantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  period?: number;

  @IsBoolean()
  ownGoal!: boolean;
}

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

  /**
   * 빈 배열을 통과시키면 새 리비전의 `v1_game_result_participants`가 0행이 되고,
   * 그 리비전이 공식이 되는 순간 그 경기의 선수 개개인 기록이 전멸한다
   * (`public-user-records.service.ts`가 그 테이블을 직접 읽는다).
   *
   * 그래도 여기에 `@ArrayNotEmpty()`를 붙이지 **않는다.** 그건 무조건적이어서
   * 정본 프로듀서가 정당하게 0행으로 만든 경기(선발 미표시·이벤트 없음, 로스터가
   * 빈 등록, TBD 브래킷 픽스처)의 점수 정정까지 400으로 막는다 — 정정 폼은 base
   * 리비전에서만 참가자를 채우므로 그런 경기는 영구히 고칠 수 없게 된다.
   * 필요한 술어는 "비우지 말라"가 아니라 **"있던 것을 비우지 말라"**여서 base
   * 리비전을 읽어야 하고, 그건 DTO가 알 수 없다 —
   * `TournamentResultReviewService.assertRevisionParticipantsValid`가 422
   * `PARTICIPANT_INVALID`로 처리한다.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameResultParticipantDto)
  actualParticipants!: GameResultParticipantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameResultGoalEventDto)
  goalEvents?: GameResultGoalEventDto[];

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

  /** 빈 배열을 DTO가 아니라 서비스에서 다루는 이유는 `SupersedeAndSubmitGameResultRevisionDto` 쪽 주석 참조. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameResultParticipantDto)
  actualParticipants!: GameResultParticipantDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GameResultGoalEventDto)
  goalEvents?: GameResultGoalEventDto[];

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
