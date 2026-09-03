import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useLoopPause } from './use-loop-pause';

/**
 * 이 훅이 실패하면 /my 화면의 티어 카드 루프(스윕·숨쉬기·발광)가 화면 밖으로
 * 스크롤되거나 탭이 백그라운드로 가도 계속 돈다 -- IntersectionObserver 콜백과
 * visibilitychange 둘 다 실제로 `data-loop-paused` 를 뒤집는지를 건다
 * (불가피한 브라우저 API mock: IntersectionObserver 는 jsdom 에 없다).
 */

let observedCallback: IntersectionObserverCallback | null = null;
let observeSpy: ReturnType<typeof vi.fn>;
let disconnectSpy: ReturnType<typeof vi.fn>;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observedCallback = callback;
  }
  observe = observeSpy;
  disconnect = disconnectSpy;
  unobserve = vi.fn();
  takeRecords = vi.fn(() => [] as IntersectionObserverEntry[]);
  root = null;
  rootMargin = '';
  thresholds: ReadonlyArray<number> = [];
}

function TestCard() {
  const ref = useLoopPause<HTMLDivElement>();
  return <div ref={ref} data-testid="card" />;
}

function fireIntersection(isIntersecting: boolean) {
  observedCallback?.(
    [{ isIntersecting } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useLoopPause', () => {
  beforeEach(() => {
    observedCallback = null;
    observeSpy = vi.fn();
    disconnectSpy = vi.fn();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    setVisibility('visible');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('마운트 시 observer 를 자신에게 건다', () => {
    render(<TestCard />);
    expect(observeSpy).toHaveBeenCalledTimes(1);
  });

  it('뷰포트를 벗어나면(isIntersecting=false) data-loop-paused="true" 를 세팅한다', () => {
    const { getByTestId } = render(<TestCard />);
    const el = getByTestId('card');
    expect(el).not.toHaveAttribute('data-loop-paused');

    fireIntersection(false);

    expect(el).toHaveAttribute('data-loop-paused', 'true');
  });

  it('뷰포트 안이어도 문서가 백그라운드(hidden)면 세팅한다', () => {
    const { getByTestId } = render(<TestCard />);
    const el = getByTestId('card');
    fireIntersection(true);
    expect(el).not.toHaveAttribute('data-loop-paused');

    setVisibility('hidden');

    expect(el).toHaveAttribute('data-loop-paused', 'true');
  });

  it('둘 다 복귀하면(뷰포트 안 + 문서 visible) 속성을 제거한다', () => {
    const { getByTestId } = render(<TestCard />);
    const el = getByTestId('card');
    fireIntersection(false);
    setVisibility('hidden');
    expect(el).toHaveAttribute('data-loop-paused', 'true');

    setVisibility('visible');
    fireIntersection(true);

    expect(el).not.toHaveAttribute('data-loop-paused');
  });

  it('한쪽만 복귀하면(뷰포트는 안이지만 문서는 여전히 hidden) 계속 paused 다', () => {
    const { getByTestId } = render(<TestCard />);
    const el = getByTestId('card');
    fireIntersection(false);
    setVisibility('hidden');

    fireIntersection(true); // 뷰포트로는 돌아왔지만 문서는 아직 hidden

    expect(el).toHaveAttribute('data-loop-paused', 'true');
  });

  it('대상 요소가 나중에 렌더돼도(조건부 렌더) 그때 observer 를 건다 — 마운트 시 한 번만 읽으면 영영 안 붙는다', () => {
    function LateCard({ show }: { show: boolean }) {
      const ref = useLoopPause<HTMLDivElement>();
      return show ? <div ref={ref} data-testid="card" /> : <p>아직 없음</p>;
    }
    const { rerender, getByTestId } = render(<LateCard show={false} />);
    expect(observeSpy).not.toHaveBeenCalled();

    rerender(<LateCard show />);

    expect(observeSpy).toHaveBeenCalledTimes(1);
    fireIntersection(false);
    expect(getByTestId('card')).toHaveAttribute('data-loop-paused', 'true');
  });

  it('언마운트 시 observer 를 disconnect 하고 visibilitychange 리스너를 뗀다', () => {
    const { unmount } = render(<TestCard />);
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    unmount();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
