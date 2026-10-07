import { DAY_MS, kstMidnightMs, toKstDateString } from './kst-calendar';

/** 마감 빠른 선택 칩이 고를 수 있는 일수. */
export const DEADLINE_PRESET_DAYS = [3, 7, 14] as const;

const LAST_MINUTE_OF_DAY_MS = (23 * 60 + 59) * 60 * 1000;

/**
 * 오늘(KST) 기준 N일 뒤 날짜의 23:59:00 KST 를 ISO 로. 로컬 타임존을 읽지 않는다 —
 * KST 달력 날짜는 `toKstDateString`, 그 자정은 `kstMidnightMs` 로 구한다.
 */
export function presetDeadlineIso(now: Date, days: number): string {
  const todayMidnight = kstMidnightMs(toKstDateString(now));
  return new Date(todayMidnight + days * DAY_MS + LAST_MINUTE_OF_DAY_MS).toISOString();
}

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
      ? { label: '② 신청 열기 진행 중', tone: 'blue' }
      : { label: '② 신청 열기 대기', tone: 'grey' },
    {
      label: `③ 신청 확인 ${activeRegistrationCount}팀`,
      tone: activeRegistrationCount > 0 ? 'green' : 'grey',
    },
  ];
}
