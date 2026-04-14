import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const TIME_RANGE_PATTERN = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
const TIME_RANGE_MSG = 'Operating hours must follow HH:MM-HH:MM format (e.g. "09:00-22:00") or be "closed"';

/**
 * Structured operating-hours DTO for venue schedules.
 * Each weekday field accepts a "HH:MM-HH:MM" string or "closed".
 */
export class OperatingHoursDto {
  @ApiPropertyOptional({ description: 'Monday hours (HH:MM-HH:MM or "closed")', example: '09:00-22:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$|^closed$/, { message: TIME_RANGE_MSG })
  mon?: string;

  @ApiPropertyOptional({ description: 'Tuesday hours', example: '09:00-22:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$|^closed$/, { message: TIME_RANGE_MSG })
  tue?: string;

  @ApiPropertyOptional({ description: 'Wednesday hours', example: '09:00-22:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$|^closed$/, { message: TIME_RANGE_MSG })
  wed?: string;

  @ApiPropertyOptional({ description: 'Thursday hours', example: '09:00-22:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$|^closed$/, { message: TIME_RANGE_MSG })
  thu?: string;

  @ApiPropertyOptional({ description: 'Friday hours', example: '09:00-22:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$|^closed$/, { message: TIME_RANGE_MSG })
  fri?: string;

  @ApiPropertyOptional({ description: 'Saturday hours', example: '09:00-22:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$|^closed$/, { message: TIME_RANGE_MSG })
  sat?: string;

  @ApiPropertyOptional({ description: 'Sunday hours', example: '09:00-22:00' })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$|^closed$/, { message: TIME_RANGE_MSG })
  sun?: string;
}

/** @deprecated Use OperatingHoursDto with structured weekday fields instead. */
export const TIME_RANGE_REGEX = TIME_RANGE_PATTERN;
