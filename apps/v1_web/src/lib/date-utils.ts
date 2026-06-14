/**
 * 공유 날짜 포맷터 — v1_web 전역 단일 소스.
 *
 * 로컬 포맷터 금지 규칙에 따라, 날짜 문자열을 다루는 모든 컴포넌트는
 * 이 파일의 함수를 import하여 사용해야 해요. 로컬에 동일 포맷터 정의 금지.
 *
 * 대회(Tournament) 날짜 표기 기준:
 *   - compact 슬롯 (홈 티저 · 목록 카드): formatTournamentDateShort  → 'M/D (요일)'
 *   - 상세 슬롯 (대회 상세 페이지):        formatTournamentDateLong   → 'YYYY년 M월 D일 (요일)'
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/**
 * compact 슬롯용 짧은 형식: 'M/D (요일)'
 * 홈 티저 카드 · 대회 목록 카드에서 사용해요.
 * dateStr 이 없거나 invalid 이면 null 반환.
 */
export function formatTournamentDateShort(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

/**
 * 상세 슬롯용 긴 형식: 'YYYY년 M월 D일 (요일)'
 * 대회 상세 페이지에서 사용해요.
 * dateStr 이 없거나 invalid 이면 '날짜 미정' 반환.
 */
export function formatTournamentDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '날짜 미정';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '날짜 미정';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}
