import { Type } from 'class-transformer';
import { V1TournamentGroupPhase } from '@prisma/client';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';

export class TournamentPeriodSettingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes!: number;
}

export class UpdateTournamentPeriodSettingsDto {
  @IsString()
  expectedVersion!: string;

  /** 없으면 대회 기본값, 있으면 해당 단계 재정의만 바꾼다. */
  @IsOptional()
  @IsEnum(V1TournamentGroupPhase)
  phase?: V1TournamentGroupPhase;

  /** 단계 재정의를 지우고 대회 기본값을 다시 상속한다. 기본값 수정에는 사용할 수 없다. */
  @IsOptional()
  @IsBoolean()
  inheritDefault?: boolean;

  @ValidateIf((value: UpdateTournamentPeriodSettingsDto) => value.inheritDefault !== true)
  @ValidateNested({ each: true })
  @Type(() => TournamentPeriodSettingDto)
  @IsArray()
  @ArrayMinSize(1)
  periods?: TournamentPeriodSettingDto[];
}
