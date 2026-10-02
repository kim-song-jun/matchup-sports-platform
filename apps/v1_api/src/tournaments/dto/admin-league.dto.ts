import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

export class LeagueScheduleTemplateDto {
  /** 0(일)~6(토), KST 기준 */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** 'HH:mm', KST 기준 24시간제 */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: '시각은 HH:mm 형식으로 입력해주세요.' })
  time!: string;
}

export class LeagueScheduleDto {
  @ValidateNested()
  @Type(() => LeagueScheduleTemplateDto)
  template!: LeagueScheduleTemplateDto;

  @IsISO8601()
  startsOn!: string;
}

export class GenerateLeagueFixturesDto {
  @IsUUID()
  groupId!: string;

  /** 회전 수. 1=싱글 라운드로빈, 2=홈/어웨이 더블 라운드로빈 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  legs!: number;

  @IsOptional()
  @IsBoolean()
  balanceHome?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeagueScheduleDto)
  schedule?: LeagueScheduleDto;

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}
