import { describe, expect, it } from 'vitest';
import { matchOutcomeReasonLabel, toDisplayableOutcomeReason } from './match-outcome';

/**
 * 이 가드가 없을 때 실제로 난 일: 확정 확인 모달이 `outcomeReason !== 'NORMAL'` 로만
 * 분기해, 필드가 없는(계약에 뒤처진) 응답에서 라벨 조회가 `undefined` 를 돌려주고
 * "2:1 (undefined) 결과를 공식 결과로 확정해요" 가 떴다 — 되돌릴 수 없는 확정 직전
 * 화면이다. 아는 값만 통과시키는 게 이 함수의 전부이자 존재 이유다.
 */
describe('toDisplayableOutcomeReason', () => {
  it('아는 사유는 그대로 통과시킨다', () => {
    expect(toDisplayableOutcomeReason('FORFEIT')).toBe('FORFEIT');
    expect(toDisplayableOutcomeReason('ABANDONED')).toBe('ABANDONED');
  });

  it('정상 종료는 표기 대상이 아니다', () => {
    expect(toDisplayableOutcomeReason('NORMAL')).toBeNull();
  });

  it('모르는 값·누락은 표기하지 않는다 (undefined 라벨이 문구로 새지 않게)', () => {
    for (const input of ['ABANDONED_WEATHER', '', null, undefined]) {
      expect(toDisplayableOutcomeReason(input)).toBeNull();
    }
  });

  it('통과한 값은 항상 사람이 읽을 수 있는 라벨이 있다', () => {
    for (const reason of ['FORFEIT', 'ABANDONED'] as const) {
      const label = matchOutcomeReasonLabel(reason);
      expect(label).toBeTruthy();
      expect(label).not.toContain('undefined');
    }
  });
});
