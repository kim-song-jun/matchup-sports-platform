import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { peekPendingSocialLink, savePendingSocialLink, takePendingSocialLink } from '@/lib/pending-social-link';
import { PendingLinkNotice } from './pending-link-notice';

// 9분 30초 남은 토큰 — 저장과 렌더가 같은 밀리초면 정확히 10분이 되는 경계를 피한다.
const store = (provider: 'kakao' | 'apple') =>
  savePendingSocialLink({ next: 'sign_in_then_link', provider, linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600 }, Date.now() - 30_000);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

/** 600초 토큰을 `remainingSeconds` 만 남은 상태로 보관한다. */
const storeWithRemaining = (remainingSeconds: number) =>
  savePendingSocialLink(
    { next: 'sign_in_then_link', provider: 'kakao', linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600 },
    Date.now() - (600 - remainingSeconds) * 1000,
  );

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
    expect(await screen.findByText(new RegExp(`9분 안에 로그인하면 ${label} 로그인이 이 계정에 연결돼요\\.`))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '연결 안 하기' })).toBeEnabled();
  });

  it.each([
    [1790, '29분 안에'],
    [90, '1분 안에'],
    [30, '1분 이내에'],
  ])('남은 %i초는 내림해 "%s" 로 약속한다', async (remaining, phrase) => {
    if (remaining > 600) {
      savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: 'link-token-1', linkTokenExpiresInSeconds: 1800 }, Date.now() - (1800 - remaining) * 1000);
    } else {
      storeWithRemaining(remaining);
    }
    render(<PendingLinkNotice />);
    expect(await screen.findByText(new RegExp(`^${phrase} 로그인하면 카카오 로그인이`))).toBeInTheDocument();
  });

  it('화면을 열어 둔 사이 토큰이 만료되면 안내가 사라진다', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    storeWithRemaining(20);
    render(<PendingLinkNotice />);
    expect(screen.getByText(/^1분 이내에 로그인하면/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(screen.queryByText(/이 계정에 연결돼요/)).not.toBeInTheDocument();
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
