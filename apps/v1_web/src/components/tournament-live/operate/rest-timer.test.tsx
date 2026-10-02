import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestTimer } from './rest-timer';

describe('RestTimer — 휴식시간 카운트다운', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('오너가 지시한 6개 프리셋(1/2/5/10/15/20분)을 모두 보여준다', () => {
    render(<RestTimer />);
    for (const minutes of [1, 2, 5, 10, 15, 20]) {
      expect(screen.getByRole('button', { name: `${minutes}분` })).toBeInTheDocument();
    }
  });

  it('프리셋을 누르면 카운트다운이 시작되고 매초 줄어든다', () => {
    render(<RestTimer />);
    fireEvent.click(screen.getByRole('button', { name: '5분' }));
    expect(screen.getByText('05:00')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText('04:57')).toBeInTheDocument();
  });

  it('경과 시간이 프리셋을 다 채우면 큰 종료 알림으로 바뀌고 확인 전까지 사라지지 않는다', () => {
    render(<RestTimer />);
    fireEvent.click(screen.getByRole('button', { name: '1분' }));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('휴식 시간이 끝났어요');

    // 시간이 더 흘러도(=자동으로 조용히 안 없어짐) 확인 전까지는 계속 보인다 —
    // 소리/진동 없이도 놓치지 않게 하는 요건.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.queryByRole('alert')).toBeNull();
    // 프리셋 화면으로 되돌아간다.
    expect(screen.getByRole('button', { name: '5분' })).toBeInTheDocument();
  });

  it('"쉬는 시간 취소"를 누르면 남은 시간과 무관하게 즉시 프리셋 화면으로 되돌아간다', () => {
    render(<RestTimer />);
    fireEvent.click(screen.getByRole('button', { name: '10분' }));
    expect(screen.getByText('10:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '쉬는 시간 취소' }));
    expect(screen.queryByText('10:00')).toBeNull();
    expect(screen.getByRole('button', { name: '10분' })).toBeInTheDocument();
  });

  it('"1분 추가"를 누르면 남은 시간이 정확히 1분 늘어난다', () => {
    render(<RestTimer />);
    fireEvent.click(screen.getByRole('button', { name: '2분' }));
    expect(screen.getByText('02:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /1분 추가/ }));
    expect(screen.getByText('03:00')).toBeInTheDocument();
  });

  it('새로고침하면 초기화된다는 한계를 화면에 정직하게 밝힌다', () => {
    render(<RestTimer />);
    expect(screen.getByText('화면을 새로고침하면 초기화돼요.')).toBeInTheDocument();
  });
});
