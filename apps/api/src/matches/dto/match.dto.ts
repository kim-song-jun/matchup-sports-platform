import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { SportType } from '@prisma/client';

export class TeamConfigDto {
  @ApiPropertyOptional({ description: 'Number of teams', minimum: 2, maximum: 4 })
  @IsInt()
  @Min(2)
  @Max(4)
  @IsOptional()
  teamCount?: number;

  @ApiPropertyOptional({ description: 'Players per team' })
  @IsInt()
  @Min(1)
  @IsOptional()
  playersPerTeam?: number;

  @ApiPropertyOptional({ description: 'Auto balance teams' })
  @IsBoolean()
  @IsOptional()
  autoBalance?: boolean;
}

export class CreateMatchDto {
  @ApiProperty({ description: '매치 제목' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: '매치 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '대표 이미지 URL' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({ enum: SportType, enumName: 'SportType' })
  @IsEnum(SportType)
  sportType!: SportType;

  @ApiProperty({ description: '시설 ID' })
  @IsString()
  venueId!: string;

  @ApiProperty({ description: '매치 날짜 (YYYY-MM-DD)' })
  @IsDateString()
  matchDate!: string;

  @ApiProperty({ description: '시작 시간 (HH:mm)' })
  @IsString()
  startTime!: string;

  @ApiProperty({ description: '종료 시간 (HH:mm)' })
  @IsString()
  endTime!: string;

  @ApiProperty({ description: '최대 인원' })
  @IsInt()
  @Min(2)
  @Max(30)
  maxPlayers!: number;

  @ApiPropertyOptional({ description: '참가비' })
  @IsInt()
  @Min(0)
  @IsOptional()
  fee?: number;

  @ApiPropertyOptional({ description: '최소 레벨 (1-5)' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  levelMin?: number;

  @ApiPropertyOptional({ description: '최대 레벨 (1-5)' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  levelMax?: number;

  @ApiPropertyOptional({ enum: ['any', 'male', 'female'] })
  @IsEnum(['any', 'male', 'female'])
  @IsOptional()
  gender?: string;

  @ValidateNested()
  @Type(() => TeamConfigDto)
  @IsOptional()
  @ApiPropertyOptional({ type: TeamConfigDto })
  teamConfig?: TeamConfigDto;
}

export class MatchFilterDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ enum: SportType, enumName: 'SportType' })
  @IsEnum(SportType)
  @IsOptional()
  sportType?: SportType;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  levelMin?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  levelMax?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  maxFee?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  freeOnly?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  availableOnly?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  beginnerFriendly?: boolean;

  @ApiPropertyOptional({ enum: ['upcoming', 'latest', 'deadline'] })
  @IsIn(['upcoming', 'latest', 'deadline'])
  @IsOptional()
  sort?: 'upcoming' | 'latest' | 'deadline';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number;
}

export class UpdateMatchDto {
  @ApiPropertyOptional({ description: '매치 제목' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: '매치 설명' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '대표 이미지 URL' })
  @IsString()
  @IsOptional()
  imageUrl?: string | null;

  @ApiPropertyOptional({ enum: SportType, enumName: 'SportType' })
  @IsEnum(SportType)
  @IsOptional()
  sportType?: SportType;

  @ApiPropertyOptional({ description: '매치 날짜 (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  matchDate?: string;

  @ApiPropertyOptional({ description: '시작 시간 (HH:mm)' })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ description: '종료 시간 (HH:mm)' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ description: '최대 인원' })
  @IsInt()
  @Min(2)
  @IsOptional()
  maxPlayers?: number;

  @ApiPropertyOptional({ description: '참가비' })
  @IsInt()
  @Min(0)
  @IsOptional()
  fee?: number;

  @ApiPropertyOptional({ description: '시설 ID' })
  @IsString()
  @IsOptional()
  venueId?: string;

  @ApiPropertyOptional({ description: '최소 레벨 (1-5)' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  levelMin?: number;

  @ApiPropertyOptional({ description: '최대 레벨 (1-5)' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  levelMax?: number;

  @ApiPropertyOptional({ enum: ['any', 'male', 'female'] })
  @IsEnum(['any', 'male', 'female'])
  @IsOptional()
  gender?: string;

  @ValidateNested()
  @Type(() => TeamConfigDto)
  @IsOptional()
  @ApiPropertyOptional({ type: TeamConfigDto })
  teamConfig?: TeamConfigDto;
}

export class CancelMatchDto {
  @ApiPropertyOptional({ description: '취소 사유' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class ArriveMatchDto {
  @ApiProperty({ description: 'GPS 위도' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ description: 'GPS 경도' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiProperty({ description: '도착 인증 사진 URL' })
  @IsString()
  photoUrl!: string;
}

// ─── Team Balancing DTOs ─────────────────────────────────────────────────────

export class ComposeTeamsDto {
  @ApiPropertyOptional({ enum: ['random', 'balanced'], description: '팀 배정 전략 (v1에서는 둘 다 ELO snake-draft, seed가 다양성 제공)' })
  @IsIn(['random', 'balanced'])
  @IsOptional()
  strategy?: 'random' | 'balanced';

  @ApiPropertyOptional({ minimum: 2, maximum: 4, description: '팀 수 (기본값: teamConfig.teamCount ?? 2)' })
  @IsInt()
  @Min(2)
  @Max(4)
  @IsOptional()
  teamCount?: number;

  @ApiPropertyOptional({ description: 'PRNG seed (0..2^31-1). 미지정 시 서버가 생성하며 응답에 포함됨' })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  @IsOptional()
  seed?: number;

  @ApiPropertyOptional({ description: 'SHA-256 hex of participant list at preview time (64-char). Missing = legacy client, stale check skipped.' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  participantHash?: string;
}

export class TeamMemberDto {
  @ApiProperty({ description: '참가자 ID (MatchParticipant.id)' })
  participantId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  nickname!: string;

  @ApiProperty({ type: String, nullable: true })
  profileImageUrl!: string | null;

  @ApiProperty({ description: '종목별 ELO 레이팅 (프로필 없으면 1000)' })
  eloRating!: number;

  @ApiProperty({ description: '해당 종목 UserSportProfile 존재 여부 (false = cold-start)' })
  hasProfile!: boolean;
}

export class TeamAssignmentDto {
  @ApiProperty({ description: '0-based 팀 인덱스' })
  index!: number;

  @ApiProperty({ description: '팀 이름 (A팀/B팀/C팀/D팀)' })
  name!: string;

  @ApiProperty({ description: '팀 색상 (hex)' })
  color!: string;

  @ApiProperty({ description: '팀 평균 ELO' })
  avgElo!: number;

  @ApiProperty({ type: [TeamMemberDto] })
  members!: TeamMemberDto[];
}

export class BalanceMetricsDto {
  @ApiProperty({ description: '최대 팀 평균 ELO 격차' })
  maxEloGap!: number;

  @ApiProperty({ description: '팀 평균 ELO 분산 (population variance)' })
  variance!: number;

  @ApiProperty({ description: '팀 평균 ELO 표준편차' })
  stdDev!: number;

  @ApiProperty({ type: [Number], description: '각 팀의 평균 ELO 배열' })
  teamAvgElos!: number[];

  @ApiProperty({ description: 'ELO 미등록 참가자 수 (hasProfile=false 인원)' })
  coldStartCount!: number;
}

export class PreviewTeamsResponseDto {
  @ApiProperty({ type: [TeamAssignmentDto] })
  teams!: TeamAssignmentDto[];

  @ApiProperty({ type: BalanceMetricsDto })
  metrics!: BalanceMetricsDto;

  @ApiProperty({ description: '사용된 PRNG seed (재현성 보장용)' })
  seed!: number;

  @ApiProperty({ description: 'SHA-256 hex of participant list at preview time (64-char). Pass back in ComposeTeamsDto to enable stale-participant check.' })
  participantHash!: string;
}
