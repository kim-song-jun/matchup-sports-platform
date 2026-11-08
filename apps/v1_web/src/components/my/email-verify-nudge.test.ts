import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AuthMe } from '@/types/api';
import {
  EMAIL_VERIFY_NUDGE_MAX_RESHOWS,
  EMAIL_VERIFY_NUDGE_SNOOZE_MS,
  emailVerifyNudgeTarget,
  isEmailVerifyNudgeDue,
  recordEmailVerifyNudgeClosed,
} from './email-verify-nudge';

const DAY = 24 * 60 * 60 * 1000;

function me(overrides: { user?: Partial<V1AuthMe['user']>; verification?: V1AuthMe['verification'] } = {}): V1AuthMe {
  return {
    user: {
      id: 'user-1',
      email: 'member@example.com',
      accountStatus: 'active',
      onboardingStatus: 'completed',
      authProviders: ['email'],
      hasPassword: true,
      ...overrides.user,
    },
    profile: { displayName: '밋팀러' },
    verification: 'verification' in overrides ? overrides.verification : { emailVerified: false, phoneVerified: true },
  } as V1AuthMe;
}

describe('emailVerifyNudgeTarget — 서버 사실만으로 대상을 가른다', () => {
  it('이메일 로그인 + 비밀번호가 있고 이메일이 미인증인 활성 계정이 대상이다', () => {
    expect(emailVerifyNudgeTarget(me())).toEqual({ userId: 'user-1' });
  });

  it('이메일 로그인에 카카오가 함께 붙어 있어도 대상이다', () => {
    expect(emailVerifyNudgeTarget(me({ user: { authProviders: ['email', 'kakao'] } }))).toEqual({ userId: 'user-1' });
  });

  it.each(['signup_done', 'sport_done', 'level_done', 'region_done', 'completed'])(
    '가입 필수 단계를 마친 %s 상태는 대상이다',
    (onboardingStatus) => {
      expect(emailVerifyNudgeTarget(me({ user: { onboardingStatus } }))).toEqual({ userId: 'user-1' });
    },
  );

  it.each([
    ['이미 인증한 계정', me({ verification: { emailVerified: true, phoneVerified: true } })],
    ['인증 여부를 아직 모르는 응답', me({ verification: undefined })],
    ['카카오로만 로그인하는 계정', me({ user: { authProviders: ['kakao'], hasPassword: false } })],
    ['이메일 로그인이 있어도 비밀번호가 없는 계정', me({ user: { hasPassword: false } })],
    ['비밀번호는 있는데 이메일 로그인이 아닌 계정', me({ user: { authProviders: ['kakao'], hasPassword: true } })],
    ['탈퇴 신청 중인 계정', me({ user: { accountStatus: 'withdrawal_pending' } })],
    ['정지된 계정', me({ user: { accountStatus: 'suspended' } })],
    ['약관만 마친 가입 중 계정', me({ user: { onboardingStatus: 'terms_done' } })],
    ['소셜 가입 약관 단계 계정', me({ user: { onboardingStatus: 'social_terms_required' } })],
    ['소셜 가입 프로필을 미룬 계정', me({ user: { onboardingStatus: 'social_profile_deferred' } })],
    ['아직 시작도 안 한 계정', me({ user: { onboardingStatus: 'not_started' } })],
  ])('%s 은 대상이 아니다', (_name, authMe) => {
    expect(emailVerifyNudgeTarget(authMe)).toBeNull();
  });

  it('/auth/me 를 아직 못 받았으면 대상이 아니다', () => {
    expect(emailVerifyNudgeTarget(undefined)).toBeNull();
  });
});

describe('닫음 기억 — 14일 숨김과 최대 3번 재노출', () => {
  const T0 = Date.UTC(2026, 10, 8, 0, 0, 0);
  let userId = 0;
  const nextUser = () => `nudge-user-${(userId += 1)}`;

  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('닫은 적이 없으면 보인다', () => {
    expect(isEmailVerifyNudgeDue(nextUser(), T0)).toBe(true);
  });

  it('닫은 뒤 14일이 지나기 전에는 숨기고, 14일이 되면 다시 보인다', () => {
    const user = nextUser();
    recordEmailVerifyNudgeClosed(user, T0);

    expect(isEmailVerifyNudgeDue(user, T0)).toBe(false);
    expect(isEmailVerifyNudgeDue(user, T0 + 14 * DAY - 1)).toBe(false);
    expect(isEmailVerifyNudgeDue(user, T0 + 14 * DAY)).toBe(true);
    expect(EMAIL_VERIFY_NUDGE_SNOOZE_MS).toBe(14 * DAY);
  });

  it('처음 보인 뒤 3번까지 다시 보이고, 그 뒤 4번째 닫기에서는 다시 오지 않는다', () => {
    const user = nextUser();
    let now = T0;
    const returns: boolean[] = [];
    for (let close = 1; close <= EMAIL_VERIFY_NUDGE_MAX_RESHOWS + 1; close += 1) {
      expect(isEmailVerifyNudgeDue(user, now)).toBe(true);
      returns.push(recordEmailVerifyNudgeClosed(user, now).willReturn);
      now += 14 * DAY;
    }

    expect(returns).toEqual([true, true, true, false]);
    expect(isEmailVerifyNudgeDue(user, now)).toBe(false);
    expect(isEmailVerifyNudgeDue(user, now + 365 * DAY)).toBe(false);
  });

  it('사용자마다 따로 기억한다', () => {
    const closed = nextUser();
    const other = nextUser();
    recordEmailVerifyNudgeClosed(closed, T0);

    expect(isEmailVerifyNudgeDue(other, T0)).toBe(true);
  });

  it('깨진 기록은 닫은 적이 없는 것으로 본다', () => {
    const user = nextUser();
    window.localStorage.setItem(`teameet:v1:email-verify-nudge:${user}`, '{"closedAt":"어제","closeCount":-2}');

    expect(isEmailVerifyNudgeDue(user, T0)).toBe(true);
  });

  it('기기 시계가 어긋나 숨김 기간보다 먼 미래에 닫힌 것으로 적혀 있으면 믿지 않고 다시 보여 준다', () => {
    const user = nextUser();
    recordEmailVerifyNudgeClosed(user, T0 + 400 * DAY);

    expect(isEmailVerifyNudgeDue(user, T0)).toBe(true);
  });

  it('localStorage 에 쓰지 못하는 환경에서도 같은 페이지 동안은 닫음을 기억한다', () => {
    const user = nextUser();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    recordEmailVerifyNudgeClosed(user, T0);

    expect(isEmailVerifyNudgeDue(user, T0 + DAY)).toBe(false);
    expect(isEmailVerifyNudgeDue(user, T0 + 14 * DAY)).toBe(true);
  });
});
