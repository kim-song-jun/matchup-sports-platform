import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import type { TeamRecordCategory } from '../team-record-category';

/** `GET /tournaments/:id/schedule` -- cursor/round/group filter. */
export class PublicTournamentScheduleQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  round?: string;

  @IsOptional()
  @IsString()
  groupId?: string;
}

/** `GET /teams/:id/records` and `GET /users/:id/records` -- cursor/season filter (frozen REST contract). */
export class PublicRecordsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Four-digit calendar year (`playedAt` for team records, `officialAt` for user records). */
  @IsOptional()
  @Matches(/^[0-9]{4}$/)
  season?: string;
}

/**
 * `GET /teams/:id/records` -- D4-a: adds an optional league/tournament/friendly
 * filter on top of the frozen cursor/season contract above.
 *
 * 서브클래스로 두는 이유는 그대로다: `PublicRecordsQueryDto` 자체는 두 엔드포인트가
 * **그대로 공유**하는 frozen 계약이라, 거기에 필드를 더하면 그 필드를 쓰지 않는 쪽의
 * 계약까지 넓어진다. 확장은 각 엔드포인트의 서브클래스에서만 한다.
 */
export class TeamRecordsQueryDto extends PublicRecordsQueryDto {
  @IsOptional()
  @IsIn(['league', 'tournament', 'friendly'])
  type?: TeamRecordCategory;
}

/**
 * `GET /users/:id/records` -- Task 166 BE-4 (2026-09-03): 개인 기록에도 같은
 * 리그/대회/친선 구분을 넣는다(정본 §5). 그전에는 이 엔드포인트가 위 frozen DTO 를
 * 그대로 썼고 "개인 기록엔 그 구분 개념이 없다" 고 적혀 있었는데, 정본이 그 구분을
 * 요구하면서 그 전제가 바뀌었다.
 *
 * **기존 클라이언트는 무변경이다** — `type` 은 optional 이고, 빼고 부르면 **기존 필드는
 * 값·모양 그대로**다. 응답 자체는 완전히 동일하지는 않다: `summary.byType` 처럼 **가산
 * 필드가 더해진다**(기존 필드를 지우거나 바꾸지 않으므로 옛 클라이언트는 영향받지 않는다).
 * 회귀 스펙이 그 구분을 고정한다. 팀 전적과 같은 모양으로 서브클래스에서만 넓혀,
 * 공유 DTO 는 여전히 frozen 이다.
 */
export class UserRecordsQueryDto extends PublicRecordsQueryDto {
  @IsOptional()
  @IsIn(['league', 'tournament', 'friendly'])
  type?: TeamRecordCategory;
}
