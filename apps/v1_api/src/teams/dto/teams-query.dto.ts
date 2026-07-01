import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class TeamsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  levelCodes?: string;

  @IsOptional()
  @IsUUID()
  sportId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  regionId?: string;

  @IsOptional()
  @IsIn(['성별 무관', '남', '여', '무관'])
  genderRule?: '성별 무관' | '남' | '여' | '무관';

  @IsOptional()
  @IsIn(['approval_required', 'closed'])
  joinPolicy?: 'approval_required' | 'closed';

  @IsOptional()
  @IsIn(['recommended', 'latest', 'member_count', 'trust'])
  sort?: 'recommended' | 'latest' | 'member_count' | 'trust';

  @IsOptional()
  @IsIn(['card', 'compact'])
  view?: 'card' | 'compact';
}

export class MyTeamsQueryDto {
  @IsOptional()
  @IsIn(['manage_team', 'create_team_match', 'apply_team_match'])
  permission?: 'manage_team' | 'create_team_match' | 'apply_team_match';
}
