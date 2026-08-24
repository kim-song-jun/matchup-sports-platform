import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min, MaxLength, ValidateIf } from 'class-validator';

/** D2 (E2): 리그 경기 결과 확정 후 7일 이내 이의 제기 요청. */
export class FileLeagueMatchDisputeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

/**
 * D2 (E4): 운영자가 이의를 수락할 때 고르는 처리 경로. 정정(correction)은 새 스코어를
 * 요구하고 무효(void)는 요구하지 않는다 -- `@ValidateIf`로 판별한다(같은 파일
 * 다른 DTO 들의 `@ValidateIf` 관례와 동일하게, `@IsOptional()`은 `null`도 통과시켜
 * "정정인데 스코어 null" 같은 상태가 생길 수 있다).
 */
export class ResolveLeagueMatchDisputeDto {
  @IsIn(['correction', 'void'])
  resolution!: 'correction' | 'void';

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;

  @ValidateIf((dto: ResolveLeagueMatchDisputeDto) => dto.resolution === 'correction')
  @Type(() => Number)
  @IsInt()
  @Min(0)
  homeScore?: number;

  @ValidateIf((dto: ResolveLeagueMatchDisputeDto) => dto.resolution === 'correction')
  @Type(() => Number)
  @IsInt()
  @Min(0)
  awayScore?: number;
}

/** D2: 이의 거부. */
export class RejectLeagueMatchDisputeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;
}
