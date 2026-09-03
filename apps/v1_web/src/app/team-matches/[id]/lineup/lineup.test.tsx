import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1TeamMatchLineup } from '@/types/api';
import type { FormationSlot } from '@/components/lineup/formation-slots';
import {
  addGuestToLineup,
  addRosterMemberToLineup,
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
  removeEntry,
  resolveOwnTeamId,
  restoreEntry,
  setGoalkeeper,
  setJerseyNumber,
  validateLineupForSubmit,
} from './lineup.view-model';

// ─────────────────────────────────────────────────────────────────────────────
// 1. 순수 view-model / reducer 유닛 테스트 — 네트워크·React 없이 상태 전이만 검증한다.
// ─────────────────────────────────────────────────────────────────────────────

const rosterMember = { userId: 'user-1', displayName: '홍길동', role: 'member' as const };
const rosterMember2 = { userId: 'user-2', displayName: '김철수', role: 'member' as const };

function serverLineup(overrides: Partial<V1TeamMatchLineup> = {}): V1TeamMatchLineup {
  return {
    teamMatchId: 'tm-1',
    gameId: 'game-1',
    sideId: 'side-1',
    role: 'team_manager',
    lineupId: 'lineup-1',
    revision: 2,
    state: 'DRAFT',
    version: 2,
    publicLineupAt: null,
    formation: null,
    starters: [],
    bench: [],
    ...overrides,
  };
}

describe('lineup.view-model', () => {
  it('creates an empty editable state pinned to the given base revision', () => {
    const state = createEmptyLineupEditorState(3);
    expect(state).toEqual({ participants: [], baseRevision: 3, formation: null, dirty: false });
  });

  it('hydrates from a server lineup without leaking a userId (server never echoes it back)', () => {
    const state = hydrateLineupEditorState(
      serverLineup({
        starters: [
          { id: 'participant-1', displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null },
        ],
        bench: [{ id: 'participant-bench-1', displayName: '게스트', jerseyNumber: null }],
      }),
    );
    expect(state.baseRevision).toBe(2);
    expect(state.dirty).toBe(false);
    // 명단은 하나다 — 서버가 아직 두 배열로 내려줘도 화면은 한 줄로 합쳐 읽는다(정본 §3).
    expect(state.participants).toEqual([
      expect.objectContaining({ userId: null, displayName: '홍길동', jerseyNumber: 1, goalkeeper: true }),
      expect.objectContaining({ userId: null, displayName: '게스트' }),
    ]);
  });

  it('이 변경 전에 후보로 저장된 사람도 명단에 남는다 — bench 를 안 읽으면 조용히 사라진다', () => {
    // 서버 응답 계약은 이 태스크가 바꾸지 않았다. 옛 저장본에는 `bench` 에만 있는 사람이
    // 실제로 존재하므로, `starters` 만 읽으면 그 사람이 화면에서 사라진 채 저장돼 삭제된다.
    const state = hydrateLineupEditorState(
      serverLineup({ bench: [{ id: 'p-9', displayName: '후보만', jerseyNumber: 12 }] }),
    );
    expect(state.participants.map((entry) => entry.displayName)).toEqual(['후보만']);
  });

  it('prevents placing the same roster member twice — a duplicate add is a structural no-op', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, rosterMember);
    expect(state.participants).toHaveLength(1);

    const again = addRosterMemberToLineup(state, rosterMember);
    expect(again).toBe(state); // 참조 동일 — 아무 것도 바뀌지 않았다
    expect(again.participants).toHaveLength(1);
  });

  it('ignores a blank guest name and adds a trimmed one', () => {
    let state = createEmptyLineupEditorState(0);
    expect(addGuestToLineup(state, '   ')).toBe(state);
    state = addGuestToLineup(state, '  게스트A  ');
    expect(state.participants[0]).toEqual(expect.objectContaining({ userId: null, displayName: '게스트A' }));
  });

  it('removes an entry by its stable key', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, rosterMember);
    const key = state.participants[0].key;
    state = removeEntry(state, key);
    expect(state.participants).toHaveLength(0);
  });

  it('restoreEntry puts the removed entry back at its original index', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, rosterMember);
    state = addRosterMemberToLineup(state, rosterMember2);
    const removed = state.participants[0];
    state = removeEntry(state, removed.key);
    state = restoreEntry(state, removed, 0);
    expect(state.participants.map((entry) => entry.displayName)).toEqual(['홍길동', '김철수']);
  });

  it('keeps exactly one goalkeeper (radio semantics)', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, rosterMember);
    state = addRosterMemberToLineup(state, rosterMember2);
    state = setGoalkeeper(state, state.participants[0].key);
    state = setGoalkeeper(state, state.participants[1].key);
    expect(state.participants[0].goalkeeper).toBe(false);
    expect(state.participants[1].goalkeeper).toBe(true);
  });

  it('derives participant/waiting counts from one merged view', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, rosterMember);
    const counts = deriveLineupCounts(state, [rosterMember, rosterMember2]);
    expect(counts).toEqual({ participantCount: 1, waitingCount: 1, totalRoster: 2 });
  });

  it('빈 명단·중복 등번호·빈 이름만 막는다 — 인원수와 GK 개수는 검사하지 않는다', () => {
    expect(validateLineupForSubmit(createEmptyLineupEditorState(0))).toContain(
      '출전 명단을 최소 한 명 이상 등록해 주세요.',
    );

    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, rosterMember);
    state = addRosterMemberToLineup(state, rosterMember2);
    state = setJerseyNumber(state, state.participants[0].key, 7);
    state = setJerseyNumber(state, state.participants[1].key, 7);
    expect(validateLineupForSubmit(state)).toContain('등번호가 중복돼요. 등번호는 서로 달라야 해요.');

    state = setJerseyNumber(state, state.participants[1].key, 9);
    // **GK 가 아무도 없어도 통과해야 한다.** 163 BE-1 이 서버에서 인원·GK 검증을 지웠으므로
    // (정본 §3), 여기 남기면 서버가 받아 주는 입력을 화면만 막는 규칙이 된다.
    expect(state.participants.every((entry) => !entry.goalkeeper)).toBe(true);
    expect(validateLineupForSubmit(state)).toEqual([]);

    // 인원이 적어도 통과한다 — 최소 인원 검증은 이 화면의 책임이 아니다.
    let tiny = createEmptyLineupEditorState(0);
    tiny = addRosterMemberToLineup(tiny, rosterMember);
    expect(validateLineupForSubmit(tiny)).toEqual([]);
  });

  it('빈 이름은 막는다', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, { ...rosterMember, displayName: '홍길동' });
    state.participants[0].displayName = '   ';
    expect(validateLineupForSubmit(state)).toContain('이름이 비어 있는 선수가 있어요.');
  });

  it('builds a save payload carrying userId only for linked entries', () => {
    let state = createEmptyLineupEditorState(4);
    state = addRosterMemberToLineup(state, rosterMember);
    state = addGuestToLineup(state, '게스트A');
    state = setGoalkeeper(state, state.participants[0].key);
    expect(buildSavePayload(state)).toEqual({
      expectedVersion: 4,
      participants: [{ userId: 'user-1', displayName: '홍길동', goalkeeper: true }, { displayName: '게스트A' }],
    });
  });

  it('명단만 바꿔 저장해도 전술보드의 좌표·포메이션은 그대로 되돌아간다', () => {
    // 이 화면은 배치를 편집하지 않는다(정본 §3 — 좌표는 전술보드 소관). 그런데 저장은
    // **명단 전체를 덮어쓴다** — 그래서 읽어온 좌표를 payload 에 다시 실어 보내지 않으면
    // 전술보드가 잡아 둔 배치가 명단 한 줄 고칠 때마다 지워진다.
    const loaded = hydrateLineupEditorState(
      serverLineup({
        formation: '1-2-1',
        starters: [
          { id: 'p-1', displayName: '홍길동', jerseyNumber: 1, position: 'GK', goalkeeper: true, positionX: 50, positionY: 6 },
          { id: 'p-2', displayName: '김철수', jerseyNumber: 4, position: 'FIXO', goalkeeper: false, positionX: 33, positionY: 43 },
        ],
      }),
    );
    // 명단만 바꾼다 — 한 명 추가.
    const edited = addGuestToLineup(loaded, '새 게스트');
    const payload = buildSavePayload(edited);

    expect(payload.formation).toBe('1-2-1');
    expect(payload.participants.slice(0, 2)).toEqual([
      { displayName: '홍길동', jerseyNumber: 1, goalkeeper: true, position: 'GK', positionX: 50, positionY: 6 },
      { displayName: '김철수', jerseyNumber: 4, position: 'FIXO', positionX: 33, positionY: 43 },
    ]);
    // 새로 추가한 사람에게는 좌표가 없다 — 없는 값을 지어내지 않는다.
    expect(payload.participants[2]).toEqual({ displayName: '새 게스트' });
  });

  it('advances the CAS token after a save ack without touching local edits', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, rosterMember);
    const saved = applySaveResult(state, { revision: 1 });
    expect(saved.baseRevision).toBe(1);
    expect(saved.dirty).toBe(false);
    expect(saved.participants).toBe(state.participants);
  });

  it('reloads from the server on a version conflict (full rehydrate, not a partial merge)', () => {
    const reloaded = applyVersionConflictReload(serverLineup({ revision: 5, version: 5 }));
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
    expect(resolveOwnTeamId(teamMatch, [{ teamId: 'team-away', role: 'manager' }])).toBe('team-away');
    expect(resolveOwnTeamId(teamMatch, [{ teamId: 'team-away', role: 'member' }])).toBeNull();
    expect(resolveOwnTeamId(teamMatch, undefined)).toBeNull();
  });

  it('accepts the paginated { items } shape useV1MyTeams actually returns', () => {
    // GET /me/teams 는 배열이 아니라 { items: [...] } 를 돌려준다. 이걸 언랩하지 않고 넘기면
    // 예전 구현은 `myTeams.find is not a function` 으로 라인업/팀매치 화면 전체를 죽였다.
    const teamMatch = { hostTeamId: 'team-host', approvedOpponentTeam: { teamId: 'team-away' } };
    expect(resolveOwnTeamId(teamMatch, { items: [{ teamId: 'team-host', role: 'owner' }] })).toBe('team-host');
    expect(resolveOwnTeamId(teamMatch, { items: [] })).toBeNull();
  });

  it('isRosterMemberPlaced matches deriveLineupCounts waiting logic', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, rosterMember);
    expect(isRosterMemberPlaced(state, rosterMember)).toBe(true);
    expect(isRosterMemberPlaced(state, rosterMember2)).toBe(false);
  });

  // ── Blocker 1 regression: reopen-a-saved-draft must not allow duplicate placement ──
  // GET .../lineup never echoes userId back (Task 14 stores only displayName snapshots),
  // so hydrateLineupEditorState() always produces userId: null entries. Before this fix,
  // isPlaced()/addRosterMemberToLineup() compared strictly by entry.userId === member.userId
  // — which is never true post-hydrate — so a previously placed roster member reappeared in
  // the addable list and could be added a second time as a distinct row. Reverting the
  // entry.displayName fallback in matchesRosterMember makes every assertion below fail.
  it('hydrate-then-add: a roster member already present in a rehydrated (reopened) draft cannot be re-added as a duplicate', () => {
    let state = hydrateLineupEditorState(
      serverLineup({
        revision: 3,
        version: 3,
        starters: [
          { id: 'participant-2', displayName: rosterMember.displayName, jerseyNumber: 7, position: null, goalkeeper: true, positionX: null, positionY: null },
        ],
      }),
    );
    // Sanity: the rehydrated entry really did lose its userId (server contract).
    expect(state.participants[0].userId).toBeNull();

    expect(isRosterMemberPlaced(state, rosterMember)).toBe(true);
    expect(deriveLineupCounts(state, [rosterMember, rosterMember2]).waitingCount).toBe(1);

    const afterAttempt = addRosterMemberToLineup(state, rosterMember);
    expect(afterAttempt).toBe(state);
    expect(afterAttempt.participants).toHaveLength(1);

    // A genuinely different roster member is unaffected and can still be added.
    state = addRosterMemberToLineup(state, rosterMember2);
    expect(state.participants).toHaveLength(2);
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
  // "이전 라인업 불러오기"/"프리셋으로 저장"이 쓰는 훅. 시트를 열기 전에는 조회하지
  // 않지만(enabled:false) 훅 자체는 매 렌더 호출되므로 모듈 모킹에 반드시 있어야 한다.
  useV1TeamLineupHistory: () => ({ data: undefined, isLoading: false }),
  useV1TeamLineupPresets: () => ({ data: undefined, isLoading: false }),
  useV1CreateLineupPreset: () => ({ mutateAsync: async () => undefined, isPending: false }),
  useV1UpdateLineupPreset: () => ({ mutateAsync: async () => undefined, isPending: false }),
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
      formation: null,
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

  it('owner/manager: lets a manager add a waiting roster member to the appearance roster', async () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('초안')).toBeInTheDocument();
    expect(screen.getByText('출전 명단 (0)')).toBeInTheDocument();
    expect(screen.getByText('추가 가능한 팀원 (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '명단 추가' }));

    expect(screen.getByText('출전 명단 (1)')).toBeInTheDocument();
    // 배치되고 나면 대기 목록에서 사라진다 — 같은 사람을 두 번 추가할 방법 자체가 없다.
    expect(screen.getByText('추가할 수 있는 팀원이 없어요')).toBeInTheDocument();
  });

  // 회귀 방지: "추가 가능한 팀원" 목록이 서버가 이미 내려주는 eligibleMembers[].attending을
  // 무시하고 활성 팀원 전체를 addable로 보여주던 결함(참석 미확정 팀원을 선발/후보로 넣고
  // 저장하면 서버가 422 LINEUP_PARTICIPANT_INELIGIBLE로 전체 저장을 막는데, 화면은 누가
  // 문제인지 전혀 알려주지 않았다). eligibleMembers가 있을 때는 attending===true인 사람만
  // 추가 버튼이 살아 있어야 하고, 나머지는 분리된 섹션에 배지 + 비활성 버튼으로 보여야 한다.
  it('participants who have not confirmed attendance are separated from the addable list and cannot be added', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        eligibleMembers: [
          { userId: 'user-1', displayName: '홍길동', jerseyNumber: null, attending: true },
          { userId: 'user-2', displayName: '김철수', jerseyNumber: null, attending: false },
        ],
      }),
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

    // 대기 2명 중 참석 확정자(1명)만 "추가 가능한 팀원" 카운트에 잡힌다.
    expect(screen.getByText('추가 가능한 팀원 (1)')).toBeInTheDocument();
    expect(screen.getByText('참석 미확정 팀원 (1)')).toBeInTheDocument();
    expect(screen.getByText('참석 미확정')).toBeInTheDocument();

    // 참석 확정자는 그대로 추가할 수 있다.
    fireEvent.click(screen.getByRole('button', { name: '명단 추가' }));
    expect(screen.getByText('출전 명단 (1)')).toBeInTheDocument();

    // 참석 미확정자의 버튼은 비활성 상태라 눌러도 아무 일도 일어나지 않는다 — 저장을 시도한
    // 뒤 422로 처음 알게 되는 대신, 애초에 추가할 수 없다는 것을 화면이 미리 말해준다.
    const blockedAddButton = screen.getByRole('button', {
      name: '김철수 명단 추가 — 참석 확정 전이라 비활성화됨',
    });
    expect(blockedAddButton).toBeDisabled();
    fireEvent.click(blockedAddButton);
    expect(screen.getByText('출전 명단 (1)')).toBeInTheDocument();
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
        starters: [{ id: 'participant-1', displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null }],
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

  // ── 명시적 저장 정책 (2026-08 사용자 요청: "바로바로 실시간 저장 말고 저장 눌렀을 때") ──
  // 예전에는 편집이 멈추고 900ms 뒤 자동저장이 돌았다. 그 디바운스는 (a) 피치에서 토큰을
  // 드래그하는 동안 매 포인터 이벤트가 타이머를 재설정해 "저장이 되는 건지" 알 수 없게 만들었고,
  // (b) 사용자가 누르지 않은 저장을 계속 서버로 보냈다. 이제 저장은 버튼을 누른 그 순간에만
  // 나가고, 저장이 나가 있는 동안에는 버튼이 잠겨 같은 expectedVersion을 든 두 번째 저장이
  // 겹치지 않는다(겹치면 자기 자신 때문에 409 VERSION_CONFLICT를 받고, 그 복구는 전체
  // 재로드라 방금 만든 편집을 통째로 버린다).
  it('편집만으로는 저장이 나가지 않는다 — 저장은 버튼을 누른 순간에만 나간다', () => {
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

      fireEvent.click(screen.getAllByRole('button', { name: '명단 추가' })[0]);
      // 예전 자동저장 디바운스(900ms)를 훌쩍 넘겨도 아무것도 나가지 않아야 한다.
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(hoisted.saveMutate).not.toHaveBeenCalled();
      expect(screen.getByText('저장하지 않은 변경사항이 있어요.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('저장이 나가 있는 동안에는 저장 버튼이 잠겨 두 번째 저장이 겹치지 않는다', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
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

    fireEvent.click(screen.getAllByRole('button', { name: '명단 추가' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();

    // 저장이 서버에 나가 있는 동안 편집을 이어가도, 사용자가 누르지 않은 저장이 자동으로
    // 뒤따라 나가지는 않는다 — 명시적 저장 정책의 핵심.
    fireEvent.click(screen.getByRole('button', { name: '명단 추가' }));
    expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);

    act(() => {
      hoisted.saveMutate.mock.calls[0][1].onSuccess({ revision: 1 });
    });
    act(() => {
      hoisted.saveMutate.mock.calls[0][1].onSettled();
    });

    // ack 이후에도 자동 재저장은 없다. 대신 저장 중 만든 편집이 미저장으로 남아 있음을
    // 화면이 분명히 말하고, 버튼이 다시 눌릴 수 있는 상태로 돌아온다.
    expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('저장하지 않은 변경사항이 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
  });

  // ── P0-1 regression (insane review, 2026-08 GPT Pro): flush-then-submit ──
  // Before this fix, clicking "라인업 제출하기" always submitted with state.baseRevision
  // regardless of dirty — a jersey number entered right before the click could be submitted
  // as the stale server revision because autosave only fires 900ms after the last edit. The
  // fix makes handleSubmit a serial state machine: while dirty, a click flushes a save
  // immediately (no debounce wait) and only submits once that save acks with a fresh
  // revision. Reverting to `submitMutation.mutate({ expectedVersion: state.baseRevision })`
  // unconditionally makes this fail — the submit would fire before the save.
  it('flush-then-submit: clicking submit while dirty flushes the pending save first, then submits with the fresh revision', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        revision: 3,
        starters: [{ id: 'participant-1', displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null }],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });
    hoisted.useV1TeamMembersMock.mockReturnValue({
      data: { items: [{ membershipId: 'm-2', userId: 'user-2', displayName: '김철수', role: 'member', status: 'active' }] },
      isLoading: false,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    // 대기 팀원을 선발로 추가 → dirty=true. 자동저장 디바운스(900ms)는 아직 돌지 않았다.
    fireEvent.click(screen.getByRole('button', { name: '명단 추가' }));

    // 곧바로 제출 버튼을 누른다 — 디바운스를 기다리지 않고 저장이 먼저 나가야 한다.
    fireEvent.click(screen.getByRole('button', { name: '라인업 제출하기' }));
    expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);
    // 저장이 아직 ack되지 않았다 — 옛 revision(3)이 실린 채 제출이 나가면 안 된다.
    expect(hoisted.submitMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '변경사항 저장 중…' })).toBeDisabled();

    // 저장 ack(새 revision 5)가 오면, 그 사이 추가 편집이 없었으므로 곧장 그 revision으로
    // 제출이 이어진다.
    act(() => {
      hoisted.saveMutate.mock.calls[0][1].onSuccess({ revision: 5 });
    });
    expect(hoisted.submitMutate).toHaveBeenCalledTimes(1);
    expect(hoisted.submitMutate.mock.calls[0][0]).toMatchObject({ expectedVersion: 5 });
  });

  // 저장이 실패하면 제출로 이어지지 않는다 — "저장 실패 시 제출 중단"을 명시적으로 검증한다.
  it('flush-then-submit: a save failure aborts the pending submit instead of continuing with stale data', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        revision: 3,
        starters: [{ id: 'participant-1', displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null }],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });
    hoisted.useV1TeamMembersMock.mockReturnValue({
      data: { items: [{ membershipId: 'm-2', userId: 'user-2', displayName: '김철수', role: 'member', status: 'active' }] },
      isLoading: false,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    fireEvent.click(screen.getByRole('button', { name: '명단 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '라인업 제출하기' }));
    expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);

    act(() => {
      hoisted.saveMutate.mock.calls[0][1].onError(
        new V1ApiError({
          status: 'error',
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: '저장 실패',
          timestamp: '2026-08-01T00:00:00.000Z',
        }),
      );
    });

    expect(hoisted.submitMutate).not.toHaveBeenCalled();
    expect(
      screen.getByText('변경사항을 저장하지 못해 라인업을 제출할 수 없어요. 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    // 버튼이 다시 눌러볼 수 있는 상태로 돌아온다(제출 대기 상태에 갇히지 않는다).
    expect(screen.getByRole('button', { name: '라인업 제출하기' })).toBeInTheDocument();
  });

  // ── P1-3 regression (insane review, 2026-08 GPT Pro): 제외 == 완전 삭제, undo 필요 ──
  // "제외"(현재 "명단에서 제거")는 moveEntry(선발↔후보)와 달리 완전 삭제라 등번호·GK
  // 지정이 통째로 사라졌었다. 5초 실행취소 토스트가 원래 자리에 원래 값 그대로 복원하는지
  // 검증한다.
  it('undo removal: restores the removed entry (jersey number + GK flag) at its original position', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        revision: 0,
        starters: [{ id: 'participant-1', displayName: '홍길동', jerseyNumber: 9, position: null, goalkeeper: true, positionX: null, positionY: null }],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('출전 명단 (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '홍길동 출전 명단에서 제거' }));

    expect(screen.getByText('출전 명단 (0)')).toBeInTheDocument();
    expect(screen.getByText('홍길동 선수를 명단에서 제거했어요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));

    expect(screen.getByText('출전 명단 (1)')).toBeInTheDocument();
    expect(screen.getByLabelText('홍길동 등번호')).toHaveValue(9);
    expect(screen.getByRole('button', { name: '홍길동, 골키퍼로 지정됨' })).toBeInTheDocument();
    expect(screen.queryByText('홍길동 선수를 명단에서 제거했어요.')).not.toBeInTheDocument();
  });
});

describe('TeamMatchLineupPageClient — 배치는 이 화면에 없다 (Task 163, 정본 §3)', () => {
  // 셋업을 여기서 다시 한다 — 앞 describe 의 beforeEach 는 이 블록에 걸리지 않으므로,
  // 없으면 앞 테스트가 남긴 mock 값에 얹혀 **실행 순서에 따라 결과가 달라진다**(`-t` 로
  // 이 테스트만 돌리면 통과하지 않는다).
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.useV1TeamMatchMock.mockReturnValue({ data: baseTeamMatch(), isLoading: false, isError: false });
    hoisted.useV1MyTeamsMock.mockReturnValue({ data: [{ teamId: 'team-host', role: 'manager' }], isLoading: false });
    hoisted.useV1TeamMembersMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    hoisted.refetchLineup.mockResolvedValue({ data: baseLineup() });
  });

  it('피치 배치 탭이 사라지고 전술보드 링크만 남는다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        gameId: 'game-1',
        // 서버가 배치 카탈로그를 내려줘도 이 화면은 그걸로 아무것도 그리지 않는다 —
        // 탭이 남아 있으면 이 단언이 깨진다.
        lineupConfig: {
          positions: [
            { code: 'GOLEIRO', label: '골레이로', short: 'GK', goalkeeper: true },
            { code: 'FIXO', label: '픽소', short: 'FX' },
          ],
          formations: [
            { code: '1-2-1', label: '1-2-1', outfield: 3, slots: [{ position: 'FIXO', x: 33, y: 43 }] },
          ],
          minPlayers: 3,
          maxPlayers: 6,
        },
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    // 탭 자체가 없다 — "명단/피치 배치" 두 탭 구조를 통째로 걷어냈다.
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText('피치 배치')).not.toBeInTheDocument();

    // 대신 배치를 하러 갈 곳을 한 줄로 알려준다. href 까지 본다 — 문구만 남고 링크가
    // 끊기면 사용자는 배치를 편집할 방법을 영영 못 찾는다.
    const link = screen.getByRole('link', { name: /전술보드/ });
    expect(link).toHaveAttribute('href', '/teams/team-host/tactics/game-1');
  });
});
