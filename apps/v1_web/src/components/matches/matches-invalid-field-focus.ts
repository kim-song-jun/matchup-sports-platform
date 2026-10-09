/** 생성·수정 위저드의 첫 오류 입력과 안내를 고정 CTA 위에 함께 드러낸다. */
export function focusInvalidMatchField(input: HTMLElement | null): void {
  if (!input) return;
  // 네이티브 date/time 포커스가 스크롤에 영향을 주어도 그 뒤의 실제 좌표로 정렬한다.
  input.focus({ preventScroll: true });
  const field = input.closest<HTMLElement>('.tm-create-field') ?? input;
  const fieldRect = field.getBoundingClientRect();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior = reduceMotion ? 'auto' : 'smooth';
  if (fieldRect.height === 0) {
    field.scrollIntoView?.({ behavior, block: 'center' });
    return;
  }
  // 모바일은 내부 main, 데스크톱은 문서가 스크롤을 소유한다. 클래스만으로 고르지 않는다.
  let scroller = field.parentElement;
  while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  const scrollRect = scroller?.getBoundingClientRect();
  const top = Math.max(0, scrollRect?.top ?? 0);
  const bottom = Math.min(window.innerHeight, scrollRect?.bottom ?? window.innerHeight);
  const footer = input.closest('main')?.querySelector<HTMLElement>('.tm-create-fixed-cta');
  // 데스크톱의 정적 CTA는 가림 영역이 아니다. 모바일에서는 safe inset까지 포함한 실제 높이다.
  const visibleBottom = footer && getComputedStyle(footer).position === 'fixed'
    ? Math.min(bottom, footer.getBoundingClientRect().top)
    : bottom;
  const targetTop = top + Math.max(0, (visibleBottom - top - fieldRect.height) / 2);
  const offset = fieldRect.top - targetTop;
  if (scroller) scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + offset), behavior });
  else window.scrollTo({ top: Math.max(0, window.scrollY + offset), behavior });
}
