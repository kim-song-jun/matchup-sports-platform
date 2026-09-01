import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamRecordsPageClient } from './team-records-page-client';
import type { PublicTeamRecordsResponse, TeamRecordTypeFilter } from '@/components/public-game-records/types';

/**
 * 공유 링크로 들어온 방문자에게 헤더가 "팀 전적" 만 보여주면 **어느 팀인지 알 수 없다**.
 * 응답에 teamName 이 있는데 화면 헤더만 제네릭이었다. 아래 테스트는 그 표기가 사라지면 깨진다.
 *
 * 로딩·에러 분기에는 아직 팀명이 없으므로 그때는 제네릭 문구가 정상이다 — 팀명을 알 수 없는
 * 상태에서 무언가로 채우면 그게 오히려 잘못된 정보다.
 *
 * 셸 승격(U29) 이후 제목은 이 컴포넌트가 직접 렌더하지 않고 `useShellOverride`로 셸에
 * 밀어넣는다(app-shell-promotion.md §1.9 "결합 제목" 패턴) — 그래서 검증도 DOM 텍스트가
 * 아니라 그 훅 호출 인자를 본다. 데스크톱 헤더(.tm-desktop-page-head)도 이제 AppShellFrame이
 * route-chrome 테이블의 desktopHead:true로 그리므로, 셸 없이 이 컴포넌트만 렌더하는 이
 * 테스트 파일에서는 검증할 수 없다(user-records-page-client.test.tsx의 동일 마이그레이션과 같은 판단).
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/records',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const shellOverride = vi.hoisted(() => ({ useShellOverride: vi.fn() }));

vi.mock('@/components/v1-ui/shell-override', () => ({
  useShellOverride: shellOverride.useShellOverride,
}));

const mocks = vi.hoisted(() => ({ usePublicTeamRecords: vi.fn() }));

vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicTeamRecords: (...args: unknown[]) => mocks.usePublicTeamRecords(...args),
}));

/**
 * U2 -- `onChangeType`/`activeType` 배선(전달 자체)을 검증하려면 진짜 콘텐츠를
 * 렌더할 필요는 없다. 탭 3개를 흉내 낸 최소 버튼만 두고 각 버튼이 `onChangeType`을
 * 그대로 호출하는지만 본다 -- 콘텐츠 내부 마크업(KPI/목록)은
 * `public-game-records.test.tsx`의 `TeamRecordsContent — 종류 탭 (U2)`에서 이미 검증한다.
 */
vi.mock('@/components/public-game-records/team-records-content', () => ({
  TeamRecordsContent: ({
    onChangeType,
    onChangeSeason,
  }: {
    onChangeType?: (type: TeamRecordTypeFilter) => void;
    onChangeSeason?: (season: string | undefined) => void;
  }) => (
    <div data-testid="records-content">
      <button type="button" onClick={() => onChangeType?.('league')}>정규 리그</button>
      <button type="button" onClick={() => onChangeType?.('tournament')}>대회</button>
      <button type="button" onClick={() => onChangeSeason?.('2025')}>2025시즌</button>
      <button type="button" onClick={() => onChangeSeason?.(undefined)}>전체 시즌</button>
    </div>
  ),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function page(teamName: string): PublicTeamRecordsResponse {
  return {
    teamId: 'team-1',
    teamName,
    summary: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
    availableSeasons: ['2026', '2025'],
    items: [],
    nextCursor: null,
  } as unknown as PublicTeamRecordsResponse;
}

function loaded(teamName: string) {
  return {
    data: { pages: [page(teamName)] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  };
}

function lastOverrideTitle() {
  const calls = shellOverride.useShellOverride.mock.calls;
  return calls[calls.length - 1]?.[0]?.title as string | undefined;
}

describe('TeamRecordsPageClient', () => {
  beforeEach(() => {
    mocks.usePublicTeamRecords.mockReset();
    shellOverride.useShellOverride.mockReset();
  });

  it('names which team these records belong to so a deep-linked visitor can tell', () => {
    mocks.usePublicTeamRecords.mockReturnValue(loaded('강남 러닝 크루'));

    render(<TeamRecordsPageClient teamId="team-1" />);

    expect(lastOverrideTitle()).toBe('강남 러닝 크루 전적');
  });

  // 로딩 중에는 팀명을 모른다. 모르는 값을 지어내지 않고 제네릭 문구로 남는 것이 맞다.
  it('keeps the generic heading while the team name is still unknown', () => {
    mocks.usePublicTeamRecords.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });

    render(<TeamRecordsPageClient teamId="team-1" />);

    expect(lastOverrideTitle()).toBeUndefined();
    expect(screen.queryByText(/team-1/)).toBeNull();
  });

  // U2 -- 탭 선택이 클라이언트 필터가 아니라 서버 재요청으로 이어져야 한다
  // (커서 페이지네이션이므로). `usePublicTeamRecords`가 이 컴포넌트에서 유일하게
  // 서버 요청을 만드는 지점이므로, 탭 클릭 후 그 훅이 새 `type` 인자로 다시
  // 호출됐는지를 직접 확인한다.
  it('탭 선택이 usePublicTeamRecords 훅 호출의 type 파라미터로 그대로 전달된다', () => {
    mocks.usePublicTeamRecords.mockReturnValue(loaded('강남 러닝 크루'));

    render(<TeamRecordsPageClient teamId="team-1" />);

    // 초기 렌더 -- '전체' 탭이라 type 은 undefined 여야 한다.
    expect(mocks.usePublicTeamRecords).toHaveBeenLastCalledWith('team-1', undefined, undefined);

    fireEvent.click(screen.getByRole('button', { name: '정규 리그' }));
    expect(mocks.usePublicTeamRecords).toHaveBeenLastCalledWith('team-1', undefined, 'league');

    fireEvent.click(screen.getByRole('button', { name: '대회' }));
    expect(mocks.usePublicTeamRecords).toHaveBeenLastCalledWith('team-1', undefined, 'tournament');
  });

  // 시즌 드롭다운 선택도 탭과 같은 방식(서버 재요청)이어야 한다 -- usePublicTeamRecords
  // 훅의 두 번째 인자(season)로 그대로 전달되는지 직접 확인한다.
  it('시즌 선택이 usePublicTeamRecords 훅 호출의 season 파라미터로 그대로 전달된다', () => {
    mocks.usePublicTeamRecords.mockReturnValue(loaded('강남 러닝 크루'));

    render(<TeamRecordsPageClient teamId="team-1" />);

    // 초기 렌더 -- '전체 시즌' 이라 season 은 undefined 여야 한다.
    expect(mocks.usePublicTeamRecords).toHaveBeenLastCalledWith('team-1', undefined, undefined);

    fireEvent.click(screen.getByRole('button', { name: '2025시즌' }));
    expect(mocks.usePublicTeamRecords).toHaveBeenLastCalledWith('team-1', '2025', undefined);

    fireEvent.click(screen.getByRole('button', { name: '전체 시즌' }));
    expect(mocks.usePublicTeamRecords).toHaveBeenLastCalledWith('team-1', undefined, undefined);
  });
});
