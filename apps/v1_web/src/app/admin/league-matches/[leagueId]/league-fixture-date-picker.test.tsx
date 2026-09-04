import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeagueFixtureDatePicker } from './league-fixture-date-picker';

function renderPicker(overrides: Partial<Parameters<typeof LeagueFixtureDatePicker>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <LeagueFixtureDatePicker
      selectedDates={[]}
      onChange={onChange}
      requiredCount={3}
      today="2026-09-04"
      onFillByWeekday={null}
      fillDisabledReason="요일과 시각을 고르면 한 번에 채울 수 있어요."
      {...overrides}
    />,
  );
  return onChange;
}

describe('LeagueFixtureDatePicker', () => {
  it('과거 날짜는 고를 수 없다 — 서버가 422 로 거부하는 값이다', () => {
    renderPicker();
    // 저장 순간에야 실패하면 운영자는 무엇이 문제인지 모른다.
    expect(screen.getByLabelText('2026-09-03')).toBeDisabled();
    expect(screen.getByLabelText('2026-09-04')).not.toBeDisabled();
  });

  it('날짜를 누르면 오름차순으로 넘긴다', () => {
    const onChange = renderPicker({ selectedDates: ['2026-09-26'] });
    fireEvent.click(screen.getByLabelText('2026-09-12'));
    expect(onChange).toHaveBeenCalledWith(['2026-09-12', '2026-09-26']);
  });

  it('고른 날짜를 다시 누르면 뺀다 — 칩으로도 뺄 수 있다', () => {
    const onChange = renderPicker({ selectedDates: ['2026-09-12'] });
    fireEvent.click(screen.getByLabelText('2026-09-12 빼기'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('몇 개 더 필요한지 알려 준다 — 부족은 저장을 막는 유일한 경우다', () => {
    renderPicker({ selectedDates: ['2026-09-12'], requiredCount: 3 });
    expect(screen.getByRole('status')).toHaveTextContent('3개 필요한데 1개 골랐어요. 2개 더 고르세요.');
  });

  it('초과는 오류처럼 말하지 않는다', () => {
    renderPicker({ selectedDates: ['2026-09-12', '2026-09-19', '2026-09-26'], requiredCount: 2 });
    expect(screen.getByRole('status')).not.toHaveTextContent('더 고르세요');
  });

  it('요일로 채우기를 쓸 수 없으면 이유를 보여 준다 — 버튼만 사라지면 왜인지 모른다', () => {
    renderPicker({ onFillByWeekday: null, fillDisabledReason: '리그 시작일이 없어 요일로 채울 수 없어요.' });
    expect(screen.getByText('리그 시작일이 없어 요일로 채울 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '요일로 채우기' })).not.toBeInTheDocument();
  });

  it('달을 넘겨도 격자가 흔들리지 않는다 — 연속 클릭이 빗나가지 않게', () => {
    renderPicker();
    // `role="grid"` 는 뗐다(안에 row/gridcell 이 없어 ARIA 로 부정확) — 라벨로 찾는다.
    const grid = screen.getByLabelText('대진 날짜 선택');
    const before = within(grid).getAllByRole('button').length;
    fireEvent.click(screen.getByLabelText('다음 달'));
    expect(within(grid).getAllByRole('button')).toHaveLength(before);
  });
});
