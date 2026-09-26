import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CorrectionsPageClient } from './corrections-page-client';

const mocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(),
  useV1Tournament: vi.fn(),
  useTournamentEndedFixtures: vi.fn(),
  useSearchParams: vi.fn(),
  routerPush: vi.fn(),
  pathname: { value: '/tournament-ops/tournaments/t-1/records/corrections' },
}));

// `CorrectionsPageClient`도 자체적으로 `<RequireAuth>`로 감싸므로(Task 1과 동일한
// 셸 미도입 상태) `RequireAuth`가 의존하는 `useV1AuthMe`를 함께 목한다.
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: (...args: unknown[]) => mocks.useV1AuthMe(...args),
  useV1Tournament: (...args: unknown[]) => mocks.useV1Tournament(...args),
}));
vi.mock('@/hooks/use-tournament-result-review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-tournament-result-review')>();
  return { ...actual, useTournamentEndedFixtures: (...args: unknown[]) => mocks.useTournamentEndedFixtures(...args) };
});
vi.mock('next/navigation', () => ({
  useSearchParams: (...args: unknown[]) => mocks.useSearchParams(...args),
  // 본문 링크가 지금 표면을 따라가므로 pathname 이 필요하다.
  usePathname: () => mocks.pathname.value,
  // 빈 목록에서 다음 단계로 보내는 CTA 가 라우터를 쓴다.
  useRouter: () => ({ push: mocks.routerPush }),
}));
vi.mock('@/components/tournament-result-review/game-result-correction-panel', () => ({
  GameResultCorrectionPanel: ({ gameId }: { gameId: string }) => <div data-testid="panel">panel:{gameId}</div>,
}));

const ITEM = (fixtureId: string, gameId: string, fixtureNumber: number, revisionId: string | null) => ({
  fixtureId, tournamentId: 't-1', round: '조별 A', fixtureNumber, gameId, gameState: 'ENDED',
  fieldId: null, fieldName: null, homeRegistrationId: null, awayRegistrationId: null,
  scheduledAt: null, currentScore: null, currentRevisionState: null, warnings: [], version: 1, revisionId, stableRevision: 'x',
});
// fx-1은 공식 결과가 있고(revisionId 존재), fx-2는 아직 없다 — hasOfficialResult 필터를 실제로 태운다.
const ITEMS = [ITEM('fx-1', 'game-1', 1, 'rev-1'), ITEM('fx-2', 'game-2', 2, null)];

describe('CorrectionsPageClient fixtureId 딥링크 (T6-2)', () => {
  beforeEach(() => {
    window.localStorage.setItem('teameet.v1.userId', 'user-1');
    mocks.useV1AuthMe.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
      isSuccess: true,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    mocks.useV1Tournament.mockReturnValue({ data: { title: '가을 대회' } });
    mocks.useTournamentEndedFixtures.mockReturnValue({
      isPending: false, isSuccess: true, isError: false, data: { items: ITEMS }, refetch: vi.fn(),
    });
  });

  it('?fixtureId= 매치가 공식 결과를 가진 경기면 정정 패널을 자동으로 연다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('fixtureId=fx-1'));
    render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(screen.getByTestId('panel')).toHaveTextContent('panel:game-1');
  });

  it('공식 결과가 없는 fixtureId로 딥링크하면 "정정 목록에 없어요" 안내를 보여준다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('fixtureId=fx-2'));
    render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(screen.getByText(/정정 목록에 없어요/)).toBeInTheDocument();
  });

  /* 정정할 게 0건인 건 이 화면의 흔한 정상 상태다(공식 결과를 확정해야 생긴다).
     예전에는 안내 문구만 있고 갈 곳이 없어, 전제 화면인 결과 검토를 사용자가 스스로
     찾아야 했다 — 2026-08-18 alpha 실화면에서 이 막다른 길이 드러났다. */
  it('정정할 결과가 없으면 전제 화면(결과 검토)으로 가는 길을 함께 준다', async () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    mocks.useTournamentEndedFixtures.mockReturnValue({
      isPending: false, isSuccess: true, isError: false, data: { items: [] }, refetch: vi.fn(),
    });
    render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(screen.getByText('정정할 결과가 없어요')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '결과 검토로 가기' }));
    expect(mocks.routerPush).toHaveBeenCalledWith('/tournament-ops/tournaments/t-1/result-review');
  });

  /* 셸(`TournamentOpsShell`)이 이미 <main> 을 그린다. 이 화면이 자기 <main> 을 또
     열면 문서에 main 랜드마크가 둘 생겨 스크린리더 탐색이 깨지고, padding·최대 폭도
     이중으로 걸린다(예전에 인라인 style maxWidth:960 이 셸의 1200 안에 또 있었다). */
  it('셸이 그린 main 안에서 자기 main 을 다시 열지 않는다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    const { container } = render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(container.querySelectorAll('main')).toHaveLength(0);
  });

  it('fixtureId가 없으면 기존처럼 미선택 상태다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  // Fix round 1 — `useTournamentEndedFixtures`는 staleTime: 15_000이라 창 포커스 등으로
  // 백그라운드 refetch가 돈다. 딥링크 진입 시점엔 공식 결과가 없어 "정정 목록에 없어요"
  // 배너가 뜬 뒤, refetch로 공식 결과가 확정되면(revisionId 채워짐) 배너가 사라지고
  // 패널만 남아야 한다(예전엔 deepLinkNotFound가 한번 true가 되면 안 돌아와 배너+패널이
  // 동시에 보였다).
  it('공식 결과가 없어 안내가 뜬 뒤, refetch로 공식 결과가 확정되면 안내가 사라지고 패널만 남는다', () => {
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('fixtureId=fx-2'));
    mocks.useTournamentEndedFixtures.mockReturnValue({
      isPending: false, isSuccess: true, isError: false, data: { items: ITEMS }, refetch: vi.fn(),
    });
    const { rerender } = render(<CorrectionsPageClient tournamentId="t-1" />);
    expect(screen.getByText(/정정 목록에 없어요/)).toBeInTheDocument();
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();

    // 백그라운드 refetch로 fx-2의 공식 결과가 확정된 상황을 시뮬레이션.
    mocks.useTournamentEndedFixtures.mockReturnValue({
      isPending: false,
      isSuccess: true,
      isError: false,
      data: { items: [ITEM('fx-1', 'game-1', 1, 'rev-1'), ITEM('fx-2', 'game-2', 2, 'rev-2')] },
      refetch: vi.fn(),
    });
    rerender(<CorrectionsPageClient tournamentId="t-1" />);

    expect(screen.queryByText(/정정 목록에 없어요/)).not.toBeInTheDocument();
    expect(screen.getByTestId('panel')).toHaveTextContent('panel:game-2');
  });
});


/**
 * **공개 화면 링크가 여기 사는 이유.**
 *
 * 원래 결과 검토 화면에 뒀는데 거기서는 도달할 수 없었다 — 확정 한 번에 `revisions`
 * 무효화(링크를 띄운다)와 `board` 무효화(그 패널을 걷어낸다)가 **같은 콜백에서** 나가,
 * 링크의 수명이 두 refetch 사이 간격이었다. 이 화면은 `revisionId !== null` 만 모으므로
 * **확정된 항목이 목록에서 사라지지 않는다.**
 */
describe('CorrectionsPageClient — 공개 화면 링크', () => {
  beforeEach(() => {
    window.localStorage.setItem('teameet.v1.userId', 'user-1');
    mocks.useV1AuthMe.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
      isSuccess: true,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    mocks.useTournamentEndedFixtures.mockReturnValue({
      isPending: false, isSuccess: true, isError: false, data: { items: ITEMS }, refetch: vi.fn(),
    });
    mocks.useSearchParams.mockReturnValue(new URLSearchParams('fixtureId=fx-1'));
  });

  /**
   * ⚠️ `kind` 는 **`'regular_tournament' | 'regular_league'`** 다(`V1CompetitionKind`).
   * `'tournament'` 는 서버가 보내지 않는 값인데, 구현이 `=== 'regular_league'` 로만
   * 비교해서 **아무 문자열이나 통과한다** — 그 목은 "대회 축"이 아니라 "리그가 아니다"만
   * 재게 된다. `vi.fn().mockReturnValue()` 는 느슨하게 타입돼 tsc 도 안 잡는다.
   * **목은 타입 검사의 사각지대**라 실제 합집합 값을 손으로 맞춰야 한다.
   */
  it('대회는 대회 경기 라우트로 링크한다', () => {
    mocks.useV1Tournament.mockReturnValue({ data: { title: '가을 대회', kind: 'regular_tournament', fixtures: [] } });
    render(<CorrectionsPageClient tournamentId="t-1" />);

    // 긍정 앵커 — 패널이 실제로 그려졌다는 증거를 먼저 둔다.
    expect(screen.getByTestId('panel')).toHaveTextContent('panel:game-1');
    expect(screen.getByRole('link', { name: '공개 화면에서 보기' })).toHaveAttribute(
      'href',
      '/tournaments/t-1/matches/fx-1',
    );
  });

  it('정규 리그는 리그 경기 라우트로 링크한다', () => {
    mocks.useV1Tournament.mockReturnValue({ data: { title: '가을 리그', kind: 'regular_league', fixtures: [] } });
    render(<CorrectionsPageClient tournamentId="t-1" />);

    expect(screen.getByRole('link', { name: '공개 화면에서 보기' })).toHaveAttribute(
      'href',
      '/league-matches/t-1/fixtures/fx-1',
    );
  });

  /**
   * 목록은 보드 쿼리로 뜨고 `kind` 는 다른 쿼리에서 온다 — 보드가 먼저 성공하면
   * `tournament.data` 가 undefined 라 정규 리그가 대회 라우트로 링크돼 404 다.
   * 헬퍼를 쓰는 것만으로는 안전하지 않고 **입력이 준비돼야** 한다.
   */
  it('kind 가 아직 안 왔으면 링크를 만들지 않는다', () => {
    mocks.useV1Tournament.mockReturnValue({ data: undefined });
    render(<CorrectionsPageClient tournamentId="t-1" />);

    expect(screen.getByTestId('panel')).toHaveTextContent('panel:game-1');
    expect(screen.queryByRole('link', { name: '공개 화면에서 보기' })).not.toBeInTheDocument();
  });
});
