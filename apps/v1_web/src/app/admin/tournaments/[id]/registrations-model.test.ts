import { describe, expect, it } from 'vitest';
import { registrationFixture as reg } from '@/test/registration-fixtures';
import {
  groupRegistrations,
  isBulkSelectable,
  registrationMenuSubtitle,
  registrationPrimaryAction,
  registrationStatusLabel,
  registrationTodoHint,
} from './registrations-model';

const STATUSES = [
  'submitted',
  'awaiting_payment',
  'payment_checking',
  'paid',
  'cancel_requested',
  'confirmed',
  'waitlisted',
  'cancelled',
  'draft',
] as const;

describe('신청 묶음·라벨 모델', () => {
  it('9개 상태가 정확히 한 묶음에만 들어가고 입력 순서를 지킨다', () => {
    const g = groupRegistrations(STATUSES.map((status, i) => reg({ id: `r${i}`, status })));
    expect(g.todo.map((r) => r.status)).toEqual([
      'submitted',
      'awaiting_payment',
      'payment_checking',
      'paid',
      'cancel_requested',
    ]);
    expect(g.confirmed.map((r) => r.status)).toEqual(['confirmed']);
    expect([g.waitlisted, g.cancelled, g.drafts].map((x) => x[0].status)).toEqual(['waitlisted', 'cancelled', 'draft']);
    expect(Object.values(g).flat()).toHaveLength(9);
  });

  it('같은 묶음 안에서는 API 가 준 순서를 바꾸지 않는다', () => {
    const g = groupRegistrations([
      reg({ id: 'late', status: 'paid' }),
      reg({ id: 'early', status: 'awaiting_payment' }),
      reg({ id: 'mid', status: 'cancel_requested' }),
    ]);
    expect(g.todo.map((r) => r.id)).toEqual(['late', 'early', 'mid']);
  });

  it('무료 대회 문구에는 입금이 없고 유료 문구에는 신청 확인이 없다', () => {
    for (const status of ['submitted', 'awaiting_payment', 'payment_checking', 'paid', 'cancel_requested'] as const) {
      const free = [registrationTodoHint(reg({ status }), true), registrationStatusLabel(reg({ status }), true) ?? ''].join(' ');
      expect(free).not.toContain('입금');
      const paid = [registrationTodoHint(reg({ status }), false), registrationStatusLabel(reg({ status }), false) ?? ''].join(' ');
      expect(paid).not.toContain('신청 확인');
    }
    expect(registrationStatusLabel(reg({ status: 'awaiting_payment' }), true)).toBe('신청 작성 중');
    expect(registrationStatusLabel(reg({ status: 'awaiting_payment' }), false)).toBeUndefined();
    expect(registrationStatusLabel(reg({ status: 'cancelled', cancelOutcome: 'approved' }), false)).toBe('취소 승인됨');
    expect(registrationStatusLabel(reg({ status: 'draft' }), false)).toBe('임시저장');
  });

  it('처리할 것이 아닌 상태에는 한 줄 설명이 없다', () => {
    for (const status of ['confirmed', 'waitlisted', 'cancelled', 'draft'] as const) {
      expect(registrationTodoHint(reg({ status }), false)).toBe('');
    }
  });

  it('주 버튼 판정과 일괄 선택 대상', () => {
    expect(STATUSES.map(registrationPrimaryAction)).toEqual([
      'view-roster',
      'confirm-payment',
      'confirm',
      'confirm',
      'handle-cancel',
      'view-roster',
      'confirm',
      'view-roster',
      'view-roster',
    ]);
    expect(STATUSES.filter((status) => isBulkSelectable(reg({ status })))).toEqual(['awaiting_payment']);
  });

  it('⋯ 시트 머리 한 줄은 상태·명단 인원·잠금을 말한다', () => {
    expect(registrationMenuSubtitle(reg({ status: 'confirmed', playerCount: 7 }), false)).toBe('참가 확정 · 명단 7명 · 잠금 전');
    expect(
      registrationMenuSubtitle(reg({ status: 'confirmed', playerCount: 7, rosterLockedAt: '2026-08-01T00:00:00.000Z' }), false),
    ).toBe('참가 확정 · 명단 7명 · 잠김');
    expect(registrationMenuSubtitle(reg({ status: 'awaiting_payment', playerCount: 0 }), true)).toBe('신청 작성 중 · 명단 미등록');
  });
});
