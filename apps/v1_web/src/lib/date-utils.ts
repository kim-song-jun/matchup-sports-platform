/**
 * 공유 날짜/금액 포맷터 — v1_web 전역 단일 소스.
 *
 * 로컬 포맷터 금지 규칙에 따라, 날짜 문자열·금액을 다루는 모든 컴포넌트는
 * 이 파일의 함수를 import하여 사용해야 해요. 로컬에 동일 포맷터 정의 금지.
 *
 * 대회(Tournament) 날짜 표기 기준:
 *   - compact 슬롯 (홈 티저 · 목록 카드): formatTournamentDateShort  → 'M/D (요일)'
 *   - compact 범위 슬롯:                 formatTournamentDateRangeShort → 'M/D (요일)~M/D (요일)'
 *   - 상세 슬롯 (대회 상세 페이지):        formatTournamentDateLong   → 'YYYY년 M월 D일 (요일)'
 *   - 상세 일시 슬롯 (마감 안내):          formatTournamentDateTimeLong → 'YYYY년 M월 D일 (요일) 오후 H:mm'
 *   - 상세 범위 슬롯:                    formatTournamentDateRangeLong
 *   - 대회 상세 페이지 "일정" 슬롯(시각 포함): formatTournamentDateRangeWithTime
 *     → 'M/D (요일) HH:MM ~ M/D (요일) HH:MM' (같은 날이면 'M/D (요일) HH:MM~HH:MM'로 압축).
 *     대회 상세 페이지의 일정 표시 전용 — 참가비/장소처럼 시각이 불필요한 다른 슬롯은
 *     그대로 formatTournamentDateRangeShort/Long 사용.
 *
 * 금액 포맷터:
 *   - formatEntryFee(fee)   → 0이면 '무료', 그 외 'N원' (ko-KR 천 단위 구분)
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

export function formatTournamentDateRangeShort(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): string | null {
  const start = formatTournamentDateShort(startStr);
  if (!start) return null;
  const end = formatTournamentDateShort(endStr);
  if (!end || end === start) return start;
  return `${start}~${end}`;
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

/**
 * 상세 일시 슬롯용 형식: 'YYYY년 M월 D일 (요일) 오후 H:mm'
 * 신청 마감처럼 날짜와 시각을 함께 확인해야 하는 화면에서 사용해요.
 * dateStr 이 없거나 invalid 이면 '일정 미정' 반환.
 */
export function formatTournamentDateTimeLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '일정 미정';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '일정 미정';

  const hour = d.getHours();
  const period = hour < 12 ? '오전' : '오후';
  const displayHour = hour % 12 || 12;
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]}) ${period} ${displayHour}:${minute}`;
}

export function formatTournamentDateRangeLong(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): string {
  const start = formatTournamentDateLong(startStr);
  if (start === '날짜 미정') return start;
  const end = formatTournamentDateLong(endStr);
  if (end === '날짜 미정' || end === start) return start;
  return `${start} ~ ${end}`;
}

/**
 * 대회 상세 페이지 "일정" 슬롯 전용: 날짜+시각 범위 'M/D (요일) HH:MM ~ M/D (요일) HH:MM'.
 * 시작·종료가 같은 날이면 날짜 반복을 생략하고 'M/D (요일) HH:MM~HH:MM'로 압축한다.
 * startStr 이 없거나 invalid 이면 null 반환.
 */
export function formatTournamentDateRangeWithTime(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
): string | null {
  if (!startStr) return null;
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return null;

  const startDateLabel = formatTournamentDateShort(startStr);
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const startFull = `${startDateLabel} ${startTime}`;

  if (!endStr) return startFull;
  const end = new Date(endStr);
  if (Number.isNaN(end.getTime())) return startFull;

  const endDateLabel = formatTournamentDateShort(endStr);
  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

  if (endDateLabel === startDateLabel) {
    if (endTime === startTime) return startFull;
    return `${startFull}~${endTime}`;
  }
  return `${startFull} ~ ${endDateLabel} ${endTime}`;
}

/**
 * 참가비 포맷터: 0이면 '무료', 그 외 ko-KR 천 단위 구분 + '원'.
 * 예) 0 → '무료', 30000 → '30,000원'
 */
export function formatEntryFee(fee: number): string {
  if (fee === 0) return '무료';
  return `${fee.toLocaleString('ko-KR')}원`;
}

/**
 * 관리자 운영 화면 공용 일시 포맷터: 'YYYY.M.D HH:MM'
 * 대회 도메인 밖의 관리자 로그/운영 테이블(예: 웹 푸시 실패 로그)에서 사용해요.
 * dateStr 이 없거나 invalid 이면 원본 문자열을 그대로 반환.
 */
export function formatAdminDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${hour}:${minute}`;
}
