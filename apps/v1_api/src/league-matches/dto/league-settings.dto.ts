import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

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
}
