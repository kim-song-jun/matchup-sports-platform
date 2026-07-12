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

function isAsciiDigit(value: string): boolean {
  return value >= '0' && value <= '9';
}

/** 천 단위 콤마 판정 — 양쪽이 모두 숫자인 ","만 보존한다 (스플리터·직렬화 정규화 공용 규칙) */
function isThousandsComma(text: string, index: number): boolean {
  return (
    text[index] === ',' &&
    isAsciiDigit(text[index - 1] ?? '') &&
    isAsciiDigit(text[index + 1] ?? '')
  );
}

/**
 * prizeBreakdown 텍스트 → 항목(segment) 분리 — 공개 상세 칩과 시상/어드민 행이 공유하는 단일 스플리터.
 * 구분자 규칙:
 * - "/"·줄바꿈은 항상 구분자.
 * - ","는 양쪽이 숫자면 천 단위 콤마("600,000")로 보존, 아니면 구분자("…원, MVP 축구화").
 * - "·"(가운뎃점)는 구분하지 않고 항목 안에 보존 — 물품 나열용("MVP 축구화 · 상품권"은 한 항목).
 * 예: "1위 600,000원, MVP 축구화 / 참가팀 전원 음료 제공" → 3항목.
 */
export function splitPrizeSegments(breakdown: string): string[] {
  const segments: string[] = [];
  let current = '';

  for (let index = 0; index < breakdown.length; index += 1) {
    const char = breakdown[index];
    const isSeparator =
      char === '/' || char === '\n' || (char === ',' && !isThousandsComma(breakdown, index));

    if (isSeparator) {
      const segment = current.trim();
      if (segment) segments.push(segment);
      current = '';
    } else {
      current += char;
    }
  }

  const last = current.trim();
  if (last) segments.push(last);
  return segments;
}

/** 항목 텍스트 → {label, amount} 행. 예: "1위 1,000,000원 / MVP 축구화"는 두 행. */
export function parsePrizeRows(breakdown: string): PrizeRow[] {
  return splitPrizeSegments(breakdown).map((s) => {
    const m = s.match(/^(\S+)\s+(.+)$/);
    return m ? { label: m[1], amount: m[2] } : { label: s, amount: '' };
  });
}

/**
 * 라벨·값 안의 행 구분자 문자를 나열 표기로 정규화 — 저장 텍스트를 재파싱해도 행이 쪼개지지
 * 않게 한다(round-trip 보호). "/"와 비-천단위 콤마는 주변 공백째로 "·"(나열 의미 보존)로 접고,
 * 줄바꿈은 공백으로 치환한다. 천 단위 콤마("600,000")는 splitPrizeSegments와 동일 규칙으로 보존.
 * 예: "티셔츠/모자" → "티셔츠·모자", "음료, 간식" → "음료·간식".
 */
function sanitizePrizeCellText(text: string): string {
  const flattened = text.replace(/\n+/g, ' ');
  let out = '';
  for (let index = 0; index < flattened.length; index += 1) {
    const char = flattened[index];
    const isRowSeparatorChar =
      char === '/' || (char === ',' && !isThousandsComma(flattened, index));
    if (isRowSeparatorChar) {
      out = out.replace(/[\s·]+$/, '') + '·';
      while (index + 1 < flattened.length && /\s/.test(flattened[index + 1])) index += 1;
    } else {
      out += char;
    }
  }
  // 값이 구분자 문자로 시작/끝나면 트레일링 '·'가 남으므로 양끝을 정리한다.
  return out.trim().replace(/^·+|·+$/g, '').trim();
}

/** 편집기 행 → 저장 텍스트. 빈 행은 제외하고, 셀 안의 행 구분자 문자는 나열 표기로 정규화한다. */
export function serializePrizeRows(rows: PrizeRow[]): string {
  return rows
    .map((r) => ({ label: sanitizePrizeCellText(r.label), amount: sanitizePrizeCellText(r.amount) }))
    .filter((r) => r.label.length > 0)
    .map((r) => (r.amount ? `${r.label} ${r.amount}` : r.label))
    .join(' / ');
}

/**
 * 값이 순수 금액 표기(숫자·콤마·선택적 "원")인지 판정 — 공백 정규화 후 검사.
 * "600,000원" / "600000" / "600,000 원" → true, "트로피" / "상품권 10만원 상당" → false(자유 텍스트 = 물품).
 * 숫자·콤마·"원" 사이 공백은 표기 편차로 보고 제거한 뒤 분류한다.
 * 공개 카드·시상 페이지·어드민 편집기가 이 함수 하나를 단일 소스로 공유한다.
 */
export function isPrizeAmountValue(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  // 콤마만 있는 값(",")이 금액으로 오분류되지 않도록 숫자 1개 이상을 요구한다.
  return /\d/.test(compact) && /^[\d,]+원?$/.test(compact);
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
