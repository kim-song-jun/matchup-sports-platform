import { Transform, Type } from 'class-transformer';
import { queryBoolean } from '../../common/query-boolean';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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
  @IsIn(['latest', 'member_count', 'activity'])
  sort?: 'latest' | 'member_count' | 'activity';

  /**
   * 활동 많은순(`sort=activity`)에서 이 지역(시/도면 하위 구/군 포함)의 팀을 먼저 보여 준다. 걸러 내지 않는다 — 나머지 팀은 그 뒤에 활동순으로 이어진다.
   * 다른 정렬에서는 무시한다. 사용자의 활동 지역은 서버가 읽지 않고 호출한 쪽이 명시해서, 같은 주소가 같은 결과를 내게 한다(캐시가 섞이지 않는다).
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferRegionId?: string;

  @IsOptional()
  @IsIn(['card', 'compact'])
  view?: 'card' | 'compact';

  /** `true` 이고 첫 페이지(커서 없음)일 때만 `pageInfo.totalCount` 와 `facets` 를 계산해 싣는다. 폴링·부가 조회는 생략한다. */
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeFacets?: boolean;
}

export class MyTeamsQueryDto {
  @IsOptional()
  @IsIn(['manage_team', 'create_team_match', 'apply_team_match'])
  permission?: 'manage_team' | 'create_team_match' | 'apply_team_match';
}

/** 팀 만들기·수정 입력 중 이름 확인(H2) — 같은 종목·지역에 같은 이름이 있는지만 답한다. */
export class TeamNameAvailabilityQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @IsUUID()
  sportId!: string;

  @IsString()
  @MaxLength(100)
  regionId!: string;

  /** 수정 중인 팀 자신은 세지 않는다. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  excludeTeamId?: string;
}
