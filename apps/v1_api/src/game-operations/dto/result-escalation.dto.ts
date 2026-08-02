import { V1EscalationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class ResultEscalationListQueryDto {
  @IsOptional()
  @IsEnum(V1EscalationStatus)
  status?: V1EscalationStatus;
}

export class ResultEscalationActionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(1_000)
  reason!: string;
}
