/**
 * 금액 입력 필드용 천 단위 콤마 포맷 헬퍼.
 * state에는 숫자 문자열만 보관하고, 표시할 때만 콤마를 입힌다.
 */

/** 입력값에서 숫자만 추출 ("40,000원" → "40000") */
export function onlyDigits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/** 숫자 문자열에 천 단위 콤마 ("40000" → "40,000", "" → "") */
export function formatWithComma(digits: string): string {
  if (!digits) return '';
  const n = Number(digits);
  if (Number.isNaN(n)) return '';
  return n.toLocaleString('ko-KR');
}
