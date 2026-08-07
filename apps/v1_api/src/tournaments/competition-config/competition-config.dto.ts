import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCompetitionConfigDto {
  @IsString()
  @MinLength(1)
  sportCode!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsObject()
  config!: Record<string, unknown>;
}

export class CreateCompetitionConfigVersionDto {
  @IsObject()
  config!: Record<string, unknown>;
}

export class ChangeTournamentCompetitionConfigDto {
  @IsString()
  @MinLength(1)
  competitionConfigVersionId!: string;

  @IsString()
  @MinLength(1)
  expectedVersion!: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  confirmRecalculation?: boolean;

  @ValidateIf((value: ChangeTournamentCompetitionConfigDto) => value.confirmRecalculation === true)
  @IsString()
  @MinLength(64)
  previewHash?: string;
}

export class CompetitionConfigListQueryDto {
  @IsOptional()
  @IsString()
  sportCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}
