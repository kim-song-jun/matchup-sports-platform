import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ChangeMatchParticipantDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class CreateMatchApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string | null;
}

export class WithdrawMatchApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class ListMatchApplicationsQueryDto {
  @IsOptional()
  @IsIn(['requested', 'approved', 'rejected', 'withdrawn', 'cancelled_by_host', 'expired'])
  status?: 'requested' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled_by_host' | 'expired';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ApproveMatchApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class RejectMatchApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
