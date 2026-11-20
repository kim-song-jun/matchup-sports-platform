import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminEntityOperations } from './admin-entity-operations';

function mount(entity: 'users' | 'teams') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const result = render(<QueryClientProvider client={client}><AdminEntityOperations entity={entity} id="target" /></QueryClientProvider>);
  return () => { result.unmount(); client.clear(); };
}
const ok = (data: unknown) => new Response(JSON.stringify({ status: 'success', data, timestamp: new Date().toISOString() }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe('member and team operation information', () => {
  it('shows signup blockers, withdrawal deadline, operator/reason and paginates the actual API result', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requests.push(url);
      if (!url.includes('/history')) return ok({ kind: 'user', missingItems: ['phone', 'terms'], deletionFinalized: false,
        signupStage: 'profile_deferred', pendingRequiredDocumentIds: [], withdrawalScheduledAt: '2026-12-19T01:00:00Z' });
      const second = url.includes('page=2');
      return ok({ items: [{ id: second ? 'log2' : 'log1', title: second ? '복구 처리' : '상태 변경', href: null,
        status: second ? 'active' : 'suspended', fromStatus: 'active', at: '2026-11-19T00:00:00Z', description: null, actor: '처리 운영자', reason: '반복 신고 확인' }],
      pageInfo: { page: second ? 2 : 1, pageSize: 10, total: 11, hasNext: !second } });
    }));
    const cleanup = mount('users');
    expect(await screen.findByText('보완할 항목: 휴대폰 인증 · 필수 약관 동의')).toBeInTheDocument();
    expect(screen.getByText(/탈퇴 예정일:/)).toBeInTheDocument();
    expect(await screen.findByText('사유: 반복 신고 확인')).toBeInTheDocument();
    expect(screen.getByText(/처리자 처리 운영자/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText('복구 처리')).toBeInTheDocument();
    expect(requests.some((url) => url.endsWith('/history?page=2'))).toBe(true);
    cleanup();
  });

  it('shows team owner restrictions and zero pending requests without inventing recent activity', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/history')
      ? ok({ items: [], pageInfo: { page: 1, pageSize: 10, total: 0, hasNext: false } })
      : ok({ kind: 'team', ownerAccountStatus: 'suspended', ownerLastLoginAt: null, pendingJoinCount: 0, lastPlayedAt: null })));
    const cleanup = mount('teams');
    expect(await screen.findByText('완료된 경기 없음')).toBeInTheDocument();
    expect(screen.getByText('정지')).toBeInTheDocument();
    expect(screen.getByText('0명')).toBeInTheDocument();
    expect(screen.queryByText('공식 경기 출전 기록')).not.toBeInTheDocument();
    cleanup();
  });

  it('surfaces access failure and provides retry rather than showing empty success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'error', statusCode: 403,
      code: 'PERMISSION_DENIED', message: '운영자 권한이 회수됐어요.', timestamp: new Date().toISOString() }), { status: 403 })));
    const cleanup = mount('users');
    await waitFor(() => expect(screen.getAllByText('운영자 권한이 회수됐어요.').length).toBeGreaterThan(0));
    expect(screen.queryByText('해당 기록이 없어요.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '다시 시도' }).length).toBeGreaterThan(0);
    cleanup();
  });
});
