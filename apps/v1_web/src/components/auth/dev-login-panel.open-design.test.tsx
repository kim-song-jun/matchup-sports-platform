import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DevLoginPanel } from './dev-login-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1DevLogin: () => ({
    isError: false,
    isPending: false,
    mutate: vi.fn(),
  }),
}));

describe('DevLoginPanel Open Design contract', () => {
  it('keeps persona credentials in option values without exposing internal email copy', () => {
    render(<DevLoginPanel defaultEmail="admin@teameet.v1" />);

    const accountSelect = screen.getByRole('combobox', { name: '간편 로그인 계정' });
    expect(accountSelect).not.toHaveTextContent(/@|teameet\.v1/i);
    expect(screen.getByRole('option', { name: '운영자' })).toHaveValue('admin@teameet.v1');
  });
});
