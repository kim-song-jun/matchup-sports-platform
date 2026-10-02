/**
 * URL 쿼리로 들어온 필터 값을 **허용 목록과 대조해** 통과시킨다. 목록에 없으면 빈 문자열
 * (= 전체)로 떨어뜨린다.
 *
 * URL 값은 사용자가 손으로 고칠 수 있고, 북마크·공유 링크로 오래 살아남는다. 검증 없이
 * 그대로 필터에 실으면 서버가 400 을 내고 화면은 원인 모를 전면 에러가 된다 — 실제로
 * 회원·매치·팀매치 목록에서 `?status=` 오타 하나로 목록을 아예 못 보는 상태가 됐다.
 * "다시 시도"를 눌러도 같은 값으로 재요청하므로 스스로 필터 칩을 눌러 URL 을 바꿔야
 * 한다는 걸 알아내야 회복된다.
 *
 * 이 규칙은 원래 문의 목록(admin/inquiries)에만 있었다. 같은 방어를 네 화면이 각자
 * 복붙하지 않도록 여기로 옮긴다 — 한 곳에만 있는 규칙은 나머지에서 조용히 빠진다.
 *
 * 허용 목록은 화면이 그리는 **필터 칩 목록 그대로**를 넘긴다. 칩에 없는 값은 사용자가
 * 화면에서 고를 수 없는 값이므로, 그것이 곧 유효 범위다.
 */
export function pickAllowedParam(
  raw: string | null | undefined,
  allowed: ReadonlyArray<{ value: string }>,
): string {
  if (!raw) return '';
  return allowed.some((option) => option.value === raw && raw !== '') ? raw : '';
}
