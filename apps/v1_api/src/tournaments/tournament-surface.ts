import { Prisma } from '@prisma/client';

/**
 * **대회 표면이 공유하는 단 하나의 조건 — "대회 조회는 대회만 본다".**
 *
 * `v1_tournaments` 는 통합(R1) 이후 정규 리그 시즌도 담게 된다
 * (`kind = regular_league`, 백필은 R3). 그런데 대회를 읽는 목록·집계 쿼리들은
 * 종류를 가리지 않으므로, 리그 행이 생기는 순간 **공개 대회 목록에 리그가 대회
 * 카드로 뜨고** 어드민 목록·상태 탭 카운트·대시보드 KPI 가 함께 오염된다.
 * 이 상수는 그 누출을 백필 **이전에** 막아 둔다.
 *
 * ## 왜 화이트리스트인가 (블랙리스트 `{ not: 'regular_league' }` 가 아니라)
 * 값이 둘뿐인 지금은 둘이 논리적으로 같다. 갈리는 것은 **세 번째 kind 가 생기는 날**이다:
 * - 블랙리스트면 새 종류가 **자동으로 사용자 화면에 나타난다**(fail-open) — 이 게이트가
 *   존재하는 이유 자체가 "나오면 안 되는 kind 가 추가됐기 때문"이므로 방향이 반대다.
 * - 화이트리스트면 **안 나타난다**(fail-closed). 그 기능을 개발하는 도중에 즉시 드러나고,
 *   드러났을 때 고치는 비용은 아래 한 줄이다. 반면 누출은 **안 막힌 채 발견되지 않는다.**
 *
 * 새 kind 가 조용히 들어올 수도 없다 — enum 추가는 `schema.prisma` 를 건드리므로
 * `SOURCE_SNAPSHOT_DRIFT` 게이트가 CI 를 세우고 해시 재핀 + 근거 주석을 강제한다.
 *
 * ## `kind: null` 을 함께 받는 이유
 * `kind` 는 nullable 이다(NOT NULL 승격은 R5). 마이그레이션이 `DEFAULT 'regular_tournament'`
 * 로 컬럼을 추가해 기존 행은 전부 채워졌지만, 그건 **지금의 상태**일 뿐이다. 나중에 누가
 * `kind` 를 명시적으로 null 로 쓰는 경로를 하나 만들면 그 대회들이 **사용자 목록에서
 * 조용히 사라진다.** DB 카운트로 "지금 NULL 0건"을 확인해도 그 미래는 못 막으므로,
 * 조건 자체를 NULL-safe 하게 둔다. 리그 행은 백필이 항상 `regular_league` 를 명시하므로
 * 이 OR 에 걸리지 않는다.
 *
 * `test/tournaments/tournament-surface-kind.integration-spec.ts` 의 **세 번째 케이스(`kind=null` 이 나온다)** 가 이 OR 을
 * "단순화"하려는 다음 사람을 red 로 막는다 — 지우면 그 테스트가 깨진다.
 *
 * ## 여기 걸지 않는 곳 (일부러 안 거른다)
 * 설정 축 — `competition-config-backfill.ts` 의 참조 수 집계·가드·UPDATE 와
 * `competition-config-version-repoint.ts` 의 stale 버전 조회는 **`competitionConfigVersionId`
 * 기준**이고, 설정은 대회와 리그가 이미 공유하는 축이다. 거기서 종류를 가르면 리그만
 * 옛 설정에 남거나 설정 없는 상태로 방치돼 통합을 되돌리는 셈이 된다.
 *
 * **새 kind 를 추가하면 여기 한 줄을 같이 고쳐라.**
 */
export const TOURNAMENT_SURFACE_KIND: Prisma.V1TournamentWhereInput = {
  OR: [{ kind: 'regular_tournament' }, { kind: null }],
};
