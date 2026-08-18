import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TOURNAMENT_FORMATS, type TournamentFormat } from '../dto/admin-tournament.dto';

export const MOCK_SEED_STATUSES = ['open', 'in_progress', 'completed'] as const;
export type MockSeedStatus = (typeof MOCK_SEED_STATUSES)[number];

/**
 * 목업 대회 생성 조건.
 *
 * 명단(V1TournamentPlayer)은 항상 채우고 라인업은 항상 미제출로 둔다 — 라인업 제출은 손으로
 * 테스트하는 게 목적이라 시드가 대신 해버리면 검증할 대상이 사라진다.
 */
export class CreateMockTournamentDto {
  @IsOptional()
  @IsIn(TOURNAMENT_FORMATS)
  format?: TournamentFormat;

  /** 참가 팀 수. 조별리그+토너먼트는 4의 배수가 자연스럽다. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(16)
  teamCount?: number;

  @IsOptional()
  @IsIn(MOCK_SEED_STATUSES)
  status?: MockSeedStatus;

  /** 경기 결과까지 채운다. status=completed 면 자동으로 켜진다(결과 없는 종료 대회는 후기 대상이 없다). */
  @IsOptional()
  @IsBoolean()
  withResults?: boolean;

  /** 후기를 바로 쓸 수 있는 상태로 만든다(종료 + 결과 + 공식 확정). */
  @IsOptional()
  @IsBoolean()
  reviewReady?: boolean;

  /** 대회 이름 꼬리표. 비우면 조건으로 자동 생성한다. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  titleSuffix?: string;
}
