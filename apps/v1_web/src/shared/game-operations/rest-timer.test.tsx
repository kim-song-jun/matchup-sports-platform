import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestTimerCard, RestTimerPresets, useRestTimer } from './rest-timer';

/** 쉬는 시간 카드의 「MM:SS 남았어요」 — 숫자와 「남았어요」가 다른 크기의 두 글자라 한 문단의 글자로 찾는다. */
function restCountdown(text: string, root: Pick<typeof screen, 'getByText'> = screen) {
  return root.getByText((_, element) => element?.tagName === 'P' && element.textContent === text);
}

const KEY = 'teameet.v1.restTimer:game-1';
type HookProps = { storageKey: string | null; scope: string | null };

function renderRestTimer(initial: HookProps) {
  return renderHook(
    ({ storageKey, scope }: HookProps) =>
      useRestTimer({ storageKey, autoStart: scope === null ? null : { scope } }),
    { initialProps: initial },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-08T00:00:00.000Z'));
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useRestTimer — 쉬는 시간 훅', () => {
  it('autoStart 범위가 생기면 입력 없이 10분으로 시작한다', () => {
    const { result, rerender } = renderRestTimer({ storageKey: KEY, scope: null });
    expect(result.current.state).toEqual({ kind: 'idle' });

    rerender({ storageKey: KEY, scope: 'halftime:p2' });
    expect(result.current.state.kind).toBe('running');
    expect(result.current.remainingMs).toBe(10 * 60_000);
    expect(result.current.lastMinutes).toBe(10);
  });

  it('마지막에 고른 길이(5분)를 다음 자동 시작에 쓴다', () => {
    const { result, rerender } = renderRestTimer({ storageKey: KEY, scope: 'halftime:p2' });
    act(() => result.current.setLength(5));
    expect(result.current.remainingMs).toBe(5 * 60_000);

    rerender({ storageKey: KEY, scope: null });
    rerender({ storageKey: KEY, scope: 'halftime:p3' });
    expect(result.current.state).toMatchObject({ kind: 'running', totalMs: 5 * 60_000 });
    expect(result.current.lastMinutes).toBe(5);
  });

  it('직접 잰 길이(2분)는 다음 하프타임 자동 시작에 쓰지 않는다', () => {
    const { result, rerender } = renderRestTimer({ storageKey: KEY, scope: null });
    act(() => result.current.start(2, 'manual'));
    expect(result.current.remainingMs).toBe(2 * 60_000);
    act(() => result.current.end());

    rerender({ storageKey: KEY, scope: 'halftime:p2' });
    expect(result.current.state).toMatchObject({ kind: 'running', totalMs: 10 * 60_000 });
  });

  it('재마운트해도 같은 범위는 남은 시간을 이어 가고, 끝내기 한 범위는 다시 시작하지 않는다', () => {
    const first = renderRestTimer({ storageKey: KEY, scope: 'halftime:p2' });
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    first.unmount();

    const second = renderRestTimer({ storageKey: KEY, scope: 'halftime:p2' });
    expect(second.result.current.state.kind).toBe('running');
    expect(second.result.current.remainingMs).toBe(7 * 60_000);

    act(() => second.result.current.end());
    expect(second.result.current.state).toEqual({ kind: 'idle' });
    second.unmount();

    const third = renderRestTimer({ storageKey: KEY, scope: 'halftime:p2' });
    expect(third.result.current.state).toEqual({ kind: 'idle' });
  });

  it('범위가 null 이 되면 하프타임 기록을 지운다', () => {
    const { result, rerender } = renderRestTimer({ storageKey: KEY, scope: 'halftime:p2' });
    expect(window.localStorage.getItem(KEY)).not.toBeNull();

    rerender({ storageKey: KEY, scope: null });
    expect(result.current.state).toEqual({ kind: 'idle' });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('storageKey 가 아직 없으면 자동 시작도 기록 삭제도 하지 않는다', () => {
    const first = renderRestTimer({ storageKey: KEY, scope: 'halftime:p2' });
    act(() => {
      vi.advanceTimersByTime(4 * 60_000);
    });
    first.unmount();

    // 새로고침 직후 경기 정보를 읽는 동안: 열쇠도 범위도 아직 모른다.
    const { result, rerender } = renderRestTimer({ storageKey: null, scope: null });
    expect(result.current.state).toEqual({ kind: 'idle' });
    expect(window.localStorage.getItem(KEY)).not.toBeNull();

    rerender({ storageKey: KEY, scope: 'halftime:p2' });
    expect(result.current.remainingMs).toBe(6 * 60_000);
  });

  it('addMinute 은 정확히 60초를 더한다', () => {
    const { result } = renderRestTimer({ storageKey: KEY, scope: 'halftime:p2' });
    act(() => result.current.addMinute());
    expect(result.current.remainingMs).toBe(11 * 60_000);
    expect(result.current.state).toMatchObject({ kind: 'running', totalMs: 11 * 60_000 });
  });

  it('setLength 는 시작 시각을 그대로 두고 길이만 바꾼다', () => {
    const { result } = renderRestTimer({ storageKey: KEY, scope: 'halftime:p2' });
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    act(() => result.current.setLength(5));
    expect(result.current.remainingMs).toBe(2 * 60_000);

    // 이미 지난 길이로 줄이면 바로 끝난 상태가 된다.
    act(() => result.current.setLength(2));
    expect(result.current.state).toEqual({ kind: 'finished' });
  });

  it('시간이 다 되면 finished 가 되고 end 로만 닫힌다', () => {
    const { result } = renderRestTimer({ storageKey: KEY, scope: null });
    act(() => result.current.start(1, 'manual'));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.state).toEqual({ kind: 'finished' });
    expect(result.current.remainingMs).toBe(0);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current.state).toEqual({ kind: 'finished' });
    act(() => result.current.end());
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('이미 끝난 직접 잰 기록은 재마운트 때 되살아나지 않는다', () => {
    const first = renderRestTimer({ storageKey: KEY, scope: null });
    act(() => first.result.current.start(1, 'manual'));
    first.unmount();
    vi.setSystemTime(new Date('2026-08-08T01:00:00.000Z'));

    const second = renderRestTimer({ storageKey: KEY, scope: null });
    expect(second.result.current.state).toEqual({ kind: 'idle' });
  });

  it('Storage.setItem 이 throw 해도 타이머는 메모리로 돈다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'QuotaExceededError');
    });
    const { result } = renderRestTimer({ storageKey: KEY, scope: 'halftime:p2' });
    expect(result.current.state.kind).toBe('running');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.remainingMs).toBe(9 * 60_000);
    act(() => result.current.end());
    expect(result.current.state).toEqual({ kind: 'idle' });
  });
});

function CardHarness({ scope }: { scope: string | null }) {
  const api = useRestTimer({ storageKey: KEY, autoStart: scope === null ? null : { scope } });
  return (
    <>
      <RestTimerCard api={api} />
      {api.state.kind === 'idle' ? <RestTimerPresets api={api} /> : null}
    </>
  );
}

describe('RestTimerCard · RestTimerPresets', () => {
  it('카드에 「1분 추가」「쉬는 시간 끝내기」가 있고 새로고침 안내 문구는 없다', () => {
    render(<CardHarness scope="halftime:p2" />);
    expect(screen.getByRole('button', { name: '쉬는 시간 10분' })).toBeInTheDocument();
    expect(restCountdown('10:00 남았어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1분 추가' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '쉬는 시간 끝내기' })).toBeInTheDocument();
    expect(screen.queryByText(/새로고침/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(restCountdown('09:57 남았어요')).toBeInTheDocument();
  });

  it('길이 배지를 누르면 칩이 펼쳐지고 고르면 길이가 바뀐다', () => {
    render(<CardHarness scope="halftime:p2" />);
    const badge = screen.getByRole('button', { name: '쉬는 시간 10분' });
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: '5분' })).toBeNull();

    fireEvent.click(badge);
    fireEvent.click(screen.getByRole('button', { name: '5분' }));
    expect(screen.getByRole('button', { name: '쉬는 시간 5분' })).toHaveAttribute('aria-expanded', 'false');
    expect(restCountdown('05:00 남았어요')).toBeInTheDocument();
  });

  it('프리셋은 1·2·5·10·15·20분 여섯 개', () => {
    const onStarted = vi.fn();
    function PresetHarness() {
      const api = useRestTimer({ storageKey: KEY, autoStart: null });
      return (
        <>
          <RestTimerPresets api={api} onStarted={onStarted} />
          <output>{api.state.kind}</output>
        </>
      );
    }
    render(<PresetHarness />);
    const chips = screen.getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['1분', '2분', '5분', '10분', '15분', '20분']);
    for (const chip of chips) expect(chip).toHaveClass('min-h-[44px]');

    fireEvent.click(screen.getByRole('button', { name: '5분' }));
    expect(screen.getByRole('status')).toHaveTextContent('running');
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it('끝나면 alert 가 확인 전까지 남는다', () => {
    render(<CardHarness scope={null} />);
    fireEvent.click(screen.getByRole('button', { name: '1분' }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('쉬는 시간이 끝났어요');
    // 한쪽만 굵은 색 테두리로 강조하지 않는다.
    expect(alert.className).not.toMatch(/border-2/);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '5분' })).toBeInTheDocument();
  });
});
