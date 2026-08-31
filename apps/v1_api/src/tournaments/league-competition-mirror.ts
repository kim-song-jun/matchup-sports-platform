import { Prisma, V1LeagueState, V1TournamentStatus } from '@prisma/client';

import {
  FOOTBALL_COMPETITION_CONFIG_ID,
  FUTSAL_COMPETITION_CONFIG_ID,
} from './competition-config/competition-config-backfill';

/**
 * **리그 → 대회 거울(mirror) 매핑의 단일 소스.**
 *
 * 통합 축(`V1Tournament`)에 리그를 비추는 자리가 **셋**이고, 셋이 같은 값을 써야 한다:
 *
 * ```
 * 기존 리그 88개   league-competition-backfill.ts            (한 번 도는 백필)
 * 표시 필드        league-competition-detail-backfill.ts     (한 번 도는 백필)
 * 새 리그·상태변경  league-matches/* 의 dual-write            (계속 돈다)
 * ```
 *
 * 매핑을 세 벌로 두면 갈라진다 — 그리고 갈라진 것이 **에러로 안 나타난다**(대회 행이 조용히
 * 다른 값을 갖는다). 그래서 여기 한 벌만 둔다.
 *
 * ## `status` 매핑 — **D7 과 무관하다**
 * **오늘의 리그에는 신청 단계가 없다.** 운영자가 팀을 넣고 시즌이 돈다 — 그래서 `active` 는
 * "경기가 진행 중"이라는 뜻이고 `in_progress` 가 맞다.
 *
 * **`open`("신청 받는 중")은 오늘 존재하지 않는 상태라 매핑 대상이 없다.** D7(참가 경로를
 * 신청제로 통일)이 도입할 때 생긴다. 즉 이 표는 D7 을 미리 정하는 것이 아니라 **현재 의미를
 * 그대로 옮기는 것**이고, `open` 이 비어 있는 것은 누락이 아니다.
 */
export const STATUS_BY_LEAGUE_STATE: Record<V1LeagueState, V1TournamentStatus> = {
  [V1LeagueState.draft]: V1TournamentStatus.draft,
  [V1LeagueState.active]: V1TournamentStatus.in_progress,
  [V1LeagueState.completed]: V1TournamentStatus.completed,
};

/**
 * 종목 코드 → 대회 설정 버전. 리그는 축구 계열만 있고(2026-08-30 실측 88개 전부 futsal),
 * 그 외는 축구 설정으로 떨어진다.
 */
export function competitionConfigVersionIdForSport(sportCode: string): string {
  return sportCode.toLowerCase() === 'futsal'
    ? FUTSAL_COMPETITION_CONFIG_ID
    : FOOTBALL_COMPETITION_CONFIG_ID;
}

/** 거울을 만들거나 고치는 데 필요한 리그 필드. 호출부의 `select` 가 이 모양을 맞춰야 한다. */
export interface LeagueMirrorSource {
  id: string;
  title: string;
  sportId: string;
  regionId: string;
  state: V1LeagueState;
  startsOn: Date;
  endsOn: Date;
  seriesId: string | null;
  tier: number | null;
  seasonNo: number | null;
  sportCode: string;
}

/**
 * 새 리그의 거울 행을 만들 `data`.
 *
 * **`id` 가 리그 id 와 같다** — 대응표를 따로 두지 않기 위해서다. 그래서 리그를 만든 트랜잭션
 * 안에서 이걸로 대회 행을 만들면 두 축이 같은 키로 묶인다.
 */
export function leagueMirrorCreateData(
  league: LeagueMirrorSource,
): Prisma.V1TournamentUncheckedCreateInput {
  return {
    id: league.id,
    kind: 'regular_league',
    sportId: league.sportId,
    title: league.title,
    status: STATUS_BY_LEAGUE_STATE[league.state],
    regionId: league.regionId,
    scheduledAt: league.startsOn,
    scheduledEndAt: league.endsOn,
    seriesId: league.seriesId,
    tier: league.tier,
    seasonNo: league.seasonNo,
    competitionConfigVersionId: competitionConfigVersionIdForSport(league.sportCode),
  };
}

/** `select` 를 호출부마다 손으로 적지 않도록 모아 둔다 — 필드가 늘면 여기만 고친다. */
export const LEAGUE_MIRROR_SELECT = {
  id: true,
  title: true,
  sportId: true,
  regionId: true,
  state: true,
  startsOn: true,
  endsOn: true,
  seriesId: true,
  tier: true,
  seasonNo: true,
  sport: { select: { code: true } },
} as const;

/** `LEAGUE_MIRROR_SELECT` 로 읽은 행을 `LeagueMirrorSource` 로 평탄화한다. */
export function toMirrorSource(row: {
  id: string;
  title: string;
  sportId: string;
  regionId: string;
  state: V1LeagueState;
  startsOn: Date;
  endsOn: Date;
  seriesId: string | null;
  tier: number | null;
  seasonNo: number | null;
  sport: { code: string } | null;
}): LeagueMirrorSource {
  return {
    id: row.id,
    title: row.title,
    sportId: row.sportId,
    regionId: row.regionId,
    state: row.state,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    seriesId: row.seriesId,
    tier: row.tier,
    seasonNo: row.seasonNo,
    sportCode: row.sport?.code ?? '',
  };
}

/** 표시 필드만 — 기존 거울 행을 리그 현재 값에 맞출 때 쓴다(백필 · state 변경 dual-write). */
export interface LeagueMirrorDetail {
  status: V1TournamentStatus;
  scheduledAt: Date;
  scheduledEndAt: Date;
  regionId: string;
}

export function leagueMirrorDetailData(league: {
  state: V1LeagueState;
  startsOn: Date;
  endsOn: Date;
  regionId: string;
}): LeagueMirrorDetail {
  return {
    status: STATUS_BY_LEAGUE_STATE[league.state],
    scheduledAt: league.startsOn,
    scheduledEndAt: league.endsOn,
    regionId: league.regionId,
  };
}

/**
 * 거울 행이 **이미 목표값과 같은가.**
 *
 * 백필의 "이미 값이 있으면 멈춘다" 가드는 이걸로 갈라야 한다. dual-write 가 배포된 뒤
 * 새로 생긴 리그는 거울이 **처음부터 올바른 값으로** 만들어지는데, 그걸 "덮어쓰면 안 되는
 * 낯선 값"으로 보면 **리그 하나 때문에 백필 전체가 막힌다.**
 *
 * ```
 * 목표값과 같다   → 할 일이 없다. 건너뛴다 (dual-write 가 이미 맞게 써 둔 행)
 * 다른 값이 있다  → 멈춘다 (덮어쓰면 원래 값이 사라진다)
 * ```
 */
export function mirrorDetailMatches(
  row: { status: V1TournamentStatus; scheduledAt: Date | null; scheduledEndAt: Date | null; regionId: string | null },
  target: LeagueMirrorDetail,
): boolean {
  return (
    row.status === target.status &&
    row.scheduledAt?.getTime() === target.scheduledAt.getTime() &&
    row.scheduledEndAt?.getTime() === target.scheduledEndAt.getTime() &&
    row.regionId === target.regionId
  );
}

/**
 * **거울의 `status` → 리그 `state` 역매핑.**
 *
 * read-swap 이 통합 축에서 읽어도 응답의 `state` 계약은 그대로여야 한다 — 웹이
 * `LEAGUE_STATE_META[item.state]` 로 **인덱싱**하기 때문에, 세 값 밖이 나오면 `undefined`
 * 를 역참조해 **목록 페이지가 통째로 죽는다.** 그래서 여섯 상태를 **빠짐없이** 덮는다.
 *
 * | 대회 status | 리그 state | 왜 |
 * |---|---|---|
 * | `draft` | `draft` | 그대로 |
 * | `in_progress` | `active` | `STATUS_BY_LEAGUE_STATE` 의 역 |
 * | `completed` | `completed` | 그대로 |
 * | `open` | `draft` | "신청 받는 중" = **아직 시작 안 함.** D7 이 도입할 상태다 |
 * | `closed` | `draft` | 신청 마감이지 시작이 아니다 |
 * | `cancelled` | `completed` | ⚠️ **판단이 들어간 자리다** — 리그에는 취소 상태가 없다. "더 이상 진행하지 않는다" 쪽에 붙였다. 정확히 맞지 않으므로 리그에 취소 개념이 생기면 여기부터 고친다 |
 *
 * **아래 셋은 오늘 리그 거울에 나올 수 없다** — 백필·dual-write 가 위 세 값만 쓰고,
 * 어드민 `changeStatus` 는 리그를 막는다(#866). 그래도 매핑을 비워 두지 않는 이유는
 * **비면 화면이 죽기 때문**이지 그 값이 올 것 같아서가 아니다.
 */
export const LEAGUE_STATE_BY_STATUS: Record<V1TournamentStatus, V1LeagueState> = {
  [V1TournamentStatus.draft]: V1LeagueState.draft,
  [V1TournamentStatus.open]: V1LeagueState.draft,
  [V1TournamentStatus.closed]: V1LeagueState.draft,
  [V1TournamentStatus.in_progress]: V1LeagueState.active,
  [V1TournamentStatus.completed]: V1LeagueState.completed,
  [V1TournamentStatus.cancelled]: V1LeagueState.completed,
};
