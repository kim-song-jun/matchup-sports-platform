import { Transform, Type } from 'class-transformer';
import { queryBoolean } from '../../common/query-boolean';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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

  /** 일반 팀매치(leagueId null) / 정규 리그 경기(leagueId 있음) 구분. 미지정이면 전체. */
  @IsOptional()
  @IsIn(['friendly', 'competition'])
  kind?: 'friendly' | 'competition';

  /** 오늘(KST) 시작하는 경기만. 첫 페이지 `facets.today` 는 다른 필터는 그대로 두고 이 토글을 켠 건수다. */
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  today?: boolean;

  /** 지금 신청할 수 있는 모집 중 경기만. 첫 페이지 `facets.recruiting` 은 다른 필터는 그대로 두고 이 토글을 켠 건수다. */
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  recruitingOnly?: boolean;

  /** `true` 이고 첫 페이지(커서 없음)일 때만 `pageInfo.totalCount` 와 `facets` 를 계산해 싣는다. 폴링·부가 조회는 생략한다. */
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeFacets?: boolean;
}

export class TeamMatchEligibilityQueryDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

export class MyTeamMatchesQueryDto {
  @IsOptional()
  @IsIn(['hosted', 'applied', 'created', 'all'])
  scope?: 'hosted' | 'applied' | 'created' | 'all';

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
