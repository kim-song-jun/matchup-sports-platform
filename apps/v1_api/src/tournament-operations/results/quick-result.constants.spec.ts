import { QUICK_RESULT_REASON_MARKER, revisionEntryMethod } from './quick-result.constants';

describe('revisionEntryMethod', () => {
  it('reason 이 마커로 시작하면 quick — 무효 뒤 재입력(supersedesId 있음)도 quick 이다', () => {
    expect(revisionEntryMethod({ reason: QUICK_RESULT_REASON_MARKER, supersedesId: null })).toBe('quick');
    expect(revisionEntryMethod({ reason: `${QUICK_RESULT_REASON_MARKER} 재입력`, supersedesId: 'rev-void' })).toBe('quick');
  });

  it('마커가 맨 앞이 아니면 quick 이 아니다 — 운영자가 쓴 정정 사유에 우연히 들어간 경우', () => {
    expect(revisionEntryMethod({ reason: `정정 ${QUICK_RESULT_REASON_MARKER}`, supersedesId: 'rev-1' })).toBe('correction');
  });

  it('이전 리비전을 대체하면 correction, 아니면 console', () => {
    expect(revisionEntryMethod({ reason: '운영자 결과 정정', supersedesId: 'rev-1' })).toBe('correction');
    expect(revisionEntryMethod({ reason: null, supersedesId: 'rev-1' })).toBe('correction');
    expect(revisionEntryMethod({ reason: null, supersedesId: null })).toBe('console');
    expect(revisionEntryMethod({ reason: '경기 종료', supersedesId: null })).toBe('console');
  });
});
