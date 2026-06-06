import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/auth/require-auth', () => ({
  RequireAuth: ({ children }: { readonly children: ReactNode }) => (
    <section data-testid="admin-auth-gate">{children}</section>
  ),
}));

import AdminLayout from './layout';

describe('admin auth layout', () => {
  it('wraps every admin route with the shared authentication gate', () => {
    render(
      <AdminLayout>
        <div>Admin route content</div>
      </AdminLayout>,
    );

    const gate = screen.getByTestId('admin-auth-gate');
    expect(within(gate).getByText('Admin route content')).toBeInTheDocument();
  });
});
