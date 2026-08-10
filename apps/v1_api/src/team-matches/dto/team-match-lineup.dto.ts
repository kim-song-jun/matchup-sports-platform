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
  ValidateIf,
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

  // 피치 배치 좌표 — 0(자기 진영 골라인)~100(하프라인) 퍼센트. 둘 다 있거나 둘 다 없어야
  // 한다: 한쪽만 오면 렌더링이 조용히 깨지므로 ValidateIf로 짝을 강제한다.
  @ValidateIf((o) => o.positionY !== undefined)
  @Type(() => Number)
  @Min(0)
  @Max(100)
  positionX?: number;

  @ValidateIf((o) => o.positionX !== undefined)
  @Type(() => Number)
  @Min(0)
  @Max(100)
  positionY?: number;
}

export class SaveTeamMatchLineupDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  // Task 15 blocker-2가 막았던 `formation` — V1GameLineup.formation 마이그레이션이
  // 추가돼 이제 저장·응답 모두 반영된다.
  @IsOptional()
  @IsString()
  formation?: string;

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
