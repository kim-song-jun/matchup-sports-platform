/**
 * 공개 화면의 사이드 이름. `null`(배정은 됐지만 모집 중이라 가려짐)과 `'TBD'`/빈 값(아직 팀 없음)은
 * 다른 상태라 "비공개"와 "미정"을 섞지 않는다. 팀이 없는 사이드에 자리 라벨("A조 1위")이 있으면
 * "미정"보다 그 라벨을 먼저 보여 준다.
 */
export function publicFixtureSideLabel(name: string | null, slotLabel: string | null | undefined): string {
  if (name === null) return '비공개';
  if (name === '' || name === 'TBD') return slotLabel || '미정';
  return name;
}
