/**
 * UX 감사 item 4 — 같은 운영 콘솔 화면 안에서 피리어드를 "전반"(커맨드
 * 버튼), "1피리어드"(경과 시간 aria-label, 액션 캡처 캡션), "1P"(기록된
 * 이벤트 칩) 세 가지로 다르게 불렀다. 하나로 통일한다 — 이 화면의 실사용자
 * (경기장에서 폰으로 급박하게 쓰는 동호회 총무)에게 가장 자연스러운 실제
 * 축구/풋살 용어인 "전반/후반"을 canonical 용어로 선택했다:
 *   - "피리어드"는 기술적 표현이라 실사용자에게 덜 직관적이고, "N피리어드"는
 *     `기록된 이벤트` 칩처럼 공간이 빠듯한 곳에서 "1P"보다 길다.
 *   - "전반"/"후반"은 오히려 "1P"보다도 짧아(2자) 압축된 칩에서도 유리하다.
 * 축구/풋살은 항상 정확히 2피리어드(`competition-config.presets.ts`)라
 * 1/2에는 전반/후반이 자연스럽게 맞아떨어진다. 이 화면이 다루는 종목이
 * 늘어나(T1-5 범위) 3피리어드 이상이 되면 "전반/후반"이 뜻을 잃으므로 그때는
 * 번호 기반 폴백("N피리어드")을 쓴다 — `nextPeriodCommandLabel`이 이미 이
 * 폴백 필요성을 문서화해 뒀던 것과 같은 이유다.
 */
export function periodLabel(periodNumber: number, periodCount?: number | null): string {
  if (periodCount === 1 && periodNumber === 1) return '경기';
  if (periodNumber === 1) return '전반';
  if (periodNumber === 2) return '후반';
  return `${periodNumber}피리어드`;
}

/** 단판(정규 피리어드 1개) — 피리어드를 가를 이유가 없어 시각 앞의 "전반" 같은 말머리를 뺀다. */
export function isSinglePeriod(periodCount: number | null | undefined): boolean {
  return periodCount === 1;
}

/** "5:00" 같은 시각 앞에 붙는 말머리(끝 공백 포함). 단판이면 빈 문자열이다. */
export function periodPrefix(periodNumber: number, periodCount?: number | null): string {
  return isSinglePeriod(periodCount) ? '' : `${periodLabel(periodNumber)} `;
}

/** 현재 피리어드를 끝내는 버튼 문구. 단판의 유일한 정규 피리어드는 "정규 시간 종료"다. */
export function endPeriodLabel(periodNumber: number, periodCount?: number | null): string {
  return isSinglePeriod(periodCount) && periodNumber === 1 ? '정규 시간 종료' : `${periodLabel(periodNumber)} 종료`;
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
