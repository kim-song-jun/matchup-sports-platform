/**
 * 화면 밖에 생긴 안내·패널을 뷰 가운데로 끌어오고 포커스를 옮긴다.
 * 대상은 `tabIndex={-1}` 이어야 포커스를 받는다. 모션 줄이기 설정이면 스크롤 애니메이션을 끈다.
 */
export function revealAndFocus(node: HTMLElement | null): void {
  if (node === null) return;
  const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // jsdom 등 레이아웃이 없는 환경에는 scrollIntoView 가 없다.
  node.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  node.focus({ preventScroll: true });
}
