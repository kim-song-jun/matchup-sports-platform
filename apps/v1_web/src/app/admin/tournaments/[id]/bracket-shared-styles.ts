/**
 * 대진 관리 조 카드(bracket-group-*.tsx)용 입력·버튼 클래스.
 *
 * tournament-detail-client.tsx에도 동일한 이름의 상수가 있다(그 파일 안에서만 30곳 넘게
 * 재사용돼 이번 리팩터 범위 밖). 그 파일을 이 파일이 import하면 (그 파일이 이 컴포넌트들을
 * import하는) 순환 참조가 생기므로, 짧은 CSS 토큰 문자열 2개만 여기 그대로 복제해 둔다.
 */

/** h-[44px] 통일 제출 버튼 */
export const submitBtnCls = [
  'inline-flex items-center justify-center gap-1.5 h-[44px] px-4 rounded-xl',
  'whitespace-nowrap',
  'text-[13px] text-white bg-blue-500 hover:bg-blue-600',
  'transition-colors disabled:opacity-50',
  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
].join(' ');

export const inputCls = [
  'h-[44px] px-3 text-[13px] bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)]',
  'placeholder:text-[var(--text-muted)]',
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  'transition-colors disabled:opacity-50 w-full',
].join(' ');
