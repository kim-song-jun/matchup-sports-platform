import { V1GuestRecruitmentVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';

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
  @IsOptional()
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
