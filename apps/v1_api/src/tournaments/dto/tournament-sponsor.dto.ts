import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

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
  @IsUrl({ require_protocol: true })
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
  @IsUrl({ require_protocol: true })
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
