/**
 * 초대 링크 착지(Task 180 G12) — 링크로는 가입 신청만 보내고, 이미 멤버·대기 중이면 그 상태를, 쓸 수 없는 링크면 이유를 보여 준다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TeamInviteLink } from '@/types/api';
import { createV1TeamInviteLinkMswHandlers, inviteLinkToken, TEAM_INVITE_LINK_MSW } from '@/test/msw/team-invite-link-handlers';
import { TeamInviteLandingClient } from './team-invite-landing-client';

const { teamId, teamName } = TEAM_INVITE_LINK_MSW;
const TOKEN = inviteLinkToken(5);
const ACTIVE: V1TeamInviteLink = { teamId, status: 'active', token: TOKEN, expiresAt: '2026-10-08T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z' };
const JOIN = `/api/v1/team-invite-links/${TOKEN}/join-applications`;

let server: ReturnType<typeof setupServer>;
let mock: ReturnType<typeof createV1TeamInviteLinkMswHandlers>;

function start(init: Parameters<typeof createV1TeamInviteLinkMswHandlers>[0]) {
  mock = createV1TeamInviteLinkMswHandlers(init);
  server = setupServer(...mock.handlers, http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })));
  server.listen({ onUnhandledRequest: 'error' });
}

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1'));
afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
});

function renderLanding(token = TOKEN) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamInviteLandingClient token={token} />
    </QueryClientProvider>,
  );
}

const joinPosts = () => mock.state.requests.filter((r) => r.method === 'POST' && r.path === JOIN);
const eligible = { joinState: 'none', eligible: true, reasonCode: 'OK', message: '가입 신청할 수 있어요.' };

describe('초대 링크 착지', () => {
  it('비로그인은 팀 요약을 보고, 로그인 뒤 같은 링크로 돌아오는 버튼만 있다', async () => {
    start({ link: ACTIVE, viewer: null });
    renderLanding();

    expect(await screen.findByText('풋살 · 서울 마포구')).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(teamName)).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '로그인하고 가입 신청하기' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent(`/invite/${TOKEN}`)}`,
    );
    expect(screen.queryByRole('button', { name: '가입 신청하기' })).not.toBeInTheDocument();
  });

  it('로그인한 사람이 신청하면 대기 상태로 바뀌고 다시 신청할 버튼이 없어진다', async () => {
    const user = userEvent.setup();
    start({ link: ACTIVE, viewer: eligible });
    renderLanding();

    await user.click(await screen.findByRole('button', { name: '가입 신청하기' }));
    expect(await screen.findByText('가입 신청을 보냈어요')).toBeInTheDocument();
    expect(joinPosts()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '가입 신청하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀 보기' })).toHaveAttribute('href', `/teams/${teamId}`);
  });

  it('이미 멤버면 신청 대신 팀으로 보낸다', async () => {
    start({ link: ACTIVE, viewer: { joinState: 'member', eligible: false, reasonCode: 'ALREADY_MEMBER', message: '이미 팀 멤버예요.' } });
    renderLanding();

    expect(await screen.findByText('이미 이 팀 멤버예요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀으로 가기' })).toHaveAttribute('href', `/teams/${teamId}`);
    expect(screen.queryByRole('button', { name: '가입 신청하기' })).not.toBeInTheDocument();
  });

  it('가입을 받지 않는 팀이면 서버가 준 이유를 그대로 보여 준다', async () => {
    start({ link: ACTIVE, viewer: { joinState: 'none', eligible: false, reasonCode: 'TEAM_FULL', message: '정원이 다 찬 팀이에요.' } });
    renderLanding();

    expect(await screen.findByText('정원이 다 찬 팀이에요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '가입 신청하기' })).not.toBeInTheDocument();
  });

  it.each([
    ['재발급된 링크', 'revoked', '더 이상 쓸 수 없는 링크예요'],
    ['만료된 링크', 'expired', '초대 링크가 만료됐어요'],
    ['모르는 링크', 'unknown', '초대 링크를 찾을 수 없어요'],
  ])('%s는 이유를 알리고 신청 버튼이 없다', async (_label, kind, title) => {
    if (kind === 'revoked') {
      start({ link: ACTIVE, viewer: eligible });
      mock.state.revoked.add(TOKEN);
      mock.state.link = { ...ACTIVE, token: inviteLinkToken(6) };
    } else if (kind === 'expired') {
      start({ link: { ...ACTIVE, status: 'expired' }, viewer: eligible });
    } else {
      start({ link: ACTIVE, viewer: eligible });
    }
    renderLanding(kind === 'unknown' ? inviteLinkToken(99) : TOKEN);

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '가입 신청하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다른 팀 둘러보기' })).toHaveAttribute('href', '/teams');
  });
});
