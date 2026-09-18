import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class TournamentPeriodSettingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes!: number;
}

export class UpdateTournamentPeriodSettingsDto {
  @IsString()
  expectedVersion!: string;

  @ValidateNested({ each: true })
  @Type(() => TournamentPeriodSettingDto)
  @IsArray()
  @ArrayMinSize(1)
  periods!: TournamentPeriodSettingDto[];
}
