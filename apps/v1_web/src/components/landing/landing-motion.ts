/*
 * 랜딩 모션 컨트롤러. IntersectionObserver 는 트리거만 맡고 움직임은 CSS(transform/opacity)가 한다.
 * 서버가 그린 기본 상태는 "모션이 끝난 최종 장면"이다 — JS 가 없거나(크롤러) 모션 감소 설정이면
 * 아무것도 숨기지 않은 채 그대로 둔다. 숨김 상태는 root[data-motion='on'] 아래에서만 걸린다.
 */

export function startLandingMotion(root: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cleanups: Array<() => void> = [];

  /* 1. 스크롤 reveal — 이미 화면 안(위)에 있는 요소는 숨기지 않고 바로 최종 상태로 둔다 */
  if (!reduce) {
    const revealIO = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          revealIO.unobserve(entry.target);
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -6% 0px' },
    );
    root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in');
      else revealIO.observe(el);
    });
    root.dataset.motion = 'on';
    cleanups.push(() => revealIO.disconnect());
  }

  /* 2. 반복 모션 구역 — 뷰포트 밖이면 data-loop="off" 로 CSS 반복 애니메이션을 멈춘다(landing.css --tm-landing-play) */
  const loopIO = new IntersectionObserver((entries) => {
    for (const entry of entries) (entry.target as HTMLElement).dataset.loop = entry.isIntersecting ? 'on' : 'off';
  });
  root.querySelectorAll('[data-loop]').forEach((el) => loopIO.observe(el));
  cleanups.push(() => loopIO.disconnect());

  return () => cleanups.forEach((fn) => fn());
}
