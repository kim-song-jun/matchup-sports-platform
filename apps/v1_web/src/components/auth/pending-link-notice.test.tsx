import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { peekPendingSocialLink, savePendingSocialLink, takePendingSocialLink } from '@/lib/pending-social-link';
import { PendingLinkNotice } from './pending-link-notice';

const store = (provider: 'kakao' | 'apple') =>
  savePendingSocialLink({ next: 'sign_in_then_link', provider, linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600 });

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe('PendingLinkNotice', () => {
  it('대기 연결 토큰이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<PendingLinkNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['kakao', '카카오'],
    ['apple', 'Apple'],
  ] as const)('%s 토큰이 있으면 어떤 로그인이 연결되는지 알리고 연결 안 하기를 준다', async (provider, label) => {
    store(provider);
    render(<PendingLinkNotice />);
    expect(await screen.findByText(new RegExp(`로그인하면 ${label} 로그인이 이 계정에 연결돼요\\.`))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '연결 안 하기' })).toBeEnabled();
  });

  it('연결 안 하기를 누르면 안내가 사라지고 보관한 토큰도 지워진다', async () => {
    store('kakao');
    render(<PendingLinkNotice />);
    await userEvent.setup().click(await screen.findByRole('button', { name: '연결 안 하기' }));
    expect(screen.queryByText(/이 계정에 연결돼요/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연결 안 하기' })).not.toBeInTheDocument();
    expect(peekPendingSocialLink()).toBeNull();
  });

  // 만료 표식을 소비하는 것은 로그인 뒤 리졸버뿐이다 — 배너가 먼저 읽어 표식을 없애면 expired 안내가 사라진다.
  it('이미 만료된 토큰은 안내하지 않고, 만료 표식도 소비하지 않는다', () => {
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600 }, Date.now() - 601_000);
    const { container } = render(<PendingLinkNotice />);
    expect(container).toBeEmptyDOMElement();
    expect(takePendingSocialLink()).toMatchObject({ provider: 'kakao', expired: true });
  });
});
