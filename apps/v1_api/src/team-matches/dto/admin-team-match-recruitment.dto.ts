import { ArrayMaxSize, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  MATCH_FORMAT_MAX_LENGTH,
  MATCH_STYLE_ITEM_MAX_LENGTH,
  MATCH_STYLE_MAX_ITEMS,
  UNIFORM_COLOR_MAX_LENGTH,
} from '../team-match-conditions.constants';

export class CreateAdminTeamMatchRecruitmentDto {
  @IsUUID()
  clientCommandId!: string;

  @IsUUID()
  sportId!: string;

  @IsString()
  @IsNotEmpty()
  regionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
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

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  manualPlaceName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  costNote?: string | null;

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

  @IsOptional()
  @IsString()
  @MaxLength(MATCH_FORMAT_MAX_LENGTH)
  matchFormat?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATCH_STYLE_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(MATCH_STYLE_ITEM_MAX_LENGTH, { each: true })
  matchStyle?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(UNIFORM_COLOR_MAX_LENGTH)
  uniformColor?: string | null;
}

export class ApproveAdminTeamMatchApplicationDto {
  @IsUUID()
  clientCommandId!: string;
}
