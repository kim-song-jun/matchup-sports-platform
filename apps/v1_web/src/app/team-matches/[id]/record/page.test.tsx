import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Page from './page';

vi.mock('@/components/team-matches/team-match-shared-record', () => ({
  TeamMatchSharedRecord: ({ teamMatchId }: { teamMatchId: string }) => (
    <div>공개 경기 기록 {teamMatchId}</div>
  ),
}));

vi.mock('@/components/auth/require-auth', () => ({
  RequireAuth: () => <div>로그인 필요</div>,
}));

describe('/team-matches/:id/record', () => {
  it('비로그인 방문자도 조회할 수 있도록 인증 게이트 없이 경기 기록을 렌더한다', async () => {
    render(await Page({ params: Promise.resolve({ id: 'team-match-1' }) }));

    expect(screen.getByText('공개 경기 기록 team-match-1')).toBeInTheDocument();
    expect(screen.queryByText('로그인 필요')).not.toBeInTheDocument();
  });
});
