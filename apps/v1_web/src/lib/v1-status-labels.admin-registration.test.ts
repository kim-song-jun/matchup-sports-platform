import { describe, expect, it } from 'vitest';
import { adminRegistrationStatusLabel, tournamentRegistrationStatusConfig } from './v1-status-labels';

describe('adminRegistrationStatusLabel — 어드민 신청 알약의 라벨 덮어쓰기', () => {
  it('무료 대회는 입금 말이 든 세 상태를 신청 말로 바꾼다', () => {
    expect(adminRegistrationStatusLabel('awaiting_payment', true, null)).toBe('신청 작성 중');
    expect(adminRegistrationStatusLabel('payment_checking', true, null)).toBe('신청 확인 중');
    expect(adminRegistrationStatusLabel('paid', true, null)).toBe('신청 완료');
  });

  it('유료 대회는 알약 기본 라벨을 쓰도록 비워 둔다', () => {
    for (const status of ['awaiting_payment', 'payment_checking', 'paid', 'confirmed', 'waitlisted', 'cancel_requested', 'submitted'] as const) {
      expect(adminRegistrationStatusLabel(status, false, null)).toBeUndefined();
    }
  });

  it('무료 대회도 확정·대기·취소 요청처럼 입금 말이 없는 상태는 기본 라벨을 쓴다', () => {
    for (const status of ['confirmed', 'waitlisted', 'cancel_requested', 'submitted'] as const) {
      expect(adminRegistrationStatusLabel(status, true, null)).toBeUndefined();
    }
  });

  it('임시저장은 신청 상태 정본의 말과 같다 — 알약 기본 「초안」은 대회 초안을 뜻한다', () => {
    expect(adminRegistrationStatusLabel('draft', false, null)).toBe('임시저장');
    expect(adminRegistrationStatusLabel('draft', true, null)).toBe(tournamentRegistrationStatusConfig('draft', null).label);
  });

  it('어드민이 처리한 취소는 누가 끝냈는지가 드러나고, 처리하지 않은 취소는 기본 라벨이다', () => {
    expect(adminRegistrationStatusLabel('cancelled', false, 'approved')).toBe('취소 승인됨');
    expect(adminRegistrationStatusLabel('cancelled', true, 'rejected')).toBe('거부됨');
    expect(adminRegistrationStatusLabel('cancelled', false, null)).toBeUndefined();
  });
});
