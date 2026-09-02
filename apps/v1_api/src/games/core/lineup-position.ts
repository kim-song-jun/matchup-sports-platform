/**
 * 라인업이 저장하려는 `position` 이 그 대회 설정이 아는 값인지 판정한다 — 순수 함수.
 *
 * ## 왜 필요한가
 * Task 163 이 후보 센티널 `position = 'BENCH'` 를 폐기하고 마이그레이션으로 기존 행을
 * 정리했다. 그런데 `position` 은 **클라이언트가 보내는 자유 문자열**이라, 지운 센티널이
 * 다음 저장 요청으로 그대로 다시 들어올 수 있다. 그러면 마이그레이션이 한 일이 조용히
 * 되돌아가고, 읽는 쪽은 그 값을 "이상한 포지션" 으로 화면에 노출한다.
 *
 * ## 왜 'BENCH' 만 특별 취급하지 않는가
 * 센티널 하나만 막으면 `'벤치'`·`'sub'`·오타 같은 **카탈로그 밖의 다른 값**은 그대로
 * 들어온다. 정본이 정한 것은 "후보 개념이 없다" 이지 "BENCH 라는 글자만 없다" 가 아니다.
 * 그래서 **대회 설정의 포지션 카탈로그에 있는 값만** 통과시킨다.
 *
 * ## 카탈로그를 쓸 수 없을 때만 좁힌다
 * 설정이 없거나(`competitionConfigVersionId` 가 가리키는 행이 없음) 카탈로그가 비어 있는
 * 경로에서는 대조할 기준이 없다. 그때는 **폐기한 센티널만** 거부한다 — 기준 없이 전부
 * 막으면 정상 저장을 깨고, 전부 통과시키면 센티널이 되돌아온다.
 *
 * ## 서버가 스스로 쓰는 리터럴은 이 검증을 지나지 않는다
 * 팀 매치 라인업은 `goalkeeper: true` 를 받아 position 을 `'GK'`(GOALKEEPER_MARKER)로
 * **서버가 눌러 담는다.** 풋살 카탈로그에는 `'GK'` 가 없고 `'GOLEIRO'` 가 있으므로,
 * 그 리터럴까지 카탈로그로 재면 풋살 팀매치의 골키퍼 저장이 전부 막힌다(실측). 이
 * 함수는 **클라이언트가 보낸 입력값만** 판정하고, 서버가 나중에 정하는 값은 보지 않는다.
 */

/** 폐기된 후보 센티널. 되돌아오는 것을 막기 위해서만 이름이 남아 있다. */
export const RETIRED_BENCH_SENTINEL = 'BENCH';

/**
 * 통과하지 못하는 첫 값을 돌려준다(없으면 `null`).
 *
 * @param positions 클라이언트가 보낸 position 들. `null`/`undefined` 는 "미지정" 이라 통과.
 * @param catalogCodes 대회 설정의 포지션 코드. 비어 있으면 센티널만 거부하는 모드가 된다.
 */
export function findRejectedLineupPosition(
  positions: readonly (string | null | undefined)[],
  catalogCodes: readonly string[],
): string | null {
  const allowed = new Set(catalogCodes);
  for (const position of positions) {
    if (position === null || position === undefined) continue;
    if (allowed.size === 0) {
      if (position === RETIRED_BENCH_SENTINEL) return position;
      continue;
    }
    if (!allowed.has(position)) return position;
  }
  return null;
}

/** 거부 사유 문구 — 두 저장 경로가 같은 말을 하도록 한 곳에 둔다. */
export function rejectedLineupPositionMessage(position: string): string {
  return `이 종목에 없는 포지션이에요: ${position}`;
}
