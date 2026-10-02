/**
 * **리그 상태 어휘 — 이제 Prisma enum 이 아니라 손으로 쓴 유니온이다** (Task 164 BE-5 drop).
 *
 * `V1League` 테이블이 사라지면서 `V1LeagueState` enum 도 함께 없어졌다. 그런데 **응답은
 * 여전히 이 어휘를 쓴다** — 리그 목록·상세·어드민 응답의 `state` 필드가 `draft`·`active`·
 * `completed` 를 그대로 내보내고, 화면(`LEAGUE_STATE_META`)이 그 값으로 라벨을 고른다.
 * 저장은 통합 축의 `V1TournamentStatus` 로 하고, 그 값과 이 어휘 사이는
 * `league-competition-mirror.ts` 의 `LEAGUE_STATE_BY_STATUS` / `STATUSES_BY_LEAGUE_STATE`
 * 가 옮긴다.
 *
 * **문자열 리터럴을 재선언하지 않는다.** 예전엔 Prisma 가 생성한 enum 하나뿐이라 값이 갈릴
 * 자리가 없었는데, 손 유니온이 되면 파일마다 `'draft' | 'active' | 'completed'` 를 다시
 * 적고 싶어진다 — 그러면 한 곳만 고쳐진 채로 나가도 타입이 잡아 주지 않는다. 소비처는 전부
 * 이 모듈을 import 한다.
 */
export const LEAGUE_STATES = ['draft', 'active', 'completed'] as const;

export type LeagueState = (typeof LEAGUE_STATES)[number];

/**
 * 예전 `V1LeagueState.draft` 처럼 **값으로** 쓰던 자리를 위한 상수 객체. enum 이 사라져도
 * 호출부 모양이 그대로라 diff 가 작고, 오타는 타입이 잡는다.
 */
export const LeagueStateValue = {
  draft: 'draft',
  active: 'active',
  completed: 'completed',
} as const satisfies Record<LeagueState, LeagueState>;
