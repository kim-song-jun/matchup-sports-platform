export const ADMIN_USER_SIGNUP_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'required_complete', label: '필수정보 완료' },
  { value: 'onboarding_complete', label: '온보딩 완료' },
  { value: 'incomplete', label: '가입 미완료' },
  { value: 'terms_required', label: '약관 미동의' },
  { value: 'profile_required', label: '프로필 미완료' },
  { value: 'profile_deferred', label: '입력 보류' },
] as const;

export const ADMIN_USER_PROVIDER_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'email', label: '이메일' },
  { value: 'kakao', label: '카카오' },
  { value: 'apple', label: 'Apple' },
] as const;

export const ADMIN_USER_MULTI_FILTERS = {
  signup: ADMIN_USER_SIGNUP_OPTIONS.map((option) => option.value).filter(Boolean),
  providers: ADMIN_USER_PROVIDER_OPTIONS.map((option) => option.value).filter(Boolean),
};

export function adminUserSignupLabel(stage: string | undefined): string {
  return ADMIN_USER_SIGNUP_OPTIONS.find((option) => option.value && option.value === stage)?.label ?? '확인 필요';
}
