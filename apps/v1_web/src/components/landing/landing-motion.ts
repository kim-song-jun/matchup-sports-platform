import { startRevealOnScroll } from '@/lib/reveal-on-scroll';

/*
 * 랜딩 모션 컨트롤러. IntersectionObserver 는 트리거만 맡고 움직임은 CSS(transform/opacity)가 한다.
 * 서버가 그린 기본 상태는 "모션이 끝난 최종 장면"이다 — JS 가 없거나(크롤러) 모션 감소 설정이면
 * 아무것도 숨기지 않은 채 그대로 둔다. 숨김 상태는 root[data-motion='on'] 아래에서만 걸린다.
 */

export function startLandingMotion(root: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const cleanups: Array<() => void> = [];

  /* 1. 스크롤 reveal — 공개 페이지와 같은 트리거 */
  const stopReveal = startRevealOnScroll(root);
  if (stopReveal) cleanups.push(stopReveal);

  /* 2. 반복 모션 구역 — 뷰포트 밖이면 data-loop="off" 로 CSS 반복 애니메이션을 멈춘다(landing.css --tm-landing-play) */
  const loopIO = new IntersectionObserver((entries) => {
    for (const entry of entries) (entry.target as HTMLElement).dataset.loop = entry.isIntersecting ? 'on' : 'off';
  });
  root.querySelectorAll('[data-loop]').forEach((el) => loopIO.observe(el));
  cleanups.push(() => loopIO.disconnect());

  return () => cleanups.forEach((fn) => fn());
}
