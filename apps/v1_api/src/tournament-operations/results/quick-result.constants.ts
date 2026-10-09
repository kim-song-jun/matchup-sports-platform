/** 빠른 결과가 만든 리비전의 `reason` 맨 앞에 붙는 표식. 어드민 응답의 `entryMethod` 가 이것으로 갈린다. */
export const QUICK_RESULT_REASON_MARKER = '[quick-result]';

export type RevisionEntryMethod = 'quick' | 'console' | 'correction';

/**
 * 결과 리비전이 어떻게 들어왔는지. `supersedesId` 는 정정뿐 아니라 무효·보완 요청 뒤의 새 초안에도 붙어서,
 * 'correction' 은 "앞 리비전을 대체한 것" 이라는 뜻이다(콘솔 종료가 만든 첫 초안만 'console').
 */
export function revisionEntryMethod(rev: { reason: string | null; supersedesId: string | null }): RevisionEntryMethod {
  if (rev.reason?.startsWith(QUICK_RESULT_REASON_MARKER)) return 'quick';
  return rev.supersedesId === null ? 'console' : 'correction';
}
