/**
 * 스크롤 등장(reveal) 트리거. 움직임은 CSS 가 하고 여기서는 `[data-reveal]` 에 `.is-in` 만 붙인다.
 * 숨김 규칙은 root[data-motion='on'] 아래에만 걸려야 한다 — JS 가 없거나 모션 감소 설정이면
 * 이 함수가 data-motion 을 달지 않으므로 서버 HTML(최종 상태) 그대로 보인다.
 * 마운트 뒤에 새로 그려지는 요소에는 data-reveal 을 달지 않는다(관찰 대상이 아니라 숨은 채 남는다).
 *
 * @returns 정리 함수. 모션을 켜지 않았으면 null.
 */
export function startRevealOnScroll(root: HTMLElement): (() => void) | null {
  if (typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.18, rootMargin: '0px 0px -6% 0px' },
  );
  // 이미 화면 안(위)에 있는 요소는 숨기지 않고 바로 최종 상태로 둔다
  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in');
    else observer.observe(el);
  });
  root.dataset.motion = 'on';
  return () => observer.disconnect();
}
