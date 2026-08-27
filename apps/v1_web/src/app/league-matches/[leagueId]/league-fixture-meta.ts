import type { V1LeagueFixture } from '@/types/league-match';

/**
 * 리그 대진(fixture) 상태·결과 표기의 단일 소스.
 *
 * 원래 league-match-standings-client.tsx 로컬 함수였는데, 리그 경기 상세 페이지
 * (fixtures/[fixtureId])가 같은 판정을 그대로 써야 해서 여기로 옮겼다 — 두 화면이
 * 같은 경기를 서로 다른 상태("예정" vs "결과 대기")로 부르면 사용자는 그것을 다른
 * 개념으로 읽는다(lib/league-state-meta.ts와 같은 이유).
 */

/**
 * 리그 대진(fixture)은 팀 매칭(team-match) 레코드 그대로다 — status는
 * V1TeamMatchApiStatus(모집 중/마감/매칭됨/취소됨/완료/기한 만료)와 같은 값을 쓴다.
 * 이 화면은 public 페이지라 관리자 전용 AdminStatusPill(components/admin — /admin
 * 라우트 밖에서 쓰인 전례가 없다)을 끌어오지 않고, team-matches-page.tsx 등 다른
 * public 화면이 이미 쓰는 "tm-badge 로컬 라벨 매핑" 관례를 그대로 따른다.
 */
const FIXTURE_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  recruiting: { label: '모집 중', badgeClass: 'tm-badge-blue' },
  closed: { label: '마감', badgeClass: 'tm-badge-orange' },
  matched: { label: '매칭됨', badgeClass: 'tm-badge-green' },
  cancelled: { label: '취소됨', badgeClass: 'tm-badge-red' },
  completed: { label: '완료', badgeClass: 'tm-badge-grey' },
  expired: { label: '기한 만료', badgeClass: 'tm-badge-grey' },
};

export function fixtureStatusMeta(status: string): { label: string; badgeClass: string } {
  return FIXTURE_STATUS_META[status] ?? { label: status, badgeClass: 'tm-badge-grey' };
}

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
 * **킥오프 시각이 이미 지난 대진도 '결과 대기'로 본다(감사 L-I 후속).** 이 저장소의 리그
 * 대진은 생성 시 status='matched' 로 시작해 결과가 제출돼야 비로소 'completed' 로 바뀐다
 * (league-match-admin.service.ts, games.service.ts). 즉 킥오프는 지났는데 아직 아무도
 * 결과를 입력하지 않은 대진은 status 가 여전히 'matched' 로 남는다 — status만 보던
 * 이전 버전은 이 구간을 '예정'으로 오분류했다(결과 미입력 리마인더가 킥오프+24h 에
 * 발화하도록 설계돼 있을 만큼, 이 구간은 매 대진마다 최소 하루는 정상적으로 발생한다).
 * status 대신 "지금이 킥오프 이후인가"로 직접 판정해 status 값과 무관하게 잡는다.
 */
export function fixtureResultLabel(fixture: V1LeagueFixture): { text: string; hasScore: boolean; isForfeit: boolean } {
  if (fixture.status === 'cancelled') {
    return { text: '집계 제외', hasScore: false, isForfeit: false };
  }
  if (typeof fixture.homeScore === 'number' && typeof fixture.awayScore === 'number') {
    // 몰수는 스코어만 보면 실제 1:0 승리와 똑같이 읽힌다 — 점수는 그대로 두고 별도
    // 뱃지로 구분한다. 색만으로 알리지 않도록 "몰수" 텍스트를 함께 싣는다.
    return { text: `${fixture.homeScore} : ${fixture.awayScore}`, hasScore: true, isForfeit: fixture.isForfeit === true };
  }
  const kickoffPassed = new Date(fixture.startAt).getTime() <= Date.now();
  return { text: fixture.status === 'completed' || kickoffPassed ? '결과 대기' : '예정', hasScore: false, isForfeit: false };
}

/**
 * 이슈 3(감사 보통) — "예정"으로 봐야 할 대진 = 각 행에 실제로 **'예정'이라고 찍히는** 대진.
 *
 * 판정을 fixtureResultLabel 과 **같은 기준으로 맞춘다.** 스코어가 없다고 다 '예정'인 게 아니다 —
 * 이미 치렀지만 공식 결과가 아직 안 붙은 대진에는 그 함수가 '결과 대기'를 찍는다(status가
 * 'completed'인 경우뿐 아니라, 감사 L-I 후속으로 킥오프 시각이 이미 지났는데 결과가 아직
 * 제출조차 안 된 status='matched' 대진도 이제 같은 기준에 포함된다). 그런데도 필터가 그걸
 * '예정'으로 세면, "예정만 보기"를 켰을 때 화면엔 '결과 대기'라고 적힌 행이 섞여 나오고
 * "다음 경기" 강조도 지난 경기에 붙는다.
 */
export function isUpcomingFixture(fixture: V1LeagueFixture): boolean {
  return fixtureResultLabel(fixture).text === '예정';
}

export interface TeamLookupEntry {
  name: string;
  logoUrl: string | null;
}
