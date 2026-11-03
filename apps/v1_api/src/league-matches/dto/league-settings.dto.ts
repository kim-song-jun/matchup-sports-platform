import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { TOURNAMENT_GENDER_CATEGORIES, type TournamentGenderCategory } from '../../tournaments/dto/admin-tournament.dto';

/** Full editable settings snapshot. UI-only state is never part of this contract. */
export class UpdateLeagueSettingsDto {
  @IsDateString()
  expectedUpdatedAt!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @IsString()
  @MaxLength(10000)
  rulesText!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  regionId!: string;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;

  @ValidateIf((_object, value) => value !== null)
  @IsDateString()
  registrationDeadlineAt!: string | null;

  /** 총 경기 수 계획. null이면 계획 수를 두지 않는다. */
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(500)
  plannedFixtureCount?: number | null;

  /** 생략은 기존 정원 유지, null은 무제한으로 변경한다. */
  @Transform(({ obj }) => obj.maxTeams, { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  maxTeams?: number | null;

  /** 생략은 기존 성별 유지. 미지정으로 되돌리는 길은 두지 않는다(대회 정보 수정과 같다). */
  @IsOptional()
  @IsIn(TOURNAMENT_GENDER_CATEGORIES, { message: '성별 카테고리가 올바르지 않아요.' })
  genderCategory?: TournamentGenderCategory;
}
