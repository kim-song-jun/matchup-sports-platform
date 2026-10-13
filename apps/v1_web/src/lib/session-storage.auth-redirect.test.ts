import { afterEach, describe, expect, it } from 'vitest';
import { getSavedRedirectPath, resolveAuthContinuationPath, saveRedirectPath } from './session-storage';

afterEach(() => window.sessionStorage.clear());

describe('필수 인증 단계와 최종 복귀 목적지', () => {
  it('연결·약관·온보딩 사이에서는 최초 URL 목적지를 유지하고 마지막 성공에서 한 번 소비한다', () => {
    saveRedirectPath('/teams/new');
    expect(resolveAuthContinuationPath('/onboarding/sport', '/chat')).toBe('/onboarding/sport');
    expect(getSavedRedirectPath()).toBe('/chat');
    expect(resolveAuthContinuationPath(null, '/onboarding/sport')).toBe('/onboarding/sport');
    expect(getSavedRedirectPath()).toBe('/chat');
    expect(resolveAuthContinuationPath('/onboarding/level')).toBe('/onboarding/level');
    expect(getSavedRedirectPath()).toBe('/chat');
    expect(resolveAuthContinuationPath('/home')).toBe('/chat');
    expect(getSavedRedirectPath()).toBeNull();
    expect(window.sessionStorage.getItem('teameet.v1.savedRedirect')).toBeNull();
    expect(resolveAuthContinuationPath('/home')).toBe('/home');
  });

  it.each(['/terms?mode=renewal', '/terms?mode=social', '/terms?mode=signup', '/onboarding/confirm'])('%s 중간 URL이 원 목적지를 덮어쓰거나 소비하지 않는다', (intermediate) => {
    saveRedirectPath('/teams/new');
    expect(resolveAuthContinuationPath(null, intermediate)).toBe(intermediate);
    expect(getSavedRedirectPath()).toBe('/teams/new');
  });

  it('부분 약관 동의의 추가 필수 응답을 먼저 따르고 온보딩 URL은 최종 목적지로 저장하지 않는다', () => {
    saveRedirectPath('/teams/new');
    expect(resolveAuthContinuationPath('/terms?mode=renewal', '/onboarding/sport')).toBe('/terms?mode=renewal&redirect=%2Fonboarding%2Fsport');
    expect(getSavedRedirectPath()).toBe('/teams/new');
  });

  it('서버가 최종 성공을 반환하면 중간 URL로 재진입하지 않고 원 목적지를 소비한다', () => {
    saveRedirectPath('/teams/new');
    expect(resolveAuthContinuationPath('/home', '/onboarding/sport')).toBe('/teams/new');
    expect(getSavedRedirectPath()).toBeNull();
  });

  it.each(['/terms', '/terms?document=privacy', '/chat?room=team#latest'])('안전한 최종 URL %s는 저장값보다 우선하고 정리된다', (destination) => {
    saveRedirectPath('/teams/new');
    expect(resolveAuthContinuationPath(null, destination)).toBe(destination);
    expect(getSavedRedirectPath()).toBeNull();
  });

  it.each(['//outside.invalid', '/\\outside.invalid', '/..//outside.invalid', 'https://outside.invalid'])('외부 URL %s는 단계 이동과 최종 복귀에서 모두 차단한다', (unsafe) => {
    saveRedirectPath('/teams/new');
    expect(resolveAuthContinuationPath('/onboarding/sport', unsafe)).toBe('/onboarding/sport');
    expect(getSavedRedirectPath()).toBe('/teams/new');
    expect(resolveAuthContinuationPath(unsafe)).toBe('/teams/new');
    expect(getSavedRedirectPath()).toBeNull();
  });

  it('저장소에 직접 들어간 외부 목적지도 마지막에 제거하고 홈으로 이동한다', () => {
    window.sessionStorage.setItem('teameet.v1.savedRedirect', '//outside.invalid');
    expect(resolveAuthContinuationPath('/home')).toBe('/home');
    expect(window.sessionStorage.getItem('teameet.v1.savedRedirect')).toBeNull();
  });
});
