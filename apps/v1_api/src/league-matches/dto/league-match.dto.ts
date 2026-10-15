import { Transform, Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsDefined, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { IsPlaceLatitude, IsPlaceLongitude, IsPlaceProvider, IsPlaceProviderId } from '../../places/place-snapshot';

/** 경기 장소 스냅샷 입력(이름은 각 DTO 의 `placeName`). 규칙은 `places/place-snapshot.ts` 가 소유한다. */
export abstract class LeaguePlaceSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeAddress?: string;

  @IsPlaceLatitude()
  placeLatitude?: number | null;

  @IsPlaceLongitude()
  placeLongitude?: number | null;

  @IsPlaceProvider()
  placeProvider?: string | null;

  @IsPlaceProviderId()
  placeProviderId?: string | null;
}

export class UpdateLeagueVisibilityDto {
  // Keep the JSON type: implicit Boolean conversion would turn the string "false" into true.
  @Transform(({ obj }) => obj.isPublic, { toClassOnly: true })
  @IsBoolean()
  isPublic!: boolean;
}

export class CreateLeagueMatchDto {
  @IsString()
  @MaxLength(100)
  title!: string;

  @IsUUID()
  sportId!: string;

  // Master regions use stable slugs (for example `region-busan-jung`) as IDs.
  // The service still enforces active level-2 membership and returns
  // LEAGUE_REGION_INVALID for unknown or non-district values.
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
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

  /** 팀 명단 최소 인원. 생략하면 1(제한 없음과 함께). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  minPlayers?: number;

  /** 팀 명단 최대 인원. `null`·생략 = 제한 없음(리그 기본값). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxPlayers?: number | null;

  /** 참가팀 정원. null·생략은 무제한이며 팀당 선수 정원(maxPlayers)과 독립이다. */
  @Transform(({ obj }) => obj.maxTeams, { toClassOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  maxTeams?: number | null;

  /** 리그 총 경기 수(계획). 대진 생성 폼의 기본값이다. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  plannedFixtureCount?: number;
}

/** 리그 상태 변경 — 상태 변경 버튼 하나가 보류·해제·종료·되돌리기·시작을 모두 이 요청으로 보낸다. */
export class ChangeLeagueStateDto {
  @IsIn(['draft', 'active', 'on_hold', 'completed'])
  state!: 'draft' | 'active' | 'on_hold' | 'completed';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// 그룹 B 감사 결함 1: 개설 후 참가팀을 추가·제거할 방법이 아예 없었다(V1LeagueTeam write는
// 생성 시 createMany 한 곳뿐). teamId 하나만 받는다 — 여러 팀을 한 번에 추가하는 배치
// 형태는 CreateLeagueMatchDto.teamIds가 이미 담당하고, 여기는 "개설 후 한 팀씩" 조작이다.
export class AddLeagueTeamDto {
  @IsUUID()
  teamId!: string;
}

/**
 * 대진을 놓을 **날짜 목록**. 서버는 요일을 모른다(Task 164 BE-2).
 *
 * 예전엔 요일 하나(`dayOfWeek`)를 받아 "시작일 이후 매주 그 요일" 로 무한 반복했는데,
 * 그러면 **명절·구장 사정으로 한 주를 건너뛰거나 날짜를 옮기는 것을 표현할 수 없다**.
 * 요일로 고르고 싶으면 **화면이 날짜 목록으로 전개해서** 보낸다 — 그래야 전개 결과를
 * 운영자가 눈으로 확인하고 개별 날짜를 지우거나 바꿀 수 있다.
 *
 * 규칙(`league-fixture-dates.ts`): 중복 제거 · 오름차순 배정 · 과거 날짜 거부 ·
 * 날짜가 **매치데이 수**보다 적으면 422 `LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT`.
 * (라운드 수가 아니다 — 4팀 6경기를 `timing.gamesPerDay` 3 으로 치르면 라운드 3 이 매치데이 2 다.)
 */
export class LeagueFixtureScheduleDto {
  /** `'YYYY-MM-DD'` (KST 달력 날짜). 순서·중복 무관 — 서버가 정리한다. */
  @IsArray()
  @ArrayNotEmpty()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, {
    each: true,
    message: '날짜는 YYYY-MM-DD 형식이어야 해요.',
  })
  dates!: string[];

  /** 'HH:mm', KST 기준 24시간제 시각. 모든 날짜에 같은 시각을 쓴다. */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time은 HH:mm 형식이어야 해요.' })
  time!: string;
}

// 운영자 요구(2026-08-25): "한 구장 순차 진행" — 22시 리그에 한 경기장을 쓰면 4팀이
// 15분 경기·5분 휴식으로 22:00~00:00 사이 하루 6경기를 치르는 식으로,
// 경기 시간·휴식·하루 경기 수를 설정하면 매치데이 안에서 경기별 시각이 계산된다.
// 하루 경기 수는 2026-10-13 사용자 확정으로 '팀당'에서 '하루 전체'로 바꿨다 — 팀당이면 하루 경기가
// 라운드 크기의 배수로만 정해져 6팀 하루 4경기 같은 운영을 못 했다.
export class LeagueFixtureTimingDto {
  /** 경기당 소요 시간(분). 생략하면 경기 설정의 정규 시간(연장 제외 피리어드 합계). */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  gameDurationMinutes?: number;

  /** 경기 간 휴식(분). 생략 시 0. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  breakMinutes?: number;

  /** 하루 경기 수(전 팀 합계). 대진 순서대로 하루 N경기씩 묶는다. 생략하면 하루에 한 라운드. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  gamesPerDay?: number;
}

export class GenerateLeagueFixturesDto extends LeaguePlaceSnapshotDto {
  @IsInt()
  @Min(1)
  @Max(104)
  // 만들 라운드 수(이름은 하루 한 라운드 시절의 '주차 수'를 그대로 둔다). 필요한 경기 날짜 수는
  // 하루 경기 수(`timing.gamesPerDay`)가 정한다 — 없으면 이 수와 같다.
  weeksCount!: number;

  // 지정하면 총 라운드를 이 수로 자른다(옛 화면 호환 — 지금 화면은 weeksCount 에 라운드 수를 바로 싣는다).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(104)
  roundsCount?: number;

  // 리그를 만들 때 정한 총 경기 수 — 라운드로빈 순서대로 만든 뒤 이 수에서 자른다. 생략하면 라운드 전부.
  // null 은 거부한다 — `@IsOptional` 은 null 도 통과시키는데 `slice(0, null)` 은 0경기를 만든다.
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(500)
  fixtureCount?: number;

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

export class UpdateLeagueFixtureDto extends LeaguePlaceSnapshotDto {
  @IsOptional()
  @IsUUID()
  fieldId?: string | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeName?: string;

  /** 경기 이름. 비우면 그대로다. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;

  /** 홈·원정 팀(리그 확정 참가팀). 시작 전·결과 없는 경기만 바꿀 수 있다. 자리 방식 경기는 자리에서 바꾼다. */
  @IsOptional()
  @IsUUID()
  homeTeamId?: string;

  @IsOptional()
  @IsUUID()
  awayTeamId?: string;
}

/** 경기 삭제 — 취소하고 대진표에서 숨긴다(기록은 지우지 않는다). 사유는 감사 로그에 남는다. */
export class DeleteLeagueFixtureDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

// R6: 결과 정정 등으로 completed -> active 역전이할 때, 왜 되돌렸는지 감사 로그에
// 남기기 위한 선택 필드. 본문 없이 보내도(빈 객체) 유효하다.
/**
 * 참가 신청을 여는 운영자 액션의 body (D7).
 *
 * 리그 축에는 `open` 상태가 없다(리그 상태는 draft·active·completed 셋뿐 — `league-state.ts`). 신청은
 * **거울(`V1Tournament`)의 `status='open'`** 으로 열리고, `V1League.state` 는 `draft` 로
 * 남는다 — `LEAGUE_STATE_BY_STATUS` 가 이미 `open → draft` 로 되돌리므로 목록·상세의
 * 리그 축 표시는 그대로 "준비 중"이다. 두 축이 어긋나는 게 아니라, **신청 접수는 시작이
 * 아니라는 것**이 두 축 모두에서 같은 뜻으로 표현된 것이다.
 */
export class OpenLeagueRegistrationDto {
  /** 신청 마감 시각(ISO 8601). 과거면 거부한다 — 열자마자 닫힌 리그를 만들지 않는다. */
  @IsDateString()
  registrationDeadlineAt!: string;
}

export class RevertLeagueCompletionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

// 되돌리기·보류 해제 뒤 남은 대진이 없으면 리그를 다시 종료할 길이 없었다(MD-QA #93) — 수동 종료. 사유는 선택.
export class CompleteLeagueDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

// R12: 리그 대진 취소는 되돌릴 수 없는 운영 조작이라 사유를 필수로 받는다
// (프론트 GateConfirmModal의 REASON_MAX=500과 동일 상한).
// 리그 보류는 공개 화면에서 리그와 경기를 숨기는 운영 조작이라 사유를 필수로 받는다(대진 취소와 같은 상한).
export class HoldLeagueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ResumeLeagueDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

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

/**
 * 운영자가 **한 경기씩** 직접 넣는 리그 대진 (Task 164 BE-1).
 *
 * 라운드로빈 일괄 생성이 못 담는 경우를 위한 것이다 — 우천 순연 재편성, 팀이 늦게 합류해
 * 생긴 잔여 경기, 조정된 재경기. 저장 경로는 자동 생성과 **완전히 같다**
 * (`createLeagueFixture`) — 부수효과가 한쪽에만 빠지지 않게 하려는 것이다.
 *
 * ⚠️ **주차(round)를 받지 않는다.** `V1TeamMatch` 에 주차 컬럼이 없고 순위 계산도 쓰지
 * 않는다 — 화면의 "N주차" 는 그 리그의 서로 다른 경기일을 세어 `startAt` 에서 파생한다
 * (`league-week-number.ts`). 받아 봐야 저장되지 않는 값이라 API 표면에 두지 않는다
 * (2026-09-02 사용자 확정, Task 164 Ambiguity 3).
 */
export class CreateManualLeagueFixtureDto extends LeaguePlaceSnapshotDto {
  @IsUUID()
  homeTeamId!: string;

  @IsUUID()
  awayTeamId!: string;

  @IsDateString()
  startsAt!: string;

  /**
   * 경기 길이(분). 주면 `endAt = startsAt + durationMinutes`, 안 주면 종료 시각을 **비운다**.
   * 종료 시각을 직접 받지 않는 이유: 시작보다 이른 종료를 만들 수 있는 입력을 애초에 두지
   * 않기 위해서다(일괄 생성도 슬롯 계산으로 duration 을 거쳐 endAt 을 만든다).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  placeName?: string;

  /** 미지정이면 일괄 생성과 **같은 규칙**으로 짓는다(`leagueFixtureTitle`). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;
}

/**
 * 리그 징계(출전정지) 규정 수정. **옵트인이다** — 두 값이 모두 비어 있으면 이 리그에는
 * 규정이 적용되지 않는다(기본값을 두지 않은 것이 안전장치다: 값이 있으면 이미 진행 중인
 * 리그에 소급 적용된다. schema.prisma 의 같은 필드 주석 참고).
 *
 * 대회(`admin-tournament.dto.ts`)와 **같은 범위·같은 문구**를 쓴다 — 두 축에서 다른 값을
 * 허용하면 같은 규정이 대회냐 리그냐에 따라 달라진다.
 */
export class UpdateLeagueDisciplineDto {
  /** 경고 누적 출전정지 — 옐로 몇 장이 쌓이면 다음 1경기 출전이 막히는가. */
  @IsOptional()
  @IsInt({ message: '경고 누적 기준은 정수여야 해요.' })
  @Min(1, { message: '경고 누적 기준은 1장 이상이어야 해요.' })
  @Max(20, { message: '경고 누적 기준이 20장을 넘으면 사실상 규정이 없는 것과 같아요.' })
  yellowAccumulationLimit?: number | null;

  /** 레드카드(퇴장) 1장당 출전정지 경기 수. 생략·null = 퇴장 정지 미적용. */
  @IsOptional()
  @IsInt({ message: '퇴장 정지 경기 수는 정수여야 해요.' })
  @Min(1, { message: '퇴장 정지 경기 수는 1경기 이상이어야 해요.' })
  @Max(20, { message: '퇴장 정지 경기 수는 20경기를 넘을 수 없어요.' })
  redCardSuspensionMatches?: number | null;
}

// 정규 리그 대진 템플릿(자리 기반 빈 경기). 팀은 나중에 자리에 넣으므로 teamIds 가 없다.
// 일정은 필수다 — 공개 가드가 startAt·placeName 이 있는 경기만 내보내기 때문이다. 라운드마다 날짜 하나씩
// 쓰므로(팀당 하루 1경기) 필요한 날짜 수는 총 라운드 수이고, 모자라면 422 LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT.
export class ApplyLeagueTemplateDto extends LeaguePlaceSnapshotDto {
  @IsInt()
  @Min(3)
  @Max(20)
  teamCount!: number;

  @IsInt()
  @IsIn([1, 2])
  legs!: 1 | 2;

  @IsDefined()
  @ValidateNested()
  @Type(() => LeagueFixtureScheduleDto)
  schedule!: LeagueFixtureScheduleDto;

  // 하루에 치르는 경기 수(전 팀 합계). 비우면 하루 한 라운드 — 그 라운드 경기가 같은 시각에 시작한다.
  // 넣으면 라운드로빈 순서대로 하루 N경기씩 나누고, 그날 경기는 한 구장에서 `경기 시간 + 휴식` 간격으로 잇는다.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  gamesPerDay?: number;

  // gamesPerDay 와 함께만 쓴다. 생략하면 경기 설정의 정규 시간(연장 제외 피리어드 합계).
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  gameDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  breakMinutes?: number;

  // 비우면 일괄 생성과 같은 기본값('장소 미정')이다.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeName?: string;

  // true 면 취소 안 된 경기가 전부 시작 전·결과 없음일 때 기존 대진을 취소로 접고 다시 만든다.
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}
