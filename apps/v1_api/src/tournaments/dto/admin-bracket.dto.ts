import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

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

export class UpdateFixtureDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string;

  /** 결과가 이미 기록된 경기는 팀 변경 불가 (409) — 결과를 먼저 삭제해야 한다 */
  @IsOptional()
  @IsUUID()
  homeRegistrationId?: string;

  @IsOptional()
  @IsUUID()
  awayRegistrationId?: string;
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

  /**
   * 경기 하이라이트/중계 영상 목록 (옵션) — 전달 시 replace-all.
   * undefined 로 생략하면 기존 영상 목록을 유지한다.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FixtureVideoDto)
  videos?: FixtureVideoDto[];

  /**
   * 득점자 목록 (옵션) — 전달 시 replace-all.
   * undefined 로 생략하면 기존 득점 기록을 유지한다.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FixtureGoalDto)
  goals?: FixtureGoalDto[];
}

export const TOURNAMENT_GOAL_TEAMS = ['home', 'away'] as const;
export type TournamentGoalTeam = (typeof TOURNAMENT_GOAL_TEAMS)[number];

export class FixtureGoalDto {
  @IsIn(TOURNAMENT_GOAL_TEAMS)
  team!: TournamentGoalTeam;

  /** 명단(V1TournamentPlayer)에서 선택한 경우 세팅. 자유 입력 시 null/undefined. */
  @IsOptional()
  @IsUUID()
  playerId?: string;

  /** 비회원/대타 등 명단에 없는 득점자도 이름은 항상 필수 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  playerName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(200)
  minute?: number;
}

export class FixtureVideoDto {
  /** 표시 제목 (예: "전반 하이라이트") — 없으면 "경기 영상 N"으로 표시 */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  url!: string;
}
