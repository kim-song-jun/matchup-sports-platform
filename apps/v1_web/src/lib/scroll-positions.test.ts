import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readScrollPosition, saveScrollPosition } from './scroll-positions';
import { restoreWhenTallEnough } from '../components/v1-ui/scroll-restoration';

const SCROLL_POSITIONS_KEY = 'teameet.v1.scrollPositions';
const RESTORE_TIMEOUT_MS = 1500; // scroll-restoration.tsx 의 상수와 동일 — 타임아웃 클램프
  // 케이스 검증에 필요하지만 내부 구현 상수라 export 하지 않는다.

describe('scroll-positions', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('30개를 넘게 저장하면 가장 오래된 항목부터 버려 무제한 증가를 막는다', () => {
    for (let i = 0; i < 31; i += 1) {
      saveScrollPosition(`/route-${i}`, i * 10);
    }

    const raw = window.sessionStorage.getItem(SCROLL_POSITIONS_KEY);
    const map = JSON.parse(raw ?? '{}') as Record<string, number>;

    expect(Object.keys(map)).toHaveLength(30);
    // 가장 먼저 저장한 route-0 은 캡 초과로 버려졌어야 한다.
    expect(readScrollPosition('/route-0')).toBeNull();
    // 가장 최근 것은 남아 있다.
    expect(readScrollPosition('/route-30')).toBe(300);
  });

  it('sessionStorage에 손상된 JSON이 있으면 예외를 던지지 않고 빈 맵으로 폴백한다', () => {
    window.sessionStorage.setItem(SCROLL_POSITIONS_KEY, '{not valid json');

    expect(readScrollPosition('/home')).toBeNull();

    // 폴백 이후에도 저장은 정상 동작해야 한다(손상된 값을 덮어써 복구).
    saveScrollPosition('/home', 120);
    expect(readScrollPosition('/home')).toBe(120);
  });

  it('재삽입은 LRU 순서를 최신으로 갱신한다(같은 라우트를 다시 저장해도 캡에 영향 없음)', () => {
    saveScrollPosition('/a', 1);
    saveScrollPosition('/a', 2);

    const raw = window.sessionStorage.getItem(SCROLL_POSITIONS_KEY);
    const map = JSON.parse(raw ?? '{}') as Record<string, number>;
    expect(Object.keys(map)).toHaveLength(1);
    expect(readScrollPosition('/a')).toBe(2);
  });
});

// restoreWhenTallEnough 은 ResizeObserver(불가피한 브라우저 API — 전역 지침 3 예외)에
// 의존하므로 목킹해서 검증한다.
describe('restoreWhenTallEnough', () => {
  class MockResizeObserver {
    static instances: MockResizeObserver[] = [];
    callback: ResizeObserverCallback;
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      MockResizeObserver.instances.push(this);
    }
  }

  function createFakeHost(scrollHeight: number, clientHeight: number) {
    return {
      scrollHeight,
      clientHeight,
      scrollTop: 0,
    } as unknown as Element;
  }

  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    originalResizeObserver = window.ResizeObserver;
    MockResizeObserver.instances = [];
    // @ts-expect-error 테스트 전용 목 — 실제 ResizeObserver 시그니처와 호환된다.
    window.ResizeObserver = MockResizeObserver;
    vi.useFakeTimers();
  });

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver;
    vi.useRealTimers();
  });

  it('즉시 충분한 높이면 ResizeObserver 없이 바로 목표 지점으로 복원한다', () => {
    const host = createFakeHost(2000, 800);

    restoreWhenTallEnough(host, 1000);

    expect(host.scrollTop).toBe(1000);
    expect(MockResizeObserver.instances).toHaveLength(0);
  });

  it('처음엔 높이가 부족해도 콘텐츠가 자라면(ResizeObserver 콜백) 목표 지점으로 복원한다', () => {
    const host = createFakeHost(500, 800);

    restoreWhenTallEnough(host, 1000);

    // 아직 부족 — 복원되지 않았어야 한다.
    expect(host.scrollTop).toBe(0);
    expect(MockResizeObserver.instances).toHaveLength(1);

    // 콘텐츠가 자라 목표까지 스크롤 가능해짐을 시뮬레이션.
    Object.assign(host, { scrollHeight: 2000 });
    MockResizeObserver.instances[0].callback([], MockResizeObserver.instances[0] as unknown as ResizeObserver);

    expect(host.scrollTop).toBe(1000);
    expect(MockResizeObserver.instances[0].disconnect).toHaveBeenCalledOnce();
  });

  it('타임아웃까지 목표 높이에 못 미치면 그 시점 도달 가능한 최댓값으로 클램프한다', () => {
    // scrollHeight=900, clientHeight=800 → 최대 스크롤 가능 100. 목표 1000은 영원히 못 미친다.
    const host = createFakeHost(900, 800);

    restoreWhenTallEnough(host, 1000);
    expect(host.scrollTop).toBe(0);

    vi.advanceTimersByTime(RESTORE_TIMEOUT_MS);

    // 무작정 맨 위(0)로 두지 않고, 도달 가능했던 최댓값(100)으로 클램프한다.
    expect(host.scrollTop).toBe(100);
  });
});
