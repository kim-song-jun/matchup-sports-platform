import { Type } from 'class-transformer';
import { IsInt, IsObject, IsUUID, Min, ValidateIf, ValidateNested } from 'class-validator';

/** 승부차기 점수. 킥 수·선축은 받지 않는다 — 득점 기록이 없는 경기라 대조할 대상이 없다. */
export class QuickResultPenaltiesDto {
  @IsInt()
  @Min(0)
  home!: number;

  @IsInt()
  @Min(0)
  away!: number;
}

export class QuickResultScoreDto {
  @IsInt()
  @Min(0)
  home!: number;

  @IsInt()
  @Min(0)
  away!: number;

  /** `@IsOptional()` 은 null 도 건너뛰므로 undefined 만 면제한다(`PenaltyScoreDto` 와 같은 이유). */
  @ValidateIf((score: QuickResultScoreDto) => score.penalties !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => QuickResultPenaltiesDto)
  penalties?: QuickResultPenaltiesDto;
}

/** `POST /admin/games/:gameId/quick-result` 본문. 헤더 `Idempotency-Key` 는 `clientCommandId` 와 같아야 한다. */
export class QuickResultDto {
  @IsUUID()
  clientCommandId!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ValidateNested()
  @Type(() => QuickResultScoreDto)
  score!: QuickResultScoreDto;
}
