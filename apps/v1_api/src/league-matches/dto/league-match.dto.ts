import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateLeagueMatchDto {
  @IsString()
  @MaxLength(100)
  title!: string;

  @IsUUID()
  sportId!: string;

  @IsUUID()
  regionId!: string;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;

  // 카디널리티 규칙("서로 다른 팀 2개 이상")은 여기 붙이지 않는다 — @ArrayMinSize를 붙이면
  // teamIds가 1개인 요청이 ValidationPipe 단계에서 400 VALIDATION_ERROR로 먼저 걸려버려서
  // 서비스가 절대 422 LEAGUE_TEAM_INVALID를 낼 기회를 못 가진다(dedup 후 1개가 되는 케이스도
  // 마찬가지 — DTO는 원소 개수만 보고 dedup을 모른다). "형식"은 여기서, "도메인 규칙"은
  // LeagueMatchAdminService.create()가 유일하게 소유한다.
  @IsArray()
  @IsUUID('4', { each: true })
  teamIds!: string[];
}

// 그룹 B 감사 결함 1: 개설 후 참가팀을 추가·제거할 방법이 아예 없었다(V1LeagueTeam write는
// 생성 시 createMany 한 곳뿐). teamId 하나만 받는다 — 여러 팀을 한 번에 추가하는 배치
// 형태는 CreateLeagueMatchDto.teamIds가 이미 담당하고, 여기는 "개설 후 한 팀씩" 조작이다.
export class AddLeagueTeamDto {
  @IsUUID()
  teamId!: string;
}

export class LeagueFixtureScheduleDto {
  /** 0(일)~6(토), KST 기준 요일. */
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  /** 'HH:mm', KST 기준 24시간제 시각. */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time은 HH:mm 형식이어야 해요.' })
  time!: string;
}

// 운영자 요구(2026-08-25): "한 구장 순차 진행" — 22시 리그에 한 경기장을 쓰면 4팀이
// 15분 경기·5분 휴식으로 22:00~00:00 사이 하루 6경기(팀당 3경기)를 치르는 식으로,
// 경기 시간·휴식·팀당 하루 경기 수를 설정하면 매치데이 안에서 경기별 시각이 계산된다.
export class LeagueFixtureTimingDto {
  /** 경기당 소요 시간(분). */
  @IsInt()
  @Min(5)
  @Max(240)
  gameDurationMinutes!: number;

  /** 경기 간 휴식(분). 생략 시 0. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  breakMinutes?: number;

  /** 팀당 매치데이(하루) 경기 수 = 하루에 소화하는 라운드 수. 생략 시 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  gamesPerTeamPerDay?: number;
}

export class GenerateLeagueFixturesDto {
  @IsInt()
  @Min(1)
  @Max(52)
  weeksCount!: number;

  // 지정하지 않으면 기존 동작(시작일 그대로 매주 반복)을 유지한다 — 하위 호환.
  @IsOptional()
  @ValidateNested()
  @Type(() => LeagueFixtureScheduleDto)
  schedule?: LeagueFixtureScheduleDto;

  // 지정하지 않으면 서비스가 기존 기본값('장소 미정')을 사용한다.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeName?: string;

  // 지정하지 않으면 기존 동작(같은 주차 전 경기 동일 시각·endAt 없음)을 유지한다 — 하위 호환.
  // "주차 수 × 팀당 하루 경기 수" 상한 같은 도메인 규칙은 서비스가 소유한다(위
  // CreateLeagueMatchDto의 카디널리티 주석과 같은 이유).
  @IsOptional()
  @ValidateNested()
  @Type(() => LeagueFixtureTimingDto)
  timing?: LeagueFixtureTimingDto;
}

export class UpdateLeagueFixtureDto {
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeAddress?: string;
}

// R6: 결과 정정 등으로 completed -> active 역전이할 때, 왜 되돌렸는지 감사 로그에
// 남기기 위한 선택 필드. 본문 없이 보내도(빈 객체) 유효하다.
export class RevertLeagueCompletionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

// R12: 리그 대진 취소는 되돌릴 수 없는 운영 조작이라 사유를 필수로 받는다
// (프론트 GateConfirmModal의 REASON_MAX=500과 동일 상한).
export class CancelLeagueFixtureDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

// R13: 대진 재생성은 기존 대진을 전부 취소하고 새로 만드는 파괴적 조작이라 사유를 필수로
// 받는다. weeksCount/schedule/placeName은 GenerateLeagueFixturesDto와 동일 계약을 그대로
// 재사용한다(생성 로직 자체를 공유하므로 DTO도 같은 형태를 유지).
export class RegenerateLeagueFixturesDto extends GenerateLeagueFixturesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

// R5: 공개 리그 목록 필터/페이지네이션. team-matches의 TeamMatchesQueryDto(cursor·limit
// 1~50)와 동일한 커서 관례를 따른다 — 두 목록 다 같은 프론트 스크롤/더보기 UX를 쓴다.
export class ListLeagueMatchesQueryDto {
  @IsOptional()
  @IsUUID()
  sportId?: string;

  /**
   * 이 팀이 참가한 리그만. `V1LeagueTeam` 을 직접 보므로 **대진이 아직 없는 draft 리그도
   * 걸린다** -- 팀 상세의 "내 리그" 가 그동안 팀매치에서 distinct 로 리그를 뽑느라 대진
   * 생성 전에는 아무것도 못 띄웠던 문제(2026-08-21 재감사)를 이 필터로 대체한다.
   */
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  regionId?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'completed'])
  state?: 'draft' | 'active' | 'completed';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
