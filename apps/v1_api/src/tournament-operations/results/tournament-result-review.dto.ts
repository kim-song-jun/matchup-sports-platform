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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GameResultParticipantDto, GameScoreDto } from '../../games/dto/game-result.dto';

/**
 * 몰수·중단 표식 (Task 165 BE-3).
 *
 * ## 왜 콘솔이 이걸 받아야 하나
 * 지금까지 콘솔은 `outcomeReason` 을 **base 에서 승계만** 했다 — 새로 정할 입력이 없었다.
 * 몰수를 *지정* 하는 경로는 **리그 전용 결과 입력의 몰수 플래그** 하나뿐이었는데, BE-3 이
 * 그 엔드포인트·DTO 를 지웠다 — 이 필드가 없으면 **몰수를 새로 지정할 길이 사라진다.**
 *
 * ## 스코어를 건드리지 않는다 — 표식일 뿐이다
 * 리그 전용 경로의 `isForfeit` 도 정확히 그랬다: `outcomeReason` 컬럼과 사유 마커만 세우고
 * 스코어는 운영자 입력 그대로 뒀다. **스코어를 1:0 으로 강제하는 것은 몰수 *선언* 서비스**
 * (`league-match-forfeit.service.ts`, `noShowTeamId` 로 방향 결정)이고 그 서비스는 남는다.
 * 순위 계산은 `{homeScore, awayScore}` 만 읽으므로(`league-standings-source.ts`), 두 경로가
 * 같은 스코어를 쓰면 순위도 같다 — 여기서 스코어 규칙을 흉내 내면 없던 결합이 생긴다.
 *
 * ## 미전송은 승계다
 * 필드를 안 보내면 지금처럼 base 의 표식을 이어받는다. 그래야 **몰수로 끝난 경기의 정정이
 * 표식을 지우지 않는다**(그 승계가 원래 있던 이유다).
 */
export class GameResultOutcomeDto {
  /** `NORMAL`(정상) · `FORFEIT`(몰수·기권) · `ABANDONED`(중단). 새 값을 만들지 않는다. */
  @IsIn(['NORMAL', 'FORFEIT', 'ABANDONED'])
  reason!: 'NORMAL' | 'FORFEIT' | 'ABANDONED';

  /**
   * 운영자 메모. **`FORFEIT`·`ABANDONED` 에는 필수**다 — 비우면 422
   * `GAME_OUTCOME_NOTE_REQUIRED`(`GamesService.extractEndOutcome` 과 같은 규칙·같은 코드).
   * "나중에 왜 그 점수인지 설명할 수 있는 유일한 기록" 이라 이 저장소가 몰수·중단에
   * 사유를 강제한다. `NORMAL` 에는 의미가 없어 저장하지 않는다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

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
  @IsBoolean()
  anonymous?: boolean;

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

  /** 몰수·중단 표식. 미전송이면 base 승계 — `GameResultOutcomeDto` 참조. */
  @IsOptional()
  @ValidateNested()
  @Type(() => GameResultOutcomeDto)
  outcome?: GameResultOutcomeDto;
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

  /** 몰수·중단 표식. 미전송이면 base 승계 — `GameResultOutcomeDto` 참조. */
  @IsOptional()
  @ValidateNested()
  @Type(() => GameResultOutcomeDto)
  outcome?: GameResultOutcomeDto;
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


