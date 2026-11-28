/**
 * 경기 시간 구간의 이름. 화면 어디서나 같은 말을 쓴다 — 정규 구간이 둘이면 "전반"·"후반"이고, 정규 구간 뒤는
 * 연장이다(단판은 "경기" 뒤가 연장 전반·후반). 정규 구간이 셋 이상인 경기(`periodCount`)와 그 밖의 구간은 번호로 부른다.
 */
export function periodLabel(periodNumber: number, periodCount?: number | null): string {
  if (periodCount === 1) {
    if (periodNumber === 1) return '경기';
    if (periodNumber === 2) return '연장 전반';
    if (periodNumber === 3) return '연장 후반';
    return `${periodNumber}번째 경기 시간`;
  }
  if (periodNumber === 1) return '전반';
  if (periodNumber === 2) return '후반';
  const regularCount = periodCount ?? 2;
  if (periodNumber === 3 && regularCount < 3) return '연장 전반';
  if (periodNumber === 4 && regularCount < 3) return '연장 후반';
  return `${periodNumber}번째 경기 시간`;
}

/** 단판(정규 구간 1개) — 구간을 가를 이유가 없어 시각 앞의 "전반" 같은 말머리를 뺀다. */
export function isSinglePeriod(periodCount: number | null | undefined): boolean {
  return periodCount === 1;
}

/** "5:00" 같은 시각 앞에 붙는 말머리(끝 공백 포함). 단판이면 빈 문자열이다. */
export function periodPrefix(periodNumber: number, periodCount?: number | null): string {
  return isSinglePeriod(periodCount) ? '' : `${periodLabel(periodNumber, periodCount)} `;
}

/** 지금 구간을 끝내는 버튼 문구. 단판의 유일한 정규 구간은 "정규 시간 종료"다. */
export function endPeriodLabel(periodNumber: number, periodCount?: number | null): string {
  return isSinglePeriod(periodCount) && periodNumber === 1 ? '정규 시간 종료' : `${periodLabel(periodNumber, periodCount)} 종료`;
}

/**
 * 운영 상태의 피리어드 행에서 정규 피리어드 수를 센다. 연장 피리어드도 행이 되므로 길이 설정(`periodDurations`)의
 * `extraTime` 로 뺀다. 길이 설정이 없으면(레거시 `{count}` 설정) 연장 개념이 없으니 행 수가 곧 정규 수다.
 */
export function regularPeriodCountOf(
  periodRowCount: number,
  periodDurations: ReadonlyArray<{ extraTime: boolean } | null> | null | undefined,
): number | null {
  if (periodRowCount === 0) return null;
  if (!periodDurations) return periodRowCount;
  const regular = periodDurations.filter((entry) => entry === null || !entry.extraTime).length;
  return regular > 0 ? regular : null;
}
