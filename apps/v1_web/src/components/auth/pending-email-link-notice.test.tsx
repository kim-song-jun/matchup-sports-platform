import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPendingEmailLink, savePendingEmailLink } from '@/lib/pending-email-link';
import { PendingEmailLinkNotice } from './pending-email-link-notice';

// 9분 30초 남은 기록 — 저장과 렌더가 같은 밀리초면 정확히 10분이 되는 경계를 피한다.
const store = (email: string | null) => savePendingEmailLink({ email }, Date.now() - 30_000);

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PendingEmailLinkNotice', () => {
  it('보관한 뜻이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<PendingEmailLinkNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('이메일을 적어 둔 경우 그 이메일 연결을 이어 간다고 남은 시간과 함께 알린다', async () => {
    store('typed@example.com');
    render(<PendingEmailLinkNotice />);

    expect(await screen.findByText('9분 안에 로그인하면 typed@example.com 연결을 이어서 도와요. 시간이 지나면 이 안내는 사라져요.')).toBeVisible();
    expect(screen.getByRole('button', { name: '연결 안 하기' })).toBeEnabled();
  });

  it('이메일 없이 뜻만 있으면 이메일은 로그인한 뒤에 직접 적는다고 알린다', async () => {
    store(null);
    render(<PendingEmailLinkNotice />);

    expect(await screen.findByText('9분 안에 로그인하면 이메일 연결을 이어서 도와요. 연결할 이메일은 로그인한 뒤에 직접 적어요.')).toBeVisible();
  });

  // 안내는 로그인 수단을 가리지 않는다 — 카카오 버튼으로 가든 이메일 로그인으로 가든 같은 말이어야 맞다.
  it('로그인 수단 이름을 말하지 않는다', async () => {
    store('typed@example.com');
    render(<PendingEmailLinkNotice />);

    const message = await screen.findByText(/연결을 이어서 도와요/);
    expect(message.textContent).not.toMatch(/카카오|Apple|애플/);
  });

  it('연결 안 하기를 누르면 안내가 사라지고 보관한 뜻도 지워져 로그인해도 이어지지 않는다', async () => {
    store('typed@example.com');
    render(<PendingEmailLinkNotice />);

    await userEvent.setup().click(await screen.findByRole('button', { name: '연결 안 하기' }));

    expect(screen.queryByText(/연결을 이어서 도와요/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연결 안 하기' })).not.toBeInTheDocument();
    expect(readPendingEmailLink()).toBeNull();
  });

  it.each([
    [90, '1분 안에'],
    [30, '1분 이내에'],
  ])('남은 %i초는 내림해 "%s" 로 약속한다', async (remaining, phrase) => {
    savePendingEmailLink({ email: null }, Date.now() - (600 - remaining) * 1000);
    render(<PendingEmailLinkNotice />);
    expect(await screen.findByText(new RegExp(`^${phrase} 로그인하면 이메일 연결을`))).toBeInTheDocument();
  });

  it('화면을 열어 둔 사이 보관 시간이 지나면 안내가 사라진다', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    savePendingEmailLink({ email: null }, Date.now() - 580_000);
    render(<PendingEmailLinkNotice />);
    expect(screen.getByText(/^1분 이내에 로그인하면/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(screen.queryByText(/연결을 이어서 도와요/)).not.toBeInTheDocument();
    expect(readPendingEmailLink()).toBeNull();
  });
});
