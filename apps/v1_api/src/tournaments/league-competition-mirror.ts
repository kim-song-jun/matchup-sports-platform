import { Prisma, V1TournamentStatus } from '@prisma/client';
// BE-5 drop: `V1LeagueState` enum 이 사라졌다. 응답 어휘는 손 유니온으로 남는다 —
// **문자열 리터럴을 여기서 다시 선언하지 않는다**(league-state.ts 의 doc 참조).
import { LeagueStateValue, type LeagueState } from '../league-matches/league-state';

import {
  FOOTBALL_COMPETITION_CONFIG_ID,
  FUTSAL_COMPETITION_CONFIG_ID,
} from './competition-config/competition-config-backfill';

/**
 * **리그 → 대회 거울(mirror) 매핑의 단일 소스.**
 *
 * 통합 축(`V1Tournament`)에 리그를 비추는 자리에서 같은 값을 써야 한다. 한때 자리가 셋
 * 이었다 — 기존 리그 88개를 옮기는 백필, 표시 필드를 채우는 백필, 그리고 새 리그·상태 변경의
 * dual-write. 앞의 둘은 **한 번 돌고 끝났고**(alpha 실행 완료 2026-08-31, 재실행 금지)
 * BE-5 에서 코드째 지웠다. 지금 남은 자리는 dual-write 하나다.
 *
 * 매핑을 여러 벌로 두면 갈라지고, 갈라진 것이 **에러로 안 나타난다**(대회 행이 조용히 다른
 * 값을 갖는다). 그래서 여기 한 벌만 둔다.
 *
 * ## `status` 매핑 — **D7 과 무관하다**
 * **오늘의 리그에는 신청 단계가 없다.** 운영자가 팀을 넣고 시즌이 돈다 — 그래서 `active` 는
 * "경기가 진행 중"이라는 뜻이고 `in_progress` 가 맞다.
 *
 * **`open`("신청 받는 중")은 오늘 존재하지 않는 상태라 매핑 대상이 없다.** D7(참가 경로를
 * 신청제로 통일)이 도입할 때 생긴다. 즉 이 표는 D7 을 미리 정하는 것이 아니라 **현재 의미를
 * 그대로 옮기는 것**이고, `open` 이 비어 있는 것은 누락이 아니다.
 */
export const STATUS_BY_LEAGUE_STATE: Record<LeagueState, V1TournamentStatus> = {
  [LeagueStateValue.draft]: V1TournamentStatus.draft,
  [LeagueStateValue.active]: V1TournamentStatus.in_progress,
  [LeagueStateValue.completed]: V1TournamentStatus.completed,
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
  state: LeagueState;
  startsOn: Date;
  endsOn: Date;
  seriesId: string | null;
  tier: number | null;
  seasonNo: number | null;
  sportCode: string;
  /**
   * **리그가 실제로 만들어진 시각.** 거울에 그대로 옮긴다.
   *
   * 안 옮기면 `V1Tournament.createdAt` 의 스키마 기본값 `now()` 가 남아 **백필을 실행한
   * 시각**이 박힌다. 그 값은 아무 뜻도 없는데 **목록 정렬을 지배한다**:
   * `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` 라서, 한 번에 백필된 리그가 통째로
   * 최신이 되어 통합 목록 첫 페이지를 전부 차지한다(2026-09-01 alpha 실측: 리그 50건이
   * 전부 `2026-08-30T18:43:43`, 대회는 12일 전 → `?kind=all` 첫 50건이 전부 리그).
   *
   * `V1League` 에도 `@@index([createdAt desc, id desc])` 가 있어 **리그 목록도 같은 축으로
   * 정렬한다** — 원본 시각을 옮기면 두 목록의 순서가 일치한다. 새로 만드는 성질이 아니라
   * 원래 그래야 했던 상태다.
   */
  createdAt: Date;
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
    // 원본 시각을 그대로 쓴다 — 생략하면 `@default(now())` 가 백필/생성 시각을 박고,
    // 그 값이 목록 정렬(`createdAt desc`)을 지배한다. 위 필드 주석 참조.
    createdAt: league.createdAt,
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
  createdAt: true,
  sport: { select: { code: true } },
} as const;

/** `LEAGUE_MIRROR_SELECT` 로 읽은 행을 `LeagueMirrorSource` 로 평탄화한다. */
export function toMirrorSource(row: {
  id: string;
  title: string;
  sportId: string;
  regionId: string;
  state: LeagueState;
  startsOn: Date;
  endsOn: Date;
  seriesId: string | null;
  tier: number | null;
  seasonNo: number | null;
  createdAt: Date;
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
    createdAt: row.createdAt,
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
  state: LeagueState;
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
 * | `cancelled` | `completed` | 방어값. 아래 참조 |
 *
 * ## 아래 셋은 **도달 불가**다 — "어떻게 보여줄까" 를 고민할 자리가 아니다
 * `V1Tournament.status` 를 자유롭게 쓰는 곳은 어드민 `TournamentsAdminService.changeStatus`
 * 하나뿐이고, 그 진입 조회가 `findTournamentOnSurface(..., TOURNAMENT_KINDS, ...)`
 * (= `[regular_tournament]`) 라 **리그 거울에 닿지 않는다.** 백필·dual-write 도 위 세 값만
 * 쓴다. **즉 취소된 리그 같은 것은 존재하지 않는다.**
 *
 * (줄 번호를 적지 않는다 — 이 파일은 병렬 세션이 자주 고쳐서 번호가 금방 어긋나고,
 * 어긋난 번호는 없는 근거를 있는 것처럼 보이게 한다. 메서드 이름으로 찾아라.)
 *
 * 그런데도 매핑을 비우지 않는 이유는 **비면 `LEAGUE_STATE_META[undefined]` 로 웹이 죽기
 * 때문**이지, 그 값이 올 것 같아서가 아니다. 방어값이지 제품 판단이 아니다.
 *
 * > **반증**: 어떤 경로가 `ALL_COMPETITION_KINDS` 로 리그를 허용하면 이 값이 실제로 보일 수
 * > 있다. `scripts/v1-surface-check.mjs` 의 **"리그 허용" baseline 이 1 을 넘으면 여기를 다시
 * > 본다** — 봉쇄가 느슨해지는 순간 이 자리가 같이 걸리도록 게이트에 묶어 둔 것이다.
 */
export const LEAGUE_STATE_BY_STATUS: Record<V1TournamentStatus, LeagueState> = {
  [V1TournamentStatus.draft]: LeagueStateValue.draft,
  [V1TournamentStatus.open]: LeagueStateValue.draft,
  [V1TournamentStatus.closed]: LeagueStateValue.draft,
  [V1TournamentStatus.in_progress]: LeagueStateValue.active,
  [V1TournamentStatus.completed]: LeagueStateValue.completed,
  [V1TournamentStatus.cancelled]: LeagueStateValue.completed,
};

/**
 * 위 매핑의 역방향 — 리그 `state` 하나가 통합 축 `status` **여럿**에 대응한다
 * (예: `draft` ← `draft`·`open`·`closed`). 상태로 거르는 목록 API 가 쓴다.
 *
 * **손으로 적지 않고 `LEAGUE_STATE_BY_STATUS` 에서 파생한다.** 두 방향을 따로 적으면
 * 한쪽만 고쳐져 "목록엔 안 보이는데 상세는 열리는" 식으로 어긋난다.
 */
/**
 * **리그 목록에 실을 수 있는 거울인가** (Task 164 BE-5).
 *
 * `V1Tournament` 에서 `scheduledAt`·`scheduledEndAt`·`regionId` 는 nullable 이지만 리그 거울은
 * 셋 다 항상 채운다(원본이 non-null 이었다). 비어 있다면 그 행은 깨진 것이다.
 *
 * **목록에서는 끊지 않고 제외한다.** 단건 조회는 `LEAGUE_MIRROR_MISSING` 으로 끊는 게 맞지만
 * (그 리그를 열려는 사람에게 사실을 말해야 한다), 목록에서 같은 판단을 하면 **깨진 행 하나
 * 때문에 목록 전체가 500** 이 되어 운영자가 다른 리그도 못 본다. 대신 제외하면서 warn 로그와
 * 개수를 남긴다 — 조용히 사라지면 아무도 모른다.
 *
 * 어드민 목록과 공개 목록이 **같은 기준**을 써야 한다(한쪽에만 보이는 리그를 만들지 않는다).
 */
export function isCompleteLeagueMirror<T extends {
  scheduledAt: Date | null;
  scheduledEndAt: Date | null;
  regionId: string | null;
}>(row: T): row is T & { scheduledAt: Date; scheduledEndAt: Date; regionId: string } {
  return row.scheduledAt !== null && row.scheduledEndAt !== null && row.regionId !== null;
}

export const STATUSES_BY_LEAGUE_STATE: Record<LeagueState, V1TournamentStatus[]> =
  Object.entries(LEAGUE_STATE_BY_STATUS).reduce(
    (acc, [status, state]) => {
      acc[state].push(status as V1TournamentStatus);
      return acc;
    },
    {
      [LeagueStateValue.draft]: [] as V1TournamentStatus[],
      [LeagueStateValue.active]: [] as V1TournamentStatus[],
      [LeagueStateValue.completed]: [] as V1TournamentStatus[],
    },
  );
