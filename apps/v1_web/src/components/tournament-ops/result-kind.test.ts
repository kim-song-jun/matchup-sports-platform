import { describe, expect, it } from 'vitest';
import { classifyEndedResult } from './result-kind';

describe('classifyEndedResult', () => {
  it.each([
    ['확정 결과 없음', { revisionId: null }, false, 'pending'],
    ['revisionId 가 비어 오면(체험 응답) 확정 결과 없음', { revisionId: undefined }, false, 'pending'],
    ['공식 결과 있음', { revisionId: 'r1', currentRevisionState: 'OFFICIAL' }, false, 'confirmed'],
    ['상태 글자가 없어도 결과가 있으면 확정됨', { revisionId: 'r1' }, false, 'confirmed'],
    ['공식 결과가 있어도 검토 기한 초과', { revisionId: 'r1', currentRevisionState: 'OFFICIAL' }, true, 'pending'],
    ['공식 결과 외 상태(제출됨)는 대기', { revisionId: 'r1', currentRevisionState: 'SUBMITTED' }, false, 'pending'],
    ['무효 처리된 결과는 확정 대기가 아니다', { revisionId: 'r1', currentRevisionState: 'VOID' }, false, 'void'],
    ['무효는 기한 초과보다 우선한다', { revisionId: 'r1', currentRevisionState: 'VOID' }, true, 'void'],
  ] as const)('%s', (_name, item, overdue, want) => {
    expect(classifyEndedResult(item, overdue)).toBe(want);
  });
});
