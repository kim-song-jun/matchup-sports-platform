import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1GameResultRevision } from '@/types/api';
import {
  TeamMatchResultApprovalPageClient,
  TeamMatchResultPageClient,
  scoreLabel,
} from './team-match-result-client';

const {
  useV1TeamMatchMock,
  useV1GameMock,
  useV1GameResultRevisionsMock,
  useV1TeamMatchLineupMock,
  createMutateAsync,
  submitMutateAsync,
  decideMutateAsync,
  fileDisputeMutateAsync,
} = vi.hoisted(() => ({
  useV1TeamMatchMock: vi.fn(),
  useV1GameMock: vi.fn(),
  useV1GameResultRevisionsMock: vi.fn(),
  useV1TeamMatchLineupMock: vi.fn(),
  createMutateAsync: vi.fn(),
  submitMutateAsync: vi.fn(),
  decideMutateAsync: vi.fn(),
  fileDisputeMutateAsync: vi.fn(),
}));

// jsdom has no Next router, so `useSearchParams()` returns null and the first
// `.get()` inside AppChrome throws "Cannot read properties of null". Mirrors
// team-matches-client.test.tsx, which mounts the same chrome.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/team-matches/tm-1/result',
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatch: useV1TeamMatchMock,
  useV1Game: useV1GameMock,
  useV1GameResultRevisions: useV1GameResultRevisionsMock,
  useV1TeamMatchLineup: useV1TeamMatchLineupMock,
  useV1CreateGameResultRevision: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useV1SubmitGameResultRevision: () => ({ mutateAsync: submitMutateAsync, isPending: false }),
  useV1DecideGameResultRevision: () => ({ mutateAsync: decideMutateAsync, isPending: false }),
  useV1FileLeagueDispute: () => ({ mutateAsync: fileDisputeMutateAsync, isPending: false }),
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
    score: { regulation: { home: 0, away: 0 }, penalty: null, goals: [], incomplete: false },
    eventsHash: 'hash',
    missingScorer: false,
    mvpParticipantId: null,
    reason: null,
    outcomeReason: 'NORMAL',
    outcomeNote: null,
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
    // The roster row renders the jersey number and the name as two sibling
    // text nodes (`{'#7 '}{displayName}`), so an exact-string matcher never
    // matches. Asserting on the combined label proves both are rendered.
    expect(screen.getByText(/#7\s*김민준/)).toBeInTheDocument();
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
      settledQuery(
        teamMatch({ viewer: { state: 'approved', manageableHostTeam: false, manageableOpponentTeam: true } }),
      ),
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
    // P0-3: "결과 작성 완료"는 검토 단계로만 넘어간다 — 실제 서버 호출은 검토 화면의
    // "제출하기"에서 일어난다.
    fireEvent.click(screen.getByText('결과 작성 완료'));
    fireEvent.click(screen.getByText('제출하기'));
    await waitFor(() =>
      expect(screen.getByText('그새 경기 상태가 바뀌었어요. 새로고침 후 다시 시도해 주세요.')).toBeInTheDocument(),
    );
  });

  it('코드 없는 일반 서버 오류(500)는 해요체 기본 메시지로 보여준다', async () => {
    createMutateAsync.mockRejectedValue({});
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    fireEvent.click(screen.getByText('결과 작성 완료'));
    fireEvent.click(screen.getByText('제출하기'));
    await waitFor(() =>
      expect(screen.getByText('처리하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument(),
    );
  });

  // P0-3 재현: 예전에는 "결과 작성 완료"를 누르는 순간 서버에 DRAFT가 생겨 입력 폼이
  // 통째로 사라지고, 득점자를 잘못 골랐어도 되돌아가 고칠 방법이 없었다(RESULT_REVISION_ALREADY_EXISTS
  // 에러가 그 증거). 지금은 로컬 "검토" 단계를 거치고, "수정하기"로 언제든 돌아갈 수 있다.
  it('P0-3: "결과 작성 완료"는 서버 DRAFT를 만들지 않고 검토 화면만 보여주며, "수정하기"로 입력값을 그대로 유지한 채 돌아갈 수 있다', async () => {
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

    fireEvent.change(screen.getByLabelText('호스트팀 (홈)'), { target: { value: '1' } });
    fireEvent.change(screen.getAllByLabelText(/번 골$/)[0], { target: { value: 'p-1' } });

    fireEvent.click(screen.getByText('결과 작성 완료'));

    // 검토 단계로 넘어갔을 뿐 아직 서버에는 아무것도 만들어지지 않았다.
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('작성한 결과를 확인해 주세요')).toBeInTheDocument();
    expect(screen.getByText(/1번 골 · #7\s*김민준/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('수정하기'));

    // 입력 폼으로 돌아왔고, 방금 지정한 득점자 선택은 그대로 남아있다.
    expect(screen.getByText('결과 작성 완료')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/번 골$/)[0]).toHaveValue('p-1');
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  // P0-2 재현: 홈 점수 입력창에서 백스페이스로 값을 지워 ''가 되는 순간 지정해둔
  // 득점자가 전부 사라지면 안 된다(예전엔 Number('') || 0 이 즉시 0으로 확정해버렸다).
  it('P0-2: 스코어 입력창을 지우는 도중(빈 문자열)에는 지정해둔 득점자가 사라지지 않는다', () => {
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

    fireEvent.change(screen.getByLabelText('호스트팀 (홈)'), { target: { value: '2' } });
    const scorerSelects = screen.getAllByLabelText(/번 골$/);
    fireEvent.change(scorerSelects[0], { target: { value: 'p-1' } });
    expect(screen.getAllByLabelText(/번 골$/)).toHaveLength(2);

    // 백스페이스로 지우는 중 — 입력값은 ''이지만 아직 확정된 게 아니다.
    fireEvent.change(screen.getByLabelText('호스트팀 (홈)'), { target: { value: '' } });
    expect(screen.getAllByLabelText(/번 골$/)).toHaveLength(2);
    expect(screen.getAllByLabelText(/번 골$/)[0]).toHaveValue('p-1');

    // 다시 2를 입력하면(흔한 "지웠다 다시 입력" 케이스) 원래 선택이 복원된다.
    fireEvent.change(screen.getByLabelText('호스트팀 (홈)'), { target: { value: '2' } });
    expect(screen.getAllByLabelText(/번 골$/)).toHaveLength(2);
    expect(screen.getAllByLabelText(/번 골$/)[0]).toHaveValue('p-1');
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

  // 감사 백로그 M-E 재현: OFFICIAL로 확정되는 순간 입력한 득점자·카드·MVP가 화면에서
  // 통째로 사라졌다 — GoalTimeline은 이 화면이 만드는 평평한 score({home,away})에서는
  // 항상 null을 반환하고, 확정 카드에는 다른 대체 블록이 없었다. 호스트는 자기 팀
  // 라인업이 있으므로 실명(잠실 배정 등번호 포함)으로 보여야 한다.
  it('공식 확정(OFFICIAL) 상태에서도 득점자·카드·MVP를 roster 실명으로 보여준다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({
          state: 'OFFICIAL',
          officialAt: '2026-08-01T01:00:00.000Z',
          score: { home: 1, away: 0 },
          mvpParticipantId: 'p-1',
          resultParticipants: [
            {
              id: 'rp-1',
              resultRevisionId: 'rev-1',
              participantId: 'p-1',
              sideId: 'side-home',
              started: true,
              minutesPlayed: null,
              goals: 1,
              assists: 0,
              fouls: 0,
              cards: { yellow: 1, red: 0 },
              goalkeeper: false,
            },
          ],
        }),
      ]),
    );
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.getByText(/#7 김민준.*1골/)).toBeInTheDocument();
    expect(screen.getByText(/#7 김민준.*옐로/)).toBeInTheDocument();
    expect(screen.getAllByText('#7 김민준').length).toBeGreaterThan(0); // MVP 줄
    // participantId 원문이 그대로 노출되면 안 된다(이름 매핑 실패 회귀 가드)
    expect(screen.queryByText(/^p-1$/)).not.toBeInTheDocument();
  });

  // 감사 백로그 M-E 재현: 제출 직후에는 latest.state가 SUBMITTED로 넘어가는데, 그 화면은
  // "상대팀 승인을 기다리고 있어요" 문구만 남기고 방금 입력한 기록을 보여주지 않았다.
  it('제출 후 SUBMITTED(승인 대기) 상태에서도 득점자·MVP를 roster 실명으로 보여준다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({
          state: 'SUBMITTED',
          score: { home: 1, away: 0 },
          mvpParticipantId: 'p-1',
          submittedAt: '2026-08-01T00:00:00.000Z',
          resultParticipants: [
            {
              id: 'rp-1',
              resultRevisionId: 'rev-1',
              participantId: 'p-1',
              sideId: 'side-home',
              started: true,
              minutesPlayed: null,
              goals: 1,
              assists: 0,
              fouls: 0,
              cards: { yellow: 0, red: 0 },
              goalkeeper: false,
            },
          ],
        }),
      ]),
    );
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('상대팀 승인을 기다리고 있어요')).toBeInTheDocument();
    expect(screen.getByText(/#7 김민준.*1골/)).toBeInTheDocument();
  });

  it('친선 자가 제출 결과는 어시스트 입력란이 없으므로 골이 있어도 "어시스트 미기입" 경고를 띄우지 않는다', () => {
    // 친선 팀매치 자가 제출 폼은 assists를 상수 0으로 고정 전송한다(입력란 자체가 없음) —
    // countMissingAssists(totalGoals - totalAssists)를 이 화면에 그대로 적용하면 골이 있는
    // 모든 결과에 예외 없이 경고가 뜨고, 재제출해도 절대 사라지지 않는다.
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({
          state: 'OFFICIAL',
          officialAt: '2026-08-01T01:00:00.000Z',
          resultParticipants: [
            { id: 'rp-1', resultRevisionId: 'rev-1', participantId: 'p-1', sideId: 'side-home', started: true, minutesPlayed: null, goals: 3, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
          ],
        }),
      ]),
    );
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.queryByText(/어시스트 미기입/)).not.toBeInTheDocument();
  });

  it('상대팀 정정 요청(CHANGE_REQUESTED) 사유를 배너로 보여주고 재작성 폼을 연다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([revision({ state: 'CHANGE_REQUESTED', reason: '점수가 달라요' })]),
    );
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('상대팀 정정 요청: 점수가 달라요')).toBeInTheDocument();
    expect(screen.getByText('결과 작성 완료')).toBeInTheDocument();
  });

  // 새로고침 후 재진입 재현: 로컬 state는 비어있고(막 마운트된 컴포넌트) 서버에만
  // CHANGE_REQUESTED revision이 있는 경우, hydrateResultFormFromRevision이 이전에
  // 작성했던 득점자·MVP·메모를 폼에 복원해야 한다 — 그렇지 않으면 빈 폼이 뜬다.
  it('정정 요청 재진입 시 이전에 작성했던 득점자·MVP·메모가 폼에 복원된다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({
          state: 'CHANGE_REQUESTED',
          reason: '점수가 달라요',
          score: { home: 1, away: 2 },
          mvpParticipantId: 'p-1',
          resultParticipants: [
            {
              id: 'rp-1',
              resultRevisionId: 'rev-1',
              participantId: 'p-1',
              sideId: 'side-home',
              started: true,
              minutesPlayed: null,
              goals: 1,
              assists: 0,
              fouls: 0,
              cards: { yellow: 0, red: 0 },
              goalkeeper: false,
            },
          ],
        }),
      ]),
    );
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

    expect(screen.getByLabelText('호스트팀 (홈)')).toHaveValue(1);
    expect(screen.getByLabelText('상대팀 (원정)')).toHaveValue(2);
    expect(screen.getAllByLabelText(/번 골$/)[0]).toHaveValue('p-1');
    expect(screen.getByLabelText('5. MVP')).toHaveValue('p-1');
  });

  // 출전 게이트: 라인업에 이름이 오른 것과 경기에 나간 것은 다르다. 결과에 실린 선수만
  // 개인 프로필의 "출전 N경기"로 집계되므로(백엔드 PublicUserRecordsService), 끝까지
  // 벤치를 지킨 선수는 payload에서 빠져야 한다.
  describe('출전 게이트 — 교체 출전 체크', () => {
    function withBench() {
      useV1TeamMatchLineupMock.mockReturnValue(
        settledQuery(
          lineup({
            bench: [
              { id: 'p-2', displayName: '이서준', jerseyNumber: 14, position: null, goalkeeper: false },
              { id: 'p-3', displayName: '박도윤', jerseyNumber: 21, position: null, goalkeeper: false },
            ],
          }),
        ),
      );
    }

    it('체크하지 않은 벤치 선수는 제출 payload에서 빠진다', async () => {
      withBench();
      createMutateAsync.mockResolvedValue({ revisionId: 'rev-new', version: 4 });
      submitMutateAsync.mockResolvedValue({});
      render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

      fireEvent.click(screen.getByText('결과 작성 완료'));
      fireEvent.click(screen.getByText('제출하기'));

      await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
      const payload = createMutateAsync.mock.calls[0][0];
      expect(payload.actualParticipants.map((row: { participantId: string }) => row.participantId)).toEqual(['p-1']);
    });

    it('교체 출전을 체크한 벤치 선수는 started=false로 실린다', async () => {
      withBench();
      createMutateAsync.mockResolvedValue({ revisionId: 'rev-new', version: 4 });
      submitMutateAsync.mockResolvedValue({});
      render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

      fireEvent.click(screen.getByLabelText(/이서준/));
      fireEvent.click(screen.getByText('결과 작성 완료'));
      fireEvent.click(screen.getByText('제출하기'));

      await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
      const payload = createMutateAsync.mock.calls[0][0];
      expect(payload.actualParticipants).toEqual([
        { participantId: 'p-1', sideId: 'side-home', started: true, goals: 0, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
        { participantId: 'p-2', sideId: 'side-home', started: false, goals: 0, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
      ]);
    });

    it('출전하지 않은 선수는 득점자·MVP 드롭다운에 아예 나오지 않는다', () => {
      withBench();
      render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

      const mvp = screen.getByLabelText('5. MVP');
      expect(within(mvp).queryByText(/이서준/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText(/이서준/));
      expect(within(mvp).getByText(/이서준/)).toBeInTheDocument();
      // 체크하지 않은 나머지 벤치 선수는 여전히 후보에서 빠져 있다.
      expect(within(mvp).queryByText(/박도윤/)).not.toBeInTheDocument();
    });

    it('교체 출전 체크를 해제하면 그 선수에게 붙어 있던 득점·MVP도 함께 걷어낸다', async () => {
      withBench();
      createMutateAsync.mockResolvedValue({ revisionId: 'rev-new', version: 4 });
      submitMutateAsync.mockResolvedValue({});
      render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

      fireEvent.click(screen.getByLabelText(/이서준/));
      fireEvent.change(screen.getByLabelText('호스트팀 (홈)'), { target: { value: '1' } });
      fireEvent.change(screen.getAllByLabelText(/번 골$/)[0], { target: { value: 'p-2' } });
      fireEvent.change(screen.getByLabelText('5. MVP'), { target: { value: 'p-2' } });

      // 잘못 체크했음을 깨닫고 해제 — 결과에 없는 선수를 가리키는 득점자가 남으면 안 된다.
      fireEvent.click(screen.getByLabelText(/이서준/));
      expect(screen.getAllByLabelText(/번 골$/)[0]).toHaveValue('');
      expect(screen.getByLabelText('5. MVP')).toHaveValue('');

      fireEvent.click(screen.getByText('결과 작성 완료'));
      fireEvent.click(screen.getByText('제출하기'));

      await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
      const payload = createMutateAsync.mock.calls[0][0];
      // 골 수는 유지되고(스코어 1:0) 득점자만 미지정으로 돌아간다.
      expect(payload.score).toEqual({ home: 1, away: 0 });
      expect(payload.actualParticipants.map((row: { participantId: string }) => row.participantId)).toEqual(['p-1']);
      expect(payload.mvpParticipantId).toBeUndefined();
    });
  });

  it('DRAFT 상태에서는 재작성 폼 대신 제출 확인 카드를 보여주고, 제출하면 submitRevision을 호출한다', async () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([revision({ state: 'DRAFT', score: { regulation: { home: 0, away: 0 }, penalty: null, goals: [], incomplete: false } })]),
    );
    submitMutateAsync.mockResolvedValue({});
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);
    expect(screen.queryByText('결과 작성 완료')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('결과 제출하기'));
    await waitFor(() =>
      expect(submitMutateAsync).toHaveBeenCalledWith({ revisionId: 'rev-1', expectedVersion: 3 }),
    );
  });

  // 재설계된 흐름: 홈 점수 입력 -> 그 개수만큼 득점자 드롭다운 -> 제출 시 선수별
  // goals/cards 합계로 접혀서 기존 백엔드 계약(actualParticipants)에 실린다.
  it('홈 점수를 2로 입력하면 득점자 드롭다운이 2개 생기고, 득점자를 지정한 뒤 검토 화면에서 제출하면 선수별 합계로 접혀서 전송된다', async () => {
    createMutateAsync.mockResolvedValue({ revisionId: 'rev-new', version: 4 });
    submitMutateAsync.mockResolvedValue({});
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

    fireEvent.change(screen.getByLabelText('호스트팀 (홈)'), { target: { value: '2' } });
    const scorerSelects = screen.getAllByLabelText(/번 골$/);
    expect(scorerSelects).toHaveLength(2);
    fireEvent.change(scorerSelects[0], { target: { value: 'p-1' } });
    // 두 번째 골은 미지정(기본값)으로 남겨둔다 — 득점자 특정 없이도 제출 가능해야 한다.

    // P0-3: "결과 작성 완료"는 검토 단계로 넘어갈 뿐이고, 실제 제출은 검토 화면의
    // "제출하기"에서 createRevision -> submitRevision 순차 호출로 일어난다.
    fireEvent.click(screen.getByText('결과 작성 완료'));
    fireEvent.click(screen.getByText('제출하기'));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    const payload = createMutateAsync.mock.calls[0][0];
    expect(payload.score).toEqual({ home: 2, away: 0 });
    expect(payload.actualParticipants).toEqual([
      { participantId: 'p-1', sideId: 'side-home', started: true, goals: 1, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
    ]);
    await waitFor(() =>
      expect(submitMutateAsync).toHaveBeenCalledWith({ revisionId: 'rev-new', expectedVersion: 4 }),
    );
  });

  it('카드를 추가해 경고를 기록하고 MVP를 지정하면 검토 후 제출 payload에 반영된다', async () => {
    createMutateAsync.mockResolvedValue({ revisionId: 'rev-new', version: 4 });
    submitMutateAsync.mockResolvedValue({});
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

    fireEvent.click(screen.getByText('+ 카드 추가'));
    fireEvent.change(screen.getByLabelText('카드 대상 선수'), { target: { value: 'p-1' } });
    fireEvent.change(screen.getByLabelText('카드 종류'), { target: { value: 'yellow' } });
    fireEvent.change(screen.getByLabelText('5. MVP'), { target: { value: 'p-1' } });

    fireEvent.click(screen.getByText('결과 작성 완료'));
    fireEvent.click(screen.getByText('제출하기'));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    const payload = createMutateAsync.mock.calls[0][0];
    expect(payload.mvpParticipantId).toBe('p-1');
    expect(payload.actualParticipants).toEqual([
      { participantId: 'p-1', sideId: 'side-home', started: true, goals: 0, assists: 0, fouls: 0, cards: { yellow: 1, red: 0 }, goalkeeper: false },
    ]);
  });

  // P1 재현: "카드 추가"를 누르면 예전엔 roster[0]이 자동으로 선택돼, 실수로 엉뚱한 선수에게
  // 경고/퇴장을 기록해도 화면상 아무 표시가 없었다(카드 페널티는 다음 경기 출전정지로 이어질 수
  // 있어 득점자 미지정보다 훨씬 위험하다). 이제는 선수 미지정 placeholder로 추가되고, 지정하지
  // 않은 채로는 검토 단계로 넘어갈 수 없다.
  it('P1: 카드를 추가하면 선수 미지정 상태이고, 선수를 고르지 않으면 결과 작성 완료가 막힌다', () => {
    render(<TeamMatchResultPageClient teamMatchId="tm-1" />);

    fireEvent.click(screen.getByText('+ 카드 추가'));
    expect(screen.getByLabelText('카드 대상 선수')).toHaveValue('');

    fireEvent.click(screen.getByText('결과 작성 완료'));
    expect(screen.getByText('카드 기록에 아직 선수를 선택하지 않은 항목이 있어요.')).toBeInTheDocument();
    // 검토 화면으로 넘어가지 않는다 — 입력 폼이 여전히 보인다.
    expect(screen.getByText('결과 작성 완료')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('카드 대상 선수'), { target: { value: 'p-1' } });
    fireEvent.click(screen.getByText('결과 작성 완료'));
    expect(screen.getByText('작성한 결과를 확인해 주세요')).toBeInTheDocument();
  });
});

describe('TeamMatchResultApprovalPageClient — 상대팀 승인/정정 요청', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1TeamMatchMock.mockReturnValue(
      settledQuery(
        teamMatch({ viewer: { state: 'approved', manageableHostTeam: false, manageableOpponentTeam: true } }),
      ),
    );
    useV1GameMock.mockReturnValue(settledQuery(game()));
    // 승인 화면은 own-side 라인업을 쓰지 않지만(needsOwnLineup:false), 훅 자체는 항상 호출되므로
    // 목이 undefined를 반환하지 않도록 기본값을 채워 둔다.
    useV1TeamMatchLineupMock.mockReturnValue(settledQuery(lineup()));
  });

  it('제출된 결과가 있으면 승인/정정 요청 버튼을 보여준다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({ state: 'SUBMITTED', score: { regulation: { home: 2, away: 1 }, penalty: null, goals: [], incomplete: false }, submittedAt: '2026-08-01T00:00:00.000Z' }),
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
    useV1TeamMatchMock.mockReturnValue(
      settledQuery(teamMatch({ viewer: { state: 'none', manageableHostTeam: false, manageableOpponentTeam: false } })),
    );
    useV1GameResultRevisionsMock.mockReturnValue(settledQuery<V1GameResultRevision[]>([]));
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    expect(screen.getByText('상대팀만 결과를 승인할 수 있어요')).toBeInTheDocument();
  });

  // 리그 대진 회귀: 상대팀 매니저의 viewer.state 는 'none' 이지만 승인 권한은 있다.
  // 게이트가 state 기반으로 되돌아가면 이 화면 전체가 다시 막힌다.
  it('신청서를 직접 내지 않은 상대팀 매니저(리그 대진)도 승인 화면에 들어간다', () => {
    useV1TeamMatchMock.mockReturnValue(
      settledQuery(teamMatch({ viewer: { state: 'none', manageableHostTeam: false, manageableOpponentTeam: true } })),
    );
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({
          state: 'SUBMITTED',
          score: { regulation: { home: 2, away: 1 }, penalty: null, goals: [], incomplete: false },
          submittedAt: '2026-08-01T00:00:00.000Z',
        }),
      ]),
    );
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    expect(screen.queryByText('상대팀만 결과를 승인할 수 있어요')).not.toBeInTheDocument();
    expect(screen.getByText('승인하기')).toBeInTheDocument();
  });

  it('409 race: 승인 처리 중 그새 바뀐 버전 충돌을 actionable 메시지로 보여준다', async () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([revision({ state: 'SUBMITTED', score: { regulation: { home: 2, away: 1 }, penalty: null, goals: [], incomplete: false } })]),
    );
    decideRevisionRejects({ code: 'VERSION_CONFLICT', message: 'stale' });
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    // P0-4: "승인하기"는 확인 단계를 한 번 거친다 — 실제 승인 호출은 "승인 확정"에서 일어난다.
    fireEvent.click(screen.getByText('승인하기'));
    fireEvent.click(screen.getByText('승인 확정'));
    await waitFor(() =>
      expect(screen.getByText('그새 경기 상태가 바뀌었어요. 새로고침 후 다시 시도해 주세요.')).toBeInTheDocument(),
    );
  });

  // P0-4 재현: 예전에는 스코어와 GoalTimeline(이 화면의 결과에서는 항상 비어있는 레거시
  // 전용 필드)만 보고 "승인하기"를 누르면 바로 확정됐다 — 득점자·카드·MVP는 서버에 있지만
  // 화면에 전혀 안 보였다. 이제는 participantId 기반 요약이 보이고, 승인도 확인 단계를 거친다.
  it('P0-4: 제출된 결과의 득점자·MVP 요약을 보여주고, "승인하기"는 확인 단계 없이 바로 승인하지 않는다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({
          state: 'SUBMITTED',
          score: { home: 1, away: 0 },
          mvpParticipantId: 'p-1',
          resultParticipants: [
            {
              id: 'rp-1',
              resultRevisionId: 'rev-1',
              participantId: 'p-1',
              sideId: 'side-home',
              started: true,
              minutesPlayed: null,
              goals: 1,
              assists: 0,
              fouls: 0,
              cards: { yellow: 0, red: 0 },
              goalkeeper: false,
            },
          ],
        }),
      ]),
    );
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);

    expect(screen.getByText(/선수 #p-1.*1골/)).toBeInTheDocument();
    expect(screen.getByText('선수 #p-1')).toBeInTheDocument(); // MVP 줄

    // 원클릭 승인이 아니다 — 아직 decideMutateAsync가 호출되지 않는다.
    fireEvent.click(screen.getByText('승인하기'));
    expect(decideMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('승인 확정')).toBeInTheDocument();
  });

  // 감사 백로그 M-E 재현: 승인 전(SUBMITTED)에는 보이던 득점자·MVP 요약이 "승인하기"를
  // 눌러 OFFICIAL로 확정된 순간 사라졌다 — 승인 화면은 호스트 라인업을 조회할 수 없으므로
  // (roster 없음) 이전과 같은 participantId 라벨로라도 계속 보여야 한다.
  it('OFFICIAL 확정 후에도 승인 화면은 득점자·MVP 요약을 계속 보여준다', () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({
          state: 'OFFICIAL',
          score: { home: 1, away: 0 },
          officialAt: '2026-08-01T01:00:00.000Z',
          mvpParticipantId: 'p-1',
          resultParticipants: [
            {
              id: 'rp-1',
              resultRevisionId: 'rev-1',
              participantId: 'p-1',
              sideId: 'side-home',
              started: true,
              minutesPlayed: null,
              goals: 1,
              assists: 0,
              fouls: 0,
              cards: { yellow: 0, red: 0 },
              goalkeeper: false,
            },
          ],
        }),
      ]),
    );
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('공식 결과로 확정됐어요')).toBeInTheDocument();
    expect(screen.getByText(/선수 #p-1.*1골/)).toBeInTheDocument();
    expect(screen.getByText('선수 #p-1')).toBeInTheDocument(); // MVP 줄
  });

  it('정정 요청은 사유 입력 전에는 비활성화, 입력 후 전송된다', async () => {
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([revision({ state: 'SUBMITTED', score: { regulation: { home: 2, away: 1 }, penalty: null, goals: [], incomplete: false } })]),
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
        revision({ state: 'OFFICIAL', score: { regulation: { home: 2, away: 1 }, penalty: null, goals: [], incomplete: false }, officialAt: '2026-08-01T01:00:00.000Z' }),
      ]),
    );
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    expect(screen.getByText(/개인 기록·팀 전적 반영에는/)).toBeInTheDocument();
  });

  it('제출/확정 결과 모두 골이 있어도 "어시스트 미기입" 경고를 띄우지 않는다 (친선 자가 제출은 어시스트 입력란이 없음)', () => {
    const goalsOnlyParticipants = [
      { id: 'rp-1', resultRevisionId: 'rev-1', participantId: 'p-1', sideId: 'side-home', started: true, minutesPlayed: null, goals: 2, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
    ];
    useV1GameResultRevisionsMock.mockReturnValue(
      settledQuery<V1GameResultRevision[]>([
        revision({
          state: 'SUBMITTED',
          score: { regulation: { home: 2, away: 1 }, penalty: null, goals: [], incomplete: false },
          submittedAt: '2026-08-01T00:00:00.000Z',
          resultParticipants: goalsOnlyParticipants,
        }),
      ]),
    );
    render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
    expect(screen.queryByText(/어시스트 미기입/)).not.toBeInTheDocument();
  });
});

function decideRevisionRejects(error: unknown) {
  decideMutateAsync.mockRejectedValue(error);
}

function leagueInfo(overrides: Record<string, unknown> = {}) {
  return {
    leagueId: 'league-1',
    title: '테스트 리그',
    disputeDeadline: '2026-08-08T00:00:00.000Z',
    disputeBlockedReason: null,
    openDisputeExists: false,
    ...overrides,
  };
}

// U3-A안: 리그 대진은 호스트/상대 두 진입점 모두 같은 "확정 영수증 + 이의 D-day 카드"
// 뷰로 합류한다 — "호스트만 입력"/"상대팀만 승인" 프레이밍과 "승인하기" 버튼이 아예
// 뜨면 안 된다.
describe('리그 대진 결과 - 확정 영수증 + 이의 D-day 카드 (U3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useV1GameMock.mockReturnValue(settledQuery(game()));
    useV1TeamMatchLineupMock.mockReturnValue(settledQuery(lineup()));
  });

  function renderReceipt(
    entry: 'host' | 'approval',
    viewerOverrides: Record<string, unknown> = {},
    leagueOverrides: Record<string, unknown> = {},
    revisions: V1GameResultRevision[] = [],
  ) {
    useV1TeamMatchMock.mockReturnValue(
      settledQuery(
        teamMatch({
          league: leagueInfo(leagueOverrides),
          viewer: {
            state: 'none',
            manageableHostTeam: false,
            manageableOpponentTeam: false,
            participantMember: true,
            ...viewerOverrides,
          },
        }),
      ),
    );
    useV1GameResultRevisionsMock.mockReturnValue(settledQuery<V1GameResultRevision[]>(revisions));
    return entry === 'host'
      ? render(<TeamMatchResultPageClient teamMatchId="tm-1" />)
      : render(<TeamMatchResultApprovalPageClient teamMatchId="tm-1" />);
  }

  it.each([
    ['host' as const, '호스트만 결과를 입력할 수 있어요'],
    ['approval' as const, '상대팀만 결과를 승인할 수 있어요'],
  ])('%s 진입점도 리그 대진이면 "%s" 문구 대신 확정 영수증을 보여준다', (entry, gatedText) => {
    renderReceipt(
      entry,
      { manageableHostTeam: entry === 'host', manageableOpponentTeam: entry === 'approval' },
      {},
      [revision({ state: 'OFFICIAL', score: { home: 2, away: 1 }, officialAt: '2026-08-01T00:00:00.000Z' })],
    );
    expect(screen.getByText('공식 결과로 확정됐어요')).toBeInTheDocument();
    expect(screen.queryByText(gatedText)).not.toBeInTheDocument();
    expect(screen.queryByText('승인하기')).not.toBeInTheDocument();
    expect(screen.queryByText('결과 작성 완료')).not.toBeInTheDocument();
  });

  it('아직 공식 결과가 없으면 "운영자가 입력하면 표시된다"는 빈 상태를 보여준다', () => {
    renderReceipt('host', { manageableHostTeam: true }, {}, []);
    expect(screen.getByText('아직 결과가 없어요')).toBeInTheDocument();
    expect(screen.getByText('운영자가 결과를 입력하면 여기에 표시돼요.')).toBeInTheDocument();
  });

  it('참가팀 멤버가 아니면 결과 대신 접근 제한 안내를 보여준다', () => {
    renderReceipt('host', { participantMember: false }, {}, []);
    expect(screen.getByText('참가팀만 볼 수 있어요')).toBeInTheDocument();
    expect(screen.queryByText('아직 결과가 없어요')).not.toBeInTheDocument();
  });

  it('무효 처리된 결과는 무효 안내를 보여준다', () => {
    renderReceipt('host', {}, {}, [revision({ state: 'VOID', reason: '오심 확인' })]);
    expect(screen.getByText('이 결과는 무효 처리됐어요')).toBeInTheDocument();
    // 무효 사유는 이 카드와 아래 변경 이력 두 곳에 함께 나온다.
    expect(screen.getAllByText('오심 확인').length).toBeGreaterThan(0);
  });

  it('마감 전 + 미차단이면 D-day 배지와 이의 제기 버튼을 보여준다(권한 있음)', () => {
    renderReceipt(
      'host',
      { manageableHostTeam: true },
      { disputeDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(), disputeBlockedReason: null },
      [revision({ state: 'OFFICIAL', score: { home: 2, away: 1 }, officialAt: '2026-08-01T00:00:00.000Z' })],
    );
    expect(screen.getByText(/^D-\d+$/)).toBeInTheDocument();
    expect(screen.getByText('이의 제기')).toBeInTheDocument();
  });

  it('마감 전이어도 owner/manager가 아니면 이의 제기 버튼을 숨긴다', () => {
    renderReceipt(
      'host',
      { manageableHostTeam: false, manageableOpponentTeam: false },
      { disputeDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(), disputeBlockedReason: null },
      [revision({ state: 'OFFICIAL', score: { home: 2, away: 1 }, officialAt: '2026-08-01T00:00:00.000Z' })],
    );
    expect(screen.queryByText('이의 제기')).not.toBeInTheDocument();
  });

  it('disputeBlockedReason=window_expired이면 회색 톤으로 기간 만료 안내를 보여준다', () => {
    renderReceipt(
      'host',
      { manageableHostTeam: true },
      { disputeBlockedReason: 'window_expired' },
      [revision({ state: 'OFFICIAL', score: { home: 2, away: 1 }, officialAt: '2026-07-01T00:00:00.000Z' })],
    );
    expect(screen.getByText('이의 제기 기간이 지났어요')).toBeInTheDocument();
    expect(screen.queryByText('이의 제기')).not.toBeInTheDocument();
  });

  it('disputeBlockedReason=promotion_committed이면 승강 확정 안내를 보여준다', () => {
    renderReceipt(
      'host',
      { manageableHostTeam: true },
      { disputeBlockedReason: 'promotion_committed' },
      [revision({ state: 'OFFICIAL', score: { home: 2, away: 1 }, officialAt: '2026-08-01T00:00:00.000Z' })],
    );
    expect(screen.getByText('승강이 확정되어 이의를 제기할 수 없어요')).toBeInTheDocument();
    expect(screen.queryByText('이의 제기')).not.toBeInTheDocument();
  });

  it('openDisputeExists=true이면 접수 확인 안내를 보여주고 버튼은 숨긴다', () => {
    renderReceipt(
      'host',
      { manageableHostTeam: true },
      { openDisputeExists: true },
      [revision({ state: 'OFFICIAL', score: { home: 2, away: 1 }, officialAt: '2026-08-01T00:00:00.000Z' })],
    );
    expect(screen.getByText('접수된 이의를 운영자가 확인하고 있어요')).toBeInTheDocument();
    expect(screen.queryByText('이의 제기')).not.toBeInTheDocument();
  });

  it('이의 제기 폼을 제출하면 올바른 사유로 mutation을 호출하고, 성공하면 접수 안내로 바뀐다', async () => {
    fileDisputeMutateAsync.mockResolvedValue({ id: 'dispute-1', leagueId: 'league-1', teamMatchId: 'tm-1', status: 'open', createdAt: '2026-08-01T00:00:00.000Z' });
    renderReceipt(
      'host',
      { manageableHostTeam: true },
      { disputeDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(), disputeBlockedReason: null },
      [revision({ state: 'OFFICIAL', score: { home: 2, away: 1 }, officialAt: '2026-08-01T00:00:00.000Z' })],
    );

    fireEvent.click(screen.getByText('이의 제기'));
    fireEvent.change(screen.getByLabelText('이의 사유'), { target: { value: '심판 판정에 문제가 있었어요' } });
    fireEvent.click(screen.getByText('이의 제기 보내기'));

    await waitFor(() => expect(fileDisputeMutateAsync).toHaveBeenCalledWith({ reason: '심판 판정에 문제가 있었어요' }));
    await waitFor(() => expect(screen.getByText('접수된 이의를 운영자가 확인하고 있어요')).toBeInTheDocument());
  });

  it('이의 제기가 서버에서 거부되면(409) 에러 메시지를 보여주고 폼은 유지한다', async () => {
    fileDisputeMutateAsync.mockRejectedValue({ code: 'LEAGUE_RESULT_DISPUTE_ALREADY_OPEN', message: '이미 있음' });
    renderReceipt(
      'host',
      { manageableHostTeam: true },
      { disputeDeadline: new Date(Date.now() + 3 * 86_400_000).toISOString(), disputeBlockedReason: null },
      [revision({ state: 'OFFICIAL', score: { home: 2, away: 1 }, officialAt: '2026-08-01T00:00:00.000Z' })],
    );

    fireEvent.click(screen.getByText('이의 제기'));
    fireEvent.change(screen.getByLabelText('이의 사유'), { target: { value: '사유' } });
    fireEvent.click(screen.getByText('이의 제기 보내기'));

    await waitFor(() => expect(screen.getByText('이미 처리 대기 중인 이의가 있어요.')).toBeInTheDocument());
    expect(screen.getByText('이의 제기 보내기')).toBeInTheDocument();
  });
});

describe('scoreLabel', () => {
  // 스코어는 score.regulation 아래에 있다. 예전 구현은 score.home 을 읽어서 화면에
  // "undefined : undefined" 를 그렸는데, 목이 같은 잘못된 형태를 쓰고 있어 테스트는 초록이었다.
  // 이 테스트는 서버가 실제로 보내는 스냅샷 형태를 그대로 넣는다 — 되돌리면 반드시 깨진다.
  const snapshot = (regulation: { home: number; away: number } | null): V1GameResultRevision =>
    ({
      score: { regulation, penalty: null, goals: [], incomplete: regulation === null },
    }) as unknown as V1GameResultRevision;

  it('renders the regulation score from the response snapshot shape', () => {
    expect(scoreLabel(snapshot({ home: 2, away: 1 }))).toBe('2 : 1');
    expect(scoreLabel(snapshot({ home: 0, away: 0 }))).toBe('0 : 0');
  });

  it('never renders undefined when regulation is absent', () => {
    const label = scoreLabel(snapshot(null));
    expect(label).not.toContain('undefined');
    expect(label).toBe('기록 없음');
  });

  // team-match 결과 입력 화면(이 파일)이 만든 결과는 백엔드가 score를 감싸지 않고
  // {home, away} 그대로 저장/반환한다(CreateGameResultRevisionDto.score, 라이브 DB에서
  // {"away":1,"home":3} 형태로 확인, 2026-08 QA 재현). regulation만 읽던 이전 구현은 이
  // 경로에서 실제로 저장된 점수가 있어도 "기록 없음"을 표시했다 — 이 테스트는 그 실사고를
  // 재현한다.
  it('renders the flat {home, away} shape this screen\'s own submissions actually produce', () => {
    const flatRevision = { score: { home: 3, away: 1 } } as unknown as V1GameResultRevision;
    expect(scoreLabel(flatRevision)).toBe('3 : 1');
  });
});


describe('displayRevisionReason — 내부 마커 표시 제거', () => {
  // 서버는 멱등 판정용으로 reason 앞에 [LEAGUE_RESULT_ENTRY]/[LEAGUE_RESULT_CORRECTION]
  // 마커를 붙여 저장한다. 화면이 그걸 그대로 렌더해 내부 식별자가 사용자에게 노출됐다
  // (2026-08-25 alpha 실측). 저장값은 못 바꾸므로 표시에서 벗긴다.
  it('맨 앞의 대문자 마커를 벗기고 본문만 남긴다', async () => {
    const { displayRevisionReason } = await import('./team-match-result.types');
    expect(displayRevisionReason('[LEAGUE_RESULT_CORRECTION] 검증: 스코어 정정')).toBe('검증: 스코어 정정');
    expect(displayRevisionReason('[LEAGUE_RESULT_ENTRY] 1주차 입력')).toBe('1주차 입력');
  });

  it('마커가 없거나 사용자가 쓴 소문자 대괄호 사유는 건드리지 않는다', async () => {
    const { displayRevisionReason } = await import('./team-match-result.types');
    expect(displayRevisionReason('상대 요청으로 정정')).toBe('상대 요청으로 정정');
    expect(displayRevisionReason('[비고] 우천 단축')).toBe('[비고] 우천 단축');
    expect(displayRevisionReason(null)).toBe('');
  });
});
