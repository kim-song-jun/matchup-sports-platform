/**
 * 검증 오류로 포커스를 옮길 때 고정 상단바 뒤에 라벨·안내가 숨지 않게 하는 공용 도구.
 * Android System WebView 의 focus() 스크롤은 CSS scroll-margin 을 무시하므로,
 * focus 는 preventScroll 로 하고 스크롤 컨테이너 위치는 직접 계산해 맞춘다.
 */
const TOPBAR_FALLBACK_PX = 56;
const TOPBAR_GAP_PX = 16;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 고정 상단바 높이. CSS 토큰(--v1-shell-topbar-height)을 읽고, 읽지 못하면 56px. */
export function readTopbarHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--v1-shell-topbar-height');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : TOPBAR_FALLBACK_PX;
}

function findScroller(node: HTMLElement): HTMLElement | null {
  const marked = node.closest<HTMLElement>('.tm-scroll-area');
  if (marked) return marked;
  let current = node.parentElement;
  while (current) {
    if (['auto', 'scroll'].includes(getComputedStyle(current).overflowY)) return current;
    current = current.parentElement;
  }
  return null;
}

/** target 윗면이 상단바 + 여백 아래에 오도록 가장 가까운 스크롤 컨테이너를 스크롤한다. */
export function scrollBelowTopbar(target: HTMLElement): void {
  const scroller = findScroller(target);
  const rect = target.getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) return;
  const scrollerTop = scroller ? scroller.getBoundingClientRect().top : 0;
  const visibleTop = Math.max(scrollerTop, readTopbarHeight()) + TOPBAR_GAP_PX;
  if (rect.top >= visibleTop) return;
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
  const delta = rect.top - visibleTop;
  if (scroller) scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + delta), behavior });
  else window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior });
}

/**
 * 첫 오류 입력에 포커스를 주고, 필드 래퍼(`.tm-create-field`)나 `revealTarget` 이 상단바 아래에 보이게 한다.
 * 브라우저 기본 포커스 스크롤은 쓰지 않는다(preventScroll).
 */
export function focusBelowTopbar(el: HTMLElement | null, revealTarget?: HTMLElement | null): void {
  if (el === null) return;
  el.focus({ preventScroll: true });
  scrollBelowTopbar(revealTarget ?? el.closest<HTMLElement>('.tm-create-field') ?? el);
}
