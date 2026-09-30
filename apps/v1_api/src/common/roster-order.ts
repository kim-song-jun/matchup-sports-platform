export interface RosterOrderKey {
  jerseyNumber: number | null;
  /** 화면에 실제로 나가는 이름. 이름이 가려진 행은 빈 문자열을 넘긴다(숨긴 이름의 순서가 새지 않게 id 로 갈린다). */
  name: string;
  id: string;
}

/**
 * 명단 표시 순서 — 등번호 오름차순, 번호 없는 선수는 뒤, 같으면 표시 이름순(ko), 그래도 같으면 id.
 * 저장 순서(라인업을 뺐다 되돌리면 맨 뒤로 간다)에 기대지 않으려고 명단을 내보내는 자리마다 이 함수로 정렬한다.
 */
export function compareRosterOrder(a: RosterOrderKey, b: RosterOrderKey): number {
  if (a.jerseyNumber !== b.jerseyNumber) {
    if (a.jerseyNumber === null) return 1;
    if (b.jerseyNumber === null) return -1;
    return a.jerseyNumber - b.jerseyNumber;
  }
  return a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id);
}
