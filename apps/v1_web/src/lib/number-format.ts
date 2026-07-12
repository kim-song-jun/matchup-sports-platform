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

/**
 * 값이 숫자(콤마 포함)로만 구성되면 천 단위 콤마로 재포맷하고, 그 외 자유 텍스트는 원본 그대로 반환.
 * "금액 또는 물품"을 한 입력칸에서 받는 필드(예: 상금 배분 행)에서, 숫자 입력에만 실시간 콤마 포맷을
 * 적용하고 자유 텍스트 타이핑은 건드리지 않기 위한 헬퍼.
 */
export function formatIfNumeric(value: string): string {
  const digitsOnly = value.replace(/,/g, '');
  if (digitsOnly.length === 0 || !/^[0-9]+$/.test(digitsOnly)) return value;
  return formatWithComma(digitsOnly);
}
