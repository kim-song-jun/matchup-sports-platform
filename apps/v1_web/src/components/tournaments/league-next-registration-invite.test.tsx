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
  // 2026-11-06: 모바일 버튼도 실제로 가는 곳을 적는다(고정 문구 '다음 리그에서 함께 뛰어요'는 리그 목록으로 갈 때도 떴다).
  const openLabel = '다음 리그 참가 신청';
  const closedLabel = '다음 시즌 보기';
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
    expect(screen.getByRole('link', { name: '다른 리그 둘러보기' }))
      .toHaveAttribute('href', '/tournaments?kind=league&stage=recruiting');
  });

  it('이 리그에 참가했던 팀이면 다음 시즌 재참가 신청이 그 팀을 골라 신청 화면을 연다', async () => {
    get.mockResolvedValue(league);
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant={variant} returningTeamId="team-a" />);
    const link = await screen.findByRole('link', { name: '다음 시즌 재참가 신청' });
    expect(link).toHaveAttribute('href', '/tournaments/next-league/apply?team=team-a');
    expect(screen.getByText(/지난 시즌 명단도 옮겨 와요/)).toBeInTheDocument();
  });

  // MD-QA #208: 다음 시즌에 이미 확정된 팀에게 재참가 신청을 다시 걸지 않는다.
  it('다음 시즌에 이미 확정된 팀이면 재참가 신청 대신 다음 시즌 상세로 보낸다', async () => {
    get.mockResolvedValue({ ...league, nextRound: { ...league.nextRound, teamIds: ['team-a'] } });
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant={variant} returningTeamId="team-a" />);
    expect(await screen.findByRole('link', { name: '다음 시즌 보기' })).toHaveAttribute('href', '/tournaments/next-league');
    expect(screen.getByText('우리 팀은 다음 시즌에 참가 확정됐어요.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '다음 시즌 재참가 신청' })).not.toBeInTheDocument();
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

// 2026-11-04 알파 QA: 리그 체계로 전환한 리그는 다음 시즌 링크가 비어 리그 목록으로만 갔다.
describe('리그 체계로 전환한 리그의 다음 시즌 입구', () => {
  const converted = {
    ...league,
    nextRound: null,
    nextSeasonTiers: [
      { leagueId: 'tier-1', title: '체계 1시즌 1부', tier: 1, teamIds: ['team-a'] },
      { leagueId: 'tier-2', title: '체계 1시즌 2부', tier: 2, teamIds: ['team-b'] },
    ],
  };

  // 2026-11-06 사용자 선택: 티어마다 버튼을 하나씩 두고 내 팀 티어를 맨 앞에 둔다.
  it.each(['mobile', 'sidebar'] as const)('티어마다 버튼을 두고 내 팀 티어를 맨 앞에 둔다 (%s)', async (variant) => {
    get.mockResolvedValue(converted);
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant={variant} myTeamIds={['team-b']} />);
    await screen.findByText('우리 팀은 "체계 1시즌 2부"에 편성됐어요.');
    const links = screen.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['다음 시즌 2부 보기', '/tournaments/tier-2'],
      ['다음 시즌 1부 보기', '/tournaments/tier-1'],
    ]);
  });

  it('편성된 팀이 없으면 1부부터 둔다', async () => {
    get.mockResolvedValue(converted);
    render(<LeagueNextRegistrationInvite leagueId="current-league" variant="sidebar" />);
    expect(await screen.findByText('리그 체계 첫 시즌이 시작돼요.')).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/tournaments/tier-1', '/tournaments/tier-2']);
  });
});
