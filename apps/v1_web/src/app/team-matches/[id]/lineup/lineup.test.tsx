import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1TeamMatchLineup } from '@/types/api';
import {
  addGuestToBench,
  addGuestToStarters,
  addRosterMemberToBench,
  addRosterMemberToStarters,
  applySaveResult,
  applyVersionConflictReload,
  buildSavePayload,
  createEmptyLineupEditorState,
  deriveLineupCounts,
  describeLineupPhase,
  describePublicationCountdown,
  extractConflictCurrentVersion,
  hydrateLineupEditorState,
  isRosterMemberPlaced,
  moveEntry,
  removeEntry,
  resolveOwnTeamId,
  setGoalkeeper,
  setJerseyNumber,
  validateLineupForSubmit,
} from './lineup.view-model';

// ─────────────────────────────────────────────────────────────────────────────
// 1. 순수 view-model / reducer 유닛 테스트 — 네트워크·React 없이 상태 전이만 검증한다.
// ─────────────────────────────────────────────────────────────────────────────

const rosterMember = { userId: 'user-1', displayName: '홍길동', role: 'member' as const };
const rosterMember2 = { userId: 'user-2', displayName: '김철수', role: 'member' as const };

describe('lineup.view-model', () => {
  it('creates an empty editable state pinned to the given base revision', () => {
    const state = createEmptyLineupEditorState(3);
    expect(state).toEqual({ starters: [], bench: [], baseRevision: 3, dirty: false });
  });

  it('hydrates from a server lineup without leaking a userId (server never echoes it back)', () => {
    const lineup: V1TeamMatchLineup = {
      teamMatchId: 'tm-1',
      gameId: 'game-1',
      sideId: 'side-1',
      role: 'team_manager',
      lineupId: 'lineup-1',
      revision: 2,
      state: 'DRAFT',
      version: 2,
      publicLineupAt: null,
      starters: [{ id: 'participant-1', displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true }],
      bench: [{ id: 'participant-bench-1', displayName: '게스트', jerseyNumber: null }],
    };
    const state = hydrateLineupEditorState(lineup);
    expect(state.baseRevision).toBe(2);
    expect(state.dirty).toBe(false);
    expect(state.starters).toEqual([
      expect.objectContaining({ userId: null, displayName: '홍길동', jerseyNumber: 1, goalkeeper: true }),
    ]);
    expect(state.bench).toEqual([expect.objectContaining({ userId: null, displayName: '게스트' })]);
  });

  it('prevents placing the same roster member twice — a duplicate add is a structural no-op', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToStarters(state, rosterMember);
    expect(state.starters).toHaveLength(1);

    const again = addRosterMemberToStarters(state, rosterMember);
    expect(again).toBe(state); // 참조 동일 — 아무 것도 바뀌지 않았다
    expect(again.starters).toHaveLength(1);

    // 이미 선발에 있으면 후보로도 추가되지 않는다 (같은 사람이 두 슬롯에 동시에 있을 수 없다)
    const benchAttempt = addRosterMemberToBench(state, rosterMember);
    expect(benchAttempt).toBe(state);
  });

  it('ignores a blank guest name and adds a trimmed one', () => {
    let state = createEmptyLineupEditorState(0);
    expect(addGuestToBench(state, '   ')).toBe(state);
    state = addGuestToStarters(state, '  게스트A  ');
    expect(state.starters[0]).toEqual(expect.objectContaining({ userId: null, displayName: '게스트A' }));
  });

  it('removes an entry by its stable key', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToStarters(state, rosterMember);
    const key = state.starters[0].key;
    state = removeEntry(state, 'starter', key);
    expect(state.starters).toHaveLength(0);
  });

  it('moves an entry between starters and bench, clearing goalkeeper on demotion', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToStarters(state, rosterMember);
    state = setGoalkeeper(state, state.starters[0].key);
    expect(state.starters[0].goalkeeper).toBe(true);

    state = moveEntry(state, 'starter', state.starters[0].key, 'bench');
    expect(state.starters).toHaveLength(0);
    expect(state.bench).toHaveLength(1);
    expect(state.bench[0].goalkeeper).toBe(false);
  });

  it('keeps exactly one goalkeeper among starters (radio semantics)', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToStarters(state, rosterMember);
    state = addRosterMemberToStarters(state, rosterMember2);
    state = setGoalkeeper(state, state.starters[0].key);
    state = setGoalkeeper(state, state.starters[1].key);
    expect(state.starters[0].goalkeeper).toBe(false);
    expect(state.starters[1].goalkeeper).toBe(true);
  });

  it('derives starter/bench/waiting counts from one merged view', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToStarters(state, rosterMember);
    const counts = deriveLineupCounts(state, [rosterMember, rosterMember2]);
    expect(counts).toEqual({ starterCount: 1, benchCount: 0, waitingCount: 1, totalRoster: 2 });
  });

  it('flags a lineup with no goalkeeper, duplicate jersey numbers, or an empty roster', () => {
    expect(validateLineupForSubmit(createEmptyLineupEditorState(0))).toContain(
      '선발 명단을 최소 한 명 이상 등록해 주세요.',
    );

    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToStarters(state, rosterMember);
    state = addRosterMemberToStarters(state, rosterMember2);
    state = setJerseyNumber(state, 'starter', state.starters[0].key, 7);
    state = setJerseyNumber(state, 'starter', state.starters[1].key, 7);
    const errors = validateLineupForSubmit(state);
    expect(errors).toContain('선발 라인업에 골키퍼를 한 명 지정해 주세요.');
    expect(errors).toContain('등번호가 중복돼요. 등번호는 서로 달라야 해요.');

    state = setGoalkeeper(state, state.starters[0].key);
    expect(validateLineupForSubmit(state)).not.toContain('선발 라인업에 골키퍼를 한 명 지정해 주세요.');
  });

  it('builds a save payload carrying userId only for linked entries', () => {
    let state = createEmptyLineupEditorState(4);
    state = addRosterMemberToStarters(state, rosterMember);
    state = addGuestToBench(state, '게스트A');
    state = setGoalkeeper(state, state.starters[0].key);
    const payload = buildSavePayload(state);
    expect(payload).toEqual({
      expectedVersion: 4,
      starters: [{ userId: 'user-1', displayName: '홍길동', goalkeeper: true }],
      bench: [{ displayName: '게스트A' }],
    });
  });

  it('advances the CAS token after a save ack without touching local edits', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToStarters(state, rosterMember);
    const saved = applySaveResult(state, { revision: 1 });
    expect(saved.baseRevision).toBe(1);
    expect(saved.dirty).toBe(false);
    expect(saved.starters).toBe(state.starters);
  });

  it('reloads from the server on a version conflict (full rehydrate, not a partial merge)', () => {
    const lineup: V1TeamMatchLineup = {
      teamMatchId: 'tm-1',
      gameId: 'game-1',
      sideId: 'side-1',
      role: 'team_manager',
      lineupId: 'lineup-2',
      revision: 5,
      state: 'DRAFT',
      version: 5,
      publicLineupAt: null,
      starters: [],
      bench: [],
    };
    const reloaded = applyVersionConflictReload(lineup);
    expect(reloaded.baseRevision).toBe(5);
    expect(reloaded.dirty).toBe(false);
  });

  it('reads currentVersion out of the 409 details payload (and tolerates a flat legacy shape)', () => {
    expect(extractConflictCurrentVersion({ expectedVersion: 0, currentVersion: 3 })).toBe(3);
    expect(extractConflictCurrentVersion(null)).toBeNull();
    expect(extractConflictCurrentVersion({ currentVersion: 'not-a-number' })).toBeNull();
  });

  it('describes the publication countdown relative to now', () => {
    const now = new Date('2026-08-10T10:00:00.000Z').getTime();
    expect(describePublicationCountdown(null, now)).toBeNull();
    expect(describePublicationCountdown('2026-08-10T10:30:00.000Z', now)).toBe('30분 후 공개돼요.');
    expect(describePublicationCountdown('2026-08-10T09:00:00.000Z', now)).toBe('라인업이 공개됐어요.');
  });

  it('gates editability by lineup state and kickoff deadline', () => {
    expect(describeLineupPhase('DRAFT', false).editable).toBe(true);
    expect(describeLineupPhase('DRAFT', true).editable).toBe(false);
    expect(describeLineupPhase('SUBMITTED', false).editable).toBe(false);
    expect(describeLineupPhase('LOCKED', false).editable).toBe(false);
  });

  it('resolves which team is "mine" for this match from host/opponent + my memberships', () => {
    const teamMatch = { hostTeamId: 'team-host', approvedOpponentTeam: { teamId: 'team-away' } };
    expect(
      resolveOwnTeamId(teamMatch, [{ teamId: 'team-away', role: 'manager' }]),
    ).toBe('team-away');
    expect(resolveOwnTeamId(teamMatch, [{ teamId: 'team-away', role: 'member' }])).toBeNull();
    expect(resolveOwnTeamId(teamMatch, undefined)).toBeNull();
  });

  it('accepts the paginated { items } shape useV1MyTeams actually returns', () => {
    // GET /me/teams 는 배열이 아니라 { items: [...] } 를 돌려준다. 이걸 언랩하지 않고 넘기면
    // 예전 구현은 `myTeams.find is not a function` 으로 라인업/팀매치 화면 전체를 죽였다.
    const teamMatch = { hostTeamId: 'team-host', approvedOpponentTeam: { teamId: 'team-away' } };
    expect(
      resolveOwnTeamId(teamMatch, { items: [{ teamId: 'team-host', role: 'owner' }] }),
    ).toBe('team-host');
    expect(resolveOwnTeamId(teamMatch, { items: [] })).toBeNull();
  });

  it('isRosterMemberPlaced matches deriveLineupCounts waiting logic', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToStarters(state, rosterMember);
    expect(isRosterMemberPlaced(state, rosterMember)).toBe(true);
    expect(isRosterMemberPlaced(state, rosterMember2)).toBe(false);
  });

  // ── Blocker 1 regression: reopen-a-saved-draft must not allow duplicate placement ──
  // GET .../lineup never echoes userId back (Task 14 stores only displayName snapshots),
  // so hydrateLineupEditorState() always produces userId: null starters/bench. Before this
  // fix, isPlaced()/addRosterMemberToStarters()/addRosterMemberToBench() compared strictly by
  // entry.userId === member.userId — which is never true post-hydrate — so a previously
  // placed roster member reappeared in the addable list and could be added a second time as
  // a distinct row. Reverting the entry.displayName fallback in matchesRosterMember (i.e.
  // going back to a strict userId-only comparison) makes every assertion below fail.
  it('hydrate-then-add: a roster member already present in a rehydrated (reopened) draft cannot be re-added as a duplicate', () => {
    const lineup: V1TeamMatchLineup = {
      teamMatchId: 'tm-1',
      gameId: 'game-1',
      sideId: 'side-1',
      role: 'team_manager',
      lineupId: 'lineup-1',
      revision: 3,
      state: 'DRAFT',
      version: 3,
      publicLineupAt: null,
      starters: [{ id: 'participant-2', displayName: rosterMember.displayName, jerseyNumber: 7, position: null, goalkeeper: true }],
      bench: [],
    };
    let state = hydrateLineupEditorState(lineup);
    // Sanity: the rehydrated starter really did lose its userId (server contract).
    expect(state.starters[0].userId).toBeNull();

    // The waiting/addable pool must already exclude this roster member post-hydrate...
    expect(isRosterMemberPlaced(state, rosterMember)).toBe(true);
    const counts = deriveLineupCounts(state, [rosterMember, rosterMember2]);
    expect(counts.waitingCount).toBe(1);

    // ...and attempting to add them again is a structural no-op on both the starting XI
    // and the bench — the exact scenario that used to create a second V1GameParticipant row.
    const afterStarterAttempt = addRosterMemberToStarters(state, rosterMember);
    expect(afterStarterAttempt).toBe(state);
    expect(afterStarterAttempt.starters).toHaveLength(1);

    const afterBenchAttempt = addRosterMemberToBench(state, rosterMember);
    expect(afterBenchAttempt).toBe(state);
    expect(afterBenchAttempt.bench).toHaveLength(0);

    // A genuinely different roster member is unaffected and can still be added.
    state = addRosterMemberToStarters(state, rosterMember2);
    expect(state.starters).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 컴포넌트 테스트 — owner/manager/member 권한, 강제 409, 네트워크 단절
// ─────────────────────────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  useV1TeamMatchMock: vi.fn(),
  useV1MyTeamsMock: vi.fn(),
  useV1TeamMatchLineupMock: vi.fn(),
  useV1TeamMembersMock: vi.fn(),
  saveMutate: vi.fn(),
  submitMutate: vi.fn(),
  changeRequestMutate: vi.fn(),
  refetchLineup: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/team-matches/tm-1/lineup',
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatch: hoisted.useV1TeamMatchMock,
  useV1MyTeams: hoisted.useV1MyTeamsMock,
  useV1TeamMatchLineup: hoisted.useV1TeamMatchLineupMock,
  useV1TeamMembers: hoisted.useV1TeamMembersMock,
  useV1SaveTeamMatchLineup: () => ({ mutate: hoisted.saveMutate, isPending: false }),
  useV1SubmitTeamMatchLineup: () => ({ mutate: hoisted.submitMutate, isPending: false }),
  useV1RequestTeamMatchLineupChange: () => ({ mutate: hoisted.changeRequestMutate, isPending: false }),
  // AppChrome 헤더/데스크톱 nav의 알림 벨이 호출한다 — 라인업 화면과 무관하지만 모듈 전체를
  // 모킹하는 이상 실제로 렌더되는 하위 트리가 쓰는 훅도 채워줘야 한다.
  useV1NotificationUnreadSummary: () => ({ data: undefined }),
}));

import { TeamMatchLineupPageClient } from './lineup-client';

function futureIso(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function baseTeamMatch() {
  return {
    id: 'tm-1',
    teamMatchId: 'tm-1',
    title: '주말 친선 팀매치',
    sportName: '풋살',
    startsAt: futureIso(180),
    placeName: '잠실 풋살파크',
    capacityText: '11:11',
    status: 'open',
    hostTeamId: 'team-host',
    approvedOpponentTeam: { teamId: 'team-away', name: '상대팀', applicationId: 'app-1' },
  };
}

function baseLineup(overrides: Partial<V1TeamMatchLineup> = {}): V1TeamMatchLineup {
  return {
    teamMatchId: 'tm-1',
    gameId: 'game-1',
    sideId: 'side-host',
    role: 'team_manager',
    lineupId: null,
    revision: 0,
    state: 'DRAFT',
    version: 0,
    publicLineupAt: null,
    starters: [],
    bench: [],
    ...overrides,
  };
}

describe('TeamMatchLineupPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.useV1TeamMatchMock.mockReturnValue({ data: baseTeamMatch(), isLoading: false, isError: false });
    hoisted.useV1MyTeamsMock.mockReturnValue({ data: [{ teamId: 'team-host', role: 'manager' }], isLoading: false });
    hoisted.useV1TeamMembersMock.mockReturnValue({
      data: { items: [{ membershipId: 'm-1', userId: 'user-1', displayName: '홍길동', role: 'member', status: 'active' }] },
      isLoading: false,
    });
    hoisted.refetchLineup.mockResolvedValue({ data: baseLineup() });
  });

  it('owner/manager: lets a manager place a waiting roster member into the starting lineup', async () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('초안')).toBeInTheDocument();
    expect(screen.getByText('선발 (0)')).toBeInTheDocument();
    expect(screen.getByText('추가 가능한 팀원 (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '선발 추가' }));

    expect(screen.getByText('선발 (1)')).toBeInTheDocument();
    // 배치되고 나면 대기 목록에서 사라진다 — 같은 사람을 두 번 추가할 방법 자체가 없다.
    expect(screen.getByText('추가할 수 있는 팀원이 없어요')).toBeInTheDocument();
  });

  it('member (non-manager): shows a permission-denied state instead of the editor', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new V1ApiError({
        status: 'error',
        statusCode: 403,
        code: 'PERMISSION_DENIED',
        message: '팀장 또는 매니저만 라인업을 관리할 수 있어요.',
        timestamp: '2026-08-01T00:00:00.000Z',
      }),
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('팀장 또는 매니저만 라인업을 관리할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByLabelText('게스트 이름')).not.toBeInTheDocument();
  });

  it('forced 409: a stale submit shows the version-conflict banner, and "새로고침" reloads from the server', async () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        revision: 0,
        starters: [{ id: 'participant-1', displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true }],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    fireEvent.click(screen.getByRole('button', { name: '라인업 제출하기' }));
    expect(hoisted.submitMutate).toHaveBeenCalledTimes(1);

    const onError = hoisted.submitMutate.mock.calls[0][1].onError;
    act(() => {
      onError(
        new V1ApiError({
          status: 'error',
          statusCode: 409,
          code: 'VERSION_CONFLICT',
          message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
          details: { expectedVersion: 0, currentVersion: 2 },
          timestamp: '2026-08-01T00:00:00.000Z',
        }),
      );
    });

    expect(screen.getByText('라인업이 그새 변경됐어요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

    await waitFor(() => expect(hoisted.refetchLineup).toHaveBeenCalled());
    expect(screen.queryByText('라인업이 그새 변경됐어요.')).not.toBeInTheDocument();
  });

  it('network loss: going offline blocks editing and surfaces an offline banner', async () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);
    // 게스트 이름 입력은 editable일 때만 렌더된다(포메이션 입력은 존재하지 않는다 — Task 15
    // blocker-2: `V1GameLineup`에 저장할 컬럼이 없어 눈속임 필드를 남기지 않고 제거했다).
    expect(screen.getByLabelText('게스트 이름')).toBeInTheDocument();

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    expect(
      screen.getByText('오프라인 상태예요. 연결이 끊긴 동안 변경사항은 저장되지 않아요.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('게스트 이름')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '라인업 제출하기' })).not.toBeInTheDocument();

    // 이 스위트의 다음 테스트가 온라인 상태를 전제하므로 복원한다 — navigator.onLine은
    // jsdom 전역이라 defineProperty로 false를 박아두면 테스트 간에 그대로 새어나간다.
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    });
  });

  // ── Blocker 4 regression: autosave must serialize overlapping saves ──
  // Before this fix, the debounce timer called saveMutation.mutate() unconditionally. On a
  // slow connection, a second edit made before the first save's ack would fire a second
  // concurrent save carrying the same (not-yet-bumped) expectedVersion — a spurious
  // self-inflicted 409 VERSION_CONFLICT, whose "새로고침" then discards the user's newest
  // edit (full reload, not a merge). Removing the saveInFlightRef/saveQueuedRef guard (i.e.
  // calling saveMutation.mutate directly from the debounce timer again) makes this fail: the
  // second assertion below would see 2 calls instead of 1.
  it('autosave in-flight guard: a second edit made before the first save acks is queued, not fired concurrently', () => {
    // 이 스위트의 온라인 상태 전제를 테스트 실행 순서와 무관하게 보장한다.
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    vi.useFakeTimers();
    try {
      hoisted.useV1TeamMatchLineupMock.mockReturnValue({
        data: baseLineup(),
        isLoading: false,
        isError: false,
        error: null,
        refetch: hoisted.refetchLineup,
      });
      hoisted.useV1TeamMembersMock.mockReturnValue({
        data: {
          items: [
            { membershipId: 'm-1', userId: 'user-1', displayName: '홍길동', role: 'member', status: 'active' },
            { membershipId: 'm-2', userId: 'user-2', displayName: '김철수', role: 'member', status: 'active' },
          ],
        },
        isLoading: false,
      });

      render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

      // 첫 번째 편집 → 디바운스 뒤 첫 저장이 나간다.
      fireEvent.click(screen.getAllByRole('button', { name: '선발 추가' })[0]);
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);

      // 첫 저장이 아직 ack되지 않은 상태에서 두 번째 편집 → 디바운스가 다시 지나가도
      // 두 번째 저장은 즉시 나가지 않고 큐에만 쌓인다(동시 dispatch 금지).
      fireEvent.click(screen.getByRole('button', { name: '선발 추가' }));
      act(() => {
        vi.advanceTimersByTime(900);
      });
      expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);

      // 첫 저장이 서버 ack로 끝나면, 큐에 쌓여 있던 두 번째 저장이 최신 상태로 이어서 나간다.
      // onSuccess와 onSettled을 별도 act()로 분리해 React가 onSuccess의 setState를 실제로
      // 커밋하게 한다 — 그래야 "이 save가 나간 뒤 생긴 두 번째 편집은 onSuccess가 dirty를
      // 지워도 되살아나야 한다"는 부분까지 검증된다(합쳐서 한 act()로 부르면 onSettled의
      // 재귀 호출이 아직 커밋되지 않은 이전 렌더의 ref 값을 읽어 이 부분을 우회해버린다).
      act(() => {
        hoisted.saveMutate.mock.calls[0][1].onSuccess({ revision: 1 });
      });
      act(() => {
        hoisted.saveMutate.mock.calls[0][1].onSettled();
      });
      expect(hoisted.saveMutate).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
