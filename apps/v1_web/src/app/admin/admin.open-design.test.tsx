import { cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Providers } from '../providers';
import { server } from '@/test/msw/server';
import AdminAuditPage from './audit/page';
import AdminPage from './page';

const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost/api/v1';
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

afterAll(() => {
  if (previousApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = previousApiUrl;
  }
  server.close();
});

function renderWithProviders(children: ReactNode) {
  return render(<Providers>{children}</Providers>);
}

function expectRuntimeLinksOnly(container: HTMLElement) {
  const links = within(container).queryAllByRole('link');
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    expect(href).not.toContain('.html');
    expect(href).not.toBe('#');
  }
}

describe('admin Open Design contract', () => {
  it('renders current minimum admin surfaces without unsupported action success', async () => {
    renderWithProviders(<AdminPage />);

    const dashboard = await screen.findByTestId('admin-open-design');
    await within(dashboard).findByText(/admin owner/);
    expect(dashboard).toHaveClass('tm-admin-open-design');
    expect(dashboard).toHaveClass('tm-admin-desktop-workbench');
    expect(within(dashboard).getByText('운영 요약')).toBeInTheDocument();
    expect(within(dashboard).getByText('검토 큐')).toBeInTheDocument();
    expect(within(dashboard).getAllByText('감사 로그').length).toBeGreaterThan(0);
    expect(within(dashboard).getByText('운영 상태')).toBeInTheDocument();
    expect(within(dashboard).getByRole('link', { name: /감사 로그/ })).toHaveAttribute('href', '/admin/audit');
    expect(dashboard).toHaveTextContent('읽기 전용');
    expect(dashboard).not.toHaveTextContent('처리 완료');
    expectRuntimeLinksOnly(dashboard);
    const dashboardNav = screen.getByLabelText('관리자 메뉴');
    expect(within(dashboardNav).getByRole('link', { name: /운영 상태/ })).toHaveAttribute('href', '/admin');
    expect(within(dashboardNav).getByRole('link', { name: /감사 로그/ })).toHaveAttribute('href', '/admin/audit');
    expect(within(dashboardNav).queryByRole('link', { name: /마이/ })).not.toBeInTheDocument();
    expect(within(dashboardNav).queryByRole('link', { name: /매치 만들기/ })).not.toBeInTheDocument();

    cleanup();
    renderWithProviders(<AdminAuditPage />);
    const audit = await screen.findByTestId('admin-audit-open-design');
    await within(audit).findByText('actionLogId');
    expect(audit).toHaveClass('tm-admin-audit-open-design');
    expect(within(audit).getByText('감사 로그')).toBeInTheDocument();
    expect(within(audit).getByRole('link', { name: /운영 상태/ })).toHaveAttribute('href', '/admin');
    expect(audit).toHaveTextContent('사유');
    expectRuntimeLinksOnly(audit);
    const auditNav = screen.getByLabelText('관리자 메뉴');
    expect(within(auditNav).getByRole('link', { name: /운영 상태/ })).toHaveAttribute('href', '/admin');
    expect(within(auditNav).getByRole('link', { name: /감사 로그/ })).toHaveAttribute('href', '/admin/audit');
    expect(within(auditNav).queryByRole('link', { name: /마이/ })).not.toBeInTheDocument();
    expect(within(auditNav).queryByRole('link', { name: /매치 만들기/ })).not.toBeInTheDocument();
  });

  it('renders admin role capability and permission-denied rules without fake mutation controls', async () => {
    renderWithProviders(<AdminPage />);

    const dashboard = await screen.findByTestId('admin-open-design');
    await within(dashboard).findByText(/admin owner/);
    const matrix = within(dashboard).getByTestId('admin-permission-matrix');
    expect(matrix).toHaveTextContent('owner');
    expect(matrix).toHaveTextContent('ops');
    expect(matrix).toHaveTextContent('support');
    expect(matrix).toHaveTextContent('overview:read');
    expect(matrix).toHaveTextContent('logs:read');
    expect(matrix).toHaveTextContent('status:write');
    expect(matrix).toHaveTextContent('admin:owner');
    expect(matrix).toHaveTextContent('support는 조회와 로그만 가능');

    const guard = within(dashboard).getByTestId('admin-permission-guard');
    expect(guard).toHaveTextContent('active admin');
    expect(guard).toHaveTextContent('PERMISSION_DENIED');
    expect(guard).toHaveTextContent('Support admins cannot mutate status');
    expect(guard).toHaveTextContent('reason required');
    expect(within(guard).getByRole('button', { name: /상태 변경 권한 필요/ })).toBeDisabled();
    expect(dashboard).not.toHaveTextContent('처리 완료');
  });

  it('renders the real overview API error when admin overview loading fails', async () => {
    server.use(
      http.get('*/api/v1/admin/overview', () => HttpResponse.json({
        status: 'error',
        statusCode: 500,
        code: 'ADMIN_OVERVIEW_FAILED',
        message: 'Overview service unavailable',
        timestamp: '2026-05-18T00:00:00.000Z',
      }, { status: 500 })),
    );

    renderWithProviders(<AdminPage />);

    const dashboard = await screen.findByTestId('admin-open-design');
    await within(dashboard).findByText('운영 상태 오류');
    expect(dashboard).toHaveTextContent('ADMIN_OVERVIEW_FAILED: Overview service unavailable');
    expect(dashboard).not.toHaveTextContent('처리 완료');
  });

  it('renders action log and status-change log traceability on audit surface', async () => {
    renderWithProviders(<AdminAuditPage />);

    const audit = await screen.findByTestId('admin-audit-open-design');
    await within(audit).findByText('actionLogId');
    const auditTrail = within(audit).getByTestId('admin-audit-trail');
    expect(auditTrail).toHaveTextContent('actionLogId');
    expect(auditTrail).toHaveTextContent('statusChangeLogId');
    expect(auditTrail).toHaveTextContent('beforeState');
    expect(auditTrail).toHaveTextContent('afterState');
    expect(auditTrail).toHaveTextContent('reason');
    expect(auditTrail).toHaveTextContent('cursor');
    expect(audit).not.toHaveTextContent('처리 완료');
  });

  it('keeps permission-denied admin state out of the public app shell', async () => {
    server.use(
      http.get('*/api/v1/admin/me', () => HttpResponse.json({
        status: 'error',
        statusCode: 403,
        code: 'PERMISSION_DENIED',
        message: 'Active admin access is required',
        timestamp: '2026-05-18T00:00:00.000Z',
      }, { status: 403 })),
    );

    renderWithProviders(<AdminPage />);

    const denied = await screen.findByTestId('admin-permission-denied');
    const dashboard = screen.getByTestId('admin-open-design');
    expect(denied).toHaveTextContent('PERMISSION_DENIED');
    expect(within(dashboard).getByRole('button', { name: /관리자 권한 필요/ })).toBeDisabled();
    expect(within(dashboard).queryByRole('link', { name: /홈으로/ })).not.toBeInTheDocument();
    expect(within(dashboard).queryByRole('link', { name: /마이/ })).not.toBeInTheDocument();
    expect(within(dashboard).queryByRole('link', { name: /매치 만들기/ })).not.toBeInTheDocument();
  });
});
