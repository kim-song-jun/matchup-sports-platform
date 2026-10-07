import { describe, expect, it } from 'vitest';
import { deriveRegistrationSetupSteps, presetDeadlineIso } from './league-registration-setup';

describe('presetDeadlineIso — 오늘(KST)+N일 23:59 KST', () => {
  it('KST 자정 직전(UTC 로는 같은 날)이면 KST 날짜 기준으로 센다', () => {
    // 2026-10-07T14:30Z = KST 10/07 23:30 → 3일 뒤 KST 10/10 23:59 = 10/10 14:59Z
    expect(presetDeadlineIso(new Date('2026-10-07T14:30:00Z'), 3)).toBe('2026-10-10T14:59:00.000Z');
  });

  it('UTC 날짜는 아직 어제여도 KST 로는 다음 날이면 다음 날부터 센다 (대조)', () => {
    // 2026-10-07T15:30Z = KST 10/08 00:30 → 3일 뒤 KST 10/11 23:59 = 10/11 14:59Z
    expect(presetDeadlineIso(new Date('2026-10-07T15:30:00Z'), 3)).toBe('2026-10-11T14:59:00.000Z');
  });

  it('N 이 다르면 그만큼 날짜가 달라진다', () => {
    const now = new Date('2026-10-07T03:00:00Z');
    expect(presetDeadlineIso(now, 7)).toBe('2026-10-14T14:59:00.000Z');
    expect(presetDeadlineIso(now, 14)).toBe('2026-10-21T14:59:00.000Z');
  });

  it('월 경계를 넘긴다', () => {
    expect(presetDeadlineIso(new Date('2026-10-30T03:00:00Z'), 3)).toBe('2026-11-02T14:59:00.000Z');
  });
});

describe('deriveRegistrationSetupSteps', () => {
  it('미설정·닫힘·신청 없음 — 모두 아직 할 일로 읽힌다', () => {
    const steps = deriveRegistrationSetupSteps({
      entryFeeConfigured: false,
      registrationOpen: false,
      activeRegistrationCount: 0,
    });
    expect(steps.map((s) => s.label)).toEqual(['① 참가비 설정 필요', '② 신청 열기 대기', '③ 직접 신청 0팀']);
    expect(steps.map((s) => s.tone)).toEqual(['orange', 'grey', 'grey']);
  });

  it('설정됨·열림·신청 3팀', () => {
    const steps = deriveRegistrationSetupSteps({
      entryFeeConfigured: true,
      registrationOpen: true,
      activeRegistrationCount: 3,
    });
    expect(steps.map((s) => s.label)).toEqual(['① 참가비 설정 완료', '② 신청 열기 진행 중', '③ 직접 신청 3팀']);
    expect(steps.map((s) => s.tone)).toEqual(['green', 'blue', 'green']);
  });

  it('세 단계는 서로 독립이다 — 설정됨만 바꿔도 나머지는 그대로', () => {
    const a = deriveRegistrationSetupSteps({ entryFeeConfigured: true, registrationOpen: false, activeRegistrationCount: 0 });
    const b = deriveRegistrationSetupSteps({ entryFeeConfigured: false, registrationOpen: false, activeRegistrationCount: 0 });
    expect(a[1]).toEqual(b[1]);
    expect(a[2]).toEqual(b[2]);
    expect(a[0]).not.toEqual(b[0]);
  });
});
