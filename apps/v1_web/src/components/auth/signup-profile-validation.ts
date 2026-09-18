export type SignupProfileField = 'displayName' | 'phone' | 'birthDate' | 'gender';

export type SignupProfileDraft = {
  readonly displayName: string;
  readonly phone: string;
  readonly birthDate: string;
  readonly gender: 'male' | 'female' | '';
};

type CompleteSignupProfileDraft = SignupProfileDraft & {
  readonly gender: 'male' | 'female';
};

export const SIGNUP_PROFILE_ERROR_MESSAGES: Readonly<Record<SignupProfileField, string>> = {
  displayName: '이름을 입력해 주세요.',
  phone: '휴대폰 번호는 숫자 11자리로 입력해 주세요.',
  birthDate: '만 14세 이상만 가입할 수 있어요. 생년월일을 확인해 주세요.',
  gender: '성별을 선택해 주세요.',
};

export function getSignupProfileIssue(profile: SignupProfileDraft): SignupProfileField | null {
  if (!normalizeSignupDisplayName(profile.displayName)) return 'displayName';
  if (!/^\d{11}$/.test(profile.phone)) return 'phone';
  if (!isSignupAgeEligible(profile.birthDate)) return 'birthDate';
  if (!profile.gender) return 'gender';
  return null;
}

export function isCompleteSignupProfile(profile: SignupProfileDraft): profile is CompleteSignupProfileDraft {
  return getSignupProfileIssue(profile) === null;
}

export function normalizeSeparatedDigits(value: string): string {
  return value.replace(/[-\s]/gu, '');
}

export function formatPhone(value: string): string {
  if (!/^\d+$/.test(value)) return value;
  if (value.length <= 3) return value;
  if (value.length <= 7) return `${value.slice(0, 3)}-${value.slice(3)}`;
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}

export function formatBirthDate(value: string): string {
  if (!/^\d+$/.test(value)) return value;
  if (value.length <= 4) return value;
  if (value.length <= 6) return `${value.slice(0, 4)}-${value.slice(4)}`;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
}

export function isValidBirthDateDigits(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeSignupDisplayName(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/gu, '').trim();
}

/** UTC calendar age; birthday must have occurred, including leap-day boundaries. */
export function isSignupAgeEligible(value: string, now = new Date()): boolean {
  if (!isValidBirthDateDigits(value)) return false;
  const cutoff = `${now.getUTCFullYear() - 14}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  return value <= cutoff;
}
