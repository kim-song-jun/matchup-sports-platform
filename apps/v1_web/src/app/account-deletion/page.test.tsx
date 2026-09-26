import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AccountDeletionPage from './page';

vi.mock('@/lib/public-site/site-info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/public-site/site-info')>();
  return { ...actual, fetchPublicSiteInfo: vi.fn(async () => actual.normalizeSiteInfo({ contactEmail: 'help@example.com' })) };
});

describe('AccountDeletionPage', () => {
  it('offers both the in-app path and a public request path without claiming immediate deletion', async () => {
    render(await AccountDeletionPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Teameet 계정 삭제를 요청할 수 있어요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '앱에서 탈퇴 요청하기' })).toHaveAttribute(
      'href',
      '/my/settings/withdrawal',
    );
    expect(screen.getByRole('link', { name: '이메일로 삭제 요청하기' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^mailto:help@example\.com\?/),
    );
    // 어드민 설정의 문의 이메일을 쓴다 — 하드코딩하면 설정을 바꿔도 이 페이지만 옛 주소로 남는다.
    expect(screen.getByText('help@example.com')).toBeInTheDocument();
    expect(screen.getByText(/본인 확인을 추가로 요청할 수 있어요/)).toBeInTheDocument();
    expect(screen.getByText(/로그인과 푸시 알림 등록을 즉시 중지해요/)).toBeInTheDocument();
    expect(screen.getByText(/활동 지역과 검색 기록을 삭제하거나 식별할 수 없게 처리해요/)).toBeInTheDocument();
    expect(screen.getByText(/제한적으로 보관될 수 있어요/)).toBeInTheDocument();
    expect(screen.getByText(/진행 중인 매치나 팀 운영 권한이 있으면 먼저 정리가 필요할 수 있어요/)).toBeInTheDocument();
  });

  // 탈퇴 화면·개인정보처리방침 v1.4 7절과 같은 30일 유예를 공개 페이지에서도 알린다(App Store 5.1.1(v)).
  it('states the 30-day grace period and the recovery path, matching the in-app withdrawal screen', async () => {
    render(await AccountDeletionPage());

    expect(
      screen.getByText('탈퇴를 요청하면 30일 뒤 계정과 개인정보가 삭제돼요. 그 전에는 고객센터로 복구를 요청할 수 있어요.'),
    ).toBeInTheDocument();
  });
});
