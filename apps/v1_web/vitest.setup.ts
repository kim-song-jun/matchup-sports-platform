import '@testing-library/jest-dom/vitest';

// jsdom은 window.matchMedia를 구현하지 않는다. ThemeProvider(다크모드 시스템 설정 감지)를 비롯해
// prefers-color-scheme/반응형 훅을 쓰는 컴포넌트를 렌더하는 모든 테스트에 필요한 최소 스텁 —
// 불가피한 브라우저 API mock(CLAUDE.md 품질 규칙 3의 예외)이다.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

// jsdom 은 Element.scrollTo 도 구현하지 않는다(레이아웃이 없다). 스크롤 위치를 맞추는 컴포넌트를
// 렌더하는 테스트가 TypeError 로 죽지 않게 하는 최소 스텁 — 위치를 검증하는 테스트는 자기 spy 로 덮어쓴다.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function scrollTo() {};
}
