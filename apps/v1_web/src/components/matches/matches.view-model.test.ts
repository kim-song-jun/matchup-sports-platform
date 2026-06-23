import { describe, it, expect } from 'vitest';
import { applyLabel } from './matches.view-model';

/**
 * 회귀 가드: 백엔드 getReasonMessage('OK')가 '신청할 수 있습니다.'(합니다체)에서
 * '신청할 수 있어요.'(해요체)로 바뀌어도 CTA 라벨이 깨지지 않아야 한다.
 * 과거엔 message 문자열을 OK sentinel과 비교해 거르다가 카피 변경 시 OK 메시지가
 * 그대로 라벨로 노출됐다 → eligible 불리언을 단일 진실원천으로 판단하도록 수정(Copilot).
 */
describe('applyLabel — 참가 CTA 라벨 계약', () => {
  it('eligible=true면 message 문자열과 무관하게 항상 "참가 신청"', () => {
    expect(applyLabel('guest', 'recruiting', true, '신청할 수 있어요.')).toBe('참가 신청');
    expect(applyLabel('guest', 'recruiting', true, '신청할 수 있습니다.')).toBe('참가 신청');
    expect(applyLabel('none', 'recruiting', true, undefined)).toBe('참가 신청');
  });

  it('eligible=false면 백엔드 차단 사유 메시지를 그대로 노출', () => {
    expect(applyLabel('guest', 'recruiting', false, '신청 마감된 매치예요.')).toBe('신청 마감된 매치예요.');
    expect(applyLabel('none', 'recruiting', false, '정원이 가득 찼어요.')).toBe('정원이 가득 찼어요.');
  });

  it('eligible=false인데 메시지가 없으면 "참가 신청"으로 fallback', () => {
    expect(applyLabel('guest', 'recruiting', false, undefined)).toBe('참가 신청');
  });

  it('종료 계열 status(closed/cancelled/completed/expired/full)는 eligible과 무관하게 "신청 불가"', () => {
    for (const s of ['closed', 'cancelled', 'completed', 'expired', 'full'] as const) {
      expect(applyLabel('guest', s, true, '신청할 수 있어요.')).toBe('신청 불가');
    }
  });

  it('viewerState 우선순위(host/requested/approved·participant)가 status·eligible보다 우선', () => {
    expect(applyLabel('host', 'recruiting', true)).toBe('매치 관리');
    expect(applyLabel('requested', 'recruiting', false)).toBe('신청 취소');
    expect(applyLabel('approved', 'recruiting', false)).toBe('승인 완료');
    expect(applyLabel('participant', 'recruiting', false)).toBe('승인 완료');
  });
});
