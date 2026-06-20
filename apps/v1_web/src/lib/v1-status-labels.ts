/**
 * v1 도메인 상태(enum) → 한국어 라벨 단일 소스.
 *
 * 백엔드 status는 영문 코드(`requested`, `active`, `left` 등)로 내려온다. UI에서
 * `status === 'x' ? '...' : status` 식 삼항으로 직접 렌더하면 매핑 안 된 값이
 * **영문 그대로 노출**된다(WS11 Rank6). 모든 상태 표시는 이 모듈을 거쳐 매핑 안 된
 * 값도 안전한 한글 fallback으로 떨어지게 한다. 새 상태값 추가 시 여기만 갱신한다.
 */

/** 팀 가입 신청 상태 (requested → active 수락 / left 거절, withdrawn 철회). */
const TEAM_JOIN_APPLICATION_STATUS: Record<string, string> = {
  requested: '검토 중',
  active: '승인됨',
  left: '거절됨',
  withdrawn: '철회됨',
  cancelled: '취소됨',
  removed: '거절됨',
};

export function teamJoinApplicationStatusLabel(status: string): string {
  return TEAM_JOIN_APPLICATION_STATUS[status] ?? '처리됨';
}

/** 팀 멤버십 상태. */
const TEAM_MEMBER_STATUS: Record<string, string> = {
  active: '활동 중',
  inactive: '비활성',
  left: '탈퇴',
  removed: '제외됨',
};

export function teamMemberStatusLabel(status: string): string {
  return TEAM_MEMBER_STATUS[status] ?? '—';
}

/** 온보딩 단계 (V1OnboardingStep). */
const ONBOARDING_STEP_LABEL: Record<string, string> = {
  terms: '약관 동의',
  signup: '회원가입',
  sport: '종목 선택',
  level: '실력 입력',
  region: '지역 선택',
  confirm: '확인',
  done: '완료',
};

export function onboardingStepLabel(step: string): string {
  return ONBOARDING_STEP_LABEL[step] ?? '종목 선택';
}
