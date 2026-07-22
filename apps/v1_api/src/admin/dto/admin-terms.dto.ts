import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const ADMIN_TERMS_CONTEXTS = ['signup', 'tournament_application', 'footer'] as const;
export const ADMIN_TERMS_REQUIREMENTS = ['required', 'optional', 'display_only'] as const;
export const ADMIN_TERMS_STATUSES = ['draft', 'published', 'archived'] as const;

export class AdminTermsListQueryDto {
  @IsOptional()
  @IsIn(ADMIN_TERMS_CONTEXTS)
  context?: (typeof ADMIN_TERMS_CONTEXTS)[number];

  @IsOptional()
  @IsIn(ADMIN_TERMS_STATUSES)
  status?: (typeof ADMIN_TERMS_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AdminTermsPlacementDto {
  @IsIn(ADMIN_TERMS_CONTEXTS)
  context!: (typeof ADMIN_TERMS_CONTEXTS)[number];

  @IsIn(ADMIN_TERMS_REQUIREMENTS)
  requirement!: (typeof ADMIN_TERMS_REQUIREMENTS)[number];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  displayOrder!: number;

  @IsBoolean()
  isActive!: boolean;
}

export class CreateAdminTermsPolicyDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{2,79}$/)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => AdminTermsPlacementDto)
  placements!: AdminTermsPlacementDto[];

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  version!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeSummary?: string;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresReconsent?: boolean;

  @IsOptional()
  @IsDateString()
  enforcementAt?: string | null;
}

export class UpdateAdminTermsPolicyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsBoolean()
  isActive!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => AdminTermsPlacementDto)
  placements!: AdminTermsPlacementDto[];
}

export class CreateAdminTermsVersionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  version!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeSummary?: string;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresReconsent?: boolean;

  @IsOptional()
  @IsDateString()
  enforcementAt?: string | null;
}

export class UpdateAdminTermsDraftDto extends CreateAdminTermsVersionDto {}

export class ChangeAdminTermsDocumentStatusDto {
  @IsIn(['published', 'archived'])
  status!: 'published' | 'archived';

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
