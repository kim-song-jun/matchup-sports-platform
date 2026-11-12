import { IsISO8601, Matches } from 'class-validator';

export class CreateScheduleTimeDto {
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/)
  scheduledAt!: string;
}
