/**
 * 리그 대진 **날짜 다중선택 캘린더**의 순수 규칙.
 *
 * ## 왜 달력인가 (사용자 A안, 2026-09-04)
 * 서버는 요일을 모르고 **날짜 목록**을 받는다. 서버 DTO 주석이 그 이유를 이미 적어 뒀다 —
 * *"요일로 고르고 싶으면 화면이 날짜 목록으로 전개해서 보낸다. 그래야 명절·구장 사정으로
 * 한 주를 건너뛰거나 날짜를 옮기는 것을 표현할 수 있다."*
 * 그런데 화면은 요일을 골라 **보이지 않는 곳에서** 전개하고 있어서, 운영자가 전개 결과를
 * 확인하거나 특정 주를 빼는 것이 불가능했다. 달력은 그 목록을 **보이게** 만든다.
 *
 * ## 날짜는 KST 달력 날짜다
 * `'YYYY-MM-DD'` 는 한국 달력의 그 날이다. 브라우저 타임존으로 계산하면 해외에서 접속한
 * 운영자와 국내 운영자가 **다른 날을 고르게 된다** — 오프셋을 명시적으로 더하고 뺀다
 * (`league-fixture-dates.ts` 와 같은 관례).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC 인스턴트를 KST 달력 날짜 문자열로. */
function toKstDateString(instant: Date): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `'YYYY-MM-DD'`(KST 자정)의 UTC 인스턴트 밀리초. */
function kstMidnightMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) - KST_OFFSET_MS;
}

export interface CalendarCell {
  /** `'YYYY-MM-DD'`. */
  readonly date: string;
  /** 이 달의 날인가. 앞뒤로 채워 넣은 이웃 달 칸은 `false`. */
  readonly inMonth: boolean;
  /** 오늘(KST)보다 이전인가 — 과거는 서버가 422 로 거부하므로 고를 수 없다. */
  readonly past: boolean;
  /** 0(일)~6(토). */
  readonly weekday: number;
}

/**
 * `'YYYY-MM'` 한 달의 달력 격자. **일요일 시작 6주(42칸)로 고정**한다.
 *
 * 주 수를 달마다 바꾸면 달을 넘길 때 격자 높이가 출렁여 클릭 위치가 흔들린다 —
 * 다중선택은 연속 클릭이라 그 흔들림이 오조작으로 이어진다.
 */
export function buildMonthGrid(month: string, today: string): CalendarCell[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`buildMonthGrid: 달을 읽을 수 없다 (${month})`);
  }
  const firstMs = kstMidnightMs(`${month}-01`);
  const firstWeekday = new Date(firstMs + KST_OFFSET_MS).getUTCDay();
  const gridStartMs = firstMs - firstWeekday * DAY_MS;
  const todayMs = kstMidnightMs(today);

  return Array.from({ length: 42 }, (_, index) => {
    const ms = gridStartMs + index * DAY_MS;
    const date = toKstDateString(new Date(ms));
    return {
      date,
      inMonth: date.startsWith(`${month}-`),
      past: ms < todayMs,
      weekday: new Date(ms + KST_OFFSET_MS).getUTCDay(),
    };
  });
}

/**
 * 날짜 하나를 켜고 끈다. **항상 오름차순·중복 없음**으로 돌려준다.
 *
 * 서버도 정렬·중복 제거를 하지만, 화면이 흐트러진 목록을 들고 있으면 운영자가 보는 순서와
 * 실제 배정 순서가 달라진다 — 1주차가 목록 세 번째에 있는 화면은 읽을 수 없다.
 */
export function toggleFixtureDate(dates: readonly string[], date: string): string[] {
  const next = dates.includes(date) ? dates.filter((d) => d !== date) : [...dates, date];
  return [...new Set(next)].sort();
}

/** 달 이동. `delta` 는 개월 수(음수 가능). */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const total = year * 12 + (mon - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total % 12;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth + 1).padStart(2, '0')}`;
}

/** `'YYYY-MM-DD'` 가 속한 달. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * 고른 날짜가 필요한 매치데이 수에 견줘 어떤 상태인가.
 *
 * 서버는 **모자라면** 422 `LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT` 로 거부하고, 남는 날짜는
 * 그냥 안 쓴다. 그래서 부족은 **막아야 할 오류**이고 초과는 **알려만 줄 정보**다 —
 * 둘을 같은 톤으로 보여주면 운영자가 멀쩡한 입력을 고치려 든다.
 */
export function describeDateSelection(
  selectedCount: number,
  requiredCount: number,
): { state: 'short' | 'exact' | 'extra'; message: string } {
  if (selectedCount < requiredCount) {
    return {
      state: 'short',
      message: `${requiredCount}개 필요한데 ${selectedCount}개 골랐어요. ${requiredCount - selectedCount}개 더 고르세요.`,
    };
  }
  if (selectedCount === requiredCount) {
    return { state: 'exact', message: `${requiredCount}개를 모두 골랐어요.` };
  }
  return {
    state: 'extra',
    message: `${requiredCount}개만 쓰고 나머지 ${selectedCount - requiredCount}개는 남겨 둬요. 앞쪽 날짜부터 배정돼요.`,
  };
}
