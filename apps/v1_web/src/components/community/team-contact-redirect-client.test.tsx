import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamContactRedirectClient } from './team-contact-redirect-client';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const resolve = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/my/team-contacts/contact-1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1ResolveChatRoom: () => resolve,
}));

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TeamContactRedirectClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('컨택 id 로 방을 찾아 채팅방으로 replace 한다', () => {
    resolve.mutate.mockImplementation((_vars, opts) => opts.onSuccess({ roomId: 'room-1', route: '/chat/room-1', created: false, roomType: 'team_contact' }));

    renderWithClient(<TeamContactRedirectClient contactId="contact-1" />);

    expect(resolve.mutate).toHaveBeenCalledWith({ targetType: 'team_contact', targetId: 'contact-1' }, expect.any(Object));
    expect(router.replace).toHaveBeenCalledWith('/chat/room-1');
  });

  it('찾지 못하면 에러와 채팅 목록 링크를 보여준다', () => {
    resolve.mutate.mockImplementation((_vars, opts) => opts.onError(new Error('boom')));

    renderWithClient(<TeamContactRedirectClient contactId="contact-1" />);

    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '채팅 목록으로' })).toHaveAttribute('href', '/chat?category=team_contact');
  });
});
