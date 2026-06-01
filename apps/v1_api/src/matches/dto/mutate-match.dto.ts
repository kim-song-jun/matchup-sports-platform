import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MutateMatchDto {
  @IsUUID()
  sportId!: string;

  @IsUUID()
  regionId!: string;

  @IsString()
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  capacity!: number;

  @IsString()
  @MaxLength(120)
  manualPlaceName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rulesText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  minLevelCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  maxLevelCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  genderRule?: string | null;
}

export class UpdateMatchDto extends MutateMatchDto {
  @IsString()
  version!: string;
}

export class CancelMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
