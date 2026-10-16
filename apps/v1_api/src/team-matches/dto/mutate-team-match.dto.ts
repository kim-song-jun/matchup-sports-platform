import { IsPlaceLatitude, IsPlaceLongitude, IsPlaceProvider, IsPlaceProviderId } from '../../places/place-snapshot';
import { GENDER_RULES } from '../../common/gender-rule';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  MATCH_FORMAT_MAX_LENGTH,
  MATCH_STYLE_ITEM_MAX_LENGTH,
  MATCH_STYLE_MAX_ITEMS,
  UNIFORM_COLOR_MAX_LENGTH,
} from '../team-match-conditions.constants';
import { MAX_TEAM_MATCH_PERIOD_MINUTES } from '../team-match-periods.constants';

export class TeamMatchPeriodSettingDto {
  // Preserve JSON number types instead of implicitly converting strings or booleans.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }): unknown => obj[key])
  @IsInt()
  @Min(1)
  @Max(MAX_TEAM_MATCH_PERIOD_MINUTES)
  durationMinutes!: number;
}

export class MutateTeamMatchDto {
  @IsUUID()
  hostTeamId!: string;

  @IsUUID()
  sportId!: string;

  // Master region IDs are stable slugs in the v1 catalog (for example
  // `region-seoul-jongno`), unlike team/sport primary keys. Existence and
  // active district validation remains authoritative in TeamMatchesService.
  @IsString()
  @IsNotEmpty()
  regionId!: string;

  // 웹 폼은 title.trim() 으로 막지만 서버가 받아 주면 API 직접 호출로 제목 없는
  // 팀매치가 만들어진다(MD-QA #163). 경계에서 trim 한 뒤 빈 값을 거절한다.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '매치 제목을 입력해 주세요.' })
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  listImageUrl?: string | null;

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

  @IsPlaceLatitude()
  placeLatitude?: number | null;

  @IsPlaceLongitude()
  placeLongitude?: number | null;

  @IsPlaceProvider()
  placeProvider?: string | null;

  @IsPlaceProviderId()
  placeProviderId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  costNote?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rulesText?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TeamMatchPeriodSettingDto)
  periods?: TeamMatchPeriodSettingDto[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  minLevelCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  maxLevelCode?: string | null;

  @IsOptional()
  @IsIn(GENDER_RULES)
  genderRule?: (typeof GENDER_RULES)[number] | null;

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
