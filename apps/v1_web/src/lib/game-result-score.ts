import type { V1GameResultScore } from '@/types/api';

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
 */
export function readGameResultScore(
  score: V1GameResultScore | null | undefined,
): { home: number; away: number } | null {
  if (!score) return null;
  if ('regulation' in score) {
    return score.regulation ?? null;
  }
  return { home: score.home, away: score.away };
}

/** `3:1` — 점수를 못 읽으면 `fallback`(기본 `기록 없음`). */
export function formatGameResultScore(
  score: V1GameResultScore | null | undefined,
  fallback = '기록 없음',
): string {
  const parsed = readGameResultScore(score);
  return parsed === null ? fallback : `${parsed.home}:${parsed.away}`;
}
