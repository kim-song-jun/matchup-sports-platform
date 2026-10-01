/**
 * 오버레이가 하나라도 열려 있는 동안 body 스크롤을 잠근다. 반환값이 해제 함수다.
 *
 * 잠금마다 직전 값을 저장했다 되돌리면 해제 순서가 연 순서의 역순일 때만 맞는다 — 시트 A 가
 * 닫히는 커밋보다 시트 B 가 먼저 잠그면 B 가 A 의 'hidden' 을 원래 값으로 저장해, B 가 열린
 * 동안은 풀리고 둘 다 닫힌 뒤에는 잠긴 채 남는다. 그래서 개수를 세고 마지막 해제에서만
 * 첫 잠금 전의 인라인 값으로 되돌린다. 모바일 셸의 CSS 잠금(`body:has(.tm-app-frame)`)은
 * 인라인 값이 아니라서 건드리지 않는다.
 */
let holders = 0;
let inlineBeforeLock = '';

export function lockBodyScroll(): () => void {
  if (holders === 0) inlineBeforeLock = document.body.style.overflow;
  holders += 1;
  document.body.style.overflow = 'hidden';
  return () => {
    holders -= 1;
    if (holders === 0) document.body.style.overflow = inlineBeforeLock;
  };
}
