import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

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

  /** Four-digit calendar year of `officialAt`, e.g. `2026`. */
  @IsOptional()
  @Matches(/^[0-9]{4}$/)
  season?: string;
}
