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
  ValidateNested,
} from 'class-validator';

export class GameScoreDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  home!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  away!: number;

  @IsOptional()
  @IsObject()
  penalties?: { home: number; away: number };
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

export class PenaltyScoreDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  home!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  away!: number;
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
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => PenaltyScoreDto)
  penalties?: PenaltyScoreDto;
}
