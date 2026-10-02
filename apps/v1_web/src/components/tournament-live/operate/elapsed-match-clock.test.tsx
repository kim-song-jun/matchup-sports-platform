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
        pausedTotalMs={0}
        pausedAtMs={null}
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
        pausedTotalMs={0}
        pausedAtMs={null}
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
        pausedTotalMs={0}
        pausedAtMs={null}
      />,
    );
    expect(screen.getByText('10:00')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByText('10:03')).toBeInTheDocument();
  });

  it('완료된 일시정지 구간(pausedTotalMs)만큼 경과 시간에서 뺀다', () => {
    // 10분 경과 중 2분을 일시정지로 이미 다 썼다 — 화면엔 8분이어야 한다.
    render(
      <ElapsedMatchClock
        periodNumber={1}
        periodStartedAtMs={new Date('2026-08-08T00:00:00.000Z').getTime()}
        offsetMs={0}
        pausedTotalMs={2 * 60_000}
        pausedAtMs={null}
      />,
    );
    // 스톱워치 표시는 분을 2자리로 고정 패딩한다(formatStopwatchClock).
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });

  it('60분을 넘으면 시:분:초로 롤오버해 보여준다 — alpha 실측("전반 584:23") 회귀 방지', () => {
    render(
      <ElapsedMatchClock
        periodNumber={1}
        // 65분 경과: 시:분:초로 롤오버해야 한다(00:65:00처럼 분이 60을
        // 넘겨 그대로 표시되면 안 된다).
        periodStartedAtMs={new Date('2026-08-07T23:05:00.000Z').getTime()}
        offsetMs={0}
        pausedTotalMs={0}
        pausedAtMs={null}
      />,
    );
    expect(screen.getByText('1:05:00')).toBeInTheDocument();
  });

  it('일시정지 중(pausedAtMs 설정)에는 시계가 실제로 멈춘다 — 매초 tick이 와도 값이 그대로다', () => {
    // 일시정지 시작 시각을 현재 시각(00:10:00)과 정확히 일치시킨다 — "지금 막 눌렀다"를
    // 재현한다. 경과 시간은 pausedAt 이전까지만(10:00) 계산되고, 그 이후 tick은 전부
    // 열린 일시정지 구간으로 빠져야 한다.
    render(
      <ElapsedMatchClock
        periodNumber={1}
        periodStartedAtMs={new Date('2026-08-08T00:00:00.000Z').getTime()}
        offsetMs={0}
        pausedTotalMs={0}
        pausedAtMs={new Date('2026-08-08T00:10:00.000Z').getTime()}
      />,
    );
    expect(screen.getByText('10:00')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    // 5초가 더 흘렀지만 그 5초는 전부 일시정지 구간 안이므로 표시는 그대로다.
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('일시정지 중에는 색상만이 아니라 아이콘+텍스트 배지("일시 중지")를 보여준다', () => {
    render(
      <ElapsedMatchClock
        periodNumber={1}
        periodStartedAtMs={new Date('2026-08-08T00:00:00.000Z').getTime()}
        offsetMs={0}
        pausedTotalMs={0}
        pausedAtMs={new Date('2026-08-08T00:05:00.000Z').getTime()}
      />,
    );
    expect(screen.getByText('일시 중지')).toBeInTheDocument();
  });

  it('일시정지 중이 아니면 배지를 보여주지 않는다', () => {
    render(
      <ElapsedMatchClock
        periodNumber={1}
        periodStartedAtMs={new Date('2026-08-08T00:00:00.000Z').getTime()}
        offsetMs={0}
        pausedTotalMs={0}
        pausedAtMs={null}
      />,
    );
    expect(screen.queryByText('일시 중지')).toBeNull();
  });
});
