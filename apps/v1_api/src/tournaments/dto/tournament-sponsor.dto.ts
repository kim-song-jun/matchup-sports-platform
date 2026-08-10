import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  isURL,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const SAFE_UPLOAD_SEGMENT = /^[\p{L}\p{N}._-]+$/u;

@ValidatorConstraint({ name: 'isTournamentSponsorLogoUrl', async: false })
class TournamentSponsorLogoUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    if (!value.startsWith('/uploads/')) return isURL(value, { require_protocol: true });

    const segments = value.slice('/uploads/'.length).split('/');
    return (
      segments.length > 0 &&
      segments.every(
        (segment) => segment !== '.' && segment !== '..' && SAFE_UPLOAD_SEGMENT.test(segment),
      )
    );
  }

  defaultMessage(): string {
    return 'logoUrl must be a protocol URL or a safe local /uploads/ path';
  }
}

export class CreateTournamentSponsorDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @Validate(TournamentSponsorLogoUrlConstraint)
  @MaxLength(1000)
  logoUrl?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  websiteUrl?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  benefitText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  boothText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  eventTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventResultText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTournamentSponsorDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @Validate(TournamentSponsorLogoUrlConstraint)
  @MaxLength(1000)
  logoUrl?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  websiteUrl?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  benefitText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  boothText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  eventTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventResultText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
