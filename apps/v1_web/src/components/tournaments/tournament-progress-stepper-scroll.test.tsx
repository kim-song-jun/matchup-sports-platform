import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pickFocusStageIndex,
  stepperFade,
  stepperScrollLeft,
  TournamentProgressStepper,
  type StageStatus,
  type TournamentStage,
} from './tournament-progress-stepper';

function stages(statuses: StageStatus[]): TournamentStage[] {
  return statuses.map((status, idx) => ({ key: `s${idx}`, label: `단계 ${idx + 1}`, status }));
}

describe('pickFocusStageIndex', () => {
  it('진행 중 단계가 있으면 그 단계다', () => {
    expect(pickFocusStageIndex(stages(['done', 'done', 'active', 'upcoming', 'upcoming']))).toBe(2);
  });

  it('진행 중 단계가 없으면(단계 사이 구간) 첫 미완료 단계다', () => {
    expect(pickFocusStageIndex(stages(['done', 'done', 'upcoming', 'upcoming']))).toBe(2);
  });

  it('모두 끝났으면 마지막 단계다', () => {
    expect(pickFocusStageIndex(stages(['done', 'done', 'done']))).toBe(2);
  });

  it('아직 아무것도 시작하지 않았으면 첫 단계다', () => {
    expect(pickFocusStageIndex(stages(['upcoming', 'upcoming', 'upcoming']))).toBe(0);
  });

  it('단계가 없으면 -1 이다', () => {
    expect(pickFocusStageIndex([])).toBe(-1);
  });
});

describe('stepperScrollLeft', () => {
  const viewport = 362;
  const content = 725;

  it('기준 단계를 보이는 영역 가운데로 둔다', () => {
    expect(stepperScrollLeft({ viewport, content, itemStart: 300, itemSize: 72 })).toBe(155);
  });

  it('앞쪽 단계는 0 아래로 내려가지 않는다', () => {
    expect(stepperScrollLeft({ viewport, content, itemStart: 20, itemSize: 72 })).toBe(0);
  });

  it('마지막 단계는 끝을 넘어 밀지 않는다', () => {
    expect(stepperScrollLeft({ viewport, content, itemStart: 640, itemSize: 72 })).toBe(content - viewport);
  });

  it('내용이 영역보다 짧으면 움직이지 않는다', () => {
    expect(stepperScrollLeft({ viewport: 400, content: 300, itemStart: 200, itemSize: 72 })).toBe(0);
  });
});

describe('stepperFade', () => {
  const base = { scrollWidth: 725, clientWidth: 362 };

  it('처음에는 오른쪽이 가려진다', () => {
    expect(stepperFade({ ...base, scrollLeft: 0 })).toBe('end');
  });

  it('가운데에서는 양쪽이 가려진다', () => {
    expect(stepperFade({ ...base, scrollLeft: 155 })).toBe('both');
  });

  it('끝에서는 왼쪽만 가려진다 — 소수점 위치 오차(0.5px)가 끝 판정을 뒤집지 않는다', () => {
    expect(stepperFade({ ...base, scrollLeft: 363 })).toBe('start');
    expect(stepperFade({ ...base, scrollLeft: 362.5 })).toBe('start');
  });

  it('모두 보이면 가장자리를 흐리지 않는다', () => {
    expect(stepperFade({ scrollWidth: 350, clientWidth: 350, scrollLeft: 0 })).toBe('none');
    expect(stepperFade({ scrollWidth: 350.5, clientWidth: 350, scrollLeft: 0 })).toBe('none');
  });
});

/**
 * jsdom 은 레이아웃이 없다. 스크롤 영역 폭 362 · 내용 폭 725, 단계 하나 72px 가 140px 간격으로
 * 놓인 390 폭 화면을 흉내 낸다(alpha 실측: scrollWidth 725 / clientWidth 362, 단계 5개).
 * getBoundingClientRect 는 브라우저처럼 뷰포트 기준이라 스크롤한 만큼 단계 left 가 줄어든다 —
 * 스크롤 위치를 지금 쓰는 단계 계산이 이 보정을 빠뜨리면 이미 스크롤된 뒤의 재정렬이 어긋난다.
 */
const VIEWPORT = 362;
const CONTENT = 725;
const STAGE_PITCH = 140;
const STAGE_WIDTH = 72;
const PADDING_LEFT = 20;
const LIST_LEFT = 16;

describe('TournamentProgressStepper 자동 스크롤', () => {
  let scrollTo: ReturnType<typeof vi.fn>;
  let scrollIntoView: ReturnType<typeof vi.fn>;
  let windowScrollTo: ReturnType<typeof vi.fn>;
  let reducedMotion: boolean;

  beforeEach(() => {
    reducedMotion = false;
    scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
      this.scrollLeft = options.left ?? 0;
    });
    scrollIntoView = vi.fn();
    windowScrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    vi.spyOn(window, 'scrollTo').mockImplementation(windowScrollTo);
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: reducedMotion && query.includes('prefers-reduced-motion'),
          media: query,
        }) as MediaQueryList,
    );
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => VIEWPORT });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => CONTENT });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('tm-hub-stages')) {
        return { left: LIST_LEFT, width: VIEWPORT } as DOMRect;
      }
      const list = this.parentElement as HTMLElement;
      const items = Array.from(list.querySelectorAll('[role="listitem"]'));
      return {
        left: LIST_LEFT + PADDING_LEFT + items.indexOf(this) * STAGE_PITCH - list.scrollLeft,
        width: STAGE_WIDTH,
      } as DOMRect;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
  });

  it('진행 중 단계가 첫 화면 밖이어도 마운트 때 스텝퍼 안에서 그 단계가 보이게 옮긴다', () => {
    const { container } = render(
      <TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming'])} />,
    );

    // 세 번째 단계: 시작 300 + 폭 72/2 - 영역 362/2 = 155
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: 155, behavior: 'auto' });
    expect(scrollTo.mock.contexts[0]).toBe(container.querySelector('.tm-hub-stages'));
  });

  it('세로 페이지 스크롤은 건드리지 않는다', () => {
    render(<TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming'])} />);

    expect(scrollTo.mock.calls[0][0]).not.toHaveProperty('top');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it('진행 중 단계가 없으면 첫 미완료 단계를 보인다', () => {
    render(<TournamentProgressStepper stages={stages(['done', 'done', 'done', 'upcoming', 'upcoming'])} />);

    // 네 번째 단계: 440 + 36 - 181 = 295
    expect(scrollTo).toHaveBeenCalledWith({ left: 295, behavior: 'auto' });
  });

  it('모두 끝난 대회는 마지막 단계를 보인다', () => {
    render(<TournamentProgressStepper stages={stages(['done', 'done', 'done', 'done', 'done'])} />);

    expect(scrollTo).toHaveBeenCalledWith({ left: CONTENT - VIEWPORT, behavior: 'auto' });
  });

  it('진행 단계가 바뀌면 새 단계로 다시 맞춘다 — 움직임을 줄이는 설정이 아니면 부드럽게', () => {
    const { rerender, container } = render(
      <TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming'])} />,
    );
    // 이미 155 만큼 스크롤된 상태에서 단계가 바뀐다 — 이때 단계 left 는 스크롤만큼 줄어 있다.
    expect(container.querySelector('.tm-hub-stages')?.scrollLeft).toBe(155);
    scrollTo.mockClear();

    rerender(<TournamentProgressStepper stages={stages(['done', 'done', 'done', 'active', 'upcoming'])} />);

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: 295, behavior: 'smooth' });
  });

  it('움직임 줄이기 설정이면 단계가 바뀌어도 애니메이션 없이 옮긴다', () => {
    reducedMotion = true;
    const { rerender, container } = render(
      <TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming'])} />,
    );
    expect(container.querySelector('.tm-hub-stages')?.scrollLeft).toBe(155);
    scrollTo.mockClear();

    rerender(<TournamentProgressStepper stages={stages(['done', 'done', 'done', 'active', 'upcoming'])} />);

    expect(scrollTo).toHaveBeenCalledWith({ left: 295, behavior: 'auto' });
  });

  it('기준 단계가 그대로면 다시 렌더돼도 스크롤을 건드리지 않는다 — 사용자가 직접 민 위치를 되돌리지 않는다', () => {
    const { rerender } = render(
      <TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming'])} />,
    );
    scrollTo.mockClear();

    rerender(<TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming'])} />);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('단계가 비어 있다가 채워져도 채워진 순간 맞춘다', () => {
    const { rerender, container } = render(<TournamentProgressStepper stages={[]} />);
    expect(container.querySelector('.tm-hub-stages')).toBeNull();
    expect(scrollTo).not.toHaveBeenCalled();

    rerender(<TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming'])} />);

    expect(scrollTo).toHaveBeenCalledWith({ left: 155, behavior: 'auto' });
  });

  it('가려진 쪽에 맞춰 가장자리 흐림 방향을 정한다', () => {
    const fadeOf = (statuses: StageStatus[]) => {
      const { container, unmount } = render(<TournamentProgressStepper stages={stages(statuses)} />);
      const fade = container.querySelector('.tm-hub-stages')?.getAttribute('data-fade');
      unmount();
      return fade;
    };

    expect(fadeOf(['active', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])).toBe('end');
    expect(fadeOf(['done', 'done', 'active', 'upcoming', 'upcoming'])).toBe('both');
    expect(fadeOf(['done', 'done', 'done', 'done', 'done'])).toBe('start');
  });

  it('사용자가 스텝퍼를 밀면 흐림 방향이 따라 바뀐다', () => {
    const { container } = render(
      <TournamentProgressStepper stages={stages(['active', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])} />,
    );
    const list = container.querySelector('.tm-hub-stages') as HTMLElement;
    expect(list).toHaveAttribute('data-fade', 'end');

    list.scrollLeft = 200;
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-fade', 'both');

    list.scrollLeft = CONTENT - VIEWPORT;
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-fade', 'start');
  });

  it('넘칠 때만 키보드로 닿는 스크롤 영역이 된다', () => {
    const { container, unmount } = render(
      <TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming'])} />,
    );
    expect(container.querySelector('.tm-hub-stages')).toHaveAttribute('tabindex', '0');
    unmount();

    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => VIEWPORT });
    const fits = render(<TournamentProgressStepper stages={stages(['done', 'done', 'active', 'upcoming', 'upcoming'])} />);
    const list = fits.container.querySelector('.tm-hub-stages');
    expect(list).toHaveAttribute('data-fade', 'none');
    expect(list).not.toHaveAttribute('tabindex');
  });
});
