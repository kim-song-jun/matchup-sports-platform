import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savePendingSocialLink } from '@/lib/pending-social-link';
import { AccountExistsGuide } from './account-exists-guide';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));

const renderGuide = (props: Parameters<typeof AccountExistsGuide>[0]) =>
  render(<QueryClientProvider client={new QueryClient()}><AccountExistsGuide {...props} /></QueryClientProvider>);

const storeToken = (provider: 'kakao' | 'apple') =>
  savePendingSocialLink({ next: 'sign_in_then_link', provider, linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600 });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_KAKAO_CLIENT_ID', 'rest-key');
  vi.stubEnv('NEXT_PUBLIC_KAKAO_REDIRECT_URI', 'https://teameet.test/callback/kakao');
});
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllEnvs();
});

describe('AccountExistsGuide', () => {
  it('이미 팀밋 계정이 있다고 알리고 원래 방법으로 로그인하는 3단계를 번호 순서로 보여 준다', () => {
    storeToken('kakao');
    renderGuide({ provider: 'kakao', redirectPath: null });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('이미 팀밋 계정이 있어요');
    expect(screen.getByText(/카카오로 새로 가입할 수 없어요/)).toBeInTheDocument();
    const steps = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('원래 가입한 방법으로 로그인해요');
    expect(steps[1]).toHaveTextContent('30분 안에 로그인하면 카카오 로그인이 자동으로 연결돼요');
    expect(steps[2]).toHaveTextContent('다음부터는 같은 계정으로 들어와요');
  });

  it('Apple 충돌이면 문구도 Apple 로 바뀐다', () => {
    storeToken('apple');
    renderGuide({ provider: 'apple', redirectPath: null });
    expect(screen.getByText(/Apple로 새로 가입할 수 없어요/)).toBeInTheDocument();
    expect(screen.getByText('30분 안에 로그인하면 Apple 로그인이 자동으로 연결돼요')).toBeInTheDocument();
    expect(screen.queryByText(/카카오 로그인이 자동으로/)).not.toBeInTheDocument();
  });

  // 연결 토큰이 없거나 만료됐으면 자동 연결을 약속하지 않는다 — 설정에서 직접 연결하도록 안내한다.
  it('보관된 연결 토큰이 없으면 자동 연결 대신 설정에서 직접 연결하라고 안내한다', () => {
    renderGuide({ provider: 'kakao', redirectPath: null });
    expect(screen.queryByText(/자동으로 연결돼요/)).not.toBeInTheDocument();
    expect(screen.getByText('로그인한 뒤 설정에서 연결해요')).toBeInTheDocument();
    expect(screen.getByText(/"로그인 방법"에서 카카오 로그인을 연결해 주세요/)).toBeInTheDocument();
  });

  it('이메일 로그인·계정 찾기·비밀번호 재설정으로 가는 길을 주고 돌아갈 경로를 싣는다', () => {
    storeToken('kakao');
    renderGuide({ provider: 'kakao', redirectPath: '/teams/new' });
    expect(screen.getByRole('link', { name: '이메일로 로그인하기' })).toHaveAttribute('href', '/login/email?redirect=%2Fteams%2Fnew');
    const guide = encodeURIComponent('/auth/account-conflict?provider=kakao&redirect=%2Fteams%2Fnew');
    expect(screen.getByRole('link', { name: '계정 찾기' })).toHaveAttribute('href', `/auth/find-account?from=${guide}&redirect=%2Fteams%2Fnew`);
    expect(screen.getByRole('link', { name: '비밀번호 재설정' })).toHaveAttribute(
      'href',
      `/auth/find-account?mode=reset-password&from=${guide}&redirect=%2Fteams%2Fnew`,
    );
  });

  it('돌아갈 경로가 없으면 쿼리 없이 이메일 로그인으로 보낸다', () => {
    renderGuide({ provider: 'kakao', redirectPath: null });
    expect(screen.getByRole('link', { name: '이메일로 로그인하기' })).toHaveAttribute('href', '/login/email');
  });

  it('원래 수단이 카카오일 수도 있어 카카오 로그인 버튼도 준다', () => {
    renderGuide({ provider: 'apple', redirectPath: null });
    expect(screen.getByRole('link', { name: '카카오로 로그인하기' })).toBeInTheDocument();
  });

  it('카카오 설정이 없는 환경에서는 카카오 버튼을 그리지 않는다', () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_CLIENT_ID', '');
    renderGuide({ provider: 'kakao', redirectPath: null });
    expect(screen.queryByRole('link', { name: '카카오로 로그인하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '이메일로 로그인하기' })).toBeInTheDocument();
  });

  it('제공자를 모르면 특정 서비스를 단정하지 않는다', () => {
    renderGuide({ provider: null, redirectPath: null });
    expect(screen.getByText(/소셜로 새로 가입할 수 없어요/)).toBeInTheDocument();
  });
});
