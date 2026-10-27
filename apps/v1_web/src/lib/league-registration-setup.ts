export type SetupStepTone = 'green' | 'blue' | 'orange' | 'grey';

export interface SetupStep {
  label: string;
  tone: SetupStepTone;
}

/**
 * 신청 관리 화면 맨 위 "신청 준비 순서" 3단계. 색만으로 상태를 전하지 않도록 라벨 자체에
 * 완료·필요·진행·대기를 적는다.
 */
export function deriveRegistrationSetupSteps(input: {
  entryFeeConfigured: boolean;
  registrationOpen: boolean;
  activeRegistrationCount: number;
}): [SetupStep, SetupStep, SetupStep] {
  const { entryFeeConfigured, registrationOpen, activeRegistrationCount } = input;
  return [
    entryFeeConfigured
      ? { label: '① 참가비 설정 완료', tone: 'green' }
      : { label: '① 참가비 설정 필요', tone: 'orange' },
    registrationOpen
      ? { label: '② 접수 중', tone: 'blue' }
      : { label: '② 접수 시작 전', tone: 'grey' },
    {
      label: `③ 직접 신청 ${activeRegistrationCount}팀`,
      tone: activeRegistrationCount > 0 ? 'green' : 'grey',
    },
  ];
}
