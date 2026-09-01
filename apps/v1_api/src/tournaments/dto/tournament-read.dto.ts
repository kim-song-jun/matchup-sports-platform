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
 * 소비자 대회 목록 쿼리 — 공개 노출 status(open/closed/in_progress/completed)만 필터.
 * draft/cancelled는 노출 제외(서비스 계층 고정).
 *
 * ⚠️ **이 상수는 캠페인 조회 등 다른 곳도 쓴다**(`tournament-campaign-read.service.ts`).
 * 목록 필터에 값을 더하려고 여기를 늘리면 그 소비처의 공개 범위까지 함께 넓어진다 —
 * 그래서 `draft` 는 이 배열이 아니라 **아래 목록 전용 배열**에만 더한다.
 */
export const PUBLIC_TOURNAMENT_STATUSES = [
  'open',
  'closed',
  'in_progress',
  'completed',
] as const;
export type PublicTournamentStatus = (typeof PUBLIC_TOURNAMENT_STATUSES)[number];

/**
 * **목록 필터가 받는 값.** 위 공개 status 에 `draft` 를 더한다 — 정규 리그의 `draft` 는
 * **"예정"** 이고 사용자가 고를 수 있어야 하는 상태이기 때문이다(2026-09-01 확정).
 *
 * ⚠️ **여기서 받는다는 것이 "누구에게나 보인다" 는 뜻이 아니다.** 서비스가 `draft` 를
 * **정규 리그로 좁혀서** 적용한다(`tournaments-read.service.ts`) — 대회의 `draft`(운영자
 * 준비 중)는 이 값을 줘도 계속 안 나온다. 그 분리가 없으면 이 한 줄이 대회 비공개를
 * 통째로 여는 구멍이 된다.
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
