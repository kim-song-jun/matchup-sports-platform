/** Mirrors `QUICK_RESULT_REASON_MARKER` in v1_api `quick-result.constants.ts`. */
const QUICK_RESULT_MARKER = '[quick-result]';

/** Uppercase audit codes such as `[LEAGUE_RESULT_ENTRY]` that league result paths prefix to `reason`. */
const AUDIT_CODE_MARKER = /^\[[A-Z0-9_]+\]\s*/;

/**
 * 결과 리비전 `reason` 의 표시용 정리 — 맨 앞의 내부 마커를 전부 벗기고 사람이 쓴 문장만 남긴다
 * (없으면 빈 문자열이라 호출부의 `reason ? … : null` 이 그 줄을 그리지 않는다).
 *
 * 마커(`[LEAGUE_RESULT_ENTRY]`, 어드민 빠른 결과의 `[quick-result]`)는 서버가 리비전 종류를
 * 가르는 데(startsWith) 쓰는 저장용 값이라 저장에서 뺄 수 없다. 사용자가 직접 쓴 `[비고]` 같은
 * 말머리와 부딪히지 않도록 대문자 코드 형태와 이 알려진 마커만 벗긴다.
 */
export function displayRevisionReason(reason: string | null | undefined): string {
  let text = reason ?? '';
  for (;;) {
    const stripped = text.startsWith(QUICK_RESULT_MARKER)
      ? text.slice(QUICK_RESULT_MARKER.length).trimStart()
      : text.replace(AUDIT_CODE_MARKER, '');
    if (stripped === text) break;
    text = stripped;
  }
  return text.trim();
}
