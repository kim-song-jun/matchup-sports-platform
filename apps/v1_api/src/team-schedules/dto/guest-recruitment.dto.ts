import { V1GuestRecruitmentVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateGuestRecruitmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  slots!: number;

  @IsDateString()
  closesAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsEnum(V1GuestRecruitmentVisibility)
  visibility?: V1GuestRecruitmentVisibility;
}

export class UpdateGuestRecruitmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  slots?: number;

  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsEnum(V1GuestRecruitmentVisibility)
  visibility?: V1GuestRecruitmentVisibility;

  // Lowercase contract vocabulary per decision-#1 precedent (shipped enum canonical): mapped to
  // Prisma OPEN/CLOSED in the service layer. FILLED is server-derived only (approvedCount ===
  // slots) and is deliberately not accepted here.
  //
  // P1-5 fix: this used to be `@IsOptional() @IsIn(['open', 'closed'])`. class-validator's
  // `@IsOptional()` treats `null` exactly like an omitted field and skips every other decorator on
  // this property — so a request body carrying `{ "state": null }` passed validation untouched,
  // and guest-recruitment.service.ts's updateRecruitment() resolved it as `dto.state === undefined
  // ? recruitment.state : dto.state === 'open' ? 'OPEN' : 'CLOSED'`: `null !== undefined` and
  // `null !== 'open'`, so an explicit null silently CLOSED the recruitment — a state neither this
  // DTO's own comment ("resolves to OPEN or CLOSED only", written when only real string values were
  // assumed reachable) nor any caller ever asked for. `@ValidateIf` here runs `@IsIn` whenever the
  // field is present AT ALL (including `null`), so an omitted field still skips validation
  // (preserve-existing-state semantics, unchanged) but an explicit `null` now 400s instead of being
  // silently accepted as an alias for "closed".
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['open', 'closed'])
  state?: 'open' | 'closed';
}

export class CreateGuestApplicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  // Deliberately NO userId property: the global ValidationPipe's forbidNonWhitelisted:true
  // rejects (400 VALIDATION_ERROR) any request body carrying an extra `userId` field outright
  // rather than silently stripping it. The persisted userId always comes from @CurrentUser().
}
