import type { CompetitionKind } from '@/components/v1-ui/competition-kind-segment';
import type { CursorPage, V1Sport, V1TournamentListPage } from '@/types/api';
import type { V1TournamentCampaignList } from '@/types/tournament-campaign';

/*
 * 공개 목록의 서버 seed 와 클라이언트 첫 요청이 공유하는 쿼리 값.
 * 'use client' 파일에 두면 서버 컴포넌트가 받는 것은 값이 아니라 클라이언트 참조라 여기 둔다.
 */

export const TOURNAMENT_LIST_PAGE_SIZE = 20;
export const EVENT_CAMPAIGN_PAGE_SIZE = 30;

/** 서버가 받아 둔 대회 목록 첫 페이지와, 그것을 받은 유형. 다른 유형 화면에 쓰면 안 된다. */
export type TournamentListSeed = {
  readonly kind: CompetitionKind;
  readonly page: V1TournamentListPage;
};

export type EventCampaignSeed = V1TournamentCampaignList;

/** 매치·팀매치·팀 목록의 무필터 첫 페이지와 종목 칩용 마스터 종목. */
export type CursorListSeed<T> = {
  readonly page: CursorPage<T>;
  readonly sports: V1Sport[];
};

export const TEAM_LIST_PAGE_SIZE = 20;

/*
 * 클라이언트 무필터 첫 요청과 같은 쿼리다. 매치·팀매치 목록은 파라미터 없이 부르고(서버 기본 20건),
 * 팀 목록은 limit 을 붙인다.
 */
export const MATCH_LIST_SEED_PATH = '/matches';
export const TEAM_MATCH_LIST_SEED_PATH = '/team-matches';
export const TEAM_LIST_SEED_PATH = `/teams?limit=${TEAM_LIST_PAGE_SIZE}`;

/*
 * 목록 클라이언트가 필터로 읽는 파라미터. 하나라도 값이 있으면 화면이 무필터 첫 페이지와 달라지므로
 * ItemList 를 내지 않는다 — 클라이언트에 필터 파라미터를 더하면 여기에도 더한다.
 */
const COMMON_LIST_FILTER_PARAMS = ['sportId', 'sort', 'genderRule', 'levelCodes', 'levels', 'q'] as const;
export const MATCH_LIST_FILTER_PARAMS = [...COMMON_LIST_FILTER_PARAMS, 'view', 'regionId'] as const;
export const TEAM_MATCH_LIST_FILTER_PARAMS = [...COMMON_LIST_FILTER_PARAMS, 'view', 'kind'] as const;
export const TEAM_LIST_FILTER_PARAMS = [...COMMON_LIST_FILTER_PARAMS, 'regionId'] as const;

/** 클라이언트 모바일 첫 요청(`cursor` 없음 + 필터 없음)과 같은 쿼리다. */
export function tournamentListSeedPath(kind: CompetitionKind): string {
  const query = new URLSearchParams({ limit: String(TOURNAMENT_LIST_PAGE_SIZE), kind });
  return `/tournaments?${query.toString()}`;
}

export function eventCampaignSeedPath(): string {
  return `/tournaments/campaigns?limit=${EVENT_CAMPAIGN_PAGE_SIZE}`;
}

/** `?status=` 처럼 값이 빈 파라미터는 없는 것과 같다(클라이언트 목록과 같은 규칙). */
export function firstSearchParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === undefined || raw === '' ? null : raw;
}

export function hasListFilter(
  params: Record<string, string | string[] | undefined>,
  keys: readonly string[],
): boolean {
  return keys.some((key) => firstSearchParam(params[key]) !== null);
}
