/**
 * 상금 배분(prizeBreakdown) 텍스트 ↔ 구조화 행 변환 — 공개 시상 카드와 어드민 편집기의 단일 소스.
 * 저장 포맷은 기존 텍스트("1위 600,000원 / 2위 300,000원")를 유지해 스키마·하위 호환을 지킨다.
 */

export interface PrizeRow {
  label: string;
  /** 자유 텍스트 — 숫자형("600,000원")이면 합계 계산에 포함, "트로피" 같은 비금액도 허용 */
  amount: string;
}

/** 어드민 편집기의 항목 프리셋 (공개 카드 아이콘 매핑과 동일한 라벨) */
export const PRIZE_LABEL_PRESETS = ['1위', '2위', '3위', 'MVP', '득점왕', '도움왕'] as const;

/**
 * 행 구분자는 "/"와 줄바꿈만 사용한다. "·"(가운뎃점)는 행 안에서 물품을 나열하는 용도로
 * 자유 텍스트에 그대로 남겨둔다 (예: "MVP 축구화 · 상품권"은 한 행, "1위 100만원 / MVP 축구화"는 두 행).
 */
export function parsePrizeRows(breakdown: string): PrizeRow[] {
  return breakdown
    .split(/[\/\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(\S+)\s+(.+)$/);
      return m ? { label: m[1], amount: m[2] } : { label: s, amount: '' };
    });
}

/** 편집기 행 → 저장 텍스트. 빈 행은 제외한다. */
export function serializePrizeRows(rows: PrizeRow[]): string {
  return rows
    .map((r) => ({ label: r.label.trim(), amount: r.amount.trim() }))
    .filter((r) => r.label.length > 0)
    .map((r) => (r.amount ? `${r.label} ${r.amount}` : r.label))
    .join(' / ');
}

/**
 * 값이 순수 금액 표기(숫자·콤마·선택적 "원")인지 판정 — trim 후 검사.
 * "600,000원" / "600000" → true, "트로피" / "상품권 10만원 상당" → false(자유 텍스트 = 물품).
 * 공개 카드·시상 페이지·어드민 편집기가 이 함수 하나를 단일 소스로 공유한다.
 */
export function isPrizeAmountValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^[\d,]+원?$/.test(trimmed);
}

/** 금액 값을 정수로 추출 ("600,000원" → 600000). 금액이 아니면(물품) null */
export function prizeAmountDigits(value: string): number | null {
  if (!isPrizeAmountValue(value)) return null;
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

/**
 * 표시/저장용 정규화: 금액이면 "1,234,567원" 형태로 통일, 물품(자유 텍스트)이면 trim한 원본을 그대로 반환.
 * 어드민 편집기 저장 시 행 값 보정과 공개 화면 표시 포맷팅에 공용으로 사용한다.
 */
export function formatPrizeRowValue(value: string): string {
  const n = prizeAmountDigits(value);
  if (n === null) return value.trim();
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 행의 금액이 숫자형이면 정수로, 아니면 null ("600,000원" → 600000, "트로피" → null) */
export function prizeRowAmountValue(row: PrizeRow): number | null {
  return prizeAmountDigits(row.amount);
}

/** 숫자형 금액 행들의 합계 (물품 행은 0으로 취급되어 합계에서 자동 제외) */
export function prizeRowsTotal(rows: PrizeRow[]): number {
  return rows.reduce((sum, r) => sum + (prizeRowAmountValue(r) ?? 0), 0);
}
