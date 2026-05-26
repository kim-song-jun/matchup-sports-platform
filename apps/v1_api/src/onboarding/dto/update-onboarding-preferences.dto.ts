import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { V1OnboardingStep } from '../onboarding-summary';

class SportPreferenceDto {
  @IsUUID()
  sportId!: string;

  @IsOptional()
  @IsUUID()
  levelId?: string | null;
}

class RegionPreferenceDto {
  @IsUUID()
  regionId!: string;

  @IsBoolean()
  primary!: boolean;
}

class CurrentLocationDto {
  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number | null;

  @IsString()
  capturedAt!: string;

  @IsOptional()
  @IsUUID()
  matchedRegionId?: string | null;
}

export class UpdateOnboardingPreferencesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SportPreferenceDto)
  sports?: SportPreferenceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RegionPreferenceDto)
  regions?: RegionPreferenceDto[];

  @IsString()
  @IsIn(['sport', 'level', 'region', 'confirm'])
  currentStep!: Extract<V1OnboardingStep, 'sport' | 'level' | 'region' | 'confirm'>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CurrentLocationDto)
  currentLocation?: CurrentLocationDto | null;
}
