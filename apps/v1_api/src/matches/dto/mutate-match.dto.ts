import { IsPlaceLatitude, IsPlaceLongitude, IsPlaceProvider, IsPlaceProviderId } from '../../places/place-snapshot';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
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

  // 웹 폼은 title.trim() 으로 빈 제목을 막지만 서버가 받아 주면 API 직접 호출로
  // 제목 없는 매치가 만들어진다(MD-QA #163). 경계에서 trim 한 뒤 빈 값을 거절한다.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: '매치 제목을 입력해 주세요.' })
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
  @Min(1)
  @Max(100)
  capacity!: number;

  @IsOptional()
  @IsBoolean()
  hostParticipates?: boolean;

  @IsString()
  @MaxLength(120)
  manualPlaceName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressText?: string | null;

  @IsPlaceLatitude()
  placeLatitude?: number | null;

  @IsPlaceLongitude()
  placeLongitude?: number | null;

  @IsPlaceProvider()
  placeProvider?: string | null;

  @IsPlaceProviderId()
  placeProviderId?: string | null;

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

  /** 참가비 자유 입력(예: "10,000원/1인", "무료"). team-matches의 costNote와 같은 계약. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  costNote?: string | null;
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
