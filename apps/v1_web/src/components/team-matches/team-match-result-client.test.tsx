import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1GameResultRevision } from '@/types/api';
import { TeamMatchResultApprovalPageClient, TeamMatchResultPageClient } from './team-match-result-client';

const {
  useV1TeamMatchMock,
  useV1GameMock,
  useV1GameResultRevisionsMock,
  useV1TeamMatchLineupMock,
  createMutateAsync,
  submitMutateAsync,
  decideMutateAsync,
} = vi.hoisted(() => ({
  useV1TeamMatchMock: vi.fn(),
  useV1GameMock: vi.fn(),
  useV1GameResultRevisionsMock: vi.fn(),
  useV1TeamMatchLineupMock: vi.fn(),
  createMutateAsync: vi.fn(),
  submitMutateAsync: vi.fn(),
  decideMutateAsync: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatch: useV1TeamMatchMock,
  useV1Game: useV1GameMock,
  useV1GameResultRevisions: useV1GameResultRevisionsMock,
  useV1TeamMatchLineup: useV1TeamMatchLineupMock,
  useV1CreateGameResultRevision: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useV1SubmitGameResultRevision: () => ({ mutateAsync: submitMutateAsync, isPending: false }),
  useV1DecideGameResultRevision: () => ({ mutateAsync: decideMutateAsync, isPending: false }),
  // Both clients below render `AppChrome`, whose `NotificationBell` calls this
  // hook. Because this factory replaces the whole module, omitting it makes
  // vitest throw "No export is defined on the mock" before any assertion runs.
  // `data: undefined` is the real pre-fetch shape — the bell reads
  // `summary.data?.unreadCount ?? 0`.
  useV1NotificationUnreadSummary: () => ({ data: undefined, isPending: false }),
}));

// 백엔드가 실제로 내려주는 필드만 사용하는 순수 목 데이터 — team-matches-client.test.tsx의
// 기존 관례와 동일하게, mock된 훅 리턴값은 프론트 타입으로 강제하지 않는다(V1Match.status의
// 개인매치 전용 V1Status와 팀매치 전용 표시 상태 문자열이 겹치지 않아 캐스팅만 번거로워진다).
function teamMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tm-1',
    teamMatchId: 'tm-1',
    gameId: 'game-1',
    title: '풋살 팀매치',
    sportName: '풋살',
    placeName: '잠실 풋살장',
    startsAt: '2026-08-01T10:00:00.000Z',
    capacityText: '2/2',
    status: 'matched',
    displayState: 'matched',
    hostTeam: { teamId: 'team-host', name: '호스트팀' },
    approvedOpponentTeam: { teamId: 'team-away', name: '상대팀', applicationId: 'app-1' },
    viewer: { state: 'host_team', manageableHostTeam: true },
    ...overrides,
  };
}

function game(overrides: Record<string, unknown> = {}) {
  return {
    id: 'game-1',
    sourceType: 'TEAM_MATCH',
    state: 'ENDED',
    version: 3,
    lastSequence: 0,
    competitionConfigVersionId: 'config-1',
    currentOfficialRevisionId: null,
    sides: [
      { id: 'side-home', gameId: 'game-1', sideKey: 'HOME', teamId: 'team-host', displayNameSnapshot: '호스트팀' },
      { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '상대팀' },
    ],
    periods: [],
    lineups: [],
    actorRole: 'team_owner',
    ...overrides,
  };
}

function lineup(overrides: Record<string, unknown> = {}) {
  return {
    teamMatchId: 'tm-1',
    gameId: 'game-1',
    sideId: 'side-home',
    role: 'team_owner',
    lineupId: 'lineup-1',
    revision: 1,
    state: 'SUBMITTED',
    version: 1,
    publicLineupAt: null,
    starters: [{ id: 'p-1', displayName: '김민준', jerseyNumber: 7, position: null, goalkeeper: false }],
    bench: [],
    ...overrides,
  };
}

function revision(overrides: Partial<V1GameResultRevision> = {}): V1GameResultRevision {
  return {
    id: 'rev-1',
    gameId: 'game-1',
    revision: 1,
    state: 'DRAFT',
    score: { home: 0, away: 0 },
    eventsHash: 'hash',
    missingScorer: false,
    mvpParticipantId: null,
    reason: null,
    createdByActorType: 'USER',
    createdByUserId: 'user-host',
    createdBySystemActor: null,
    supersedesId: null,
    submittedAt: null,
    officialAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    resultParticipants: [],
    ...overrides,
  };
}

const settledQuery = <T,>(data: T) => ({ data, isError: false, isLoading: false, isFetching: false, refetch: vi.fn() });

describe('TeamMatchResultPageClient — 호스트 결과 입력', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchMock.mockReturnValue(settledQuery(teamMatch()));
    useV1GameMock.mockReturnValue(settledQuery(game()));
    useV1GameResultRevisionsMock.mockReturnValue(settledQuery<V1GameResultRevision[]>([]));
    useV1TeamMatchLineupMock.mockReturnValue(settledQuery(lineup()));
  });

  it('호스트(owner)에게 결과 작성 폼과 라인업 선수를 보여준다', () => {
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('결과 작성 완료')).toBeInTheDocument();
    expect(screen.getByText('김민준')).toBeInTheDocument();
  });

  it('매니저 권한(manageableHostTeam)도 동일하게 결과 작성 폼을 볼 수 있다', () => {
    useV1TeamMatchMock.mockReturnValue(
      settledQuery(teamMatch({ viewer: { state: 'host_team', manageableHostTeam: true } })),
    );
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('결과 작성 완료')).toBeInTheDocument();
  });

  it('상대팀(opponent) 담당자는 결과를 작성할 수 없다', () => {
    useV1TeamMatchMock.mockReturnValue(
      settledQuery(teamMatch({ viewer: { state: 'approved', manageableHostTeam: false } })),
    );
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('호스트만 결과를 입력할 수 있어요')).toBeInTheDocument();
    expect(screen.queryByText('결과 작성 완료')).not.toBeInTheDocument();
  });

  it('상대팀이 아직 정해지지 않은 매치는 결과 입력 폼 대신 안내를 보여준다', () => {
    useV1TeamMatchMock.mockReturnValue(settledQuery(teamMatch({ status: 'recruiting', displayState: 'recruiting' })));
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('아직 결과를 입력할 수 없어요')).toBeInTheDocument();
  });

  it('409 VERSION_CONFLICT는 새로고침을 안내하는 구체적 메시지로 보여준다 (경쟁 상태)', async () => {
    createMutateAsync.mockRejectedValue({ code: 'VERSION_CONFLICT', message: 'stale' });
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    fireEvent.click(screen.getByText('결과 작성 완료'));
    await waitFor(() =>
      expect(screen.getByText('그새 경기 상태가 바뀌었어요. 새로고침 후 다시 시도해 주세요.')).toBeInTheDocument(),
    );
  });

  it('코드 없는 일반 서버 오류(500)는 해요체 기본 메시지로 보여준다', async () => {
    createMutateAsync.mockRejectedValue({});
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    fireEvent.click(screen.getByText('결과 작성 완료'));
    await waitFor(() =>
      expect(screen.getByText('처리하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument(),
    );
  });

  it('공식 확정(OFFICIAL) 상태에서는 기록 반영 지연 안내(projection-pending)를 보여준다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([revision({ state: 'OFFICIAL', officialAt: '2026-08-01T01:00:00.000Z' })]),
    );
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.getByText(/개인 기록·팀 전적 반영에는/)).toBeInTheDocument();
    // 확정 상태에서는 새 초안 작성 폼이 다시 보이면 안 된다
    expect(screen.queryByText('결과 작성 완료')).not.toBeInTheDocument();
  });

  it('상대팀 정정 요청(CHANGE_REQUESTED) 사유를 배너로 보여주고 재작성 폼을 연다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([revision({ state: 'CHANGE_REQUESTED', reason: '점수가 달라요' })]),
    );
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('상대팀 정정 요청: 점수가 달라요')).toBeInTheDocument();
    expect(screen.getByText('결과 작성 완료')).toBeInTheDocument();
  });

  it('DRAFT 상태에서는 재작성 폼 대신 제출 확인 카드를 보여주고, 제출하면 submitRevision을 호출한다', async () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([revision({ state: 'DRAFT', score: { home: 0, away: 0 } })]),
    );
    submitMutateAsync.mockResolvedValue({});
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.queryByText('결과 작성 완료')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('결과 제출하기'));
    await waitFor(() =>
      expect(submitMutateAsync).toHaveBeenCalledWith({ revisionId: 'rev-1', expectedVersion: 3 }),
    );
  });
});

describe('TeamMatchResultApprovalPageClient — 상대팀 승인/정정 요청', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchMock.mockReturnValue(
      settledQuery(teamMatch({ viewer: { state: 'approved', manageableHostTeam: false } })),
    );
    useV1GameMock.mockReturnValue(settledQuery(game()));
    // 승인 화면은 own-side 라인업을 쓰지 않지만(needsOwnLineup:false), 훅 자체는 항상 호출되므로
    // 목이 undefined를 반환하지 않도록 기본값을 채워 둔다.
    useV1TeamMatchLineupMock.mockReturnValue(settledQuery(lineup()));
  });

  it('제출된 결과가 있으면 승인/정정 요청 버튼을 보여준다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({ state: 'SUBMITTED', score: { home: 2, away: 1 }, submittedAt: '2026-08-01T00:00:00.000Z' }),
      ]),
    );
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('승인하기')).toBeInTheDocument();
    expect(screen.getByText('정정 요청')).toBeInTheDocument();
  });

  it('아직 제출된 결과가 없으면 빈 상태를 보여준다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(settledQuery<V1GameResultRevision[]>([]));
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('아직 제출된 결과가 없어요')).toBeInTheDocument();
  });

  it('호스트도 상대팀도 아닌 사용자는 승인 화면에 접근할 수 없다', () => {
    useV1TeamMatchMock.mockReturnValue(settledQuery(teamMatch({ viewer: { state: 'none', manageableHostTeam: false } })));
    useV1GameResultRevisionsMock.mockReturnValue(settledQuery<V1GameResultRevision[]>([]));
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('상대팀만 결과를 승인할 수 있어요')).toBeInTheDocument();
  });

  it('409 race: 승인 처리 중 그새 바뀐 버전 충돌을 actionable 메시지로 보여준다', async () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([revision({ state: 'SUBMITTED', score: { home: 2, away: 1 } })]),
    );
    decideRevisionRejects({ code: 'VERSION_CONFLICT', message: 'stale' });
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    fireEvent.click(screen.getByText('승인하기'));
    await waitFor(() =>
      expect(screen.getByText('그새 경기 상태가 바뀌었어요. 새로고침 후 다시 시도해 주세요.')).toBeInTheDocument(),
    );
  });

  it('정정 요청은 사유 입력 전에는 비활성화, 입력 후 전송된다', async () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([revision({ state: 'SUBMITTED', score: { home: 2, away: 1 } })]),
    );
    decideMutateAsync.mockResolvedValue({});
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    fireEvent.click(screen.getByText('정정 요청'));
    const sendButton = screen.getByText('정정 요청 보내기');
    expect(sendButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('정정 요청 사유'), { target: { value: '점수가 달라요' } });
    expect(sendButton).not.toBeDisabled();
    fireEvent.click(sendButton);
    await waitFor(() =>
      expect(decideMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'change_request', reason: '점수가 달라요' }),
      ),
    );
  });

  it('공식 확정(OFFICIAL) 상태에서는 기록 반영 지연 안내를 보여준다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({ state: 'OFFICIAL', score: { home: 2, away: 1 }, officialAt: '2026-08-01T01:00:00.000Z' }),
      ]),
    );
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    expect(screen.getByText(/개인 기록·팀 전적 반영에는/)).toBeInTheDocument();
  });
});

function decideRevisionRejects(error: unknown) {
  decideMutateAsync.mockRejectedValue(error);
}
