import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMotionPaused } from '../landing-motion-store';
import { LandingV4Demo } from './landing-v4-demo';

/* jsdom 에 없는 브라우저 API(IntersectionObserver·matchMedia)만 대신한다. */
let ioCallbacks: IntersectionObserverCallback[] = [];

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    ioCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const originalMatchMedia = window.matchMedia;

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion: reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function reportVisibility(isIntersecting: boolean) {
  act(() => {
    for (const callback of ioCallbacks) {
      callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function selectedTab() {
  return screen.getByRole('tab', { selected: true, name: /^(홈|매치|대회|팀|마이)$/ });
}

function status() {
  return screen.getByRole('status');
}

beforeEach(() => {
  ioCallbacks = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  setReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
  setMotionPaused(false);
});

describe('LandingV4Demo 조작', () => {
  it('처음엔 홈 화면만 보이고 나머지 화면은 스크린리더·포커스에서 빠진다', () => {
    render(<LandingV4Demo />);
    expect(selectedTab()).toHaveTextContent('홈');
    const matchPanel = document.getElementById('tm-landing-v4-panel-match');
    expect(matchPanel).toHaveAttribute('aria-hidden', 'true');
    expect(matchPanel).toHaveAttribute('inert');
    expect(screen.getByText('체험용 예시 · 직접 눌러 보세요')).toBeInTheDocument();
  });

  it('매치 신청은 인원·배지·버튼을 함께 바꾸고, 다시 누르면 취소된다', async () => {
    const user = userEvent.setup();
    render(<LandingV4Demo />);
    await user.click(screen.getByRole('tab', { name: '매치' }));
    const run = screen.getByRole('button', { name: '신청하기 한강 퇴근런' });
    const card = run.closest('.lpm-mcard') as HTMLElement;
    expect(within(card).getByText('마감 임박')).toBeInTheDocument();

    await user.click(run);
    expect(within(card).getByText('10/10명')).toBeInTheDocument();
    expect(within(card).getByText('마감')).toBeInTheDocument();
    expect(run).toHaveAttribute('aria-pressed', 'true');
    expect(status()).toHaveTextContent('한강 퇴근런 신청 완료. 현재 10명 / 10명. 체험용 예시예요.');
    expect(screen.getByRole('button', { name: '매치 신청 (해 봤어요)' })).toBeInTheDocument();

    await user.click(run);
    expect(within(card).getByText('9/10명')).toBeInTheDocument();
    expect(status()).toHaveTextContent('한강 퇴근런 신청 취소. 현재 9명 / 10명.');
  });

  it('종목 칩으로 거르고, 매치가 없는 종목은 빈 상태를 보인다', async () => {
    const user = userEvent.setup();
    render(<LandingV4Demo />);
    await user.click(screen.getByRole('tab', { name: '매치' }));
    const chips = screen.getByRole('group', { name: '종목 필터' });
    await user.click(within(chips).getByRole('button', { name: '수영' }));
    expect(screen.getByText('이 종목 매치가 아직 없어요')).toBeInTheDocument();
    expect(status()).toHaveTextContent('수영 매치 0개');
  });

  it('라이브 +1 은 점수·기록·옆 칸 알림을 같이 바꾸고, 처음 점수로 되돌릴 수 있다', async () => {
    const user = userEvent.setup();
    render(<LandingV4Demo />);
    await user.click(screen.getByRole('tab', { name: '대회' }));
    await user.click(screen.getByRole('tab', { name: '라이브' }));
    await user.click(screen.getByRole('button', { name: 'FC 한강 +1 득점' }));

    expect(status()).toHaveTextContent('FC 한강 득점. FC 한강 3 대 1 성수 러너스.');
    expect(screen.getByText('FC 한강 3 : 1 성수 러너스')).toBeInTheDocument();
    expect(screen.getByText("28'")).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '처음 점수로' }));
    expect(screen.getByText('FC 한강 2 : 1 성수 러너스')).toBeInTheDocument();
    expect(screen.queryByText("28'")).not.toBeInTheDocument();
  });

  it('4강 팀을 누르면 결승 칸으로 올라가고, 결승 팀을 누르면 우승이 채워진다', async () => {
    const user = userEvent.setup();
    render(<LandingV4Demo />);
    await user.click(screen.getByRole('tab', { name: '대회' }));
    expect(screen.getByRole('button', { name: '결승 FC 한강' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '4강 망원 FC' }));
    expect(status()).toHaveTextContent('망원 FC가 결승에 올라갔어요.');
    expect(screen.queryByRole('button', { name: '결승 FC 한강' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '결승 망원 FC' }));
    expect(screen.getByText('망원 FC 우승')).toBeInTheDocument();
    expect(status()).toHaveTextContent('망원 FC 우승! 대진표가 끝까지 채워졌어요.');
  });

  it('해 볼 것 버튼은 해당 화면으로 옮기고 조작할 버튼에 포커스를 준다', async () => {
    const user = userEvent.setup();
    render(<LandingV4Demo />);
    await user.click(screen.getByRole('button', { name: '카드 뒤집기' }));
    expect(selectedTab()).toHaveTextContent('마이');
    const card = screen.getByRole('button', { name: /선수 카드 뒤집기/ });
    expect(card).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(status()).toHaveTextContent('카드 뒷면');
  });

  it('하단 탭은 화살표 키로 옮겨 가고 포커스도 따라간다', async () => {
    const user = userEvent.setup();
    render(<LandingV4Demo />);
    screen.getByRole('tab', { name: '홈' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(selectedTab()).toHaveTextContent('매치');
    expect(screen.getByRole('tab', { name: '매치' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(selectedTab()).toHaveTextContent('마이');
    await user.keyboard('{ArrowRight}');
    expect(selectedTab()).toHaveTextContent('홈');
  });
});

describe('LandingV4Demo 자동 시연', () => {
  it('보이면 한 번 신청 → 골 → 결승 우승을 보여 주고 처음 화면으로 돌아온다(공지 없음)', () => {
    vi.useFakeTimers();
    render(<LandingV4Demo />);
    reportVisibility(true);
    expect(screen.getByText('자동 시연 중 · 누르면 바로 멈춰요')).toBeInTheDocument();

    advance(2000);
    expect(selectedTab()).toHaveTextContent('매치');
    expect(screen.getByRole('button', { name: '신청 완료 성수 저녁 풋살' })).toBeInTheDocument();

    advance(2300);
    expect(selectedTab()).toHaveTextContent('대회');
    expect(screen.getByText('FC 한강 3 : 1 성수 러너스')).toBeInTheDocument();

    advance(2100);
    // 라이브에서 골을 넣은 FC 한강이 우승 — 결승 상대를 바꾸지 않는다(아래 결과 카드와 모순 방지)
    expect(screen.getByText('FC 한강 우승')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결승 망원 FC' })).not.toBeInTheDocument();
    expect(status().textContent).toBe('');

    advance(2100);
    expect(selectedTab()).toHaveTextContent('홈');
    expect(screen.getByText('FC 한강 2 : 1 성수 러너스')).toBeInTheDocument();
    expect(screen.getByText('체험용 예시 · 직접 눌러 보세요')).toBeInTheDocument();
    // 시연이 한 일은 "해 봤어요"로 치지 않는다
    expect(screen.getByRole('button', { name: '매치 신청' })).toBeInTheDocument();
  });

  it('사용자가 누르는 순간 멈추고 그 뒤로는 화면을 바꾸지 않는다', () => {
    vi.useFakeTimers();
    render(<LandingV4Demo />);
    reportVisibility(true);
    advance(1000);
    expect(selectedTab()).toHaveTextContent('매치');

    fireEvent.pointerDown(window);
    advance(10000);
    expect(selectedTab()).toHaveTextContent('매치');
    expect(screen.getByRole('button', { name: '신청하기 성수 저녁 풋살' })).toBeInTheDocument();
    expect(screen.getByText('체험용 예시 · 직접 눌러 보세요')).toBeInTheDocument();
  });

  it('포인터·키 이벤트 없이 눌러도(스크린리더 가상 커서) 멈추고, 누른 결과를 시연이 덮지 않는다', () => {
    vi.useFakeTimers();
    render(<LandingV4Demo />);
    reportVisibility(true);
    advance(1000);
    fireEvent.click(screen.getByRole('button', { name: '카드 뒤집기' }));
    advance(10000);
    expect(selectedTab()).toHaveTextContent('마이');
    expect(screen.getByText('체험용 예시 · 직접 눌러 보세요')).toBeInTheDocument();
  });

  it('처음에 화면 밖이면 시작하지 않는다', () => {
    vi.useFakeTimers();
    render(<LandingV4Demo />);
    reportVisibility(false);
    // 나중에 화면에 들어와도(스크롤 없이 레이아웃이 바뀐 경우 등) 시작하지 않는다
    reportVisibility(true);
    // 시연은 끝에 홈으로 돌아오므로 끝 상태가 아니라 중간(매치 화면일 시점)을 본다
    advance(2000);
    expect(selectedTab()).toHaveTextContent('홈');
    expect(screen.getByRole('button', { name: '신청하기 성수 저녁 풋살' })).toBeInTheDocument();
    expect(screen.getByText('체험용 예시 · 직접 눌러 보세요')).toBeInTheDocument();
  });

  it('모션 감소 설정이면 관찰조차 하지 않고 재생하지 않는다', () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    render(<LandingV4Demo />);
    expect(ioCallbacks).toHaveLength(0);
    advance(10000);
    expect(selectedTab()).toHaveTextContent('홈');
  });

  it('움직임 멈추기를 누르면 시연도 멈춘다', () => {
    vi.useFakeTimers();
    render(<LandingV4Demo />);
    reportVisibility(true);
    advance(1000);
    act(() => setMotionPaused(true));
    advance(10000);
    expect(selectedTab()).toHaveTextContent('매치');
    expect(screen.getByRole('button', { name: '신청하기 성수 저녁 풋살' })).toBeInTheDocument();
  });
});
