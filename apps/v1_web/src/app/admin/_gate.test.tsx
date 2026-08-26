/**
 * _gate.test.tsx
 *
 * AdminGate 는 `/admin/*` 전체의 문이다. 대회 현장 콘솔만 예외로 스코프 게이트에 넘기는데,
 * 그 예외가 넓어지면 어드민 화면이 **관리자 판정 없이** 열린다. 아래는 그 경계를 고정한다.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { AdminGate } from './_gate';

const { hooks } = vi.hoisted(() => ({
  hooks: { pathname: '/admin/users', adminMe: {} as Record<string, unknown> },
}));

vi.mock('next/navigation', () => ({ usePathname: () => hooks.pathname }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminMe: () => hooks.adminMe }));
vi.mock('@/components/admin/admin-shell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-shell">{children}</div>,
}));

const forbidden = new V1ApiError({
  status: 'error',
  statusCode: 403,
  code: 'FORBIDDEN',
  message: '권한이 없어요.',
  timestamp: '2026-08-20T00:00:00.000Z',
});

function renderGate(pathname: string, adminMe: Record<string, unknown>) {
  hooks.pathname = pathname;
  hooks.adminMe = adminMe;
  return render(<AdminGate><div data-testid="page">본문</div></AdminGate>);
}

const DENIED = { data: undefined, isPending: false, isError: true, error: forbidden, refetch: vi.fn() };
const ADMIN = {
  data: { adminRole: 'ops', adminUserId: 'admin-user-1234', capabilities: ['status:write'] },
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
};

describe('AdminGate', () => {
  it('관리자가 아니면 일반 어드민 화면을 막는다', () => {
    renderGate('/admin/users', DENIED);
    expect(screen.getByRole('heading', { name: '운영자 권한이 필요해요' })).toBeInTheDocument();
    expect(screen.queryByTestId('page')).not.toBeInTheDocument();
  });

  it('대회 관리 화면도 그대로 막는다 — 현장 콘솔이 아니다', () => {
    renderGate('/admin/tournaments/t-1/registrations', DENIED);
    expect(screen.getByRole('heading', { name: '운영자 권한이 필요해요' })).toBeInTheDocument();
  });

  it('현장 콘솔은 막지 않고 대회 스코프 게이트에 넘긴다', () => {
    // 여기서 막으면 그 대회에 배정된 외부 스태프가 화면을 보기도 전에 튕긴다.
    // 통과가 아니라 **위임**이다 — 실제 판정은 /admin/live/[id]/layout.tsx 의
    // TournamentLiveGate 가 하고, 화면이 부르는 모든 API 는 서버에서 다시 인가된다.
    renderGate('/admin/live/t-1/operations', DENIED);
    expect(screen.getByTestId('page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '운영자 권한이 필요해요' })).not.toBeInTheDocument();
    // 어드민 셸도 씌우지 않는다 — 현장 콘솔은 자기 셸을 쓴다.
    expect(screen.queryByTestId('admin-shell')).not.toBeInTheDocument();
  });

  it('현장 콘솔에서는 관리자여도 어드민 셸을 씌우지 않는다', () => {
    renderGate('/admin/live/t-1/staff', ADMIN);
    expect(screen.getByTestId('page')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-shell')).not.toBeInTheDocument();
  });

  it('관리자는 일반 어드민 화면을 셸과 함께 본다', () => {
    renderGate('/admin/users', ADMIN);
    expect(screen.getByTestId('admin-shell')).toBeInTheDocument();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });
});
