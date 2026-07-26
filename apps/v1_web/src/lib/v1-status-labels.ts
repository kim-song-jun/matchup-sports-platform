/**
 * v1 도메인 상태(enum) → 한국어 라벨 단일 소스.
 *
 * 백엔드 status는 영문 코드(`requested`, `active`, `left` 등)로 내려온다. UI에서
 * `status === 'x' ? '...' : status` 식 삼항으로 직접 렌더하면 매핑 안 된 값이
 * **영문 그대로 노출**된다(WS11 Rank6). 모든 상태 표시는 이 모듈을 거쳐 매핑 안 된
 * 값도 안전한 한글 fallback으로 떨어지게 한다. 새 상태값 추가 시 여기만 갱신한다.
 */

/**
 * 팀 가입 신청 상태 — **관리자(검토자) 관점** 라벨.
 *
 * 백엔드 enum(`V1TeamJoinApplicationStatus`)은 requested / approved / rejected /
 * withdrawn / expired 다섯 가지다. active·left·removed는 멤버십(`V1TeamMembership`)
 * 상태값이지만 승인 처리 결과를 멤버십 기준으로 내려주는 응답이 있어 함께 매핑해 둔다.
 */
const TEAM_JOIN_APPLICATION_STATUS: Record<string, string> = {
  requested: '검토 중',
  approved: '승인됨',
  rejected: '거절됨',
  expired: '만료됨',
  active: '승인됨',
  left: '거절됨',
  withdrawn: '철회됨',
  cancelled: '취소됨',
  removed: '거절됨',
};

export function teamJoinApplicationStatusLabel(status: string): string {
  return TEAM_JOIN_APPLICATION_STATUS[status] ?? '처리됨';
}

/**
 * 같은 상태의 **신청자 본인 관점** 라벨.
 *
 * 검토자에게 '검토 중'인 신청은 신청자에게는 '승인 대기'이고, 본인이 철회한 건은
 * '철회됨'보다 '취소함'이 행위 주체를 분명히 한다. 관점이 다르면 문구도 달라야
 * 화면에서 "누가 무엇을 한 상태인지"가 흐려지지 않는다.
 */
const MY_JOIN_APPLICATION_STATUS: Record<string, string> = {
  requested: '승인 대기',
  approved: '승인됨',
  rejected: '거절됨',
  withdrawn: '취소함',
  expired: '만료됨',
};

export function myJoinApplicationStatusLabel(status: string): string {
  return MY_JOIN_APPLICATION_STATUS[status] ?? '처리됨';
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

/**
 * 매치·팀매치 수정 잠금 사유 (lockedReason enum → 한국어). 두 도메인 공용 단일 소스.
 *
 * 백엔드 가능 값:
 *   - team-matches.service.ts: 'terminal_or_matched_status'
 *   - matches.service.ts:      'terminal_status'
 * 미매핑 값은 안전한 한글 폴백으로 대체한다.
 */
const LOCKED_REASON_LABEL: Record<string, string> = {
  expired: '경기 시간이 지난 팀매치는 수정할 수 없어요.',
  terminal_or_matched_status: '이미 매칭이 완료됐거나 종료된 팀매치는 수정할 수 없어요.',
  terminal_status: '완료·취소·종료된 매치는 수정할 수 없어요.',
};

export function lockedReasonLabel(reason: string): string {
  return LOCKED_REASON_LABEL[reason] ?? '지금은 수정할 수 없어요.';
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
