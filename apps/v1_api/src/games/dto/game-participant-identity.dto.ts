import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * Task 14: every mutation on the identity-link/consent surface is a game-scoped
 * command, mirroring the `clientCommandId` == `Idempotency-Key` header contract
 * that every other `/games/:gameId/...` mutation in this module already enforces
 * (see SaveGameLineupDto/AppendGameEventDto). The frozen REST ledger's literal
 * request-body column omits `clientCommandId` for these five endpoints, but the
 * shipped Task 6 implementation applies the header/body match universally via
 * `assertGameCommandContext`, so this DTO family follows that established,
 * already-enforced convention rather than the narrower literal table text.
 */
export class RequestIdentityLinkDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;
}

export class AttestIdentityLinkDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}

export class RevokeIdentityLinkDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class GrantParticipantConsentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsUUID()
  linkId!: string;

  @IsString()
  @IsNotEmpty()
  policyHash!: string;
}

export class RevokeParticipantConsentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  clientCommandId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
