import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppChrome } from './shell';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1NotificationUnreadSummary: vi.fn(() => ({ data: { unreadCount: 0 } })),
}));

describe('AppChrome match entry', () => {
  it('하단 매치 탭은 팀 매치로 진입한다', () => {
    render(<AppChrome title="테스트" showNotifications={false}><div>본문</div></AppChrome>);
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });

    expect(within(nav).getByRole('link', { name: '매치' })).toHaveAttribute('href', '/team-matches');
  });
});
