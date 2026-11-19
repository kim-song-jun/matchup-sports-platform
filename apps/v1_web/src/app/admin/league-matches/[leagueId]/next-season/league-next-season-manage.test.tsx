import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1AdminLeagueDetail, V1NextSeasonCandidate } from '@/types/league-match';
import { LeagueNextSeasonManage, nextSeasonBlockedReason } from './league-next-season-manage';
import { candidateOptionLabel, nextSeasonLinkNotices } from './league-next-season-link';

const canWrite = vi.hoisted(() => ({ value: true }));
const leagueQuery = vi.hoisted(() => ({ value: {} as Record<string, unknown>, refetch: vi.fn() }));
const candidatesQuery = vi.hoisted(() => ({ value: {} as Record<string, unknown>, refetch: vi.fn() }));
const linkMutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const unlinkMutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => canWrite.value }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatch: () => ({ ...leagueQuery.value, refetch: leagueQuery.refetch }),
  useV1NextSeasonCandidates: () => ({ ...candidatesQuery.value, refetch: candidatesQuery.refetch }),
  useV1LinkNextSeason: () => linkMutation,
  useV1UnlinkNextSeason: () => unlinkMutation,
}));
vi.mock('./league-next-season-create', () => ({
  LeagueNextSeasonCreate: ({ league }: { league: { title: string } }) => <p>{`개설 화면 · ${league.title}`}</p>,
}));

const base = {
  leagueId: 'league-1', title: '가을 리그', seriesId: null, state: 'completed',
  startsOn: '2026-09-01T00:00:00.000Z', nextSeason: null, convertedToSeries: false,
} as unknown as V1AdminLeagueDetail;

const candidate = (overrides: Partial<V1NextSeasonCandidate> = {}): V1NextSeasonCandidate => ({
  leagueId: 'league-2', title: '겨울 리그', state: 'draft',
  startsOn: '2026-12-01T00:00:00.000Z', endsOn: '2027-02-01T00:00:00.000Z', confirmedCount: 0, ...overrides,
});

const loadLeague = (overrides: Record<string, unknown> = {}) => {
  leagueQuery.value = { data: { ...base, ...overrides }, isPending: false };
};
const loadCandidates = (candidates: V1NextSeasonCandidate[], hasMore = false) => {
  candidatesQuery.value = { data: { leagueId: 'league-1', hasMore, candidates }, isPending: false, isError: false };
};
const openLinkMode = () => fireEvent.click(screen.getByRole('button', { name: '기존 리그 잇기' }));

beforeEach(() => {
  canWrite.value = true;
  loadLeague();
  loadCandidates([candidate()]);
  leagueQuery.refetch.mockReset();
  candidatesQuery.refetch.mockReset();
  linkMutation.mutate.mockReset();
  linkMutation.isPending = false;
  unlinkMutation.mutate.mockReset();
  unlinkMutation.isPending = false;
});

describe('nextSeasonBlockedReason', () => {
  it.each([
    ['이을 수 있는 리그', {}, true, null],
    ['진행 중인 리그', { state: 'active' }, true, null],
    ['조회 전용 관리자', {}, false, '조회 권한으로는 다음 시즌을 만들거나 이을 수 없어요.'],
    ['리그 체계 안의 리그', { seriesId: 'series-1' }, true, '리그 체계에 속한 리그는 승강 확정으로 다음 시즌을 이어요.'],
    ['리그 체계로 전환한 리그', { convertedToSeries: true }, true, '리그 체계로 전환한 리그는 다음 시즌을 따로 이을 수 없어요.'],
    ['시작 전 리그', { state: 'draft' }, true, '시즌을 시작했거나 끝낸 리그에서 다음 시즌을 만들거나 이을 수 있어요.'],
    ['보류 중인 리그', { state: 'on_hold' }, true, '시즌을 시작했거나 끝낸 리그에서 다음 시즌을 만들거나 이을 수 있어요.'],
  ])('%s', (_name, overrides, write, reason) => {
    expect(nextSeasonBlockedReason({ ...base, ...overrides } as V1AdminLeagueDetail, write)).toBe(reason);
  });
});

describe('LeagueNextSeasonManage', () => {
  it('기본은 새로 만들기라 지난 시즌 설정을 채운 개설 화면이 열린다', () => {
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    expect(screen.getByRole('button', { name: '새로 만들기' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '기존 리그 잇기' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('개설 화면 · 가을 리그')).toBeInTheDocument();
  });

  it('기존 리그 잇기로 바꾸면 개설 화면 대신 이을 리그 고르기가 열리고, 다시 새로 만들기로 돌아온다', () => {
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    openLinkMode();
    expect(screen.getByRole('button', { name: '기존 리그 잇기' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: '다음 시즌으로 이을 리그' })).toBeInTheDocument();
    expect(screen.queryByText(/개설 화면/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '새로 만들기' }));
    expect(screen.getByText('개설 화면 · 가을 리그')).toBeInTheDocument();
  });

  it.each([
    ['조회 전용 관리자', { canWrite: false }, '조회 권한으로는 다음 시즌을 만들거나 이을 수 없어요.'],
    ['리그 체계 안의 리그', { overrides: { seriesId: 'series-1' } }, '리그 체계에 속한 리그는 승강 확정으로 다음 시즌을 이어요.'],
    ['리그 체계로 전환한 리그', { overrides: { convertedToSeries: true } }, '리그 체계로 전환한 리그는 다음 시즌을 따로 이을 수 없어요.'],
    ['시작 전 리그', { overrides: { state: 'draft' } }, '시즌을 시작했거나 끝낸 리그에서 다음 시즌을 만들거나 이을 수 있어요.'],
  ] as const)('%s는 만들기도 잇기도 열지 않는다', (_name, setup, message) => {
    if ('canWrite' in setup) canWrite.value = setup.canWrite;
    if ('overrides' in setup) loadLeague(setup.overrides);
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/개설 화면/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기존 리그 잇기' })).not.toBeInTheDocument();
  });

  it('리그 정보를 못 불러오면 재시도를 준다', () => {
    leagueQuery.value = { data: undefined, isPending: false, error: new Error('리그 조회 실패') };
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    expect(screen.getByText('리그 조회 실패')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(leagueQuery.refetch).toHaveBeenCalledOnce();
  });
});

describe('기존 리그 잇기', () => {
  const pick = (leagueId: string) =>
    fireEvent.change(screen.getByRole('combobox', { name: '다음 시즌으로 이을 리그' }), { target: { value: leagueId } });

  it('리그를 고르기 전에는 잇기 버튼이 막혀 있다', () => {
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    openLinkMode();
    expect(screen.getByRole('button', { name: '다음 시즌으로 잇기' })).toBeDisabled();
    expect(screen.queryByRole('region', { name: '고른 리그' })).not.toBeInTheDocument();
  });

  it('고른 리그의 기간과 참가 확정 팀을 보여 주고, 확인 창을 거쳐 그 리그 id 로 잇는다', () => {
    linkMutation.mutate.mockImplementation((nextLeagueId: string, options: { onSuccess: (result: unknown) => void }) =>
      options.onSuccess({ leagueId: 'league-1', nextSeason: { leagueId: nextLeagueId, title: '겨울 리그' } }));
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    openLinkMode();
    pick('league-2');
    const selected = screen.getByRole('region', { name: '고른 리그' });
    expect(within(selected).getByText('겨울 리그')).toBeInTheDocument();
    expect(within(selected).getByText(/참가 확정 0팀/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음 시즌으로 잇기' }));
    const dialog = screen.getByRole('dialog', { name: '다음 시즌으로 이을까요?' });
    expect(dialog).toHaveTextContent('"가을 리그"의 다음 시즌으로 "겨울 리그"을 이어요.');
    expect(linkMutation.mutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '다음 시즌으로 잇기' }));
    expect(linkMutation.mutate).toHaveBeenCalledWith('league-2', expect.objectContaining({ onSuccess: expect.any(Function) }));
    expect(screen.getByText('"겨울 리그"을 다음 시즌으로 이었어요.')).toBeInTheDocument();
  });

  it('서버가 거절하면 확인 창을 닫지 않고 이유를 보여 준다', () => {
    linkMutation.mutate.mockImplementation((_id: string, options: { onError: (error: unknown) => void }) =>
      options.onError(new Error('이미 지난 시즌이 이어진 리그예요.')));
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    openLinkMode();
    pick('league-2');
    fireEvent.click(screen.getByRole('button', { name: '다음 시즌으로 잇기' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '다음 시즌으로 잇기' }));
    expect(within(screen.getByRole('dialog')).getByText('이미 지난 시즌이 이어진 리그예요.')).toBeInTheDocument();
  });

  it('시작일이 거꾸로이거나 이미 팀이 있으면 막지 않고 알려 준다', () => {
    loadCandidates([candidate({ startsOn: '2026-08-01T00:00:00.000Z', confirmedCount: 5 })]);
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    openLinkMode();
    pick('league-2');
    expect(screen.getByText('고른 리그의 시작일이 이 리그보다 앞서요. 순서가 맞는지 확인해 주세요.')).toBeInTheDocument();
    expect(screen.getByText(/이미 5팀이 참가 확정돼 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 시즌으로 잇기' })).toBeEnabled();
  });

  it('이을 수 있는 리그가 없으면 이유를 알려 준다', () => {
    loadCandidates([]);
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    openLinkMode();
    expect(screen.getByText(/이을 수 있는 리그가 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('후보가 상한을 넘으면 최근 리그만 보인다고 알린다', () => {
    loadCandidates([candidate()], true);
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    openLinkMode();
    expect(screen.getByText('최근 시작한 리그 100개만 보여요.')).toBeInTheDocument();
  });

  it('후보를 못 불러오면 재시도를 준다', () => {
    candidatesQuery.value = { data: undefined, isPending: false, isError: true, error: new Error('후보 조회 실패') };
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    openLinkMode();
    expect(screen.getByText('후보 조회 실패')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(candidatesQuery.refetch).toHaveBeenCalledOnce();
  });
});

describe('이미 이어진 리그', () => {
  beforeEach(() => loadLeague({ nextSeason: { leagueId: 'league-2', title: '겨울 리그' } }));

  it('이어진 리그로 가는 길과 연결 해제를 보이고, 만들기·잇기는 열지 않는다', () => {
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    expect(screen.getByText('이미 "겨울 리그"이 다음 시즌으로 이어져 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다음 시즌 관리로 가기' })).toHaveAttribute('href', '/admin/league-matches/league-2');
    expect(screen.getByRole('button', { name: '연결 해제' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '기존 리그 잇기' })).not.toBeInTheDocument();
    expect(screen.queryByText(/개설 화면/)).not.toBeInTheDocument();
  });

  it('연결 해제는 확인 창을 거치고, 남는 것을 알려 준다', () => {
    unlinkMutation.mutate.mockImplementation((_variables: undefined, options: { onSuccess: () => void }) => options.onSuccess());
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    fireEvent.click(screen.getByRole('button', { name: '연결 해제' }));
    const dialog = screen.getByRole('dialog', { name: '다음 시즌 연결을 풀까요?' });
    expect(dialog).toHaveTextContent('이미 옮겨 온 지난 시즌 명단과 참가 팀은 그대로 남고');
    expect(unlinkMutation.mutate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '연결 해제' }));
    expect(unlinkMutation.mutate).toHaveBeenCalledOnce();
    expect(screen.getByText('다음 시즌 연결을 풀었어요.')).toBeInTheDocument();
  });

  it('조회 전용 관리자는 이어진 리그만 볼 수 있고 풀 수는 없다', () => {
    canWrite.value = false;
    render(<LeagueNextSeasonManage leagueId="league-1" />);
    expect(screen.getByRole('link', { name: '다음 시즌 관리로 가기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '연결 해제' })).not.toBeInTheDocument();
  });
});

describe('candidateOptionLabel', () => {
  it('이름이 같은 리그를 가리도록 상태와 시작일을 붙이고, 시작일을 모르면 상태만 붙인다', () => {
    expect(candidateOptionLabel(candidate({ title: '봄 리그', state: 'completed' }))).toMatch(/^봄 리그 · 종료 · .+ 시작$/);
    expect(candidateOptionLabel(candidate({ title: '봄 리그', state: 'active', startsOn: null }))).toBe('봄 리그 · 시즌 진행 중');
  });
});

describe('nextSeasonLinkNotices', () => {
  const previous = { startsOn: '2026-09-01T00:00:00.000Z' };

  it('순서가 맞고 팀이 없으면 알릴 것이 없다', () => {
    expect(nextSeasonLinkNotices(previous, candidate())).toEqual([]);
  });

  it('시작일이 같거나 뒤면 경고하지 않는다', () => {
    expect(nextSeasonLinkNotices(previous, candidate({ startsOn: '2026-09-01T00:00:00.000Z' }))).toEqual([]);
  });

  it('날짜를 모르면 거꾸로라고 단정하지 않는다', () => {
    expect(nextSeasonLinkNotices(previous, candidate({ startsOn: null }))).toEqual([]);
    expect(nextSeasonLinkNotices({ startsOn: null as never }, candidate())).toEqual([]);
  });

  it('시작일이 거꾸로면 경고, 이미 있는 팀은 안내한다', () => {
    const notices = nextSeasonLinkNotices(previous, candidate({ startsOn: '2026-08-01T00:00:00.000Z', confirmedCount: 3 }));
    expect(notices.map((notice) => notice.tone)).toEqual(['warning', 'info']);
    expect(notices[1].message).toContain('3팀');
  });
});
