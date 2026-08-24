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
 * filter on top of the frozen cursor/season contract above. Kept as a subclass
 * rather than a new field on `PublicRecordsQueryDto` itself, because that DTO
 * is shared verbatim with `GET /users/:id/records` (which has no concept of a
 * team-side league/tournament/friendly split) and is documented as frozen.
 */
export class TeamRecordsQueryDto extends PublicRecordsQueryDto {
  @IsOptional()
  @IsIn(['league', 'tournament', 'friendly'])
  type?: TeamRecordCategory;
}
