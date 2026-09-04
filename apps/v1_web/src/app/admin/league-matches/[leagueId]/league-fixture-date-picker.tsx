'use client';

import { useState } from 'react';
import {
  buildMonthGrid,
  describeDateSelection,
  monthOf,
  shiftMonth,
  toggleFixtureDate,
} from '@/lib/league-fixture-calendar';

const WEEKDAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/**
 * 대진 날짜 **다중선택 캘린더**(사용자 A안, 2026-09-04).
 *
 * ## 왜 요일이 아니라 날짜인가
 * 서버는 요일을 모르고 `schedule.dates` 를 받는다. 서버 DTO 주석이 이유를 이미 적어 뒀다 —
 * *"요일로 고르고 싶으면 화면이 날짜 목록으로 전개해서 보낸다. 그래야 명절·구장 사정으로
 * 한 주를 건너뛰거나 날짜를 옮기는 것을 표현할 수 있다."* 그런데 화면은 그 전개를
 * **보이지 않는 곳에서** 하고 있어서, 운영자는 어떤 날짜가 나가는지 볼 수도 특정 주를 뺄
 * 수도 없었다. 달력은 그 목록을 **보이게** 만든다.
 *
 * ## 요일 채우기를 없애지 않는다
 * 매주 같은 요일이 대부분이라, 열두 번 클릭하게 만들면 더 나빠진다. 요일로 **한 번에 채운 뒤**
 * 필요한 날짜만 지우거나 더하는 흐름이다.
 */
export function LeagueFixtureDatePicker({
  selectedDates,
  onChange,
  requiredCount,
  today,
  onFillByWeekday,
  fillDisabledReason,
}: {
  selectedDates: readonly string[];
  onChange: (dates: string[]) => void;
  /** 필요한 매치데이 수 = 서버의 `weeksCount`. */
  requiredCount: number;
  /** `'YYYY-MM-DD'`(KST). 과거 칸을 잠그는 기준. */
  today: string;
  /** 요일·시각으로 한 번에 채우기. 채울 수 없으면 `null`. */
  onFillByWeekday: (() => void) | null;
  /** 채우기를 못 쓰는 이유(버튼 옆에 그대로 보여 준다). */
  fillDisabledReason: string | null;
}) {
  const [month, setMonth] = useState(() => monthOf(selectedDates[0] ?? today));
  const grid = buildMonthGrid(month, today);
  const selection = describeDateSelection(selectedDates.length, requiredCount);

  return (
    <div className="rounded-2xl border border-[var(--border)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="이전 달"
            className="tm-btn tm-btn-sm tm-btn-ghost"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            ‹
          </button>
          <span className="tm-text-label" style={{ minWidth: 92, textAlign: 'center' }}>
            {`${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`}
          </span>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="다음 달"
            className="tm-btn tm-btn-sm tm-btn-ghost"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            ›
          </button>
        </div>
        {onFillByWeekday !== null ? (
          <button type="button" onClick={onFillByWeekday} className="tm-btn tm-btn-sm tm-btn-outline" style={{ minHeight: 44 }}>
            요일로 채우기
          </button>
        ) : (
          fillDisabledReason !== null && (
            <span className="text-xs text-[var(--text-muted)]">{fillDisabledReason}</span>
          )
        )}
      </div>

      {/* `role="grid"` 를 쓰지 않는다 — ARIA 의 grid 는 안에 `row`/`gridcell` 구조와
          방향키 이동을 요구하는데 여기엔 둘 다 없다. 선언만 해 두면 스크린리더가 없는
          구조를 있다고 알리게 되므로, **날짜 버튼들을 담은 이름 있는 묶음**으로만 둔다
          (버튼 각각은 이미 `aria-pressed` + 날짜 라벨을 갖는다). */}
      <div className="grid grid-cols-7 gap-1" aria-label="대진 날짜 선택">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="py-1 text-center text-xs text-[var(--text-muted)]" aria-hidden="true">
            {label}
          </div>
        ))}
        {grid.map((cell) => {
          const selected = selectedDates.includes(cell.date);
          const day = Number(cell.date.slice(8, 10));
          return (
            <button
              key={cell.date}
              type="button"
              // 과거는 서버가 422 `LEAGUE_SCHEDULE_DATE_PAST` 로 거부한다 — 고를 수 있게
              // 두면 저장 순간에야 실패한다.
              disabled={cell.past}
              aria-pressed={selected}
              // 날짜만 읽으면 "12" 가 무슨 달의 12일인지 알 수 없다. 이웃 달 칸이 섞여 있어
              // 더 그렇다.
              aria-label={`${cell.date}${selected ? ' 선택됨' : ''}`}
              onClick={() => onChange(toggleFixtureDate(selectedDates, cell.date))}
              className="rounded-lg text-sm disabled:opacity-30"
              style={{
                minHeight: 44,
                background: selected ? 'var(--blue500)' : 'transparent',
                color: selected ? '#fff' : cell.inMonth ? 'var(--text-strong)' : 'var(--text-muted)',
                fontWeight: selected ? 700 : 400,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      <p
        className="mt-3 text-xs"
        // 부족은 저장을 막는 오류이고 초과는 정보다 — 같은 톤으로 보여주면 운영자가
        // 멀쩡한 입력을 고치려 든다.
        style={{ color: selection.state === 'short' ? 'var(--orange700)' : 'var(--text-muted)' }}
        // `alert` 이 아니라 `status` 다. 이건 **갑자기 생긴 오류가 아니라 진행 중인 상태**이고,
        // 날짜를 누를 때마다 바뀐다 — `alert` 로 두면 클릭마다 스크린리더를 끊고, 이 화면의
        // 다른 `alert`(시작일 없음 안내)와 섞여 무엇이 진짜 문제인지 흐려진다.
        role="status"
        aria-live="polite"
      >
        {selection.message}
      </p>

      {selectedDates.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {selectedDates.map((date) => (
            <li key={date}>
              <button
                type="button"
                onClick={() => onChange(toggleFixtureDate(selectedDates, date))}
                aria-label={`${date} 빼기`}
                className="tm-chip"
                style={{ minHeight: 44 }}
              >
                {date.slice(5).replace('-', '/')} ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
