import { render, screen, fireEvent } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Get } from '@/lib/api-client';
import { LeagueNextRegistrationInvite } from './league-next-registration-invite';

vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()), v1Get: vi.fn(),
}));
const get = vi.mocked(v1Get);
const league = {
  registrationDeadlineAt: null, maxTeams: 2, confirmedCount: 2, pendingPaymentCount: 0,
  nextRound: {
    leagueId: 'next-league', title: '다음 시즌', seasonNo: 2,
    startsOn: '2099-12-01T00:00:00.000Z', endsOn: '2100-01-31T00:00:00.000Z',
    registrationOpen: true, registrationDeadlineAt: null,
  },
};
beforeEach(() => get.mockReset());

describe.each(['mobile', 'sidebar'] as const)('다음 리그 CTA (%s)', (variant) => {
  const openLabel = variant === 'mobile' ? '다음 리그에서 함께 뛰어요' : '다음 리그 참가 신청';
  const closedLabel = variant === 'mobile' ? '다음 리그에서 함께 뛰어요' : '다음 시즌 보기';
  it('실제 다음 리그의 신청 경로를 연결하고 현재 리그로 신청하지 않는다', async () => {
    get.mockResolvedValue(league);
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant={variant} />);
    const link = await screen.findByRole('link', { name: openLabel });
    expect(link).toHaveAttribute('href', '/tournaments/next-league/apply');
    expect(get).toHaveBeenCalledWith('/league-matches/current-league');
  });

  // 2026-11-03: 다음 시즌이 있으면 신청을 안 받아도 리그 목록이 아니라 그 리그 상세로 보낸다.
  it('다음 리그가 신청을 받지 않으면 신청 버튼 대신 다음 시즌 상세로 보낸다', async () => {
    get.mockResolvedValue({ ...league, nextRound: { ...league.nextRound, registrationOpen: false } });
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant={variant} />);
    await screen.findByText('다음 리그는 아직 신청을 받지 않아요.');
    expect(screen.getByRole('link', { name: closedLabel })).toHaveAttribute('href', '/tournaments/next-league');
  });

  it('다음 시즌이 없으면 리그 목록을 안내한다', async () => {
    get.mockResolvedValue({ ...league, nextRound: null });
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant={variant} />);
    await screen.findByText('다른 리그의 참가 일정도 확인해 보세요.');
    expect(screen.getByRole('link', { name: variant === 'mobile' ? '다음 리그에서 함께 뛰어요' : '다른 리그 둘러보기' }))
      .toHaveAttribute('href', '/tournaments?kind=league');
  });

  it('이 리그에 참가했던 팀이면 다음 시즌 재참가 신청이 그 팀을 골라 신청 화면을 연다', async () => {
    get.mockResolvedValue(league);
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant={variant} returningTeamId="team-a" />);
    const link = await screen.findByRole('link', { name: '다음 시즌 재참가 신청' });
    expect(link).toHaveAttribute('href', '/tournaments/next-league/apply?team=team-a');
    expect(screen.getByText(/지난 시즌 명단도 옮겨 와요/)).toBeInTheDocument();
  });

  it('재참가 팀인데 다음 시즌이 아직 신청을 안 받으면 열리면 알려 준다고 말한다', async () => {
    get.mockResolvedValue({ ...league, nextRound: { ...league.nextRound, registrationOpen: false } });
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant={variant} returningTeamId="team-a" />);
    await screen.findByText('다음 시즌 신청이 열리면 알려 드릴게요.');
  });

  it('조회 실패를 미등록으로 숨기지 않고 재시도 후 다음 신청을 표시한다', async () => {
    get.mockRejectedValueOnce(new Error('다음 리그 조회 실패')).mockResolvedValueOnce(league);
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant={variant} />);
    await screen.findByText('다음 리그 조회 실패');
    expect(screen.queryByRole('link', { name: openLabel })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(await screen.findByRole('link', { name: openLabel })).toHaveAttribute('href', '/tournaments/next-league/apply');
  });
});

it('우측 안내 제목은 데이터 조회와 hydration 전 서버 HTML에도 표시한다', () => {
  const html = renderToStaticMarkup(<LeagueNextRegistrationInvite leagueId="current-league" variant="sidebar" />);
  expect(html).toContain('다음 리그에서 함께 뛰어요');
  expect(html).toContain('다음 리그 확인 중');
});
