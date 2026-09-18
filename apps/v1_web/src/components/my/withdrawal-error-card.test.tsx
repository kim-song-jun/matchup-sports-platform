import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WithdrawalErrorCard } from './withdrawal-error-card';

describe('WithdrawalErrorCard', () => {
  it('keeps a blocked user connected to the unauthenticated deletion-request path', () => {
    render(<WithdrawalErrorCard error={{
      code: 'WITHDRAWAL_BLOCKED_TEAM_AUTHORITY',
      message: '팀 관리 권한을 다른 멤버에게 넘긴 뒤 다시 시도해 주세요.',
    }} />);

    expect(screen.getByRole('alert')).toHaveTextContent('팀 관리 권한을 먼저 넘겨 주세요');
    expect(screen.getByRole('link', { name: '계정 삭제 요청 방법 보기' })).toHaveAttribute(
      'href',
      '/account-deletion',
    );
  });
});
