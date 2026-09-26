/**
 * BottomSheet 드래그-닫기(A안) 계약 검증.
 *
 * jsdom 은 `PointerEvent`·`setPointerCapture` 계열을 구현하지 않는다(불가피한 브라우저 API
 * mock, CLAUDE.md 품질 규칙 3의 예외) — 이 파일에서만 최소 폴리필을 둔다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { MouseEvent, ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, decideBackAction, installNavigationHistory } from '@/lib/navigation-history';
import { createHistoryRouter, currentPath, settleHistory } from '@/test/history-router';
import { BottomSheet } from './bottom-sheet';

const router = createHistoryRouter();
vi.mock('next/navigation', () => ({ useRouter: () => router }));
// Next Link 처럼 기본 동작은 push — 가로채는 쪽이 preventDefault 하면 아무것도 안 한다.
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children?: ReactNode; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        router.push(href);
      }}
    >
      {children}
    </a>
  ),
}));

const SHEET_HEIGHT = 200;
// DRAG_CLOSE_RATIO(0.32) 와 동일한 값을 여기서도 써야 임계치 위/아래 케이스를 정확히
// 가른다 — 컴포넌트 내부 상수를 바꾸면 이 테스트의 오프셋 값도 함께 재계산해야 한다.
const BELOW_THRESHOLD_OFFSET = SHEET_HEIGHT * 0.32 - 10; // 54px — 안 닫혀야 한다
const ABOVE_THRESHOLD_OFFSET = SHEET_HEIGHT * 0.32 + 10; // 74px — 닫혀야 한다

beforeAll(() => {
  // jsdom 에 PointerEvent 생성자가 없으면 @testing-library/dom 이 그냥 plain Event 로
  // 대체하는데, 그러면 clientY/pointerId 가 이벤트에 실리지 않아 드래그 로직을 아예
  // 검증할 수 없다 — init dict 를 그대로 받아 싣는 최소 폴리필.
  if (typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends Event {
      clientY: number;
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.clientY = init.clientY ?? 0;
        this.pointerId = init.pointerId ?? 0;
      }
    }
    // @ts-expect-error — jsdom 환경 전용 최소 폴리필이라 브라우저 lib.dom 타입과 완전히 맞지 않는다.
    window.PointerEvent = PointerEventPolyfill;
  }
  if (!('setPointerCapture' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { value: vi.fn(), writable: true });
  }
  if (!('hasPointerCapture' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { value: () => true, writable: true });
  }
  if (!('releasePointerCapture' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { value: vi.fn(), writable: true });
  }
  // 임계치 판정이 시트의 실제 렌더 높이를 쓰므로(고정 px 대신 비율) 고정 값으로 잰다.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: SHEET_HEIGHT,
    width: 0,
    top: 0,
    bottom: SHEET_HEIGHT,
    left: 0,
    right: 0,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    },
  } as DOMRect);
});

beforeEach(() => {
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/home');
});

afterEach(() => {
  vi.clearAllMocks();
  __resetNavigationHistoryForTests();
});

function drag(dialog: HTMLElement, offset: number) {
  fireEvent.pointerDown(dialog, { clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(dialog, { clientY: offset, pointerId: 1 });
  fireEvent.pointerUp(dialog, { clientY: offset, pointerId: 1 });
}

const renderSheet = (children: ReactNode = <p>내용</p>) =>
  render(
    <BottomSheet open closeHref="/matches" ariaLabel="필터">
      {children}
    </BottomSheet>,
  );

describe('BottomSheet 드래그-닫기', () => {
  it('임계치(시트 높이의 32%) 미만으로 끌고 놓으면 닫히지 않는다', () => {
    // 오작동 방지: 살짝 스친 정도로 시트가 닫혀 버리면 사용자가 필터를 훑어보다가 실수로 다 잃는다.
    window.history.replaceState(null, '', '/matches?filter=open');
    renderSheet();
    drag(screen.getByRole('dialog'), BELOW_THRESHOLD_OFFSET);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('임계치를 넘기면 닫는다 — 시트를 연 항목이 없으면(딥링크) closeHref 로 replace', () => {
    window.history.replaceState(null, '', '/matches?filter=open');
    renderSheet();
    drag(screen.getByRole('dialog'), ABOVE_THRESHOLD_OFFSET);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/matches');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('시트 안 버튼 위에서 시작한 포인터는 드래그를 시작하지 않는다', () => {
    // 회귀 방지: 이 가드가 없으면 버튼을 누르려는 손가락의 미세한 움직임마다 시트가 따라 흔들린다.
    const setCaptureSpy = vi.spyOn(HTMLElement.prototype, 'setPointerCapture');
    renderSheet(<button type="button">적용하기</button>);
    const button = screen.getByRole('button', { name: '적용하기' });
    fireEvent.pointerDown(button, { clientY: 0, pointerId: 1 });
    expect(setCaptureSpy).not.toHaveBeenCalled();
    fireEvent.pointerMove(button, { clientY: ABOVE_THRESHOLD_OFFSET, pointerId: 1 });
    fireEvent.pointerUp(button, { clientY: ABOVE_THRESHOLD_OFFSET, pointerId: 1 });
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('BottomSheet 닫기와 히스토리', () => {
  /** /home → /matches → (필터 열기 push) /matches?filter=open */
  function openFromList() {
    installNavigationHistory();
    window.history.pushState({}, '', '/matches');
    window.history.pushState({}, '', '/matches?filter=open');
  }

  it.each([
    ['닫기 링크', () => screen.getByRole('link', { name: '닫기' })],
    ['scrim', () => screen.getByRole('link', { name: '필터 닫기' })],
  ])('%s 로 닫으면 연 항목을 걷는다 — 다음 뒤로가기가 시트를 다시 열지 않는다', async (_, target) => {
    openFromList();
    renderSheet(<a href="/matches">닫기</a>);
    fireEvent.click(target());
    await settleHistory();

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(currentPath()).toBe('/matches');
    // 바로 앞 항목이 /home 이다 — 한 번 더 뒤로 가면 목록을 떠난다(시트로 돌아가지 않는다).
    expect(decideBackAction('/home')).toBe('back');
  });

  it('시트 안의 칩 이동은 쌓지 않고 replace 한다', async () => {
    openFromList();
    renderSheet(<a href="/matches?filter=open&region=seoul">서울</a>);
    fireEvent.click(screen.getByRole('link', { name: '서울' }));

    expect(router.replace).toHaveBeenCalledWith('/matches?filter=open&region=seoul');
    expect(router.push).not.toHaveBeenCalled();
    expect(decideBackAction('/matches')).toBe('back');
  });
});
