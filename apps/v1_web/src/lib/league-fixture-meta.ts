import type { V1LeagueFixture } from '@/types/league-match';
import { leagueFixturePhase } from './competition-status';
import { matchPhaseLabel } from './v1-status-labels';

/**
 * 리그 대진(fixture)의 결과 문구 — 리그 일정·경기 상세·대회 표면 리그 카드가 같이 쓴다.
 * 경기 단계(예정·결과 대기·종료…)와 칩은 `lib/competition-status.ts` 가 정한다.
 *
 * ⚠️ **대회 어휘와 섞지 않는다.** 대회 대진의 status 는 `scheduled | completed` 이고
 * 리그는 `matched | completed | cancelled | ...` 다 — 한 함수가 두 어휘를 받으면
 * `status === 'scheduled'` 같은 코드가 모든 리그 경기에서 조용히 거짓이 된다.
 */

/** 점수가 정책상 가려진 대진의 결과 문구. 상세 화면의 "점수와 선수 기록은 공개되지 않아요" 와 같은 사실을 목록 폭에 맞춰 적는다. */
export const SCORE_HIDDEN_LABEL = '점수 비공개';

/**
 * 점수 필드(homeScore/awayScore)는 값이 없을 수 있다(미확정 대진) — 그때는 0:0으로
 * 오인되지 않게 상태 기반 문구로 대체한다.
 *
 * **취소된 대진은 점수가 있어도 점수를 보여주지 않는다.** 순위표는 취소 대진을 완전히
 * 제외하는데(R8) 일정 목록에만 "취소됨 1 : 0"이 굵게 남으면, 존재하는 점수가 왜 순위에
 * 반영되지 않는지 알 수 없다 — 같은 화면 안에서 두 집계가 서로 다른 말을 하게 된다.
 * 대신 "집계 제외"라고 명시해 그 경기가 기록에서 빠졌음을 그대로 읽히게 한다.
 * (취소 대진에 '예정'이 붙던 문제도 여기서 함께 사라진다.)
 *
 * **몰수 결과는 점수 옆에 뱃지로 구분한다.** 몰수는 1:0 으로 기록되는데, 그대로 두면
 * 실제로 치러진 1:0 승리와 화면에서 완전히 같아 보인다 — 관전자가 "이 팀이 이겼다"와
 * "상대가 안 나왔다"를 구분할 수 없다.
 *
 * 점수가 없는 대진의 문구는 경기 단계(`leagueFixturePhase` — 킥오프가 지나면 '결과 대기')를 그대로 쓴다.
 */
export function fixtureResultLabel(fixture: V1LeagueFixture): { text: string; hasScore: boolean; isForfeit: boolean } {
  if (fixture.status === 'cancelled') {
    return { text: '집계 제외', hasScore: false, isForfeit: false };
  }
  // 가려진 점수는 '결과 대기' 로 떨어뜨리지 않는다 — 결과는 확정돼 있고 공개만 안 되는
  // 상태라 그 문구는 거짓이다. 경기 상세가 쓰는 "점수는 공개되지 않아요" 와 같은 말을 한다.
  if (fixture.scoreHidden === true) {
    return { text: SCORE_HIDDEN_LABEL, hasScore: false, isForfeit: false };
  }
  if (typeof fixture.homeScore === 'number' && typeof fixture.awayScore === 'number') {
    // 몰수는 스코어만 보면 실제 1:0 승리와 똑같이 읽힌다 — 점수는 그대로 두고 별도
    // 뱃지로 구분한다. 색만으로 알리지 않도록 "몰수" 텍스트를 함께 싣는다.
    return { text: `${fixture.homeScore} : ${fixture.awayScore}`, hasScore: true, isForfeit: fixture.isForfeit === true };
  }
  return { text: matchPhaseLabel(leagueFixturePhase(fixture)), hasScore: false, isForfeit: false };
}

/** "예정만 보기"·"다음 경기" 기준 — 행에 '예정'이라고 찍히는 대진과 같은 판정(결과 대기는 예정이 아니다). */
export function isUpcomingFixture(fixture: V1LeagueFixture): boolean {
  return leagueFixturePhase(fixture) === 'scheduled';
}

export interface TeamLookupEntry {
  name: string;
  logoUrl: string | null;
}

export interface LeagueSideLabels {
  /** 자리는 있는데 팀이 아직 없을 때. */
  tbd: string;
  /** 팀은 정해졌지만 이름 맵에서 못 찾았을 때. */
  unknown: string;
}

export function leagueSideLabel(
  teamId: string | null,
  nameById: ReadonlyMap<string, string>,
  labels: LeagueSideLabels,
): string {
  if (teamId === null) return labels.tbd;
  return nameById.get(teamId) ?? labels.unknown;
}

/**
 * 어드민 표·알림 문구의 "홈 vs 원정". 원정이 null 일 때 둘을 가른다: 원정 **자리**가 있으면 아직 안 정해진
 * 경기("원정팀 미정"), 자리가 없으면 예전부터 있던 부전승이다.
 */
export function leagueFixtureMatchupLabel(
  fixture: Pick<V1LeagueFixture, 'homeTeamId' | 'awayTeamId' | 'awaySlotId'>,
  nameById: ReadonlyMap<string, string>,
): string {
  const home = leagueSideLabel(fixture.homeTeamId, nameById, { tbd: '홈팀 미정', unknown: '홈팀' });
  if (fixture.awayTeamId !== null) {
    return `${home} vs ${leagueSideLabel(fixture.awayTeamId, nameById, { tbd: '원정팀 미정', unknown: '원정팀' })}`;
  }
  return fixture.awaySlotId == null ? `${home} 부전승` : `${home} vs 원정팀 미정`;
}
