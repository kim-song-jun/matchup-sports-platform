import { ApiProperty } from '@nestjs/swagger';
import { V1CompetitionKind, V1TournamentRegistrationStatus, V1TournamentStatus } from '@prisma/client';
import type { RosterBlockReason } from '../roster-cleanup';

const ROSTER_BLOCK_REASONS: readonly RosterBlockReason[] = ['closed', 'locked', 'cancelled', 'deadline'];

/** `GET /teams/:teamId/competition-entries` 의 항목 하나 — 이 팀의 대회·리그 신청 하나. */
export class TeamCompetitionEntryDto {
  @ApiProperty({ description: '대회 id(정규 리그도 같은 대회 테이블의 id)' })
  competitionId!: string;

  @ApiProperty({ enum: V1CompetitionKind, nullable: true, description: '정규 대회 / 정규 리그. null 은 종류가 채워지기 전 행' })
  competitionKind!: V1CompetitionKind | null;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: V1TournamentStatus })
  status!: V1TournamentStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  scheduledAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  scheduledEndAt!: Date | null;

  @ApiProperty({ description: '이 팀의 신청 id — 참가 명단 화면 경로에 쓴다' })
  registrationId!: string;

  @ApiProperty({ enum: V1TournamentRegistrationStatus, description: '취소(cancelled)된 신청은 목록에 없다' })
  registrationStatus!: V1TournamentRegistrationStatus;

  @ApiProperty({ description: '참가 명단의 현재 선수 수(빠진 선수 제외)' })
  playerCount!: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: '명단 제출 마감. null 이면 마감 없음' })
  rosterDeadlineAt!: Date | null;

  @ApiProperty({ description: '지금 참가 명단을 고칠 수 있는지 — 명단 수정 API 와 같은 판정(팀장·매니저 기준)' })
  rosterEditable!: boolean;

  @ApiProperty({ enum: ROSTER_BLOCK_REASONS, nullable: true, description: '못 고치는 이유: 종료·잠금·취소 요청·제출 마감' })
  rosterBlockedBy!: RosterBlockReason | null;
}

export class TeamCompetitionEntriesDto {
  @ApiProperty()
  teamId!: string;

  @ApiProperty({ description: '보는 사람이 이 팀의 팀장·매니저인지 — 참가 명단은 그들만 고친다' })
  viewerCanManageRoster!: boolean;

  @ApiProperty({ type: [TeamCompetitionEntryDto], description: '진행 중·예정이 먼저(시작 순), 종료·취소된 대회는 맨 아래(최근 순)' })
  items!: TeamCompetitionEntryDto[];
}
