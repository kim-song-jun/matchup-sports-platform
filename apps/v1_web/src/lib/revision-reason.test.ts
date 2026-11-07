import { describe, expect, it } from 'vitest';
import { displayRevisionReason } from './revision-reason';

describe('displayRevisionReason — 내부 마커 표시 제거', () => {
  // 서버는 리비전 종류를 가르려고 reason 앞에 마커를 붙여 저장한다. 저장값은 못 바꾸므로 표시에서 벗긴다.
  it('맨 앞의 마커를 전부 벗기고 본문만 남긴다', () => {
    expect(displayRevisionReason('[LEAGUE_RESULT_CORRECTION] 검증: 스코어 정정')).toBe('검증: 스코어 정정');
    expect(displayRevisionReason('[LEAGUE_RESULT_ENTRY] 1주차 입력')).toBe('1주차 입력');
    expect(displayRevisionReason('[quick-result] 현장 기록지 기준')).toBe('현장 기록지 기준');
    expect(displayRevisionReason('[LEAGUE_RESULT_CORRECTION] [quick-result] 재입력')).toBe('재입력');
  });

  it('마커만 있는 사유(어드민 빠른 결과가 저장하는 값)는 빈 문자열이라 사유 줄이 그려지지 않는다', () => {
    expect(displayRevisionReason('[quick-result]')).toBe('');
    expect(displayRevisionReason('[LEAGUE_RESULT_ENTRY]  ')).toBe('');
  });

  it('운영자가 쓴 문장은 건드리지 않는다 — 한글·혼합 대소문자 말머리와 문장 중간의 표식', () => {
    expect(displayRevisionReason('상대 요청으로 정정')).toBe('상대 요청으로 정정');
    expect(displayRevisionReason('[비고] 우천 단축')).toBe('[비고] 우천 단축');
    expect(displayRevisionReason('[Note] 우천 단축')).toBe('[Note] 우천 단축');
    expect(displayRevisionReason('골 기록 [quick-result] 반영')).toBe('골 기록 [quick-result] 반영');
    expect(displayRevisionReason(null)).toBe('');
  });
});
