/**
 * 카카오 프로필 응답에서 가입 프리필로 쓸 값만 뽑아 정규화한다.
 *
 * 이름/전화번호/성별은 카카오 개발자 콘솔의 동의항목이 승인돼 있어야만 내려온다(비즈 앱 검수 대상).
 * 승인 전에는 필드가 통째로 없으므로 모든 정규화 함수는 "없으면 null"을 반환하고,
 * 화면은 값이 있을 때만 자동 채움한다 — 승인 여부에 따라 코드 변경 없이 동작이 갈린다.
 */

/** 카카오가 내려주는 성별 값. 그 외 값은 우리 스키마에 없으므로 버린다. */
const KAKAO_GENDERS = ['male', 'female'] as const;

export type KakaoGender = (typeof KAKAO_GENDERS)[number];

export function normalizeKakaoName(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeKakaoGender(gender: string | null | undefined): KakaoGender | null {
  return KAKAO_GENDERS.includes(gender as KakaoGender) ? (gender as KakaoGender) : null;
}

/**
 * 카카오 phone_number 는 '+82 10-1234-5678' 같은 국제 표기로 온다.
 * 우리 가입 폼은 국내 11자리 숫자('01012345678')만 받으므로 그 형태로만 변환하고,
 * 해외 번호처럼 변환이 불가능하면 null 을 돌려 자동 채움을 포기한다
 * (잘못된 값을 채워 넣으면 사용자가 지우고 다시 입력해야 해 오히려 방해가 된다).
 */
export function normalizeKakaoPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 0) return null;

  const domestic = digits.startsWith('82') ? `0${digits.slice(2)}` : digits;

  // 국내 휴대폰: 010 + 8자리. 그 외(지역번호/해외번호)는 가입 폼이 거부하므로 채우지 않는다.
  return /^010\d{8}$/.test(domestic) ? domestic : null;
}

export interface KakaoSignupPrefill {
  name: string | null;
  phone: string | null;
  gender: KakaoGender | null;
}

/** 프리필 값이 하나도 없으면 null — draftJson 에 빈 객체를 남기지 않는다. */
export function buildKakaoSignupPrefill(input: {
  name?: string | null;
  phone?: string | null;
  gender?: string | null;
}): KakaoSignupPrefill | null {
  const prefill: KakaoSignupPrefill = {
    name: normalizeKakaoName(input.name),
    phone: normalizeKakaoPhone(input.phone),
    gender: normalizeKakaoGender(input.gender),
  };

  return prefill.name || prefill.phone || prefill.gender ? prefill : null;
}

/**
 * onboardingProgress.draftJson 에 보관된 프리필을 읽는다. draftJson 은 Prisma Json 타입이라
 * 어떤 형태든 들어올 수 있으므로, 알 수 없는 값은 조용히 null 로 떨어뜨린다.
 */
export function readKakaoSignupPrefill(draftJson: unknown): KakaoSignupPrefill | null {
  if (!draftJson || typeof draftJson !== 'object' || Array.isArray(draftJson)) return null;
  const draft = draftJson as Record<string, unknown>;

  return buildKakaoSignupPrefill({
    name: typeof draft.kakaoName === 'string' ? draft.kakaoName : null,
    phone: typeof draft.kakaoPhone === 'string' ? draft.kakaoPhone : null,
    gender: typeof draft.kakaoGender === 'string' ? draft.kakaoGender : null,
  });
}
