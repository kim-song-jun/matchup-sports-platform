import { Transform, Type } from 'class-transformer';
import { queryBoolean } from '../../common/query-boolean';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class MatchesQueryDto {
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
  @IsIn(['recruiting', 'closed', 'completed', 'cancelled', 'expired'])
  status?: 'recruiting' | 'closed' | 'completed' | 'cancelled' | 'expired';

  @IsOptional()
  @IsIn(['recommended', 'latest', 'starts_at', 'deadline'])
  sort?: 'recommended' | 'latest' | 'starts_at' | 'deadline';

  @IsOptional()
  @IsIn(['card', 'compact'])
  view?: 'card' | 'compact';

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
}

export class MyMatchesQueryDto {
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
  @IsIn(['joined', 'created'])
  mode?: 'joined' | 'created';
}
