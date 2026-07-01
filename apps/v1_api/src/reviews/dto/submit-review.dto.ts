import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

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
}
