/**
 * team-record-result.ts
 *
 * 프로덕션 실측 버그: 대회 결승이 정규시간 1:1, 승부차기 2:3 이었는데 양팀의
 * `v1_team_record_facts.result` 가 둘 다 "무(DRAWN)"로 기록됐다.
 * `GameResultOfficialFactsService.project()` 가 `goalsFor`/`goalsAgainst`
 * (정규시간 스코어) 만 비교해 WON/DRAWN/LOST 를 정했기 때문이다 -- 리비전
 * `score` 에는 `penalties: { home, away }` 가 이미 들어 있는데도 무시됐다.
 *
 * 이 판정을 순수 함수로 뽑아 둔 이유는 "같은 문장이 두 곳에 따로 적히면
 * 반드시 갈린다"는 이 저장소의 반복된 교훈(`parseOfficialScore` 의 파일
 * doc 참고) 을 이번에도 피하기 위해서다 -- `GameResultOfficialFactsService.
 * project()`(라이브 outbox 경로 + `team-record-facts-backfill.ts` 재사용)가
 * 이 함수를 그대로 호출한다. 과거에 이미 잘못 기록된 행을 고치는 마이그레이션
 * (`20260818160000_v1_team_record_facts_penalty_result`)은 raw SQL이라 이
 * TS 함수를 직접 import 할 수 없으므로, 그 파일 상단 주석에 아래와 정확히
 * 같은 문장을 명시적으로 옮겨 적어 두었다 -- 둘 중 하나를 고칠 땐 반드시
 * 다른 쪽도 함께 봐야 한다.
 */

/**
 * 한 팀 관점에서 승/무/패를 정한다.
 *
 * 규칙:
 *   1. 정규시간(`goalsFor`/`goalsAgainst`)이 다르면 그걸로 끝 -- 승부차기 값이
 *      있어도 정규시간 결과를 절대 뒤집지 않는다(정규시간이 이겼는데 승부차기
 *      값이 같이 들어오는 건 있을 수 없는 조합이지만, 방어적으로 정규시간을
 *      최우선으로 둔다).
 *   2. 정규시간이 같고 승부차기 점수(`penaltiesFor`/`penaltiesAgainst`)가 둘 다
 *      주어졌으면 그걸로 승패를 가른다.
 *   3. 정규시간도 같고 승부차기도 없거나 같으면 DRAWN 그대로.
 */
export function resolveTeamRecordResult(
  goalsFor: number,
  goalsAgainst: number,
  penaltiesFor: number | undefined,
  penaltiesAgainst: number | undefined,
): 'WON' | 'DRAWN' | 'LOST' {
  if (goalsFor > goalsAgainst) return 'WON';
  if (goalsFor < goalsAgainst) return 'LOST';
  if (penaltiesFor !== undefined && penaltiesAgainst !== undefined) {
    if (penaltiesFor > penaltiesAgainst) return 'WON';
    if (penaltiesFor < penaltiesAgainst) return 'LOST';
  }
  return 'DRAWN';
}
