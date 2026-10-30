import { describe, expect, it } from 'vitest';
import { deriveRegistrationSetupSteps } from './league-registration-setup';

describe('deriveRegistrationSetupSteps', () => {
  it('미설정·닫힘·신청 없음 — 모두 아직 할 일로 읽힌다', () => {
    const steps = deriveRegistrationSetupSteps({
      entryFeeConfigured: false,
      registrationOpen: false,
      activeRegistrationCount: 0,
    });
    expect(steps.map((s) => s.label)).toEqual(['① 참가비 설정 필요', '② 접수 시작 전', '③ 직접 신청 0팀']);
    expect(steps.map((s) => s.tone)).toEqual(['orange', 'grey', 'grey']);
  });

  it('설정됨·열림·신청 3팀', () => {
    const steps = deriveRegistrationSetupSteps({
      entryFeeConfigured: true,
      registrationOpen: true,
      activeRegistrationCount: 3,
    });
    expect(steps.map((s) => s.label)).toEqual(['① 참가비 설정 완료', '② 접수 중', '③ 직접 신청 3팀']);
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
