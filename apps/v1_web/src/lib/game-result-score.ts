import type { V1GameResultScore } from '@/types/api';

/** 화면이 읽는 승부차기 한 건 -- 점수 두 개 + 선축(먼저 찬 팀). */
export type PenaltyScoreView = {
  home: number;
  away: number;
  firstKickSideKey?: 'HOME' | 'AWAY';
};

/**
 * `V1GameResultScore` 는 **두 형태의 유니온**이다 — 서버에 실제로 두 생산자가 있다.
 *
 *   평평  `{ home, away }`                    실시간 결과 확정 경로
 *   중첩  `{ regulation: {home,away}|null, … }` 레거시 결과 백필 경로
 *
 * 타입은 처음부터 유니온이었는데 **소비처가 평평한 쪽만 읽는 실수가 이 저장소에서
 * 네 번 반복됐다** — 공개 일정(`parseScore`), 대회 상세 리더(`parseTournamentFixtureOfficialScore`),
 * 팩트 프로젝션(`parseOfficialScore`), 그리고 운영 콘솔(이 파일이 고치는 곳).
 * 알파 실측 증상: 백필된 경기가 `undefined:undefined` 로 표시됐다.
 *
 * 그래서 프런트의 표시 경로는 여기 하나만 쓰도록 모은다. 새로 스코어를 그리는
 * 화면이 생기면 직접 `.home` 을 읽지 말고 이 함수를 써라.
 *
 * `regulation` 이 명시적으로 null 인 경우(완료됐지만 스코어 미기록, `incomplete`)는
 * 점수를 지어내지 않고 `null` 을 돌려준다 — 호출부가 "기록 없음"을 어떻게 쓸지 정한다.
 *
 * 승부차기 점수는 두 형태에서 필드 이름이 다르다 -- 중첩 형태는 `penalty`(단수,
 * `{home,away}|null`), 평평한 형태는 `penalties`(복수, optional). 여기서는 이름을
 * `penalties`(복수)로 통일해 돌려준다 -- 호출부가 형태별 이름 차이를 또 신경 쓰지
 * 않게.
 *
 * 선축(`penalties.firstKickSideKey`)은 평평한 형태에만 있다 -- 중첩 형태는 이 필드가
 * 생기기 전의 레거시 백필이 쓴 것이라 애초에 담고 있지 않다. 그래서 백필 경기에는
 * 선축이 없고(`undefined`), 화면은 그 경우 선축을 그리지 않는다.
 */
export function readGameResultScore(
  score: V1GameResultScore | null | undefined,
): { home: number; away: number; penalties?: PenaltyScoreView } | null {
  if (!score) return null;
  if ('regulation' in score) {
    if (!score.regulation) return null;
    return score.penalty
      ? { home: score.regulation.home, away: score.regulation.away, penalties: score.penalty }
      : { home: score.regulation.home, away: score.regulation.away };
  }
  return score.penalties
    ? { home: score.home, away: score.away, penalties: score.penalties }
    : { home: score.home, away: score.away };
}

/** `3:1` — 점수를 못 읽으면 `fallback`(기본 `기록 없음`). 승부차기는 포함하지 않는다 —
 * 순위·집계처럼 "정규시간 점수"만 뜻해야 하는 자리(조별 순위는 승부차기를 읽지 않는다)를
 * 위한 포맷이다. 결과를 **보여주는** 자리에는 `formatGameResultScoreWithPenalties`를 써라. */
export function formatGameResultScore(
  score: V1GameResultScore | null | undefined,
  fallback = '기록 없음',
): string {
  const parsed = readGameResultScore(score);
  return parsed === null ? fallback : `${parsed.home}:${parsed.away}`;
}

/**
 * `0:0 (승부차기 2:0, 선축 원정)` — 결과를 사람에게 보여주는 모든 자리의 단일 포맷.
 *
 * 결선 무승부는 승부차기로만 승자가 갈리는데, 정규시간 점수만 그리면 화면에 `0:0`만
 * 남아 "승자가 없는 종료된 결승"이 된다(알파 실측: 서버에는 `penalties {2,0}`가 있는데
 * 스태프 화면 어디에도 안 보였다 — 운영 보드·운영 콘솔·결과 검수 헤더 전부). 승부차기가
 * 없는 경기는 괄호 자체를 붙이지 않으므로 일반 경기 표시는 이 함수로 바꿔도 그대로다.
 *
 * 선축은 **팀 이름이 아니라 `홈`/`원정`으로** 적는다. 이 함수는 팀 이름을 받지 않고,
 * 받게 만들 수도 없다 — 호출부 중 `revision-timeline.tsx`(리비전 목록)와
 * `fixture-picker-list.tsx`(픽스처 목록)는 사이드 이름을 아예 갖고 있지 않다. 일부
 * 화면만 이름을 넘기게 하면 같은 경기가 화면마다 다른 문구로 보인다(그게 이 함수를
 * 하나로 모은 이유 자체를 무너뜨린다). 게다가 바로 앞에 찍히는 점수가 이미
 * `홈:원정` 순서라, 읽는 사람은 같은 기준틀을 그대로 쓴다.
 *
 * 선축이 없는 경기(이 필드가 생기기 전에 저장된 리비전, 그리고 중첩 백필 형태)는 선축
 * 부분을 붙이지 않는다 — 모르는 것을 지어내지 않는다.
 */
export function formatGameResultScoreWithPenalties(
  score: V1GameResultScore | null | undefined,
  fallback = '기록 없음',
): string {
  const parsed = readGameResultScore(score);
  if (parsed === null) return fallback;
  const base = `${parsed.home}:${parsed.away}`;
  if (!parsed.penalties) return base;
  return `${base} (${formatPenaltyShootout(parsed.penalties)})`;
}

/**
 * `승부차기 2:0, 선축 원정` — 승부차기 한 건만 따로 그리는 자리의 단일 문구.
 *
 * 정규시간 점수와 **떨어진 위치에** 승부차기를 그리는 화면이 둘 있다: 운영 보드의 결과
 * 셀(정규시간은 굵게 위, 승부차기는 작게 아래)과 결과 검수 헤더(각각 다른 칩). 둘 다
 * `승부차기 {home}:{away}`를 손으로 조립하고 있어서, `formatGameResultScoreWithPenalties`에
 * 선축을 넣어도 **이 두 화면만 선축이 안 보였다** — 같은 경기가 리비전 타임라인에는
 * `선축 원정`이 뜨고 바로 위 헤더에는 안 뜨는 어긋남이 실제로 생겼다. 그래서 승부차기
 * 문구도 포맷터를 하나로 모은다.
 *
 * 선축 표기(`홈`/`원정`)의 근거는 위 `formatGameResultScoreWithPenalties` doc 참고.
 */
export function formatPenaltyShootout(penalties: PenaltyScoreView): string {
  const base = `승부차기 ${penalties.home}:${penalties.away}`;
  const firstKick = penaltyFirstKickLabel(penalties.firstKickSideKey);
  return firstKick === null ? base : `${base}, 선축 ${firstKick}`;
}

/** 선축 사이드의 표시 문구. 값이 없으면(레거시·백필) `null` — 호출부가 표기를 생략한다.
 *  export 하지 않는다: 사이드 목록을 가진 화면(운영 콘솔)은 `홈`/`원정` 대신 실제 팀
 *  이름을 쓰므로 이 라벨을 재사용할 곳이 없다. */
function penaltyFirstKickLabel(firstKickSideKey: 'HOME' | 'AWAY' | undefined): string | null {
  if (firstKickSideKey === 'HOME') return '홈';
  if (firstKickSideKey === 'AWAY') return '원정';
  return null;
}
