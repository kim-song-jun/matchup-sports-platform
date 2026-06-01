import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class TeamMatchesQueryDto {
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
  @IsUUID()
  regionId?: string;

  @IsOptional()
  @IsIn(['성별 무관', '남', '여', '무관'])
  genderRule?: '성별 무관' | '남' | '여' | '무관';

  @IsOptional()
  @IsIn(['recruiting', 'matched', 'cancelled', 'completed', 'expired'])
  status?: 'recruiting' | 'matched' | 'cancelled' | 'completed' | 'expired';

  @IsOptional()
  @IsIn(['recommended', 'latest', 'starts_at', 'deadline'])
  sort?: 'recommended' | 'latest' | 'starts_at' | 'deadline';

  @IsOptional()
  @IsIn(['card', 'compact'])
  view?: 'card' | 'compact';
}

export class TeamMatchEligibilityQueryDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

export class MyTeamMatchesQueryDto {
  @IsOptional()
  @IsIn(['hosted', 'applied', 'all'])
  scope?: 'hosted' | 'applied' | 'all';

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsIn(['recruiting', 'matched', 'cancelled', 'completed', 'expired', 'requested', 'approved', 'rejected', 'withdrawn'])
  status?: 'recruiting' | 'matched' | 'cancelled' | 'completed' | 'expired' | 'requested' | 'approved' | 'rejected' | 'withdrawn';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
