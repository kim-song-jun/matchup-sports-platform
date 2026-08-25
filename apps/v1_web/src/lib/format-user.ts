/**
 * 어드민 회원 표기 단일 소스.
 *
 * 회원 목록(formatUserTitle)과 상세(userTitle)가 서로 다른 로직을 복제해 갖고 있어
 * 같은 회원이 목록에선 "가입 진행 중 · 약관 미동의", 상세에선 이메일로 보이는
 * 불일치가 있었다. 성별·로그인 수단 포맷터도 두 화면에 바이트 단위로 복제돼 있었다.
 */

export function formatUserTitle(user: {
  nickname?: string | null;
  displayName?: string | null;
  email?: string | null;
  userId?: string;
  onboardingStatus?: string | null;
}): string {
  if (user.nickname || user.displayName) return user.nickname ?? user.displayName ?? '';
  if (user.onboardingStatus === 'social_terms_required') return '가입 진행 중 · 약관 미동의';
  if (user.onboardingStatus === 'social_profile_required') return '가입 진행 중 · 프로필 미완료';
  if (user.email) return user.email;
  if (user.userId) return user.userId.slice(0, 8);
  return '프로필 없음';
}

/** V1UserProfile.onboardingStatus 10종 (types/api.ts) — 모르는 값은 원문 그대로 보여준다 */
const ONBOARDING_STATUS_LABEL: Record<string, string> = {
  not_started: '시작 전',
  terms_done: '약관 동의 완료',
  social_terms_required: '소셜 가입 · 약관 미동의',
  social_profile_required: '소셜 가입 · 프로필 미완료',
  signup_done: '가입 완료',
  sport_done: '종목 선택 완료',
  level_done: '실력 입력 완료',
  region_done: '지역 입력 완료',
  completed: '완료',
  deferred: '나중에 하기',
};

export function formatOnboardingStatus(status: string | null | undefined): string {
  if (!status) return '-';
  return ONBOARDING_STATUS_LABEL[status] ?? status;
}

export function formatGender(gender: string | null | undefined): string {
  if (gender === 'male') return '남';
  if (gender === 'female') return '여';
  return '성별 미등록';
}

const AUTH_PROVIDER_LABEL: Record<string, string> = {
  kakao: '카카오',
  naver: '네이버',
  email: '이메일',
};

export function formatAuthProviders(providers: readonly string[] | null | undefined): string {
  const values = providers ?? [];
  if (values.length === 0) return '로그인 수단 없음';
  return values.map((provider) => AUTH_PROVIDER_LABEL[provider] ?? provider).join(' · ');
}
