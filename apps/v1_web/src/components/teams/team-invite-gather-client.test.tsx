/**
 * 멤버 모으기(Task 180 G12 B-2) — 실제 훅이 MSW 상태형 서버에 보내는 요청과 그 결과 화면을 본다.
 * 링크가 없으면 한 번만 만들고, 재발급은 확인 창을 거치며, 여러 명 초대는 못 찾은 사람만 다시 고치게 남긴다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TeamInviteLink } from '@/types/api';
import { createV1TeamInviteLinkMswHandlers, inviteLinkToken, TEAM_INVITE_LINK_MSW } from '@/test/msw/team-invite-link-handlers';
import { TeamInviteGatherPageClient } from './team-invite-gather-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => `/teams/${TEAM_INVITE_LINK_MSW.teamId}/invite`,
}));

const { teamId, teamName } = TEAM_INVITE_LINK_MSW;
const LINK = `/api/v1/teams/${teamId}/invite-link`;

let server: ReturnType<typeof setupServer>;
let mock: ReturnType<typeof createV1TeamInviteLinkMswHandlers>;

function teamDetail(role: string) {
  return {
    teamId,
    name: teamName,
    memberCount: 1,
    profile: { memberGoalCount: 24, logoUrl: null },
    viewer: { role, membershipId: 'mem-me', joinState: role === 'none' ? 'none' : 'member', canRequestJoin: false, disabledReason: null, manageRoute: null },
  };
}

function start(role: string, init: Parameters<typeof createV1TeamInviteLinkMswHandlers>[0] = {}) {
  mock = createV1TeamInviteLinkMswHandlers(init);
  server = setupServer(
    http.get(`*/api/v1/teams/${teamId}`, () => HttpResponse.json({ status: 'success', data: teamDetail(role) })),
    ...mock.handlers,
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
}

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1'));
afterEach(() => {
  server.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamInviteGatherPageClient teamId={teamId} />
    </QueryClientProvider>,
  );
}

const linkPosts = () => mock.state.requests.filter((r) => r.method === 'POST' && r.path.startsWith(LINK));
const expectedUrl = (n: number) => `${window.location.origin}/invite/${inviteLinkToken(n)}`;

describe('초대 링크', () => {
  it('링크가 없으면 한 번만 만들어 보여 주고, 복사하면 클립보드에 그 주소가 들어간다', async () => {
    const user = userEvent.setup();
    start('owner');
    renderPage();

    expect(await screen.findByRole('textbox', { name: '초대 링크' })).toHaveValue(expectedUrl(1));
    expect(linkPosts().map((r) => r.path)).toEqual([LINK]);
    expect(screen.getByText(/가입 신청으로 접수돼요 · 10월 8일 \(목\) 오전 9:00까지 쓸 수 있어요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '복사' }));
    await expect(navigator.clipboard.readText()).resolves.toBe(expectedUrl(1));
    expect(await screen.findByText('초대 링크를 복사했어요.')).toBeInTheDocument();
  });

  it('클립보드가 거절하면 링크 글자를 선택해 두고 직접 복사하라고 알린다', async () => {
    const user = userEvent.setup();
    start('manager');
    renderPage();
    const input = (await screen.findByRole('textbox', { name: '초대 링크' })) as HTMLInputElement;
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('denied', 'NotAllowedError'));

    await user.click(screen.getByRole('button', { name: '복사' }));
    expect(await screen.findByText('복사하지 못했어요. 링크를 선택해 두었으니 직접 복사해 주세요.')).toBeInTheDocument();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, expectedUrl(1).length]);
  });

  it('살아 있는 링크가 있으면 새로 만들지 않고, 재발급은 확인 창에서 동의해야 바뀐다', async () => {
    const user = userEvent.setup();
    const active: V1TeamInviteLink = { teamId, status: 'active', token: inviteLinkToken(7), expiresAt: '2026-10-08T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z' };
    start('owner', { link: active });
    renderPage();
    expect(await screen.findByRole('textbox', { name: '초대 링크' })).toHaveValue(`${window.location.origin}/invite/${inviteLinkToken(7)}`);
    expect(linkPosts()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: '새 링크로 바꾸기' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('이전 링크는 더 이상 쓸 수 없어요');
    await user.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(linkPosts()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: '새 링크로 바꾸기' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '새 링크 만들기' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: '초대 링크' })).toHaveValue(expectedUrl(1)));
    expect(linkPosts().map((r) => r.path)).toEqual([`${LINK}/reissue`]);
  });

  it('만료된 링크는 만료 안내와 함께 새로 만들 때까지 주소를 보여 주지 않는다', async () => {
    const user = userEvent.setup();
    const expired: V1TeamInviteLink = { teamId, status: 'expired', token: null, expiresAt: '2026-09-30T03:00:00.000Z', createdAt: '2026-09-23T03:00:00.000Z' };
    start('owner', { link: expired });
    renderPage();

    expect(await screen.findByText(/9월 30일 \(수\) 오후 12:00에 링크가 만료됐어요/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '초대 링크' })).not.toBeInTheDocument();
    expect(linkPosts()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: '새 링크 만들기' }));
    expect(await screen.findByRole('textbox', { name: '초대 링크' })).toHaveValue(expectedUrl(1));
  });

  it('멤버에게는 화면을 열지 않고 링크도 요청하지 않는다', async () => {
    start('member');
    renderPage();

    expect(await screen.findByText('팀장·매니저만 멤버를 초대할 수 있어요')).toBeInTheDocument();
    expect(mock.state.requests).toHaveLength(0);
  });
});

describe('여러 명 초대', () => {
  it('Enter·쉼표로 담아 한 번에 보내고, 못 찾은 사람만 칩에 남긴다', async () => {
    const user = userEvent.setup();
    start('owner', {
      link: { teamId, status: 'active', token: inviteLinkToken(3), expiresAt: '2026-10-08T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z' },
      people: [
        { email: 'kim@example.com', nickname: '김선수' },
        { email: 'lee@example.com', nickname: '이선수', member: true },
      ],
    });
    renderPage();
    const input = await screen.findByRole('textbox', { name: '초대할 사람 추가' });

    await user.type(input, '김선수{Enter}');
    await user.type(input, '이선수, ghost@example.com,');
    expect(screen.getByRole('button', { name: '김선수 빼기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ghost@example.com 빼기' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '3명에게 초대 보내기' }));

    expect(await screen.findByText('1명에게 초대를 보냈어요. 이미 멤버이거나 초대한 1명은 건너뛰었어요.')).toBeInTheDocument();
    const batch = mock.state.requests.find((r) => r.path.endsWith('/invitations/batch'));
    expect(batch?.body).toEqual({ recipients: ['김선수', '이선수', 'ghost@example.com'] });
    expect(screen.queryByRole('button', { name: '김선수 빼기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ghost@example.com 빼기' })).toBeInTheDocument();
    expect(screen.getByText('ghost@example.com — 가입한 사람을 찾지 못했어요')).toBeInTheDocument();
  });
});
