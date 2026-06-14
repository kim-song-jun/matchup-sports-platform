import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// ─── Group phase constants ─────────────────────────────────────────────────────

export const TOURNAMENT_GROUP_PHASES = ['group', 'semi', 'final', 'third_place'] as const;
export type TournamentGroupPhase = (typeof TOURNAMENT_GROUP_PHASES)[number];

// ─── Group DTOs ───────────────────────────────────────────────────────────────

export class CreateGroupDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsIn(TOURNAMENT_GROUP_PHASES)
  phase?: TournamentGroupPhase;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  /** 이 그룹에서 다음 라운드로 진출하는 팀 수. null = 진출선 없음. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  advanceCount?: number;
}

// ─── GroupTeam DTOs ───────────────────────────────────────────────────────────

export class CreateGroupTeamDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  registrationId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

// ─── Fixture DTOs ─────────────────────────────────────────────────────────────

export class CreateFixtureDto {
  @IsOptional()
  @IsUUID()
  groupId?: string;

  /** e.g. 'group_a', 'semi', 'final', 'third_place' */
  @IsString()
  @MaxLength(60)
  round!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  fixtureNumber!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  legNumber?: number;

  /**
   * 4강 이후 자동 합산은 1차 구현에서 미지원. parentFixtureId만 연결해
   * 대진표 트리 구조를 표현하며, 결과 집계는 어드민이 수동으로 기록한다.
   */
  @IsOptional()
  @IsUUID()
  parentFixtureId?: string;

  /** 미배정 가능 — null 허용 */
  @IsOptional()
  @IsUUID()
  homeRegistrationId?: string;

  /** 미배정 가능 — null 허용 */
  @IsOptional()
  @IsUUID()
  awayRegistrationId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string;
}

// ─── Result DTOs ──────────────────────────────────────────────────────────────

export class RecordResultDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  homeScore!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  awayScore!: number;

  @IsOptional()
  @IsBoolean()
  hasPenalty?: boolean;

  /** hasPenalty=true 일 때 필수 (서비스 계층 검증) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  homePenaltyScore?: number;

  /** hasPenalty=true 일 때 필수 (서비스 계층 검증) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  awayPenaltyScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
