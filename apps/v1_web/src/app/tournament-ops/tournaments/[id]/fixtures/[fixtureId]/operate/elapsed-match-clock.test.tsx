import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElapsedMatchClock } from './elapsed-match-clock';

describe('ElapsedMatchClock — 경과 시간 표시', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:10:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('피리어드 시작 이후 경과 시간을 m:ss로 보여준다', () => {
    render(
      <ElapsedMatchClock
        periodNumber={1}
        periodStartedAtMs={new Date('2026-08-08T00:00:00.000Z').getTime()}
        offsetMs={0}
      />,
    );
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('오프셋(서버-기기 시각차)을 반영해서 계산한다', () => {
    render(
      <ElapsedMatchClock
        periodNumber={1}
        periodStartedAtMs={new Date('2026-08-08T00:00:00.000Z').getTime()}
        offsetMs={5_000}
      />,
    );
    expect(screen.getByText('10:05')).toBeInTheDocument();
  });

  it('매초 갱신된다', () => {
    render(
      <ElapsedMatchClock
        periodNumber={2}
        periodStartedAtMs={new Date('2026-08-08T00:00:00.000Z').getTime()}
        offsetMs={0}
      />,
    );
    expect(screen.getByText('10:00')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText('10:03')).toBeInTheDocument();
  });
});
