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

export function parsePrizeRows(breakdown: string): PrizeRow[] {
  return breakdown
    .split(/[\/·\n]+/)
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

/** 행의 금액이 숫자형이면 정수로, 아니면 null ("600,000원" → 600000, "트로피" → null) */
export function prizeRowAmountValue(row: PrizeRow): number | null {
  const digits = row.amount.replace(/[^0-9]/g, '');
  if (!digits) return null;
  // 숫자·콤마·"원"·공백 외 문자가 섞여 있으면 비금액 항목(예: "상품권 10만원 상당")으로 취급
  const stripped = row.amount.replace(/[0-9,원\s]/g, '');
  return stripped.length === 0 ? parseInt(digits, 10) : null;
}

/** 숫자형 금액 행들의 합계 */
export function prizeRowsTotal(rows: PrizeRow[]): number {
  return rows.reduce((sum, r) => sum + (prizeRowAmountValue(r) ?? 0), 0);
}
