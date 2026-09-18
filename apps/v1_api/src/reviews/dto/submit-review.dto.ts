import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';

/**
 * 4항목 채점(Task 155 후속). 넷 다 함께 제출한다 -- 부분 채점을 허용하면
 * "실력만 3건, 매너는 1건" 같은 반쪽 표본이 생겨 해금 카운트의 의미가 흐려진다.
 */
export class ReviewMetricScoresDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  skill!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  manner!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  punctuality!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(5)
  safety!: number;
}

export class SubmitReviewDto {
  @IsIn(['match', 'team_match', 'tournament_fixture'])
  sourceType!: 'match' | 'team_match' | 'tournament_fixture';

  @IsUUID()
  sourceId!: string;

  @IsIn(['user', 'team'])
  targetType!: 'user' | 'team';

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsUUID()
  targetTeamId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsIn([
    'punctual',
    'manner',
    'teamwork',
    'communication',
    'active',
    'considerate',
    'passionate',
    'play_again',
  ], { each: true })
  tagCodes!: string[];

  /**
   * 4항목 채점(실력·매너·시간약속·안전). 사람 대상 후기에서만 의미가 있다 --
   * 팀 대상에 실으면 400. 기존 클라이언트 호환을 위해 optional 이며, 없으면
   * legacy_single_rating 후기로 저장된다(해금 카운트에는 잡히지 않는다).
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => ReviewMetricScoresDto)
  metricScores?: ReviewMetricScoresDto;
}
