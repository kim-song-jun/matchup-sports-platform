import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicRedCardPenalty, type PublicRedCardPenaltyProps } from './public-red-card-penalty';
import type { PublicMatchEvent } from './types';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 22, 0, 0, 0);

function event(overrides: Partial<PublicMatchEvent> & Pick<PublicMatchEvent, 'type'>): PublicMatchEvent {
  return {
    cardColor: null,
    sideId: 'side-home',
    side: 'home',
    participantId: 'p-1',
    participantName: '김선수',
    jerseyNumber: 7,
    profileHref: null,
    assist: null,
    period: 1,
    clockMs: 5 * MIN,
    ...overrides,
  };
}
const RED = event({ type: 'CARD', cardColor: 'RED' });

function renderPenalty(props: Partial<PublicRedCardPenaltyProps> = {}) {
  return render(
    <PublicRedCardPenalty
      events={[RED]}
      clock={{ periodNumber: 1, elapsedMs: 5 * MIN + 30_000, isPaused: false }}
      periodBreak={null}
      periodCount={2}
      periodMinutes={[20, 20]}
      homeName="홈팀"
      awayName="원정팀"
      {...props}
    />,
  );
}

describe('PublicRedCardPenalty — 공개 경기 화면의 퇴장 패널티', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('남은 시간과 퇴장한 팀·선수를 보여 주고 매초 줄어든다', () => {
    renderPenalty();

    const list = screen.getByRole('list', { name: '퇴장 패널티' });
    expect(within(list).getByRole('timer')).toHaveTextContent('패널티 1:30');
    expect(list).toHaveTextContent('홈팀 · 김선수 퇴장');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:27');
  });

  it('선수 이름이 응답에 없으면 팀 이름까지만 보여 준다 — 원정팀 선수는 원정팀으로', () => {
    renderPenalty({ events: [event({ type: 'CARD', cardColor: 'RED', side: 'away', sideId: 'side-away', participantName: null, participantId: null })] });

    expect(screen.getByRole('list', { name: '퇴장 패널티' })).toHaveTextContent('원정팀 퇴장');
    expect(screen.getByRole('list', { name: '퇴장 패널티' })).not.toHaveTextContent('·');
  });

  it('서버가 새 시계를 보내오면 그 값에 다시 맞춘다 — 화면에서 흘려 둔 시간이 쌓이지 않는다', () => {
    const { rerender } = renderPenalty();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:20');

    // 10초 뒤 갱신: 서버 시계는 5:41 (화면 값 5:40 과 1초 어긋남) — 서버 값이 이긴다.
    rerender(
      <PublicRedCardPenalty
        events={[RED]}
        clock={{ periodNumber: 1, elapsedMs: 5 * MIN + 41_000, isPaused: false }}
        periodBreak={null}
        periodCount={2}
        periodMinutes={[20, 20]}
        homeName="홈팀"
        awayName="원정팀"
      />,
    );
    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:19');
  });

  it('2분이 지나면 줄이 사라지고, 상대가 득점해도 사라진다', () => {
    const { unmount } = renderPenalty({ clock: { periodNumber: 1, elapsedMs: 6 * MIN + 59_000, isPaused: false } });
    expect(screen.getByRole('timer')).toHaveTextContent('패널티 0:01');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
    unmount();

    renderPenalty({
      events: [RED, event({ type: 'GOAL', side: 'away', sideId: 'side-away', clockMs: 5 * MIN + 20_000 })],
    });
    expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
  });

  it('일시 중지 중에는 숫자가 멈추고 이유를 적는다', () => {
    renderPenalty({ clock: { periodNumber: 1, elapsedMs: 5 * MIN + 30_000, isPaused: true } });

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:30');
    expect(screen.getByRole('list', { name: '퇴장 패널티' })).toHaveTextContent('일시 중지 중');
  });

  it('전반에 받은 퇴장은 후반에 이어서 센다', () => {
    renderPenalty({
      events: [event({ type: 'CARD', cardColor: 'RED', clockMs: 19 * MIN + 30_000 })],
      clock: { periodNumber: 2, elapsedMs: 45_000, isPaused: false },
    });

    // 전반 남은 30초 + 후반 0:45 = 1분 15초가 흘렀다.
    expect(screen.getByRole('timer')).toHaveTextContent('패널티 0:45');
  });

  it('하프타임(정규 두 피리어드)에는 전반이 끝난 시점에 멈춘 값을 보여 준다', () => {
    renderPenalty({
      events: [event({ type: 'CARD', cardColor: 'RED', clockMs: 19 * MIN + 30_000 })],
      clock: null,
      periodBreak: 'halftime',
    });

    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:30');
    expect(screen.getByRole('list', { name: '퇴장 패널티' })).toHaveTextContent('하프타임');
  });

  // alpha 확인(#2506): 전반을 설정 길이(20분)보다 일찍 끝내면 하프타임에 줄이 사라졌다.
  it('전반을 설정 길이보다 일찍 끝내도 서버가 알려 준 실제 진행 시간으로 하프타임 값을 잰다', () => {
    const early = event({ type: 'CARD', cardColor: 'RED', clockMs: 4 * MIN + 30_000 });
    // 전반은 5:00 에 끝났다 → 퇴장 뒤 30초만 흘렀다.
    renderPenalty({
      events: [early],
      clock: null,
      periodBreak: 'halftime',
      endedPeriods: [{ periodNumber: 1, elapsedMs: 5 * MIN }],
    });

    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:30');
    expect(screen.getByRole('list', { name: '퇴장 패널티' })).toHaveTextContent('하프타임');
  });

  it('실제 진행 시간이 없는 옛 응답은 설정 길이로 센다 — 일찍 끝낸 전반이면 만료로 보인다(이전 동작 그대로)', () => {
    const { container } = renderPenalty({
      events: [event({ type: 'CARD', cardColor: 'RED', clockMs: 4 * MIN + 30_000 })],
      clock: null,
      periodBreak: 'halftime',
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('후반이 시작된 뒤에도 전반의 실제 종료 시점부터 이어 센다', () => {
    renderPenalty({
      events: [event({ type: 'CARD', cardColor: 'RED', clockMs: 4 * MIN + 30_000 })],
      clock: { periodNumber: 2, elapsedMs: 45_000, isPaused: false },
      endedPeriods: [{ periodNumber: 1, elapsedMs: 5 * MIN }],
    });

    // 전반 남은 30초 + 후반 0:45 = 1분 15초가 흘렀다.
    expect(screen.getByRole('timer')).toHaveTextContent('패널티 0:45');
  });

  it('끝난 피리어드가 여럿이면 하프타임 값은 가장 마지막 피리어드가 끝난 시점이다', () => {
    renderPenalty({
      events: [event({ type: 'CARD', cardColor: 'RED', period: 2, clockMs: 19 * MIN + 30_000 })],
      clock: null,
      periodBreak: 'halftime',
      periodCount: 2,
      endedPeriods: [
        { periodNumber: 1, elapsedMs: 20 * MIN },
        { periodNumber: 2, elapsedMs: 20 * MIN },
      ],
    });

    expect(screen.getByRole('timer')).toHaveTextContent('패널티 1:30');
  });

  it('시계가 없고 하프타임도 아니거나, 피리어드 길이를 모르는 하프타임이면 아무것도 그리지 않는다', () => {
    const { container, unmount } = renderPenalty({ clock: null, periodBreak: null });
    expect(container).toBeEmptyDOMElement();
    unmount();

    const second = renderPenalty({ clock: null, periodBreak: 'halftime', periodMinutes: null });
    expect(second.container).toBeEmptyDOMElement();
  });

  it('옐로카드·시각을 모르는 레드카드는 패널티로 세지 않는다', () => {
    renderPenalty({
      events: [
        event({ type: 'CARD', cardColor: 'YELLOW' }),
        event({ type: 'CARD', cardColor: 'RED', period: null, clockMs: null }),
        event({ type: 'CARD', cardColor: null }),
      ],
    });

    expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
  });
});
