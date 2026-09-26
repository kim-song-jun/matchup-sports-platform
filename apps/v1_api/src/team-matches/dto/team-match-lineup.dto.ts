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
 * `TeamMatchLineupService` enforces the XOR, eligibility, and duplicate
 * jersey/participant rules.
 *
 * **인원·골키퍼 수 검증은 없다**(Task 163 BE-1, 사용자 확정) — 저장은 "누가 나오나" 만
 * 받는다. `goalkeeper: true` 는 `V1GameParticipant.position` 의 `GK` 마커로 저장된다
 * (그 모델에는 전용 boolean 컬럼이 없다 — `V1GameResultParticipant.goalkeeper` 와 다르다).
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

  /**
   * **명단 = 출전자.** 선발/후보 구분은 없다(정본 §3) — 이 배열 하나가 그 경기에 나오는
   * 사람 전부다. 아래 `starters`/`bench` 를 대신한다.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamMatchLineupParticipantDto)
  participants?: TeamMatchLineupParticipantDto[];

  /**
   * @deprecated 선발/후보로 갈라 보내던 옛 형태. `participants` 와 **합쳐져** 한 명단이
   * 되며 어느 쪽에 담겼는지는 저장에 아무 영향이 없다.
   *
   * 지우지 않고 optional 로 남긴 이유는 **배포 순서** 때문이다 — dev 머지는 곧바로 alpha
   * 실배포이고, 그 시점의 프론트는 아직 이 두 배열을 보낸다. 필수 `participants` 만
   * 남기면 라인업 저장이 그 창 동안 400 으로 죽는다. 프론트가 `participants` 로 넘어가면
   * (FE-1) 이 두 필드를 지운다.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamMatchLineupParticipantDto)
  starters?: TeamMatchLineupParticipantDto[];

  /** @deprecated `starters` 와 같은 이유로 남아 있다 — 같은 명단에 합쳐진다. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamMatchLineupParticipantDto)
  bench?: TeamMatchLineupParticipantDto[];
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
