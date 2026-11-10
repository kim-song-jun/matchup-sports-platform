/**
 * 서버가 "활동 정보를 먼저 입력하라"고 거절했을 때(403 ACTIVITY_PROFILE_REQUIRED) 전역 안내 시트를
 * 띄우기 위한 최소 pub/sub. phone-verification-required 와 같은 구조이며, api-client 에 의존하지
 * 않는 leaf 모듈이어야 순환 import 가 생기지 않는다.
 */
export const ACTIVITY_PROFILE_REQUIRED_CODE = 'ACTIVITY_PROFILE_REQUIRED';

/** 활동 정보 입력 화면. 돌아갈 곳은 redirect 쿼리로 넘긴다. */
export const ACTIVITY_PROFILE_PATH = '/signup/social';

/** 관심 종목 고르기 화면. 활동 게이트에서 종목만 남았을 때 여기로 보낸다. */
export const ACTIVITY_SPORT_PATH = '/onboarding/sport';

export type ActivityMissingItem = 'phone' | 'basicProfile' | 'interestSport';

/** 체크리스트에 보여 주는 순서이자 "첫 번째로 보낼 곳"을 정하는 순서다. */
export const ACTIVITY_ITEM_ORDER: readonly ActivityMissingItem[] = ['phone', 'basicProfile', 'interestSport'];

export const ACTIVITY_ITEM_LABELS: Record<ActivityMissingItem, string> = {
  phone: '휴대폰 인증',
  basicProfile: '이름·성별·생년월일',
  interestSport: '관심 종목',
};

export function buildActivityProfileHref(returnTo: string): string {
  return `${ACTIVITY_PROFILE_PATH}?redirect=${encodeURIComponent(returnTo)}`;
}

/** 남은 항목 중 첫 번째가 있는 화면으로 간다. 입력을 마치면 returnTo(원래 화면)로 돌아온다. */
export function buildActivityGateHref(returnTo: string, missing: readonly ActivityMissingItem[]): string {
  const first = ACTIVITY_ITEM_ORDER.find((item) => missing.includes(item));
  const path = first === 'interestSport' ? ACTIVITY_SPORT_PATH : ACTIVITY_PROFILE_PATH;
  return `${path}?redirect=${encodeURIComponent(returnTo)}`;
}

/** 403 `details.missing` 에서 알려진 항목만 뽑는다. 모양이 다르면 빈 배열(= 일반 안내). */
export function parseActivityMissing(details: unknown): ActivityMissingItem[] {
  const raw = (details as { missing?: unknown } | null | undefined)?.missing;
  if (!Array.isArray(raw)) return [];
  return ACTIVITY_ITEM_ORDER.filter((item) => raw.includes(item));
}

/** `/auth/me` 만으로 남은 항목을 계산한다 — 만들기·신청 화면이 폼을 그리기 전에 먼저 막을 때 쓴다. */
export function activityMissingFromAuthMe(me: {
  user: { onboardingStatus: string; authProviders?: readonly string[] };
  verification?: { phoneVerified: boolean };
  onboarding?: unknown;
} | null | undefined): ActivityMissingItem[] {
  if (!me) return [];
  const status = me.user.onboardingStatus;
  const rawMissing = (me.onboarding as { missing?: unknown } | null | undefined)?.missing;
  const noSport = Array.isArray(rawMissing) && rawMissing.includes('sports');
  const missing: ActivityMissingItem[] = [];
  if (status === 'social_profile_deferred') {
    if (me.verification?.phoneVerified !== true) missing.push('phone');
    missing.push('basicProfile');
  } else if (status !== 'deferred' || !me.user.authProviders?.some((provider) => provider === 'kakao' || provider === 'apple')) {
    return [];
  }
  if (noSport) missing.push('interestSport');
  return missing;
}

/** 입력을 마친 뒤 돌아올 현재 위치. 해시(#section)까지 포함해야 같은 자리로 복귀한다. */
export function currentReturnPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

export type ActivityGateInfo = { missing: ActivityMissingItem[] };

type Listener = (info: ActivityGateInfo) => void;

const listeners = new Set<Listener>();

export function subscribeActivityProfileRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyActivityProfileRequired(info: ActivityGateInfo = { missing: [] }): void {
  listeners.forEach((listener) => listener(info));
}
