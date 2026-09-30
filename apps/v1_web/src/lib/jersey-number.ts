/**
 * 등번호 입력값을 보낼 값으로 바꾼다.
 *
 * **`Number()` 에 그냥 넘기면 안 된다.** `type="number"` 입력은 `e`·`1e2`·`-` 를 그대로
 * 통과시키고, `Number('e')` 는 `NaN` 이며 **`NaN` 은 JSON 에서 `null` 로 직렬화된다** —
 * 서버에서 "번호를 안 보냄" 과 구분되지 않아 번호가 조용히 사라진다(2026-09-04 Copilot 리뷰).
 *
 * 빈 값은 **번호 없는 선수**이지 오류가 아니다. `0` 은 유효한 등번호다. 범위는 서버 DTO 와 같은 0~99(두 자리까지)다.
 */
export function parseJerseyInput(raw: string): { ok: true; value?: number } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true };
  if (!/^\d{1,2}$/.test(trimmed)) return { ok: false };
  return { ok: true, value: Number(trimmed) };
}
