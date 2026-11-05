import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountRecoveryClient } from './account-recovery-client';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

afterEach(cleanup);

function app(initialMode?: 'reset-password') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><AccountRecoveryClient initialMode={initialMode} /></QueryClientProvider>;
}

describe('계정 찾기 화면 준비', () => {
  it('서버가 보낸 목적 선택과 다음 버튼은 화면 준비 전까지 잠긴다', () => {
    const html = renderToString(app());
    const document = new DOMParser().parseFromString(html, 'text/html');
    const choices = document.querySelectorAll<HTMLButtonElement>('[aria-label="찾을 항목"] button');
    const next = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('다음'));
    expect(choices).toHaveLength(2);
    expect([...choices].every((button) => button.disabled)).toBe(true);
    expect(next?.disabled).toBe(true);
    expect(document.body.textContent).toContain('화면을 준비하고 있어요');
  });

  it('직접 재설정 진입의 이메일 입력도 준비 전에는 잠기고 준비 뒤 이용할 수 있다', () => {
    const html = renderToString(app('reset-password'));
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelector<HTMLInputElement>('input[type="email"]')?.disabled).toBe(true);
    render(app('reset-password'));
    expect(screen.getByLabelText('이메일')).toBeEnabled();
  });
});
