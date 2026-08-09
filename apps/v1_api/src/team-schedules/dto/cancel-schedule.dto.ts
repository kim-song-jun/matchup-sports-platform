import { Type } from 'class-transformer';
import { IsInt, IsString, Min, MaxLength, MinLength } from 'class-validator';

export class CancelScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  cancelReason!: string;
}
