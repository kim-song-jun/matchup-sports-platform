import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class PenaltyScoreDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  home!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  away!: number;

  /**
   * 선축(먼저 찬 팀). 점수 두 개로는 복원할 수 없는 동전 던지기 결과다.
   *
   * **선언이 곧 허용이다.** `main.ts`의 `whitelist: true, forbidNonWhitelisted: true`는
   * `@ValidateNested()`가 걸린 중첩 객체 **안까지** 적용되므로, 이 필드를 여기 적지
   * 않으면 `penalties.firstKickSideKey`를 실은 요청이 여분 키로 400이 된다. 반대로
   * 여기 한 곳에 적으면 `GameScoreDto.penalties`와 `GameResultRecoveryDto.penalties`
   * **두 레인이 동시에** 이 키를 받는다 — 두 레인 모두 이 DTO를 재사용하기 때문이다.
   *
   * `penalties` 자체와 **같은 이유로** `@IsOptional()`이 아니라 `@ValidateIf`를 쓴다:
   * `@IsOptional()`은 값이 `null`일 때도 검증 전체를 건너뛰므로 `firstKickSideKey: null`이
   * 위반 0건으로 통과한다(실측). 그리고 이 DTO를 공유하는 **팀 매치 레인**
   * (`CreateGameResultRevisionDto` → `GamesService.createResultRevision`)은 `jsonInput(dto.score)`를
   * 그대로 저장하므로 — `extractEndPenalties`가 없는 경로다 — 그 null이 `score.penalties`에
   * 실제로 박힌다. 그러면 "선축 없음(키 부재)"과 "선축 null" 두 상태가 공존하게 되고,
   * 그건 `extractEndPenalties`가 애써 지키는 불변식("없으면 없는 것이 유일한 표현")을
   * DTO 쪽 입구로 되돌리는 것이다. `@ValidateIf`로 undefined만 면제하면 null은 `@IsIn`에
   * 걸려 400이 된다.
   */
  @ValidateIf((penalties: PenaltyScoreDto) => penalties.firstKickSideKey !== undefined)
  @IsIn(['HOME', 'AWAY'])
  firstKickSideKey?: 'HOME' | 'AWAY';
}

export class GameScoreDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  home!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  away!: number;

  /**
   * 승부차기 점수. `@IsObject()`만으로는 `{}`·`{home:'a'}`·`{home:1}`(away 누락)·
   * `{home:-1,away:0}`가 전부 통과했고, 그 값이 리비전 `score`에 그대로 저장되면
   * 아웃박스 핸들러 두 번째 줄의 `parseOfficialPenalties`
   * (`game-operations/parse-official-score.ts`)가 throw해 잡이 6회 재시도 끝에
   * POISONED로 남았다 — 운영자에게는 "성공"만 보인다.
   *
   * `@IsObject()`를 **유지한 채** 중첩 검증을 덧붙인다. `@IsObject()`를 빼고
   * `@ValidateNested()`로 교체하면 `penalties: []`가 위반 0건으로 통과해(실측)
   * 같은 POISONED를 배열이라는 다른 입구로 재도입한다.
   *
   * `@IsOptional()`이 아니라 `@ValidateIf`를 쓰는 이유: `@IsOptional()`은 값이
   * `null`일 때도 검증 전체를 건너뛰므로 `penalties: null`이 통과한다. 그 null이
   * 저장되면 `parseOfficialPenalties(null)`이 위와 똑같이 throw한다. 이 DTO는
   * **팀 매치 레인(`CreateGameResultRevisionDto`)도 공유**하는데 그 레인에는
   * `extractEndPenalties` 같은 서비스 가드가 없어(`GamesService.createResultRevision`은
   * `jsonInput(dto.score)`를 그대로 저장한다) DTO가 유일한 방어선이다 — 게다가
   * `validateGameResultInvariants`의 `validateScore`는 `penalties !== undefined`
   * 에서 `penalties.home`을 읽어 null이면 `GameContractError`가 아닌 TypeError로
   * 500이 난다. `@ValidateIf`로 undefined만 면제하면 null은 `@IsObject()`에서
   * 400으로 걸린다. 대회 레인은 그 위에 서비스 가드가 한 겹 더 있다
   * (`extractEndPenalties` — 동점 승부차기까지 422로 거부).
   */
  @ValidateIf((score: GameScoreDto) => score.penalties !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => PenaltyScoreDto)
  penalties?: PenaltyScoreDto;
}

export class GameResultParticipantDto {
  @IsUUID()
  participantId!: string;

  @IsUUID()
  sideId!: string;

  @IsBoolean()
  started!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minutesPlayed?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  goals!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  assists?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fouls?: number;

  @IsObject()
  cards!: { yellow: number; red: number };

  @IsBoolean()
  goalkeeper!: boolean;
}

export class CreateGameResultRevisionDto {
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

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}

export class SubmitGameResultRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;
}

export class DecideGameResultRevisionDto extends SubmitGameResultRevisionDto {
  @IsIn(['approve', 'change_request'])
  decision!: 'approve' | 'change_request';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}

export class GameResultRecoveryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsString()
  @IsNotEmpty()
  takeoverToken!: string;

  @IsString()
  @IsNotEmpty()
  eventsHash!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  /**
   * 승부차기 점수(결선 무승부 복구용).
   *
   * 복구 경로는 "이미 ENDED인데 리비전이 0건인 게임"을 되살린다. 그런 게임이 결선이고
   * 정규시간 무승부이면 `applyPenalties`의 `TOURNAMENT_PENALTY_REQUIRED` 가드에 걸리는데,
   * 여기에 승부차기를 실을 수단이 없으면 그 게임은 영영 복구할 수 없다(결과 교정 흐름은
   * 리비전이 1건 이상이어야 시작할 수 있어 대안이 되지 못한다). `end` 커맨드와 같은 형태로
   * 받아 같은 검증을 통과시킨다.
   *
   * `@IsObject()`는 `GameScoreDto.penalties`와 같은 이유로 필요하다: 중첩 검증만
   * 걸면 `penalties: []`가 위반 0건으로 통과해(실측) 그대로 `applyPenalties`를
   * 지나 리비전 score에 저장되고, 이후 `parseOfficialPenalties([])`가 throw해
   * 잡이 POISONED로 남는다. `@IsOptional()`이 아니라 `@ValidateIf`인 것도 같은
   * 이유다 — `@IsOptional()`은 `null`에서 검증을 건너뛴다.
   *
   * DTO만으로는 "동점 승부차기"(`{home:3,away:3}` — 승자가 없으므로
   * `resolveWinnerSide`가 draw로 떨어져 POISONED)를 막을 수 없어
   * `resultRecoveryDeriveAndSubmit`이 `extractEndPenalties`로 한 겹 더 검증한다.
   */
  @ValidateIf((dto: GameResultRecoveryDto) => dto.penalties !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => PenaltyScoreDto)
  penalties?: PenaltyScoreDto;
}
