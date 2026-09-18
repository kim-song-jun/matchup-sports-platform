import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class MutateMatchDto {
  @IsUUID()
  sportId!: string;

  @IsUUID()
  regionId!: string;

  @IsString()
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  capacity!: number;

  @IsString()
  @MaxLength(120)
  manualPlaceName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rulesText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  minLevelCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  maxLevelCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  genderRule?: string | null;
}

export class UpdateMatchDto extends MutateMatchDto {
  @IsString()
  version!: string;
}

export class CancelMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class CloseMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class ReopenMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  /**
   * 다시 열면서 새로 잡는 신청 마감 시각(ISO). 생략하면 서비스가 정한다 —
   * 이미 지난 마감은 지우고(= 경기 시작 전까지 받는다), 아직 남은 마감은 그대로 둔다.
   * 지난 마감을 그대로 두면 "다시 열기"를 눌러도 곧바로 다시 마감으로 보여 아무 일도
   * 안 일어난 것처럼 된다(reopen 이 실제로는 성공하는데도).
   */
  @IsOptional()
  @IsString()
  deadlineAt?: string | null;
}
