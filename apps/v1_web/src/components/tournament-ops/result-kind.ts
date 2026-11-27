/** 끝난 경기의 결과 처리 단계. 운영 보드 카드와 결과 화면이 같은 말로 갈린다. */
export type EndedResultKind = 'pending' | 'void' | 'confirmed';

interface EndedResultInput {
  revisionId: string | null | undefined;
  /** 보드가 내려주는 공식 결과 포인터의 상태(`OFFICIAL`·`VOID` …). */
  currentRevisionState?: string | null;
}

/**
 * 확정 결과가 없거나 공식 결과 외 상태이거나 검토 기한을 넘기면 확정 대기, 무효 처리된 결과는 따로(`void`),
 * 나머지는 확정됨. 무효는 확정을 기다리는 것이 아니라 다시 입력할 일이다.
 */
export function classifyEndedResult(item: EndedResultInput, overdue: boolean): EndedResultKind {
  if (!item.revisionId) return 'pending';
  if (item.currentRevisionState === 'VOID') return 'void';
  if (overdue) return 'pending';
  if (item.currentRevisionState && item.currentRevisionState !== 'OFFICIAL') return 'pending';
  return 'confirmed';
}
