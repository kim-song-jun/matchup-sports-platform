import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AdminAuditPage from './audit/page';
import AdminPage from './page';

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
  it('renders current minimum admin surfaces without unsupported action success', () => {
    render(<AdminPage />);

    const dashboard = screen.getByTestId('admin-open-design');
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
    render(<AdminAuditPage />);
    const audit = screen.getByTestId('admin-audit-open-design');
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
});
