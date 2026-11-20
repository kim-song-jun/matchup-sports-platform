import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const TEAM_INTERNAL_MAX_PLAYERS = 60;
export const TEAM_INTERNAL_MAX_SIDES = 4;

export class InternalMatchListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class InternalMatchPreviewDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(TEAM_INTERNAL_MAX_PLAYERS)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  userIds!: string[];

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(TEAM_INTERNAL_MAX_SIDES)
  teamCount!: number;

  /** 같은 값이면 같은 편성. 생략하면 0, "다시 뽑기"는 다른 값을 보낸다. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4294967295)
  seed?: number;
}

export class InternalMatchSideInputDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TEAM_INTERNAL_MAX_PLAYERS)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  userIds!: string[];
}

export class CreateInternalMatchDto {
  @IsDateString()
  playedAt!: string;

  /** 배열 순서가 곧 1팀·2팀… 이다. */
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(TEAM_INTERNAL_MAX_SIDES)
  @ValidateNested({ each: true })
  @Type(() => InternalMatchSideInputDto)
  sides!: InternalMatchSideInputDto[];
}

export class InternalMatchGoalInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TEAM_INTERNAL_MAX_SIDES)
  sideNumber!: number;

  @IsString()
  @MaxLength(64)
  scorerUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assistUserId?: string;
}

export class RecordInternalMatchResultDto {
  /** sides 와 같은 순서(1팀, 2팀…)의 점수. */
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(TEAM_INTERNAL_MAX_SIDES)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(99, { each: true })
  scores!: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InternalMatchGoalInputDto)
  goals?: InternalMatchGoalInputDto[];
}
