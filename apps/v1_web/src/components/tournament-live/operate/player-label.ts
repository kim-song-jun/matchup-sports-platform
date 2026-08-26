/**
 * 선수 표시 라벨. 등번호가 없을 때 무엇을 그릴지 한 곳에서 정한다.
 *
 * 예전에는 각 화면이 제각각 `jerseyNumber ?? '-'` 를 썼는데, 등번호가 비면 이름 앞에 맨
 * `-` 가 붙어 `- 큐에이04` 처럼 오타로 읽혔다(2026-08-18 로컬 실화면 확인 — 등번호가
 * 채워진 라인업에서는 `5 지원수` 로 정상이라, 데이터에 따라 나타나는 결함이었다).
 * 자리표시자를 그리지 않고 **번호 자체를 생략**한다 — 칸 폭은 호출부가 유지하므로
 * 목록 정렬은 흐트러지지 않는다.
 */
export function formatPlayerLabel(
  jerseyNumber: number | null | undefined,
  displayName: string,
): string {
  return typeof jerseyNumber === 'number' ? `${jerseyNumber} ${displayName}` : displayName;
}

/** JSX 에서 번호 칸에 넣을 값. 없으면 빈 문자열 — 요소는 남겨 정렬을 지킨다. */
export function jerseyText(jerseyNumber: number | null | undefined): string {
  return typeof jerseyNumber === 'number' ? String(jerseyNumber) : '';
}
