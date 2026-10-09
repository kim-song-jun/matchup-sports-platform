import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusInvalidMatchField } from './matches-invalid-field-focus';

const viewportCases = [
  { width: 390, height: 844, documentScroll: false },
  { width: 500, height: 757, documentScroll: false },
  { width: 768, height: 900, documentScroll: false },
  { width: 1440, height: 900, documentScroll: true },
] as const;
const focusCases = viewportCases.flatMap((viewport) =>
  [false, true].map((reduceMotion) => ({ ...viewport, reduceMotion })),
);

describe('개인 매치 첫 오류의 스크롤 소유권과 가시 영역', () => {
  const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  const scrollDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
  afterEach(() => {
    vi.restoreAllMocks();
    if (heightDescriptor) Object.defineProperty(window, 'innerHeight', heightDescriptor);
    if (scrollDescriptor) Object.defineProperty(window, 'scrollY', scrollDescriptor);
    document.body.replaceChildren();
  });

  it.each(focusCases)('$width×$height 모션 줄이기=$reduceMotion의 입력과 오류 전체를 실제 스크롤러에서 드러낸다', (viewport) => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height });
    const originalMedia = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ ...originalMedia(query), matches: viewport.reduceMotion }));
    const main = document.createElement('main');
    main.className = 'tm-scroll-area';
    main.style.overflowY = viewport.documentScroll ? 'visible' : 'auto';
    const field = document.createElement('div');
    field.className = 'tm-create-field';
    const input = document.createElement('input');
    input.type = 'time';
    field.append(input);
    const footer = document.createElement('div');
    footer.className = 'tm-create-fixed-cta';
    footer.style.position = viewport.documentScroll ? 'static' : 'fixed';
    main.append(field, footer);
    document.body.append(main);
    const scrollTop = viewport.documentScroll ? 0 : 56;
    const footerTop = viewport.height - 89;
    let documentOffset = 0;
    let scrollBehavior: ScrollBehavior | undefined;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => documentOffset });
    Object.defineProperty(main, 'scrollTo', { configurable: true, value: (options: ScrollToOptions) => {
      main.scrollTop = Math.max(0, Math.min(options.top ?? 0, 800));
      scrollBehavior = options.behavior;
    } });
    function scrollDocument(options?: ScrollToOptions): void;
    function scrollDocument(x: number, y: number): void;
    function scrollDocument(optionsOrX?: ScrollToOptions | number, y?: number): void {
      if (typeof optionsOrX === 'number') {
        documentOffset = Math.max(0, y ?? 0);
      } else {
        documentOffset = Math.max(0, optionsOrX?.top ?? 0);
        scrollBehavior = optionsOrX?.behavior;
      }
    }
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollDocument);
    const offset = () => viewport.documentScroll ? documentOffset : main.scrollTop;
    vi.spyOn(field, 'getBoundingClientRect').mockImplementation(() => new DOMRect(20, viewport.height - 111 - offset(), 218, 110));
    vi.spyOn(main, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, scrollTop, viewport.width, viewport.height - scrollTop));
    vi.spyOn(footer, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, footerTop, viewport.width, 89));
    // 네이티브 포커스가 스크롤을 변경하는 경우에도 이후 좌표로 필드 전체를 다시 정렬한다.
    input.addEventListener('focus', () => {
      if (viewport.documentScroll) documentOffset = 20;
      else main.scrollTop = 20;
    });

    focusInvalidMatchField(input);

    expect(input).toHaveFocus();
    expect(field.getBoundingClientRect().top).toBeGreaterThanOrEqual(scrollTop);
    expect(field.getBoundingClientRect().bottom).toBeLessThan(viewport.documentScroll ? viewport.height : footerTop);
    expect(scrollBehavior).toBe(viewport.reduceMotion ? 'auto' : 'smooth');
    if (viewport.documentScroll) {
      expect(main.scrollTop).toBe(0);
      expect(field.getBoundingClientRect().top + field.getBoundingClientRect().height / 2).toBe(viewport.height / 2);
    } else expect(documentOffset).toBe(0);
  });
});
