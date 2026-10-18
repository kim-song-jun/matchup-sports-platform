/**
 * 리그 상세 공통 셸 — 대회 상세(`tournament-admin-shell.test.tsx`)와 같은 틀을 지킨다.
 * 헤더·상태 변경·공개 설정·섹션 바는 여기서 한 번만 그리고, 섹션 화면은 하위 라우트가 채운다.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueAdminShell } from './league-admin-shell';

const nav = vi.hoisted(() => ({ pathname: '/admin/league-matches/league-1/schedule', search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const adminCanWrite = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => adminCanWrite.value }));

const query = vi.hoisted(() => ({ value: {} as Record<string, unknown>, refetch: vi.fn() }));
const changeMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatch: () => query.value,
  useV1ChangeLeagueState: () => ({ mutate: changeMutate, isPending: false }),
  useV1UpdateLeagueVisibility: () => ({ mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, error: null }),
  useV1TournamentStaffAssignments: () => ({ data: { items: [] }, isPending: false, isError: false, error: null }),
}));

const fixture = (id: string, status: string, resultStage: string) => ({
  teamMatchId: id, title: id, homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z',
  placeName: '장소 미정', status, resultStage, homeScore: null, awayScore: null,
});

function loaded(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      leagueId: 'league-1', isPublic: true, title: '가을 풋살 리그', state: 'active',
      teamIds: ['t1', 't2'], startsOn: '2026-09-01T00:00:00.000Z',
      fixtures: [fixture('tm-1', 'completed', 'official'), fixture('tm-2', 'matched', 'not_entered')],
      ...overrides,
    },
    isPending: false, isError: false, error: null, refetch: query.refetch,
  };
}

function renderShell() {
  return render(<LeagueAdminShell leagueId="league-1"><p>섹션 본문</p></LeagueAdminShell>);
}

describe('LeagueAdminShell', () => {
  beforeEach(() => {
    nav.pathname = '/admin/league-matches/league-1/schedule';
    nav.search = '';
    adminCanWrite.value = true;
    query.value = loaded();
    query.refetch.mockClear();
    changeMutate.mockClear();
  });

  it('제목과 참가팀·대진 수를 헤더에 그리고, 섹션 본문은 그 아래에 둔다', () => {
    renderShell();

    expect(screen.getByRole('heading', { level: 1, name: '가을 풋살 리그' })).toBeInTheDocument();
    expect(screen.getByText('2팀 참가 · 대진 2경기')).toBeInTheDocument();
    expect(screen.getByText('섹션 본문')).toBeInTheDocument();
  });

  describe('섹션 바', () => {
    it('운영·설정·사후로 묶고, 각 섹션은 리그 아래 자기 주소를 가진다', () => {
      renderShell();

      const bar = screen.getByRole('navigation', { name: '리그 관리 섹션' });
      expect(within(bar).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['운영', '설정', '사후']);
      const hrefOf = (name: string | RegExp) => within(bar).getByRole('link', { name }).getAttribute('href');
      expect(hrefOf(/^일정/)).toBe('/admin/league-matches/league-1/schedule');
      expect(hrefOf(/^신청 관리/)).toBe('/admin/league-matches/league-1/registrations');
      // 리그 정보의 주소는 예전 "리그 수정" 그대로라 이미 걸려 있는 링크가 깨지지 않는다.
      expect(hrefOf('리그 정보')).toBe('/admin/league-matches/league-1/edit');
      expect(hrefOf('경기 규칙')).toBe('/admin/league-matches/league-1/rules');
      expect(hrefOf('경기 영상')).toBe('/admin/league-matches/league-1/videos');
      expect(hrefOf('리뷰 관리')).toBe('/admin/league-matches/league-1/reviews');
    });

    // 신청 관리에는 숫자를 붙이지 않는다 — 운영자가 직접 넣은 팀은 '신청' 수에 안 잡혀서 팀이 있는데도 0으로 보인다.
    it('지금 있는 섹션만 현재 위치로 표시하고, 일정에는 경기 수를 붙인다', () => {
      nav.pathname = '/admin/league-matches/league-1/registrations';
      renderShell();

      const bar = screen.getByRole('navigation', { name: '리그 관리 섹션' });
      expect(within(bar).getByRole('link', { name: '신청 관리' })).toHaveAttribute('aria-current', 'page');
      expect(within(bar).getByRole('link', { name: '일정 2' })).not.toHaveAttribute('aria-current');
      expect(within(bar).getByRole('link', { name: '리그 정보' })).not.toHaveAttribute('aria-current');
    });
  });

  describe('목록으로 돌아가기', () => {
    it('출처가 없으면 기본 목록으로, 섹션 링크에도 쿼리를 붙이지 않는다', () => {
      renderShell();

      expect(screen.getByRole('link', { name: '리그 목록으로' })).toHaveAttribute('href', '/admin/league-matches');
      expect(screen.getByRole('link', { name: '리그 정보' })).toHaveAttribute('href', '/admin/league-matches/league-1/edit');
    });

    it('목록에서 넘어온 출처는 복귀 링크가 되고, 섹션을 옮겨도 이어진다', () => {
      const from = '/admin/league-matches?seriesId=series-1&from=%2Fadmin';
      nav.search = `?from=${encodeURIComponent(from)}`;
      renderShell();

      expect(screen.getByRole('link', { name: '리그 목록으로' })).toHaveAttribute('href', from);
      expect(screen.getByRole('link', { name: '경기 규칙' })).toHaveAttribute(
        'href',
        `/admin/league-matches/league-1/rules?from=${encodeURIComponent(from)}`,
      );
    });

    it('믿을 수 없는 출처는 버리고 기본 목록으로 돌아간다', () => {
      nav.search = `?from=${encodeURIComponent('//evil.example/admin')}`;
      renderShell();

      expect(screen.getByRole('link', { name: '리그 목록으로' })).toHaveAttribute('href', '/admin/league-matches');
      expect(screen.getByRole('link', { name: '경기 규칙' })).toHaveAttribute('href', '/admin/league-matches/league-1/rules');
    });
  });

  describe('상태 변경', () => {
    it('모집 마감에서 리그 시작하기를 확인하면 실제 상태 변경을 요청하고 실패를 표시한다', async () => {
      query.value = loaded({ state: 'draft', lifecycleStatus: 'closed' });
      renderShell();
      expect(screen.getByText('모집 마감')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '리그 시작하기' }));
      const dialog = screen.getByRole('dialog', { name: '리그 시작하기' });
      expect(within(dialog).getByRole('radio', { name: /진행 중/ })).toBeChecked();
      fireEvent.click(within(dialog).getByRole('button', { name: '리그 시작하기' }));
      expect(changeMutate).toHaveBeenCalledWith({ state: 'active', reason: undefined }, expect.anything());
      const callbacks = changeMutate.mock.calls[0][1];
      const { act } = await import('@testing-library/react');
      act(() => callbacks.onError(new Error('시작 권한이 없어요.')));
      expect(within(dialog).getByRole('alert')).toHaveTextContent('시작 권한이 없어요.');
    });

    it('운영자가 신청을 다시 열어도 시작 전 상태와 모집 표시는 구분한다', () => {
      query.value = loaded({ state: 'draft', lifecycleStatus: 'closed', registrationOpen: true });
      renderShell();
      expect(screen.getByText('모집 중')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '리그 시작하기' })).toBeInTheDocument();
    });

    it('조회 전용 관리자는 모집 마감 리그를 시작할 수 없다', () => {
      adminCanWrite.value = false;
      query.value = loaded({ state: 'draft', lifecycleStatus: 'closed' });
      renderShell();
      expect(screen.queryByRole('button', { name: '리그 시작하기' })).not.toBeInTheDocument();
    });

    it('조회 전용 관리자에게는 버튼이 없다', () => {
      adminCanWrite.value = false;
      renderShell();

      expect(screen.queryByRole('button', { name: '상태 변경' })).not.toBeInTheDocument();
    });

    // MD-QA #93 이후 흩어져 있던 보류 카드·되돌리기·종료 버튼을 '상태 변경' 하나로 모았다.
    it('결과가 남은 경기가 있으면 종료를 고를 수 없고, 없으면 사유를 받아 종료한다', async () => {
      const pending = renderShell();
      fireEvent.click(screen.getByRole('button', { name: '상태 변경' }));
      expect(screen.getByRole('radio', { name: /종료/ })).toBeDisabled();
      expect(screen.getByText('결과가 확정되지 않은 경기가 1개 있어요. 확정하거나 취소·삭제한 뒤 종료해 주세요.')).toBeInTheDocument();
      pending.unmount();

      query.value = loaded({ fixtures: [fixture('tm-1', 'completed', 'official'), fixture('tm-2', 'cancelled', 'not_entered')] });
      renderShell();
      fireEvent.click(screen.getByRole('button', { name: '상태 변경' }));
      fireEvent.click(screen.getByRole('radio', { name: /종료/ }));
      fireEvent.change(screen.getByLabelText(/^사유/), { target: { value: '추가 경기 없음' } });
      fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
      await waitFor(() => expect(changeMutate).toHaveBeenCalledWith({ state: 'completed', reason: '추가 경기 없음' }, expect.anything()));
    });
  });

  describe('공개 설정', () => {
    it('모든 섹션 위에서 한 번 그린다', () => {
      renderShell();

      expect(screen.getByRole('region', { name: '공개 설정' })).toHaveTextContent('현재 상태: 공개');
    });

    it('보류 중에는 그리지 않는다 — 보류 해제가 공개 여부까지 되돌린다', () => {
      query.value = loaded({ state: 'on_hold', heldFromState: 'active' });
      renderShell();

      expect(screen.queryByRole('region', { name: '공개 설정' })).not.toBeInTheDocument();
    });
  });

  it('스태프 배정 콘솔과 운영 보드로 바로 간다 — 대회 상세에는 있고 리그 상세에는 없던 입구', () => {
    renderShell();

    expect(screen.getByRole('link', { name: /스태프 배정 콘솔/ })).toHaveAttribute('href', '/admin/live/league-1/staff');
    expect(screen.getByRole('link', { name: /운영 보드/ })).toHaveAttribute('href', '/admin/live/league-1/operations');
  });

  describe('불러오는 중·실패', () => {
    it('불러오는 동안에는 섹션 바도 본문도 그리지 않는다', () => {
      query.value = { data: undefined, isPending: true, isError: false, error: null, refetch: query.refetch };
      renderShell();

      expect(screen.queryByRole('navigation', { name: '리그 관리 섹션' })).not.toBeInTheDocument();
      expect(screen.queryByText('섹션 본문')).not.toBeInTheDocument();
    });

    it('실패하면 메시지와 다시 시도 버튼을 보여 주고, 누르면 다시 조회한다', () => {
      query.value = { data: undefined, isPending: false, isError: true, error: null, refetch: query.refetch };
      renderShell();

      expect(screen.getByText('리그 정보를 불러오지 못했어요.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
      expect(query.refetch).toHaveBeenCalledTimes(1);
    });
  });
});
