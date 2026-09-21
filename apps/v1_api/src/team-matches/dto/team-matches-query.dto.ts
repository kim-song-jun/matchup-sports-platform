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

  /** Filter to a single host team's matches (used by the team detail "이 팀의 열린 매치" section). */
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsIn(['성별 무관', '남', '여', '무관'])
  genderRule?: '성별 무관' | '남' | '여' | '무관';

  @IsOptional()
  @IsIn(['recruiting', 'closed', 'matched', 'cancelled', 'completed', 'expired'])
  status?: 'recruiting' | 'closed' | 'matched' | 'cancelled' | 'completed' | 'expired';

  @IsOptional()
  @IsIn(['recommended', 'latest', 'starts_at', 'deadline'])
  sort?: 'recommended' | 'latest' | 'starts_at' | 'deadline';

  @IsOptional()
  @IsIn(['card', 'compact'])
  view?: 'card' | 'compact';

  /** 일반 팀매치(둘 다 null) / 대회·리그 경기(둘 중 하나라도 있음) 구분. 미지정이면 전체. */
  @IsOptional()
  @IsIn(['friendly', 'competition'])
  kind?: 'friendly' | 'competition';
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
  @IsIn(['recruiting', 'closed', 'matched', 'cancelled', 'completed', 'expired', 'requested', 'approved', 'rejected', 'withdrawn'])
  status?: 'recruiting' | 'closed' | 'matched' | 'cancelled' | 'completed' | 'expired' | 'requested' | 'approved' | 'rejected' | 'withdrawn';

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
