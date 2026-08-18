import { describe, expect, it } from 'vitest';
import { isWideAdminRoute } from './_gate';

// 폭 상한을 푸는 화면은 명시적으로 고른 것만이어야 한다 — 정규식을 느슨하게 바꾸면
// 폼·문단 화면까지 넓어져 한 줄이 길어지고 읽기 어려워진다.
describe('isWideAdminRoute', () => {
  it('대진 관리 화면에서만 폭을 푼다', () => {
    expect(isWideAdminRoute('/admin/tournaments/abc-123/bracket')).toBe(true);
    expect(isWideAdminRoute('/admin/tournaments/abc-123/bracket/groups')).toBe(true);
  });

  it('같은 대회의 다른 탭은 기본 폭을 유지한다', () => {
    expect(isWideAdminRoute('/admin/tournaments/abc-123')).toBe(false);
    expect(isWideAdminRoute('/admin/tournaments/abc-123/registrations')).toBe(false);
    // "bracket" 이 접두어로만 걸리는 경로에 오탐하지 않는다
    expect(isWideAdminRoute('/admin/tournaments/abc-123/bracketing')).toBe(false);
  });

  it('경로를 모르면 기본 폭을 쓴다', () => {
    expect(isWideAdminRoute(null)).toBe(false);
    expect(isWideAdminRoute('/admin')).toBe(false);
  });
});
