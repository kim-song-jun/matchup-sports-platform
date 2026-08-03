import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * A single roster entry for a team-match lineup save. Either `userId`
 * (a currently active — and, where a schedule exists, attending — team
 * member) or a freeform `displayName` (an unlinked guest) must be supplied;
 * `TeamMatchLineupService` enforces the XOR and the eligibility/roster rules
 * (duplicate jersey, single goalkeeper, min/max squad size) described in
 * Task 14. `goalkeeper: true` is persisted as the `GK` marker on
 * `V1GameParticipant.position` because that model has no dedicated boolean
 * column (unlike `V1GameResultParticipant.goalkeeper`).
 */
export class TeamMatchLineupParticipantDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  displayName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  jerseyNumber?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  position?: string;

  @IsOptional()
  @IsBoolean()
  goalkeeper?: boolean;
}

export class SaveTeamMatchLineupDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  // `formation`은 의도적으로 없다: `V1GameLineup`에 이를 저장할 컬럼이 없고, 이번 변경
  // 범위에서는 마이그레이션을 추가할 수 없어 받아도 저장·응답 어디에도 반영할 방법이
  // 없다 — 검증만 통과시키고 조용히 버리는 필드를 DTO에 남겨두지 않는다
  // (Task 15 blocker-2 report 참고).

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamMatchLineupParticipantDto)
  starters!: TeamMatchLineupParticipantDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamMatchLineupParticipantDto)
  bench!: TeamMatchLineupParticipantDto[];
}

export class SubmitTeamMatchLineupDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class ChangeRequestTeamMatchLineupDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
