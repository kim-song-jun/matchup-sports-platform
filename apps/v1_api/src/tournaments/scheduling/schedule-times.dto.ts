import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsISO8601, IsUUID, Matches, ValidateIf } from 'class-validator';

export class CreateScheduleTimeDto {
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledAt!: string;
}

export class UpdateScheduleTimeDto extends CreateScheduleTimeDto {
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  expectedScheduleTimeId!: string | null;

  @ValidateIf((object: UpdateScheduleTimeDto, value) => object.expectedScheduleTimeId === null || value !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(240)
  @IsUUID(undefined, { each: true })
  expectedFixtureIds?: string[];

  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/)
  expectedScheduledAt!: string;
}
