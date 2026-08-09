import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateTeamMatchSeriesDto {
  @IsString()
  @MaxLength(100)
  title!: string;

  @IsUUID()
  sportId!: string;

  @IsUUID()
  regionId!: string;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;

  // 카디널리티 규칙("서로 다른 팀 2개 이상")은 여기 붙이지 않는다 — @ArrayMinSize를 붙이면
  // teamIds가 1개인 요청이 ValidationPipe 단계에서 400 VALIDATION_ERROR로 먼저 걸려버려서
  // 서비스가 절대 422 SERIES_TEAM_INVALID를 낼 기회를 못 가진다(dedup 후 1개가 되는 케이스도
  // 마찬가지 — DTO는 원소 개수만 보고 dedup을 모른다). "형식"은 여기서, "도메인 규칙"은
  // TeamMatchSeriesAdminService.create()가 유일하게 소유한다.
  @IsArray()
  @IsUUID('4', { each: true })
  teamIds!: string[];
}

export class SeriesFixtureScheduleDto {
  /** 0(일)~6(토), KST 기준 요일. */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** 'HH:mm', KST 기준 24시간제 시각. */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time은 HH:mm 형식이어야 해요.' })
  time!: string;
}

export class GenerateSeriesFixturesDto {
  @IsInt()
  @Min(1)
  @Max(52)
  weeksCount!: number;

  // 지정하지 않으면 기존 동작(시작일 그대로 매주 반복)을 유지한다 — 하위 호환.
  @IsOptional()
  @ValidateNested()
  @Type(() => SeriesFixtureScheduleDto)
  schedule?: SeriesFixtureScheduleDto;

  // 지정하지 않으면 서비스가 기존 기본값('장소 미정')을 사용한다.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeName?: string;
}

export class UpdateSeriesFixtureDto {
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeAddress?: string;
}
