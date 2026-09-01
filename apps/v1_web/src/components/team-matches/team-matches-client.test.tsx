import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { V1TeamMatch, V1TeamMatchViewerState } from '@/types/api';
import type { TeamMatchDetailViewModel, TeamMatchListViewModel, TeamMatchModel } from './team-matches.types';
import { TeamMatchDetailPageClient, TeamMatchListPageClient, toTeamMatch } from './team-matches-client';

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const {
  applyTeamMatchMutateAsync,
  withdrawTeamMatchMutateAsync,
  useV1WithdrawTeamMatchApplicationMock,
  routerPush,
  useV1TeamMatchMock,
  useV1TeamMatchEligibilityMock,
  useV1TeamMatchesMock,
} = vi.hoisted(() => {
  const withdrawTeamMatchMutateAsync = vi.fn();
  return {
    applyTeamMatchMutateAsync: vi.fn(),
    withdrawTeamMatchMutateAsync,
    // 철회 훅은 applicationId를 **훅 생성 시점 인자**로 받는다(use-v1-api.ts) — 그래서 "어떤
    // 신청서를 철회하는지"는 mutateAsync 인자가 아니라 이 호출 인자로만 확인할 수 있다.
    useV1WithdrawTeamMatchApplicationMock: vi.fn(() => ({
      mutateAsync: withdrawTeamMatchMutateAsync,
      isPending: false,
    })),
    routerPush: vi.fn(),
    useV1TeamMatchMock: vi.fn(),
    useV1TeamMatchEligibilityMock: vi.fn(),
    useV1TeamMatchesMock: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatch: useV1TeamMatchMock,
  useV1TeamMatchEligibility: useV1TeamMatchEligibilityMock,
  useV1TeamMatchApplications: () => ({ data: undefined, isPending: false }),
  // 라인업 CTA(Task 15) 계산용 — 이 스위트는 GA 이벤트만 검증하므로 소속 팀 없음으로 고정.
  useV1MyTeams: () => ({ data: undefined, isPending: false }),
  useV1ApplyTeamMatch: () => ({ mutateAsync: applyTeamMatchMutateAsync, isPending: false }),
  useV1ApproveTeamMatchApplication: () => ({ mutate: vi.fn(), isPending: false }),
  useV1RejectTeamMatchApplication: () => ({ mutate: vi.fn(), isPending: false }),
  useV1CloseTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1ReopenTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1CancelTeamMatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1ResolveChatRoom: () => ({ mutate: vi.fn(), isPending: false }),
  useV1WithdrawTeamMatchApplication: useV1WithdrawTeamMatchApplicationMock,
  useV1TeamMatches: useV1TeamMatchesMock,
  useV1MasterSports: () => ({ data: [] }),
  useV1RecentSearches: () => ({ data: { items: [] }, isLoading: false }),
  useV1RecordSearch: () => ({ mutate: vi.fn() }),
}));

vi.mock('./team-matches-page', () => ({
  TeamMatchDetailPageSkeleton: () => <div data-testid="team-match-detail-skeleton" />,
  TeamMatchDetailPageView: ({ model }: { model: TeamMatchDetailViewModel }) => (
    <div>
      <span data-testid="team-match-image">{model.match.imageUrl}</span>
      <span data-testid="team-match-mode">{model.mode}</span>
      <span data-testid="team-match-status-label">{model.statusLabel}</span>
      <span data-testid="team-match-apply-label">{model.applyLabel}</span>
      <span data-testid="team-match-description">{model.match.description}</span>
      <span data-testid="team-match-address">{model.match.address}</span>
      <span data-testid="team-match-cost">{model.match.cost}</span>
      <span data-testid="team-match-opponent-cost">{model.match.opponentCost}</span>
      <span data-testid="team-match-manner">{model.match.manner}</span>
      <span data-testid="team-match-wins">{model.match.wins}</span>
      <span data-testid="team-match-applicant-count">{model.match.applicantTeams.length}</span>
      <span data-testid="team-match-host-actions">{model.hostActions?.map((action) => action.label).join(',')}</span>
      {model.onApply && <button onClick={model.onApply}>상대팀 신청</button>}
      {model.resultAction && <a href={model.resultAction.href}>{model.resultAction.label}</a>}
      {model.reviewAction && <a href={model.reviewAction.href}>{model.reviewAction.label}</a>}
      <span data-testid="team-match-chat-label">{model.chatLabel}</span>
      {model.onChat && <button onClick={model.onChat}>채팅 열기</button>}
    </div>
  ),
  TeamMatchListPageView: ({ model }: { model: TeamMatchListViewModel }) => (
    <div>
      <span data-testid="team-match-count">{model.matches.length}</span>
      {model.hasNext && model.onLoadMore ? <button onClick={model.onLoadMore}>더 보기</button> : null}
    </div>
  ),
  TeamMatchStatePageView: () => null,
}));

describe('TeamMatchDetailPageClient — GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-1',
        teamMatchId: 'team-match-1',
        title: '풋살 팀매치',
        imageUrl: '/uploads/team-match-cover.webp',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        placeName: '서울 풋살장',
        startsAt: '2026-08-01T10:00:00.000Z',
        capacityText: '1/2',
        // 'open'은 V1TeamMatchApiStatus에 없는 값이다(recruiting|closed|matched|cancelled|
        // completed|expired) — 신청 가능한 매치를 뜻하려면 'recruiting'이어야 getApplyAction의
        // status 게이트(그룹 A 수정)를 실제로 통과한다.
        status: 'recruiting',
        viewerState: 'none',
        hostTeam: { teamId: 'team-host', name: '호스트 팀' },
      },
      isError: false,
    });
    useV1TeamMatchEligibilityMock.mockReturnValue({
      data: {
        teamMatchId: 'team-match-1',
        requiresApproval: true,
        requiresPayment: false,
        teams: [
          { teamId: 'team-mine', name: '내 팀', role: 'owner', eligible: true, reasonCode: '', applicationId: null },
        ],
      },
      isSuccess: true,
    });
    applyTeamMatchMutateAsync.mockResolvedValue({ applicationId: 'app-1' });
  });

  it('fires team_match_apply_complete after a successful opponent-team application', async () => {
    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    fireEvent.click(screen.getByRole('button', { name: '상대팀 신청' }));

    await waitFor(() => {
      expect(applyTeamMatchMutateAsync).toHaveBeenCalledWith({ applicantTeamId: 'team-mine', message: null });
    });
    expect(trackEvent).toHaveBeenCalledWith('team_match_apply_complete', { teamMatchId: 'team-match-1' });
  });

  it('maps the API image URL into the detail view model', () => {
    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByTestId('team-match-image')).toHaveTextContent('/uploads/team-match-cover.webp');
  });

  it('does not present an unrelated viewer as approved after another team is matched', () => {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-1',
        teamMatchId: 'team-match-1',
        title: '풋살 팀매치',
        sportName: '풋살',
        placeName: '서울 풋살장',
        startsAt: '2026-08-10T10:00:00.000Z',
        status: 'matched',
        viewerState: 'rejected',
        hostTeam: { teamId: 'team-host', name: '호스트 팀' },
      },
      isError: false,
    });
    useV1TeamMatchEligibilityMock.mockReturnValue({
      data: {
        teamMatchId: 'team-match-1',
        requiresApproval: true,
        requiresPayment: false,
        teams: [
          { teamId: 'team-mine', name: '내 팀', role: 'owner', eligible: false, reasonCode: 'MATCHED_ALREADY', applicationId: 'app-rejected' },
        ],
      },
      isSuccess: true,
    });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByTestId('team-match-mode')).toHaveTextContent('default');
    expect(screen.getByTestId('team-match-status-label')).toHaveTextContent('상대팀 확정');
    expect(screen.getByTestId('team-match-apply-label')).toHaveTextContent('신청 불가');
    expect(screen.queryByText('승인 완료')).not.toBeInTheDocument();
  });

  it('종목이 다른 팀만 있으면 "팀 만들기" 유도 대신 종목이 다르다는 사유를 보여준다', () => {
    // status는 beforeEach 기준 'recruiting'이라 신청 마감 분기(status !== 'recruiting')를
    // 타지 않고 reasonLabel(reasonCode)까지 도달한다. eligible:false + SPORT_MISMATCH인
    // 팀이 teams 배열의 유일한 항목이므로 selectedEligibility는 teams[0]로 이 팀을 고른다
    // (hasNoTeam은 배열이 비어있지 않아 false — "팀을 만들고 신청할 수 있어요" fallback으로
    // 새지 않는다).
    useV1TeamMatchEligibilityMock.mockReturnValue({
      data: {
        teamMatchId: 'team-match-1',
        requiresApproval: true,
        requiresPayment: false,
        teams: [
          { teamId: 'team-mine', name: '내 팀', role: 'owner', eligible: false, reasonCode: 'SPORT_MISMATCH', applicationId: null },
        ],
      },
      isSuccess: true,
    });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByTestId('team-match-apply-label')).toHaveTextContent('이 팀매치와 종목이 다른 팀이에요');
  });
});

// Task 17: buildResultAction() is the sole routing gate between the host's
// result-entry screen (/team-matches/:id/result) and the opponent's
// approval screen (/team-matches/:id/result/approval). Only the destination
// screens had coverage before this — nothing failed if the gate itself was
// reverted (e.g. both roles routed to /result, or an unrelated viewer got a
// CTA at all). These tests pin the three-way split directly against the
// rendered CTA so a regression in buildResultAction's role/viewerState
// branching trips a real assertion.
describe('TeamMatchDetailPageClient — result action routing gate (Task 17)', () => {
  function mockMatchedTeamMatch(viewer: {
    state: V1TeamMatchViewerState;
    manageableHostTeam?: boolean;
    manageableOpponentTeam?: boolean;
  }) {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-1',
        teamMatchId: 'team-match-1',
        title: '풋살 팀매치',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        placeName: '서울 풋살장',
        startsAt: '2026-08-01T10:00:00.000Z',
        capacityText: '2/2',
        displayState: 'matched',
        status: 'matched',
        viewer: {
          state: viewer.state,
          manageableHostTeam: viewer.manageableHostTeam ?? false,
          manageableOpponentTeam: viewer.manageableOpponentTeam ?? false,
        },
        hostTeam: { teamId: 'team-host', name: '호스트 팀' },
      },
      isError: false,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    applyTeamMatchMutateAsync.mockResolvedValue({ applicationId: 'app-1' });
    useV1TeamMatchEligibilityMock.mockReturnValue({ data: undefined, isSuccess: false });
  });

  it('shows the host the result-entry CTA routed to /result', () => {
    mockMatchedTeamMatch({ state: 'host_team', manageableHostTeam: true });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    const link = screen.getByRole('link', { name: '경기 결과 입력' });
    expect(link).toHaveAttribute('href', '/team-matches/team-match-1/result');
    expect(screen.queryByText('경기 결과 대기')).not.toBeInTheDocument();
    expect(screen.queryByText('경기 결과 확인/승인')).not.toBeInTheDocument();
  });

  it('shows the approved opponent the approval CTA routed to /result/approval, never the entry CTA', () => {
    mockMatchedTeamMatch({ state: 'approved', manageableHostTeam: false, manageableOpponentTeam: true });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    const link = screen.getByRole('link', { name: '경기 결과 대기' });
    expect(link).toHaveAttribute('href', '/team-matches/team-match-1/result/approval');
    expect(screen.queryByRole('link', { name: '경기 결과 입력' })).not.toBeInTheDocument();
  });

  // 리그 대진 회귀: 신청서를 운영자가 대신 만들기 때문에 상대팀 매니저의 viewer.state 는
  // 영영 'none' 이다(alpha 실측). 게이트가 다시 state 기반으로 돌아가면 이 단언이 깨진다 —
  // 그때 실제로 벌어지는 일은 "리그 결과가 확정되지 않아 순위표가 멈추는 것"이다.
  it('상대팀 매니저는 신청서를 직접 내지 않았어도(리그 대진) 승인 CTA를 본다', () => {
    mockMatchedTeamMatch({ state: 'none', manageableHostTeam: false, manageableOpponentTeam: true });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    const link = screen.getByRole('link', { name: '경기 결과 대기' });
    expect(link).toHaveAttribute('href', '/team-matches/team-match-1/result/approval');
    expect(screen.queryByRole('link', { name: '경기 결과 입력' })).not.toBeInTheDocument();
  });

  it('shows an unrelated viewer neither the entry nor the approval CTA', () => {
    mockMatchedTeamMatch({ state: 'none', manageableHostTeam: false });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.queryByRole('link', { name: '경기 결과 입력' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '경기 결과 대기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '경기 결과 확인/승인' })).not.toBeInTheDocument();
  });
});

// 감사 결함 2건 회귀 방지 (2026-08-27):
// ① canOpenTeamMatchChat 이 viewerState('host_team'/'approved')를 봤는데, 그건 host 팀
//    owner/manager 와 "신청서를 낸 사람 한 명"만 통과한다 — 리그 대진처럼 운영자가 신청서를
//    대신 내면 상대팀 owner/manager는 채팅 버튼 자체를 못 봤다.
// ② status='matched' 로 좁힌 서버 엔타이틀먼트가 결과 제출로 completed 전이되는 순간 채팅을
//    끊어, 버튼은 그대로 활성인데 눌러도 죽는(409) 증상을 만들었다. 서버(chat-entitlement.ts/
//    chat.service.ts)를 completed 도 허용하도록 넓혔으니, 프론트 게이트도 status 를 더 이상
//    보지 않고 팀 멤버십만 봐야 completed 이후에도 버튼이 계속 동작한다.
describe('TeamMatchDetailPageClient — 채팅 게이트는 팀 멤버십 기준이고 경기 종료 후에도 유지된다', () => {
  function mockTeamMatchForChat(
    viewer: { state: V1TeamMatchViewerState; manageableHostTeam?: boolean; manageableOpponentTeam?: boolean },
    status: string,
  ) {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-1',
        teamMatchId: 'team-match-1',
        title: '풋살 팀매치',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        placeName: '서울 풋살장',
        startsAt: '2026-08-01T10:00:00.000Z',
        capacityText: '2/2',
        displayState: status,
        status,
        viewer: {
          state: viewer.state,
          manageableHostTeam: viewer.manageableHostTeam ?? false,
          manageableOpponentTeam: viewer.manageableOpponentTeam ?? false,
        },
        hostTeam: { teamId: 'team-host', name: '호스트 팀' },
      },
      isError: false,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchEligibilityMock.mockReturnValue({ data: undefined, isSuccess: false });
  });

  it('호스트팀 운영진은 매칭 상태에서 채팅을 연다', () => {
    mockTeamMatchForChat({ state: 'host_team', manageableHostTeam: true }, 'matched');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByRole('button', { name: '채팅 열기' })).toBeInTheDocument();
    expect(screen.getByTestId('team-match-chat-label')).toHaveTextContent('채팅');
  });

  it('리그 대진 상대팀 owner/manager는 신청서를 직접 내지 않았어도(state=none) 채팅을 연다', () => {
    mockTeamMatchForChat({ state: 'none', manageableOpponentTeam: true }, 'matched');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByRole('button', { name: '채팅 열기' })).toBeInTheDocument();
  });

  it('경기가 completed 로 넘어간 뒤에도 호스트팀 운영진의 채팅 버튼은 계속 동작한다', () => {
    mockTeamMatchForChat({ state: 'host_team', manageableHostTeam: true }, 'completed');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByRole('button', { name: '채팅 열기' })).toBeInTheDocument();
  });

  it('경기가 completed 로 넘어간 뒤에도 상대팀 운영진의 채팅 버튼은 계속 동작한다', () => {
    mockTeamMatchForChat({ state: 'approved', manageableOpponentTeam: true }, 'completed');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByRole('button', { name: '채팅 열기' })).toBeInTheDocument();
  });

  it('팀 관리 권한이 없는 뷰어에게는 채팅 버튼이 없다', () => {
    mockTeamMatchForChat({ state: 'none' }, 'matched');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.queryByRole('button', { name: '채팅 열기' })).not.toBeInTheDocument();
    expect(screen.getByTestId('team-match-chat-label')).toHaveTextContent('승인 후 채팅');
  });
});

// Regression for the review finding: toTeamMatch used to fall back to
// team-matches.view-model.ts's hardcoded skeleton mock (a fixed, unrelated match's
// grade/format/style/uniform, e.g. "A"/"11:11"/"친선"/"빨강") whenever a real team match's
// structured condition columns were empty — showing fabricated conditions on a real card,
// not the real (possibly legacy, possibly genuinely-unset) data.
describe('toTeamMatch — legacy/unmigrated condition fields never show mock data', () => {
  // Deliberately mirrors team-matches.view-model.ts's mock shape so a regression (mock
  // leaking through) would make these assertions fail loudly instead of silently.
  const mockFallback: TeamMatchModel = {
    id: 'team-match-1', title: 'FC 발빠른놈들 vs 상대팀 구합니다', imageUrl: '/mock/generated/team-huddle.webp',
    sport: '축구', hostTeam: 'FC 발빠른놈들', venue: '상암 월드컵 A구장', region: '서울 마포',
    date: '5월 11일 일', time: '09:00', endTime: '11:00',
    format: '11:11', grade: 'A', style: '친선', cost: 280000, opponentCost: 140000, uniform: '빨강',
    gender: '성별 무관', manner: 4.8, wins: 23, status: 'open',
  };

  function realMatch(overrides: Partial<V1TeamMatch>): V1TeamMatch {
    return {
      id: 'real-team-match-9',
      title: '실제 팀매치',
      sportName: '풋살',
      placeName: '진짜 경기장',
      startsAt: '2026-09-01T10:00:00.000Z',
      capacityText: '1/2',
      status: 'open',
      ...overrides,
    };
  }

  it('shows real matchFormat/matchStyle/uniformColor when structured columns are populated (post-backfill)', () => {
    const model = toTeamMatch(
      realMatch({ matchFormat: '6:6', matchStyle: ['교환매치'], uniformColor: '검정', levelLabel: 'C등급' }),
      mockFallback,
    );

    expect(model.format).toBe('6:6');
    expect(model.style).toBe('교환매치');
    expect(model.uniform).toBe('검정');
    expect(model.grade).toBe('C등급');
  });

  it('never shows the mock fallback grade/format/style/uniform for a real match with empty structured fields', () => {
    const model = toTeamMatch(
      realMatch({ matchFormat: null, matchStyle: [], uniformColor: null, levelLabel: null }),
      mockFallback,
    );

    expect(model.grade).not.toBe(mockFallback.grade);
    expect(model.format).not.toBe(mockFallback.format);
    expect(model.style).not.toBe(mockFallback.style);
    expect(model.uniform).not.toBe(mockFallback.uniform);
    expect(model.format).toBe('');
    expect(model.uniform).toBe('');
  });

  it('shows the server-derived rulesText as a display fallback for a pre-backfill legacy row instead of mock data', () => {
    const model = toTeamMatch(
      realMatch({
        matchFormat: null,
        matchStyle: [],
        uniformColor: null,
        levelLabel: '중급~고급',
        // 서버의 formatMatchConditionsRulesText가 미백필 row에 대해 내려주는 실제 값 모양
        // (levelLabel · formatNote 원문 · genderRule을 이어붙인 표시 전용 파생 문자열).
        rulesText: '중급~고급 · 5:5 친선전 · 남',
        genderRule: '남',
      }),
      mockFallback,
    );

    expect(model.style).toBe('중급~고급 · 5:5 친선전 · 남');
    expect(model.style).not.toBe(mockFallback.style);
    expect(model.format).toBe('');
    expect(model.uniform).toBe('');
  });
});

// 팀매치 후기 화면(/my/reviews/team_match/:id)으로 가는 링크는 이 CTA 하나뿐이다 —
// 이게 없던 동안 앱 전체에 그 URL을 만드는 코드가 0건이라, 사용자는 /my/reviews 목록에
// 그 매치가 뜨기를 기다리는 수밖에 없었다. 경기 종료 + 참가팀 소속 두 조건을 고정한다.
describe('TeamMatchDetailPageClient — 후기 진입점', () => {
  function mockTeamMatch(
    viewer: { state: V1TeamMatchViewerState; manageableHostTeam?: boolean; participantMember?: boolean },
    status: string,
  ) {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-1',
        teamMatchId: 'team-match-1',
        title: '풋살 팀매치',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        placeName: '서울 풋살장',
        startsAt: '2026-08-01T10:00:00.000Z',
        capacityText: '2/2',
        displayState: status,
        status,
        viewer: {
          state: viewer.state,
          manageableHostTeam: viewer.manageableHostTeam ?? false,
          participantMember: viewer.participantMember ?? false,
        },
        hostTeam: { teamId: 'team-host', name: '호스트 팀' },
      },
      isError: false,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchEligibilityMock.mockReturnValue({ data: undefined, isSuccess: false });
  });

  it('경기가 끝나면 호스트팀 운영진에게 후기 진입점이 보인다', () => {
    mockTeamMatch({ state: 'host_team', manageableHostTeam: true, participantMember: true }, 'completed');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByRole('link', { name: '후기 남기기' })).toHaveAttribute(
      'href',
      '/my/reviews/team_match/team-match-1',
    );
  });

  // 회귀 방지 — 종전 게이트는 `canManageHostTeam || viewerState === 'approved'` 였다.
  // 서버의 viewerState 는 host 팀 owner/manager 에게만 'host_team' 을, **신청서를 낸 한 사람**
  // 에게만 'approved' 를 준다. 그래서 양 팀 일반 팀원은 'none' 으로 내려와 후기 진입점을
  // 잃었는데, 서버(resolveReviewerTeams)는 두 팀의 active 멤버 전원에게 후기를 허용한다.
  it('참가팀 일반 팀원(viewerState=none)에게도 보인다', () => {
    mockTeamMatch({ state: 'none', manageableHostTeam: false, participantMember: true }, 'completed');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByRole('link', { name: '후기 남기기' })).toHaveAttribute(
      'href',
      '/my/reviews/team_match/team-match-1',
    );
  });

  it('승인된 상대팀 소속에게도 보인다', () => {
    mockTeamMatch({ state: 'approved', manageableHostTeam: false, participantMember: true }, 'completed');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByRole('link', { name: '후기 남기기' })).toBeInTheDocument();
  });

  it('경기 전(matched)에는 보이지 않는다', () => {
    mockTeamMatch({ state: 'host_team', manageableHostTeam: true, participantMember: true }, 'matched');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.queryByRole('link', { name: '후기 남기기' })).not.toBeInTheDocument();
  });

  it('무관한 사용자에게는 보이지 않는다', () => {
    mockTeamMatch({ state: 'none', manageableHostTeam: false }, 'completed');

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.queryByRole('link', { name: '후기 남기기' })).not.toBeInTheDocument();
  });
});

// alpha 실측 결함(그룹 B): API가 costNote/description을 안 주고(costNote: null, description: null,
// paymentRequired: false — 실제 응답 그대로), 신청팀도 아직 없는 실제 매치를 열었더니
// team-matches.view-model.ts의 하드코딩 목업("상대팀 부담금 140,000원", "친선 팀매치를 진행해요...",
// "매너 4.8 · 승 23", 가짜 신청팀 이름)이 그대로 새어 나왔다 — 서로 다른 매치를 열어도 항상
// 똑같은 값이 보이는 게 이 버그의 증거였다. 이 스위트는 화면(모델)에 그 목업 값이 더 이상
// 나타나지 않고, 실제 API 값이 있을 때는 여전히 정상적으로 반영됨을 함께 고정한다.
describe('TeamMatchDetailPageClient — API가 비용/설명/신청팀을 안 주면 목업으로 채우지 않는다', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyTeamMatchMutateAsync.mockResolvedValue({ applicationId: 'app-1' });
    useV1TeamMatchEligibilityMock.mockReturnValue({ data: undefined, isSuccess: false });
  });

  it('costNote/description이 null이고 신청팀이 없으면 목업(140,000원·친선 문구·매너 4.8·가짜 신청팀)이 하나도 나타나지 않는다', () => {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'real-league-match-1',
        teamMatchId: 'real-league-match-1',
        title: '(테스트) 8월 리그 3라운드',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        placeName: '진짜 경기장',
        startsAt: '2026-08-01T10:00:00.000Z',
        capacityText: '1/2',
        status: 'open',
        viewer: { state: 'none', manageableHostTeam: false },
        hostTeam: { teamId: 'team-host', name: '호스트 팀', trustState: 'none' },
        costNote: null,
        description: null,
        paymentRequired: false,
        approvedOpponentTeam: null,
      },
      isError: false,
    });

    render(<TeamMatchDetailPageClient teamMatchId="real-league-match-1" />);

    // 결함으로 보고된 정확한 목업 값들 — 하나도 렌더되면 안 된다.
    expect(screen.getByTestId('team-match-opponent-cost')).not.toHaveTextContent('140000');
    expect(screen.getByTestId('team-match-cost')).not.toHaveTextContent('280000');
    expect(screen.getByTestId('team-match-manner')).not.toHaveTextContent('4.8');
    expect(screen.getByTestId('team-match-wins')).not.toHaveTextContent('23');
    expect(screen.queryByText(/친선 팀매치를 진행해요/)).not.toBeInTheDocument();
    expect(screen.queryByText('성수 러너스 FC')).not.toBeInTheDocument();
    expect(screen.queryByText('마포 애슬레틱')).not.toBeInTheDocument();

    // 값 없음은 0 이 아니라 **null** 로 넘긴다 — 0 으로 채우면 화면이 '무료초청 · 실제 청구
    // 없어요'(비용)나 '매너 0 · 승 0'(팀 통계)이라는 또 다른 거짓 정보를 만들어낸다.
    // 렌더러(team-matches-page.tsx)는 null 을 받으면 그 줄·그룹을 감춘다.
    expect(screen.getByTestId('team-match-description')).toHaveTextContent('');
    expect(screen.getByTestId('team-match-cost')).toHaveTextContent('');
    expect(screen.getByTestId('team-match-opponent-cost')).toHaveTextContent('');
    expect(screen.getByTestId('team-match-manner')).toHaveTextContent('');
    expect(screen.getByTestId('team-match-wins')).toHaveTextContent('');
    expect(screen.getByTestId('team-match-applicant-count')).toHaveTextContent('0');
  });

  it('costNote/description이 실제로 있으면 그 값을 그대로 반영한다(목업으로 안 덮는다)', () => {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'real-league-match-2',
        teamMatchId: 'real-league-match-2',
        title: '(테스트) 8월 리그 4라운드',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        placeName: '진짜 경기장',
        startsAt: '2026-08-02T10:00:00.000Z',
        capacityText: '1/2',
        status: 'open',
        viewer: { state: 'none', manageableHostTeam: false },
        hostTeam: { teamId: 'team-host', name: '호스트 팀', trustState: 'none' },
        costNote: '총 90,000원 · 상대팀 30,000원',
        description: '실제로 입력된 설명이에요.',
        paymentRequired: true,
        approvedOpponentTeam: null,
      },
      isError: false,
    });

    render(<TeamMatchDetailPageClient teamMatchId="real-league-match-2" />);

    expect(screen.getByTestId('team-match-description')).toHaveTextContent('실제로 입력된 설명이에요.');
    expect(screen.getByTestId('team-match-cost')).toHaveTextContent('90000');
    expect(screen.getByTestId('team-match-opponent-cost')).toHaveTextContent('30000');
  });
});

// alpha 실측 결함(그룹 A, C-1) — 이미 대진이 확정/종료된 리그 경기를 비로그인 관전자로
// 열면 applyLabel은 '신청 불가'인데 onApply는 여전히 로그인 리다이렉트를 반환해서,
// "신청 불가"라고 적힌 파란 primary 버튼이 클릭되면 로그인 페이지로 튀는 상태였다.
// 신청할 게 없는(recruiting이 아닌) 매치에서는 로그인/팀만들기 유도 자체를 하지 않는다.
describe('TeamMatchDetailPageClient — 신청 마감된 매치는 로그인/팀만들기 리다이렉트를 제공하지 않는다', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchEligibilityMock.mockReturnValue({ data: undefined, isSuccess: false });
  });

  it('완료된 리그 경기를 비로그인 뷰어로 열면 신청 CTA(onApply)가 아예 없다', () => {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'league-fixture-1',
        teamMatchId: 'league-fixture-1',
        title: '(테스트) 8월 리그 3라운드',
        sportName: '풋살',
        placeName: '진짜 경기장',
        startsAt: '2026-08-01T10:00:00.000Z',
        status: 'completed',
        displayState: 'completed',
        viewer: { state: 'guest', manageableHostTeam: false },
        hostTeam: { teamId: 'team-host', name: '알파팀' },
        league: { leagueId: 'league-1', title: '8월 리그' },
        approvedOpponentTeam: { teamId: 'team-away', name: '브라보FC', applicationId: 'app-away' },
      },
      isError: false,
    });

    render(<TeamMatchDetailPageClient teamMatchId="league-fixture-1" />);

    expect(screen.getByTestId('team-match-apply-label')).toHaveTextContent('신청 불가');
    // 회귀 지점: 예전엔 onApply가 로그인 리다이렉트라 이 버튼이 여전히 렌더됐다.
    expect(screen.queryByRole('button', { name: '상대팀 신청' })).not.toBeInTheDocument();
  });

  it('신청 마감(closed)에서 소속 팀이 없는 뷰어도 팀만들기 리다이렉트를 받지 않는다', () => {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-closed-1',
        teamMatchId: 'team-match-closed-1',
        title: '모집 마감된 팀매치',
        sportName: '풋살',
        placeName: '경기장',
        startsAt: '2026-08-01T10:00:00.000Z',
        status: 'closed',
        displayState: 'closed',
        viewer: { state: 'none', manageableHostTeam: false },
        hostTeam: { teamId: 'team-host', name: '알파팀' },
        approvedOpponentTeam: null,
      },
      isError: false,
    });
    // hasNoTeam 게이트: teams 배열이 비어 있으면 '팀 없음'으로 잡힌다.
    useV1TeamMatchEligibilityMock.mockReturnValue({ data: { teamMatchId: 'team-match-closed-1', requiresApproval: true, requiresPayment: false, teams: [] }, isSuccess: true });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-closed-1" />);

    expect(screen.getByTestId('team-match-apply-label')).toHaveTextContent('신청 불가');
    expect(screen.queryByRole('button', { name: '상대팀 신청' })).not.toBeInTheDocument();
  });
});

// 그룹 A(alpha 실측) — 서버는 리그 대진(leagueId 有)의 팀 단독 취소를 항상 409
// LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN으로 거부한다(team-matches.service.ts cancel()).
// 눌러서 실패 문구를 봐야만 알 수 있게 두지 않고, 애초에 버튼을 노출하지 않는다.
describe('TeamMatchDetailPageClient — 리그 대진은 "팀매치 취소"를 노출하지 않는다', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchEligibilityMock.mockReturnValue({ data: undefined, isSuccess: false });
  });

  function mockHostView(status: string, league: { leagueId: string; title: string } | null) {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-host-1',
        teamMatchId: 'team-match-host-1',
        title: '팀매치',
        sportName: '풋살',
        placeName: '경기장',
        startsAt: '2026-08-01T10:00:00.000Z',
        status,
        displayState: status,
        viewer: { state: 'host_team', manageableHostTeam: true },
        hostTeam: { teamId: 'team-host', name: '알파팀' },
        league,
      },
      isError: false,
    });
  }

  it('리그 대진(모집 중)은 "모집 마감"만 보이고 "팀매치 취소"는 없다', () => {
    mockHostView('recruiting', { leagueId: 'league-1', title: '8월 리그' });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-host-1" />);

    const actions = (screen.getByTestId('team-match-host-actions').textContent ?? '').split(',').filter(Boolean);
    expect(actions).toEqual(['모집 마감']);
  });

  it('리그 대진(상대팀 확정)은 호스트 액션이 아예 없다', () => {
    mockHostView('matched', { leagueId: 'league-1', title: '8월 리그' });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-host-1" />);

    const actions = (screen.getByTestId('team-match-host-actions').textContent ?? '').split(',').filter(Boolean);
    expect(actions).toEqual([]);
  });

  it('일반 팀매치(리그 아님, 같은 상태)는 여전히 "팀매치 취소"가 보인다(회귀 방지)', () => {
    mockHostView('recruiting', null);

    render(<TeamMatchDetailPageClient teamMatchId="team-match-host-1" />);

    const actions = (screen.getByTestId('team-match-host-actions').textContent ?? '').split(',').filter(Boolean);
    expect(actions).toContain('팀매치 취소');
  });
});

// C2 회귀 — 히어로 CTA의 **라벨과 액션이 서로 다른 값을 근거로 삼던** 결함.
// 라벨은 viewerState(='requested')를 보고 '신청 취소'라고 적었는데, 액션은
// `teams.find(t => t.eligible)`로 고른 팀을 봤다. 내가 신청한 팀은 ALREADY_REQUESTED라
// eligible=false이므로 **절대 선택되지 않고**, 팀을 2개 이상 관리하는 사용자에게는 그 자리에
// 다른 팀이 들어왔다. 그 결과 '신청 취소'를 누르면 철회 대신 **다른 팀으로 새 신청**이 나가고
// (호스트가 그걸 승인하면 내 진짜 신청은 자동 거절되고 신청한 적 없는 팀이 상대팀이 된다),
// 화면은 '신청을 취소했어요.'라고 알렸다.
describe('TeamMatchDetailPageClient — 신청 중인 뷰어의 히어로 CTA는 새 신청을 보내지 않는다', () => {
  function mockRequestedViewer(teams: Array<{
    teamId: string;
    name: string;
    role: string;
    eligible: boolean;
    reasonCode: string;
    applicationId: string | null;
  }>) {
    useV1TeamMatchMock.mockReturnValue({
      data: {
        id: 'team-match-1',
        teamMatchId: 'team-match-1',
        title: '풋살 팀매치',
        sportName: '풋살',
        sport: { sportId: 'sport-futsal', name: '풋살' },
        placeName: '서울 풋살장',
        startsAt: '2026-09-01T10:00:00.000Z',
        capacityText: '1/2',
        status: 'recruiting',
        displayState: 'recruiting',
        // 서버는 "신청서를 낸 사람"에게만 'requested'를 준다(team-matches.service.ts
        // getViewerState) — 즉 이 뷰어에게는 살아 있는 신청서가 정확히 하나 있다.
        viewer: { state: 'requested', manageableHostTeam: false },
        hostTeam: { teamId: 'team-host', name: '호스트 팀' },
      },
      isError: false,
    });
    useV1TeamMatchEligibilityMock.mockReturnValue({
      data: { teamMatchId: 'team-match-1', requiresApproval: true, requiresPayment: false, teams },
      isSuccess: true,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    applyTeamMatchMutateAsync.mockResolvedValue({ applicationId: 'app-new' });
    withdrawTeamMatchMutateAsync.mockResolvedValue({ applicationId: 'app-alpha' });
  });

  it('A팀으로 신청한 뒤 B팀도 관리 중이면, CTA는 B팀 신규 신청이 아니라 A팀 신청 철회를 실행한다', () => {
    // eligibility는 createdAt desc라 최근에 만든 B팀이 앞에 온다 — 결함 당시 `find(t => t.eligible)`가
    // 정확히 이 B를 골랐다.
    mockRequestedViewer([
      { teamId: 'team-bravo', name: '브라보FC', role: 'owner', eligible: true, reasonCode: 'OK', applicationId: null },
      { teamId: 'team-alpha', name: '알파FC', role: 'owner', eligible: false, reasonCode: 'ALREADY_REQUESTED', applicationId: 'app-alpha' },
    ]);

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    fireEvent.click(screen.getByRole('button', { name: '상대팀 신청' }));

    // 결함의 핵심: 여기서 B팀(브라보FC) 신규 신청이 나갔다.
    expect(applyTeamMatchMutateAsync).not.toHaveBeenCalled();
    expect(withdrawTeamMatchMutateAsync).toHaveBeenCalledTimes(1);
    // 철회 대상은 A팀의 신청서다 — 훅 생성 인자로만 확인할 수 있다.
    expect(useV1WithdrawTeamMatchApplicationMock).toHaveBeenCalledWith('team-match-1', 'app-alpha');
    // 라벨과 액션이 같은 팀을 가리켜야 한다 — 취소 CTA는 철회할 팀(알파FC)을 이름으로 밝힌다.
    expect(screen.getByTestId('team-match-apply-label')).toHaveTextContent('알파FC');
  });

  it('철회할 신청서를 찾을 수 없으면 CTA를 비활성화하고, 다른 팀으로 신청하지 않는다', () => {
    // 신청 당시 팀에서 운영진 자격을 잃으면 그 팀은 eligibility 목록에서 통째로 빠진다
    // (getUserManageableTeams는 owner/manager 멤버십만 본다) — 그래도 내 신청서는 살아 있어
    // viewerState는 'requested'다. 이때 남은 B팀으로 신청이 나가면 안 된다.
    mockRequestedViewer([
      { teamId: 'team-bravo', name: '브라보FC', role: 'owner', eligible: true, reasonCode: 'OK', applicationId: null },
    ]);

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.queryByRole('button', { name: '상대팀 신청' })).not.toBeInTheDocument();
    // 라벨도 남은 팀(브라보FC)을 가리키면 안 되고, 아무 일도 못 하는 버튼에 '신청 취소'라고
    // 적어두면 "여기서 취소된다"는 거짓 안내가 된다 — 왜 못 하는지를 알려야 한다.
    const label = screen.getByTestId('team-match-apply-label');
    expect(label).not.toHaveTextContent('브라보FC');
    expect(label).not.toHaveTextContent('신청 취소');
    expect(label.textContent?.trim()).toBeTruthy();
  });
});

// 20건 컷오프 페이지네이션 결함 회귀 방지(2026-08-27 감사) — matches-client.test.tsx의
// 동일 계열 테스트와 짝을 이룬다.
describe('TeamMatchListPageClient — 커서 페이지네이션 누적', () => {
  function page(items: Array<{ id: string; title: string }>, nextCursor: string | null) {
    return {
      data: {
        items: items.map((item) => ({
          id: item.id,
          teamMatchId: item.id,
          title: item.title,
          sportName: '풋살',
          startsAt: '2026-09-01T10:00:00.000Z',
          status: 'recruiting' as const,
        })),
        nextCursor,
        pageInfo: { nextCursor, hasNext: nextCursor !== null },
      },
      isError: false,
      isFetching: false,
      isLoading: false,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchesMock.mockImplementation((filters?: { cursor?: string }, options?: { enabled?: boolean }) => {
      if (options && options.enabled === false) {
        return { data: undefined, isError: false, isFetching: false, isLoading: false };
      }
      if (!filters?.cursor) {
        return page([{ id: 'tm1', title: '팀매치 1' }], 'cursor-page-2');
      }
      return page([{ id: 'tm2', title: '팀매치 2' }], null);
    });
  });

  it('첫 페이지는 hasNext=true로 "더 보기"를 보여주고, 클릭하면 두 번째 페이지가 이어 붙는다', () => {
    render(<TeamMatchListPageClient />);

    expect(screen.getByTestId('team-match-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));

    expect(screen.getByTestId('team-match-count')).toHaveTextContent('2');
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });
});

describe('TeamMatchDetailPageClient — 로딩 중 목업 노출 방지', () => {
  it('팀매치를 아직 못 받았으면 목업 상세("FC 발빠른놈들" 등) 대신 스켈레톤을 렌더한다', () => {
    useV1TeamMatchMock.mockReturnValue({ data: undefined, isError: false });

    render(<TeamMatchDetailPageClient teamMatchId="team-match-1" />);

    expect(screen.getByTestId('team-match-detail-skeleton')).toBeTruthy();
    // 목업 팀매치(team-matches.view-model.ts)의 어떤 필드도 화면에 닿지 않아야 한다.
    expect(screen.queryByTestId('team-match-address')).toBeNull();
    expect(screen.queryByTestId('team-match-manner')).toBeNull();
  });
});
