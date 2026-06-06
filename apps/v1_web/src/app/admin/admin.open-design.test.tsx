import { readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdminAuditPageView, AdminDashboardPageView } from '@/components/community/admin-page';
import { toAdminAuditModel, toAdminDashboardModel } from '@/components/community/admin.view-model';
import { v1AdminLogsFixture, v1AdminOverviewFixture } from '@/test/msw/fixtures';

const adminAuthorityFixture = {
  adminUserId: 'admin-1',
  adminRole: 'owner',
  status: 'active',
  capabilities: ['overview:read', 'status:write', 'logs:read', 'admin:owner'],
};

function expectRuntimeLinksOnly(container: HTMLElement) {
  const links = within(container).queryAllByRole('link');
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    expect(href).not.toContain('.html');
    expect(href).not.toBe('#');
  }
}

function expectServiceFacingCopy(container: HTMLElement) {
  const visibleText = container.textContent ?? '';
  expect(visibleText).not.toMatch(/v1|API|route|contract|mutation|unavailable|AdminGuard|capability|admin id|status:write|overview:read|logs:read|admin:owner|계약 미연결|도메인|seed|smoke|action log|coverage|fixture/);
}

describe('admin Open Design contract', () => {
  it('renders service-facing admin operations without implementation copy', () => {
    render(
      <AdminDashboardPageView
        model={toAdminDashboardModel({
          authority: adminAuthorityFixture,
          overview: v1AdminOverviewFixture,
          logs: v1AdminLogsFixture.items,
          authorityState: 'ready',
          overviewState: 'ready',
          logsState: 'ready',
        })}
      />,
    );

    const dashboard = screen.getByTestId('admin-open-design');
    expect(dashboard).toHaveClass('tm-admin-open-design');
    expect(dashboard).toHaveClass('tm-admin-desktop-workbench');
    expect(within(dashboard).getByTestId('admin-desktop-domain')).toBeInTheDocument();
    expect(within(dashboard).getByText('운영 관리')).toBeInTheDocument();
    expect(within(dashboard).getAllByText('관리자 권한').length).toBeGreaterThan(0);
    expect(within(dashboard).getAllByText('준비 중').length).toBeGreaterThan(0);
    expect(within(dashboard).getByRole('button', { name: '준비 중' })).toBeDisabled();
    expect(within(dashboard).getAllByText('처리 가능 업무').length).toBeGreaterThan(0);
    expect(within(dashboard).getAllByText('사용자').length).toBeGreaterThan(0);
    expect(within(dashboard).getAllByText('개인 매치').length).toBeGreaterThan(0);
    expect(within(dashboard).getAllByText('팀 매치').length).toBeGreaterThan(0);
    expect(within(dashboard).getAllByText('감사 로그').length).toBeGreaterThan(0);
    expect(within(dashboard).getAllByText('상태 변경에서 처리').length).toBeGreaterThan(0);
    expect(dashboard).not.toHaveTextContent('대상 선택 후 처리');
    expect(within(dashboard).getByRole('link', { name: /감사 로그/ })).toHaveAttribute('href', '/admin/audit');
    expect(dashboard).not.toHaveTextContent('처리 완료');
    expectServiceFacingCopy(dashboard);
    expectRuntimeLinksOnly(dashboard);
    const dashboardNav = screen.getByLabelText('관리자 메뉴');
    expect(within(dashboardNav).getByRole('link', { name: /운영 상태/ })).toHaveAttribute('href', '/admin');
    expect(within(dashboardNav).getByRole('link', { name: /감사 로그/ })).toHaveAttribute('href', '/admin/audit');
    expect(within(dashboardNav).queryByRole('link', { name: /마이/ })).not.toBeInTheDocument();
    expect(within(dashboardNav).queryByRole('link', { name: /매치 만들기/ })).not.toBeInTheDocument();

    cleanup();
    render(
      <AdminAuditPageView
        model={toAdminAuditModel({
          authority: adminAuthorityFixture,
          logs: v1AdminLogsFixture.items,
          nextCursor: v1AdminLogsFixture.nextCursor,
          authorityState: 'ready',
          state: 'ready',
        })}
      />,
    );
    const audit = screen.getByTestId('admin-audit-open-design');
    expect(audit).toHaveClass('tm-admin-audit-open-design');
    expect(within(audit).getByTestId('admin-desktop-domain')).toBeInTheDocument();
    expect(within(audit).getAllByText('감사 로그').length).toBeGreaterThan(0);
    expect(within(audit).getByText('주체')).toBeInTheDocument();
    expect(within(audit).getByText('액션')).toBeInTheDocument();
    expect(within(audit).getByText('대상')).toBeInTheDocument();
    expect(within(audit).getByRole('link', { name: /운영 상태/ })).toHaveAttribute('href', '/admin');
    expect(audit).toHaveTextContent('사유');
    expectServiceFacingCopy(audit);
    expectRuntimeLinksOnly(audit);
    const auditNav = screen.getByLabelText('관리자 메뉴');
    expect(within(auditNav).getByRole('link', { name: /운영 상태/ })).toHaveAttribute('href', '/admin');
    expect(within(auditNav).getByRole('link', { name: /감사 로그/ })).toHaveAttribute('href', '/admin/audit');
    expect(within(auditNav).queryByRole('link', { name: /마이/ })).not.toBeInTheDocument();
    expect(within(auditNav).queryByRole('link', { name: /매치 만들기/ })).not.toBeInTheDocument();
  });

  it('does not render operational panels when admin data fails to load', () => {
    render(
      <AdminDashboardPageView
        model={toAdminDashboardModel({
          authority: null,
          overview: null,
          logs: null,
          authorityState: 'error',
          overviewState: 'error',
          logsState: 'error',
          errorMessage: 'Active admin access is required',
        })}
      />,
    );

    const dashboard = screen.getByTestId('admin-open-design');
    expect(within(dashboard).getByRole('alert')).toHaveTextContent('관리자 권한이 필요합니다.');
    expect(within(dashboard).queryByLabelText('운영 요약')).not.toBeInTheDocument();
    expect(within(dashboard).queryByText('서비스 운영 현황')).not.toBeInTheDocument();
    expect(within(dashboard).queryByText('처리 가능 업무')).not.toBeInTheDocument();
    expectServiceFacingCopy(dashboard);

    cleanup();
    render(
      <AdminAuditPageView
        model={toAdminAuditModel({
          authority: null,
          logs: null,
          authorityState: 'error',
          state: 'error',
          errorMessage: 'Active admin access is required',
        })}
      />,
    );

    const audit = screen.getByTestId('admin-audit-open-design');
    expect(within(audit).getByRole('alert')).toHaveTextContent('관리자 권한이 필요합니다.');
    expect(within(audit).queryByRole('table', { name: '감사 로그' })).not.toBeInTheDocument();
    expect(within(audit).queryByRole('button', { name: '준비 중' })).not.toBeInTheDocument();
    expectServiceFacingCopy(audit);
  });

  it('keeps the audit table stacked through the narrow tablet boundary', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');

    expect(css).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.tm-admin-table\s*\{[\s\S]*?overflow-x: visible;[\s\S]*?\.tm-admin-table-row\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?min-width: 0;/);
  });

  it('styles admin secondary actions as visible controls instead of plain text', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');

    expect(css).toMatch(/\.tm-btn-secondary\s*\{[\s\S]*?border:\s*1px solid var\(--grey200\);[\s\S]*?background:\s*var\(--static-white\);[\s\S]*?color:\s*var\(--text-strong\);/);
    expect(css).toMatch(/\.tm-desktop-nav-admin\s*\{[\s\S]*?background:\s*#111827;[\s\S]*?color:\s*var\(--static-white\);/);
  });
});
