/**
 * 회원 표기 단일 소스의 분기 고정 — 목록/상세가 각자 복제한 로직이 갈라져
 * 같은 회원이 화면마다 다른 이름으로 보이던 결함의 재발 방지.
 */
import { describe, expect, it } from 'vitest';
import {
  formatAuthProviders,
  formatGender,
  formatOnboardingStatus,
  formatUserTitle,
} from './format-user';

describe('formatUserTitle', () => {
  it('닉네임이 최우선, 없으면 displayName', () => {
    expect(formatUserTitle({ nickname: '싱아', displayName: '김철수' })).toBe('싱아');
    expect(formatUserTitle({ nickname: null, displayName: '김철수' })).toBe('김철수');
  });

  it('소셜 온보딩 미완료는 진행 상태 문구로 보여준다', () => {
    expect(formatUserTitle({ onboardingStatus: 'social_terms_required', email: 'a@b.c' })).toBe(
      '가입 진행 중 · 약관 미동의',
    );
    expect(formatUserTitle({ onboardingStatus: 'social_profile_required' })).toBe(
      '가입 진행 중 · 프로필 미완료',
    );
  });

  it('이름이 전혀 없으면 이메일 → userId 앞 8자 → 프로필 없음 순서로 폴백', () => {
    expect(formatUserTitle({ email: 'a@b.c' })).toBe('a@b.c');
    expect(formatUserTitle({ userId: '0123456789abcdef' })).toBe('01234567');
    expect(formatUserTitle({})).toBe('프로필 없음');
  });
});

describe('formatOnboardingStatus', () => {
  it('알려진 상태는 한글 라벨로', () => {
    expect(formatOnboardingStatus('not_started')).toBe('시작 전');
    expect(formatOnboardingStatus('completed')).toBe('완료');
  });

  it('모르는 값은 원문 그대로, 빈 값은 대시', () => {
    expect(formatOnboardingStatus('future_status')).toBe('future_status');
    expect(formatOnboardingStatus(null)).toBe('-');
  });
});

describe('formatGender', () => {
  it('male/female 외에는 성별 미등록', () => {
    expect(formatGender('male')).toBe('남');
    expect(formatGender('female')).toBe('여');
    expect(formatGender(null)).toBe('성별 미등록');
  });
});

describe('formatAuthProviders', () => {
  it('알려진 provider는 한글, 모르는 값은 원문, 빈 배열은 안내 문구', () => {
    expect(formatAuthProviders(['kakao', 'email'])).toBe('카카오 · 이메일');
    expect(formatAuthProviders(['apple'])).toBe('apple');
    expect(formatAuthProviders([])).toBe('로그인 수단 없음');
    expect(formatAuthProviders(null)).toBe('로그인 수단 없음');
  });
});
