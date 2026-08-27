/**
 * 리그 개인 기록(득점왕·도움왕)이 비어 있을 때의 안내 문구 — **단일 소스**.
 *
 * 같은 문구가 순위표(`league-match-standings-client.tsx`)와 시상
 * (`awards/league-awards-page-client.tsx`) 두 화면에 필요하다. 복붙하면 한쪽만 고쳐져
 * 갈린다 — 실제로 이 저장소에서 같은 매핑이 세 곳에 흩어져 한 곳만 새 분기를 받은
 * 사고가 있었다(채팅방 종류 라벨).
 *
 * 왜 두 갈래인가: 순위가 비는 이유가 두 가지이고 **처방이 다르다**.
 * - `hiddenByEligibility` — 기록은 쌓였는데 선수의 신원 연동·공개 동의가 없어 가려졌다.
 *   할 일이 있는 상태다.
 * - 그 외 — 아직 확정된 결과가 없다. 기다리는 것 말고 할 일이 없다.
 * 둘을 한 문구로 뭉치면 "연동하면 되는데 그냥 기다리는" 사용자가 생긴다.
 */
export function leagueRecordEmptySub(kind: 'goals' | 'assists', hiddenByEligibility: boolean): string {
  const label = kind === 'goals' ? '득점' : '도움';
  return hiddenByEligibility
    ? `${label} 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.`
    : `확정된 경기 결과가 쌓이면 ${label} 순위가 나타나요.`;
}
