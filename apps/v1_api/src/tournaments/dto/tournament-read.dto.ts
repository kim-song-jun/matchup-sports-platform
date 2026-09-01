import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  COMPETITION_LIST_KINDS,
  type CompetitionListKind,
} from '../tournament-surface';

/**
 * **공개 대회의 status 집합.** 대회가 공개 표면에 나올 수 있는 상태들이다.
 *
 * ⚠️ **이건 "목록 필터가 받는 값" 이 아니다.** 두 개념이 갈렸다 — 목록 입력 범위는 아래
 * `COMPETITION_LIST_STATUSES` 이고 거기엔 `draft` 가 있다. 이 배열만 보고
 * *"draft 는 어디서도 안 받는다"* 로 읽으면 틀린다.
 *
 * ⚠️ **이 상수는 캠페인 조회도 쓴다**(`tournament-campaign-read.service.ts`). 목록에 값을
 * 더하려고 여기를 늘리면 **그 소비처의 공개 범위까지 함께 넓어진다** — 그래서 `draft` 는
 * 여기가 아니라 아래 목록 전용 배열에만 들어갔다.
 */
export const PUBLIC_TOURNAMENT_STATUSES = [
  'open',
  'closed',
  'in_progress',
  'completed',
] as const;
export type PublicTournamentStatus = (typeof PUBLIC_TOURNAMENT_STATUSES)[number];

/**
 * **목록 필터가 받는 입력 범위.** 위 공개 status 에 `draft` 를 더한다 — 정규 리그의 `draft`
 * 는 **"예정"** 이고 사용자가 고를 수 있어야 하는 상태이기 때문이다(2026-09-01 확정).
 *
 * ⚠️ **받는다 ≠ 열린다.** 서비스가 `draft` 를 **`kind: regular_league` 와 묶어서** 건다
 * (`tournaments-read.service.ts`). 그래서 대회 표면(`kind` 기본값 또는 `tournament`)과는
 * **조건이 서로 모순이라 결과가 나올 수 없다** — 대회의 `draft`(운영자 준비 중)는 이 값을
 * 줘도 계속 안 나온다.
 *
 * 안전성의 근거가 **검증이 아니라 모순**이라는 점이 중요하다. 이 `@IsIn` 을 누가 넓혀도
 * 대회 draft 는 여전히 안 샌다 — 반대로, 서비스의 그 묶음을 풀면 이 배열이 그대로 구멍이
 * 된다. 둘 중 서비스 쪽이 진짜 게이트다.
 */
export const COMPETITION_LIST_STATUSES = [...PUBLIC_TOURNAMENT_STATUSES, 'draft'] as const;
export type CompetitionListStatus = (typeof COMPETITION_LIST_STATUSES)[number];

export class TournamentListQueryDto {
  @IsOptional()
  @IsIn(COMPETITION_LIST_STATUSES)
  status?: CompetitionListStatus;

  @IsOptional()
  @IsUUID()
  sportId?: string;

  /**
   * 담을 종류. **기본값은 `tournament`** — 지금까지의 동작을 그대로 유지한다.
   *
   * 기본값을 `all` 로 두지 않은 이유: 이 파라미터만 들어가고 화면이 아직 두 종류를 그리지
   * 못하는 창에서, `/tournaments` 를 여는 기존 사용자가 **구분되지 않는 섞인 목록**을 보게
   * 된다(대회는 참가비·정원, 리그는 시즌 기간·티어라 카드가 담는 정보가 다르다).
   * 화면이 준비된 뒤 기본값을 `all` 로 뒤집는다.
   */
  @IsOptional()
  @IsIn(COMPETITION_LIST_KINDS)
  kind?: CompetitionListKind;

  @IsOptional()
  @IsString()
  cursor?: string;

  // 데스크톱 대회 목록은 "몇 페이지째인지"가 보여야 한다 — cursor 만으로는 "더 보기"를
  // 계속 누르는 것 말고 위치를 옮길 방법이 없다(오너 지적: "더보기눌러서 다음다음
  // 넘어가는게 그게 좀 어려운것같고"). cursor 도 계속 받아 모바일 무한 스크롤과 기존
  // 호출자를 깨뜨리지 않고, 둘 다 오면 page 가 이긴다 — `paginationArgs` 참고.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지 번호는 정수여야 해요.' })
  @Min(1, { message: '페이지 번호는 1 이상이어야 해요.' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/**
 * 어드민 공지 생성 DTO.
 * audience는 공개 시 tournament_announcement_published 알림 수신 대상(신청 팀) 필터로 사용된다.
 * publish=true이면 publishedAt=now()로 즉시 공개 처리.
 */
export const ANNOUNCEMENT_AUDIENCES = [
  'public',
  'all_registered',
  'confirmed_only',
  'waitlist',
] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_CATEGORIES = [
  'general',
  'venue',
  'sponsor',
  'media',
  'results',
  'review',
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_AUDIENCES)
  audience?: AnnouncementAudience;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_CATEGORIES)
  category?: AnnouncementCategory;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class UpdateAnnouncementDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_CATEGORIES)
  category?: AnnouncementCategory;

  @IsOptional()
  @IsIn(ANNOUNCEMENT_AUDIENCES)
  audience?: AnnouncementAudience;

  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
