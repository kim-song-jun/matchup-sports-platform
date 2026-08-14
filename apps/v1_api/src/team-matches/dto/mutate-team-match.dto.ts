import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  MATCH_FORMAT_MAX_LENGTH,
  MATCH_STYLE_ITEM_MAX_LENGTH,
  MATCH_STYLE_MAX_ITEMS,
  UNIFORM_COLOR_MAX_LENGTH,
} from '../team-match-conditions.constants';

export class MutateTeamMatchDto {
  @IsUUID()
  hostTeamId!: string;

  @IsUUID()
  sportId!: string;

  @IsUUID()
  regionId!: string;

  @IsString()
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

  // 경기방식(예: '5:5', '11:11') — 프리셋 + 직접입력 둘 다 허용(allowsFreeText=true).
  @IsOptional()
  @IsString()
  @MaxLength(MATCH_FORMAT_MAX_LENGTH)
  matchFormat?: string | null;

  // 경기 스타일(다중선택, 예: ['친선', '매너 중시']) — 프리셋 + 직접입력 둘 다 허용.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATCH_STYLE_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(MATCH_STYLE_ITEM_MAX_LENGTH, { each: true })
  matchStyle?: string[];

  // 유니폼 색상(단일선택, 예: '흰색') — 프리셋 + 직접입력 둘 다 허용.
  @IsOptional()
  @IsString()
  @MaxLength(UNIFORM_COLOR_MAX_LENGTH)
  uniformColor?: string | null;
}

export class UpdateTeamMatchDto extends MutateTeamMatchDto {
  @IsString()
  version!: string;
}

export class CancelTeamMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class CloseTeamMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class ReopenTeamMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
