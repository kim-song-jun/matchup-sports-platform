/**
 * 리그·대회 개인 기록(득점왕·도움왕)이 비어 있을 때의 안내 문구 — **단일 소스**.
 *
 * 같은 문구가 리그 순위표·시상과 대회 기록 화면에 필요하다. 복붙하면 한쪽만 고쳐져
 * 갈린다 — 실제로 이 저장소에서 같은 매핑이 세 곳에 흩어져 한 곳만 새 분기를 받은
 * 사고가 있었다(채팅방 종류 라벨).
 *
 * 왜 두 갈래인가: 순위가 비는 이유가 두 가지이고 **처방이 다르다**.
 * - `hiddenByEligibility` — 기록은 쌓였는데 선수의 신원 연동·공개 동의가 없어 가려졌다.
 *   득점·도움 전체의 플래그이므로, 빈 개별 순위에 해당 종류의 기록이 있다고 단정할 수 없다.
 * - 그 외 — 아직 확정된 결과가 없다. 기다리는 것 말고 할 일이 없다.
 * 둘을 한 문구로 뭉치면 "연동하면 되는데 그냥 기다리는" 사용자가 생긴다.
 */
export function playerRecordEmptySub(kind: 'goals' | 'assists', hiddenByEligibility: boolean): string {
  const label = kind === 'goals' ? '득점' : '도움';
  return hiddenByEligibility
    ? `선수의 신원 연동과 경기 기록 공개 동의에 따라 공개 가능한 ${label} 기록만 순위에 표시돼요.`
    : `확정된 경기 결과가 쌓이면 ${label} 순위가 나타나요.`;
}

/** 제목도 사유를 따른다 — 기록이 가려진 것을 "기록이 없어요"로 말하면 방금 입력한 기록이 사라진 것처럼 읽힌다. */
export function playerRecordEmptyTitle(hiddenByEligibility: boolean): string {
  return hiddenByEligibility ? '아직 공개할 수 있는 기록이 없어요' : '아직 기록이 없어요';
}

/** 득점·도움을 한 섹션으로 합쳐 보여주는 화면용 설명. */
export function playerRecordsCombinedEmptySub(hiddenByEligibility: boolean): string {
  return hiddenByEligibility
    ? '기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 득점·도움 순위가 공개돼요.'
    : '확정된 경기 결과가 쌓이면 득점·도움 순위가 나타나요.';
}
