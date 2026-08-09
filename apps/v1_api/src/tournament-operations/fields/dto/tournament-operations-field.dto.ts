import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * `scopeKey` is the *stable* identity for a field/court (plan Task 18 scope
 * line: "the literal stable field/court CRUD" -- "stable" means assigning and
 * reassigning fixtures must never churn the field row). It is caller-supplied
 * (not server-generated) so operators can pick a durable value (e.g.
 * `court-a`, `field-1`) and it is enforced unique per tournament by the
 * existing `@@unique([tournamentId, scopeKey])` constraint
 * (schema.prisma:2782). The regex keeps it identifier-safe (lowercase
 * alnum/dash/underscore) -- a sensible default since neither the plan nor
 * global-contract.md constrain its shape.
 */
const SCOPE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export class CreateTournamentFieldDto {
  @IsString()
  @Matches(SCOPE_KEY_PATTERN, {
    message: '필드 코드는 소문자/숫자/하이픈(-)/언더스코어(_) 조합으로 64자 이내여야 해요.',
  })
  scopeKey!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class UpdateTournamentFieldDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * PATCH .../fixtures/:fixtureId/field body -- assigns the fixture to an
 * existing, same-tournament field. Clearing the assignment is a separate
 * DELETE (no body) so "assign" vs "no-op" is never ambiguous over a nullable
 * JSON field (user decision: sensible default, documented here since neither
 * the plan nor global-contract.md define this route -- V1TournamentFixture.fieldId
 * has no write path anywhere else in the codebase, confirmed by the schema
 * lane's recon).
 */
export class AssignTournamentFixtureFieldDto {
  @IsUUID()
  fieldId!: string;
}
