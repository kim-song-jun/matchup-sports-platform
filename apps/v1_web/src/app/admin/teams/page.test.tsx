import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1AdminTeamRow } from '@/types/api';
import AdminTeamsPage from './page';

const hooks = vi.hoisted(() => ({
  teams: vi.fn(),
  mutate: vi.fn(),
  capabilities: [] as string[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTeams: (filters: unknown) => hooks.teams(filters),
  useV1ChangeTeamStatus: () => ({ mutate: hooks.mutate, isPending: false }),
  useV1AdminMe: () => ({ data: { capabilities: hooks.capabilities } }),
}));

describe('AdminTeamsPage — 주소로 들어온 검색어', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hooks.teams.mockReturnValue({
      data: { items: [], pageInfo: { page: 1, totalPages: 1, total: 0, limit: 20 }, summary: { total: 0, byStatus: {} } },
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('?q= 를 검색창에 채우고 debounce 뒤 목록 조회 필터로 보낸다', () => {
    window.history.replaceState(null, '', '/admin/teams?q=%EB%A7%88%ED%8F%AC');

    render(<AdminTeamsPage />);
    expect(screen.getByRole('searchbox', { name: '팀명 검색' })).toHaveValue('마포');

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(hooks.teams).toHaveBeenLastCalledWith(expect.objectContaining({ q: '마포' }));
  });

  it('?q= 가 없으면 검색어 없이 조회한다', () => {
    window.history.replaceState(null, '', '/admin/teams');

    render(<AdminTeamsPage />);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByRole('searchbox', { name: '팀명 검색' })).toHaveValue('');
    expect(hooks.teams).toHaveBeenLastCalledWith(expect.not.objectContaining({ q: expect.anything() }));
  });
});

describe('AdminTeamsPage — 보관(archived)이 막히면', () => {
  const row: V1AdminTeamRow = {
    teamId: 'team-1', name: '마포 FC', sportId: 'sport-1', sportName: '풋살', ownerUserId: 'owner-1', ownerName: '김팀장',
    memberCount: 5, managerCount: 1, status: 'active', createdAt: '2026-09-01T00:00:00.000Z',
  };
  const serverError = (code: string, message: string, details: unknown) =>
    new V1ApiError({ status: 'error', statusCode: code.startsWith('TEAM_') ? 409 : 403, code, message, details, timestamp: '2026-10-01T00:00:00.000Z' });

  beforeEach(() => {
    hooks.capabilities = ['status:write'];
    hooks.mutate.mockReset();
    hooks.teams.mockReturnValue({
      data: { items: [row], pageInfo: { page: 1, totalPages: 1, total: 1, limit: 20 }, summary: { total: 1, byStatus: { active: 1 } } },
      isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn(),
    });
  });

  afterEach(() => {
    hooks.capabilities = [];
  });

  function submitArchive() {
    render(<AdminTeamsPage />);
    // 표는 넓은 화면용 행과 좁은 화면용 카드를 함께 그린다 — 같은 버튼이 둘이다.
    fireEvent.click(screen.getAllByRole('button', { name: '마포 FC 상태 변경' })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('변경할 상태'), { target: { value: 'archived' } });
    fireEvent.change(within(dialog).getByLabelText(/사유/), { target: { value: '정책 위반' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));
    return dialog;
  }

  it('409 TEAM_DISSOLVE_BLOCKED 의 details.blockers 를 모달 안에 항목별로 읽히게 보여 주고 모달을 닫지 않는다', () => {
    hooks.mutate.mockImplementation((_vars, options: { onError: (err: unknown) => void }) =>
      options.onError(serverError('TEAM_DISSOLVE_BLOCKED', '끝나지 않은 경기나 대회·리그 참가가 남아 있어 지금은 해체할 수 없어요.', {
        blockers: [
          { kind: 'matched_team_match', items: [{ id: 'tm-1', title: '주말 친선', opponentName: '합정 FC', startAt: null, placeName: '망원 유수지', registrationStatus: null, route: '/team-matches/tm-1' }] },
          { kind: 'league_entry', items: [{ id: 'reg-1', title: '마포 리그', opponentName: null, startAt: null, placeName: null, registrationStatus: 'cancel_requested', route: null }] },
        ],
      })),
    );
    const dialog = submitArchive();

    expect(hooks.mutate).toHaveBeenCalledWith({ id: 'team-1', status: 'archived', reason: '정책 위반' }, expect.anything());
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('끝나지 않은 경기나 대회·리그 참가가 남아 있어 지금은 해체할 수 없어요.');
    const list = within(alert).getByRole('list', { name: '보관을 막는 항목' });
    expect(within(list).getByText('상대가 정해진 팀매치 1건')).toBeInTheDocument();
    expect(within(list).getByText('주말 친선 · vs 합정 FC · 망원 유수지')).toBeInTheDocument();
    expect(within(list).getByText('참가 중인 리그 1건')).toBeInTheDocument();
    expect(within(list).getByText('마포 리그 · 취소 요청 중')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('보관을 풀 때 409 TEAM_RESTORE_NAME_TAKEN 이면 창 안에 이유와 팀 상세(이름 바꾸기)로 가는 길을 남긴다', () => {
    hooks.teams.mockReturnValue({
      data: { items: [{ ...row, status: 'archived' }], pageInfo: { page: 1, totalPages: 1, total: 1, limit: 20 }, summary: { total: 1, byStatus: { archived: 1 } } },
      isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn(),
    });
    hooks.mutate.mockImplementation((_vars, options: { onError: (err: unknown) => void }) =>
      options.onError(serverError('TEAM_RESTORE_NAME_TAKEN', '같은 종목·지역에 같은 이름의 팀이 있어 복구할 수 없어요.', null)),
    );
    render(<AdminTeamsPage />);
    fireEvent.click(screen.getAllByRole('button', { name: '마포 FC 상태 변경' })[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('변경할 상태'), { target: { value: 'active' } });
    fireEvent.change(within(dialog).getByLabelText(/사유/), { target: { value: '복구 요청' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '확인' }));

    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('같은 종목·지역에 같은 이름의 팀이 있어 복구할 수 없어요.');
    expect(within(alert).getByRole('link', { name: '팀 상세에서 이름 바꾸기' })).toHaveAttribute('href', '/admin/teams/team-1');
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('다른 거절은 지금처럼 토스트로만 알리고 모달에 목록을 남기지 않는다', () => {
    hooks.mutate.mockImplementation((_vars, options: { onError: (err: unknown) => void }) =>
      options.onError(serverError('PERMISSION_DENIED', '권한이 없어요.', null)),
    );
    const dialog = submitArchive();

    expect(within(dialog).queryByRole('list', { name: '보관을 막는 항목' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: '팀 상세에서 이름 바꾸기' })).not.toBeInTheDocument();
    expect(screen.getByText('권한이 없어요.')).toBeInTheDocument();
  });
});
