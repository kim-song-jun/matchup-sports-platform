import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from './admin-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminInquiriesPendingCount: () => ({ data: { count: 0 } }),
}));

describe('AdminShell nav', () => {
  it('renders a reachable sidebar link to the Web Push failure log page', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    // Desktop sidebar renders inside `nav[aria-label="주 메뉴"]`; there are two
    // (desktop sidebar + mobile drawer), so assert at least one reachable link exists.
    const links = screen.getAllByRole('link', { name: /웹 푸시 실패/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/admin/ops/push-failures');
    }
  });
});
