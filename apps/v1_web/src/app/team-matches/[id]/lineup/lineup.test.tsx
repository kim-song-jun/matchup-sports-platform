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
  describeLineupPhase,
  addAllRosterMembersToLineup,
  compareByJersey,
  describeGoalkeeperNotice,
  describeLineupSizeNotice,
  describeOpponentSkipped,
  describePublicationCountdown,
  describePublicationNotice,
  describeResubmitted,
  findJerseyHolder,
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

  /**
   * 재수화가 **사람 연결(`userId`)을 이어받는다.**
   *
   * 이 테스트는 예전에 정반대를 못박고 있었다("server never echoes it back") — 그런데
   * 서버는 예전부터 `userId` 를 실어 보냈고, 응답 **타입**에만 그 칸이 없었다. 그래서
   * 화면이 값을 못 읽고 연동 선수를 전부 게스트로 재수화했고, 그대로 저장하면 연결이
   * 조용히 끊겨 개인 기록·상호평가·징계 추적이 그 사람을 못 찾았다.
   *
   * `null` 은 이제 **실제 게스트**만을 뜻한다 — 두 경우를 한 배열에서 함께 잰다.
   */
  it('hydrates a server lineup carrying each participant\'s userId, and keeps null only for a real guest', () => {
    const state = hydrateLineupEditorState(
      serverLineup({
        starters: [
          { id: 'participant-1', userId: 'user-hong', displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null },
        ],
        bench: [{ id: 'participant-bench-1', displayName: '게스트', jerseyNumber: null }],
      }),
    );
    expect(state.baseRevision).toBe(2);
    expect(state.dirty).toBe(false);
    // 명단은 하나다 — 서버가 아직 두 배열로 내려줘도 화면은 한 줄로 합쳐 읽는다(정본 §3).
    expect(state.participants).toEqual([
      expect.objectContaining({ userId: 'user-hong', displayName: '홍길동', jerseyNumber: 1, goalkeeper: true }),
      expect.objectContaining({ userId: null, displayName: '게스트' }),
    ]);
  });

  /**
   * **결함이 실제로 터지던 자리는 여기다.** 재수화만 고쳐도 저장 payload 가 `userId` 를
   * 안 실으면 아무것도 안 바뀐다 — 다시 열어 저장할 때마다 연동 선수가 게스트로
   * 내려앉는다. 불러오기 → 저장 payload 를 한 번에 잰다.
   */
  it('재수화한 라인업을 그대로 저장하면 payload 가 사람 연결을 그대로 실어 보낸다', () => {
    const state = hydrateLineupEditorState(
      serverLineup({
        revision: 4,
        starters: [
          { id: 'p-1', userId: 'user-1', displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null },
          { id: 'p-2', userId: 'user-2', displayName: '김철수', jerseyNumber: 4, position: null, goalkeeper: false, positionX: null, positionY: null },
          { id: 'p-3', userId: null, displayName: '용병 게스트', jerseyNumber: 9, position: null, goalkeeper: false, positionX: null, positionY: null },
        ],
        bench: [],
      }),
    );

    const payload = buildSavePayload(state);
    expect(payload.expectedVersion).toBe(4);
    expect(payload.participants).toEqual([
      expect.objectContaining({ userId: 'user-1', displayName: '홍길동' }),
      expect.objectContaining({ userId: 'user-2', displayName: '김철수' }),
      // 게스트는 계정이 없으므로 `userId` 키 자체가 실리지 않는다(서버 DTO 계약).
      { displayName: '용병 게스트', jerseyNumber: 9 },
    ]);
  });

  /**
   * `revision === 1` 은 경기 생성 때 자동으로 깔린 **미편집 스냅샷**이다 — 참가자는 대진
   * 생성 시점의 팀 전체 활성 멤버이고, 일부러 `userId` 를 붙이지 않는다(한 경기도 안 뛴
   * 팀원에게 신원 연결을 만들면 개인 기록·상호평가가 거짓이 된다).
   *
   * 이걸 편집기 시작 상태로 쓰면 팀장은 자기가 짜지 않은 명단을 보고, 그대로 저장하는
   * 순간 **팀 전원이 이름뿐인 게스트로 박제된다.** alpha 실측에서 제출된 리그 라인업
   * 참가자가 전원 `userId` 없이 저장돼 있던 마지막 고리가 여기다.
   *
   * 같은 참가자 목록을 `revision: 2` 로 주면 그대로 불러온다 — 규칙이 **내용이 아니라
   * 리비전**이라는 것을 함께 잰다(내용으로 판정하면 진짜 게스트 명단까지 지워진다).
   */
  it('자동으로 깔린 미편집 스냅샷(revision 1)은 불러오지 않는다 — 팀이 저장한 리비전은 그대로 불러온다', () => {
    const autoRoster = [
      { id: 'auto-1', userId: null, displayName: '팀원A', jerseyNumber: null, position: null, goalkeeper: false, positionX: null, positionY: null },
      { id: 'auto-2', userId: null, displayName: '팀원B', jerseyNumber: null, position: null, goalkeeper: false, positionX: null, positionY: null },
    ];

    const auto = hydrateLineupEditorState(serverLineup({ revision: 1, version: 1, starters: autoRoster, bench: [] }));
    expect(auto.participants).toEqual([]);
    // CAS 토큰은 그대로여야 한다 — 저장할 때 서버가 기대하는 값이 1 이다.
    expect(auto.baseRevision).toBe(1);
    expect(auto.dirty).toBe(false);

    const saved = hydrateLineupEditorState(serverLineup({ revision: 2, version: 2, starters: autoRoster, bench: [] }));
    expect(saved.participants.map((entry) => entry.displayName)).toEqual(['팀원A', '팀원B']);
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

  // L20 — 멤버 관리의 "팀에서 계속 쓰는 번호" 가 명단에 넣을 때 버려져 칸이 비어 있었다.
  it('팀 등번호를 지정한 팀원은 그 번호로 명단에 들어간다', () => {
    const state = addRosterMemberToLineup(createEmptyLineupEditorState(0), { ...rosterMember, jerseyNumber: 8 });
    expect(state.participants[0].jerseyNumber).toBe(8);
  });

  it('팀 번호를 지정하지 않은 팀원은 빈칸으로 들어간다', () => {
    expect(addRosterMemberToLineup(createEmptyLineupEditorState(0), rosterMember).participants[0].jerseyNumber).toBeNull();
    expect(
      addRosterMemberToLineup(createEmptyLineupEditorState(0), { ...rosterMember, jerseyNumber: null }).participants[0]
        .jerseyNumber,
    ).toBeNull();
  });

  it('그 번호를 명단의 다른 행이 이미 쓰면 빈칸으로 둔다 — 중복 번호로 제출이 막히지 않게', () => {
    let state = addRosterMemberToLineup(createEmptyLineupEditorState(0), { ...rosterMember, jerseyNumber: 8 });
    state = addRosterMemberToLineup(state, { ...rosterMember2, jerseyNumber: 8 });
    expect(state.participants.map((entry) => entry.jerseyNumber)).toEqual([8, null]);
    expect(validateLineupForSubmit(state)).toEqual([]);
    expect(findJerseyHolder(state, 8)).toBe('홍길동');
    expect(findJerseyHolder(state, 9)).toBeNull();
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

  it('allows multiple goalkeepers and toggles each independently', () => {
    let state = createEmptyLineupEditorState(0);
    state = addRosterMemberToLineup(state, rosterMember);
    state = addRosterMemberToLineup(state, rosterMember2);
    state = setGoalkeeper(state, state.participants[0].key);
    state = setGoalkeeper(state, state.participants[1].key);
    expect(state.participants[0].goalkeeper).toBe(true);
    expect(state.participants[1].goalkeeper).toBe(true);
    state = setGoalkeeper(state, state.participants[0].key);
    expect(state.participants[0].goalkeeper).toBe(false);
    expect(state.participants[1].goalkeeper).toBe(true);
  });

  it('빈 명단·중복 등번호·빈 이름만 막는다 — 인원수와 GK 개수는 검사하지 않는다', () => {
    expect(validateLineupForSubmit(createEmptyLineupEditorState(0))).toContain(
      '참석명단을 최소 한 명 이상 등록해 주세요.',
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
          { id: 'p-1', userId: null, displayName: '홍길동', jerseyNumber: 1, position: 'GK', goalkeeper: true, positionX: 50, positionY: 6 },
          { id: 'p-2', userId: null, displayName: '김철수', jerseyNumber: 4, position: 'FIXO', goalkeeper: false, positionX: 33, positionY: 43 },
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

  it('describes the publication countdown relative to now', () => {
    const now = new Date('2026-08-10T10:00:00.000Z').getTime();
    expect(describePublicationCountdown(null, now)).toBeNull();
    expect(describePublicationCountdown('2026-08-10T10:30:00.000Z', now)).toBe('공개까지 30분 남았어요.');
    expect(describePublicationCountdown('2026-08-11T09:59:00.000Z', now)).toBe('공개까지 23시간 59분 남았어요.');
    // W2-V10 — 하루가 넘으면 "163시간 38분"이 아니라 날짜로 말한다(KST).
    expect(describePublicationCountdown('2026-08-17T11:00:00.000Z', now)).toBe('8/17 (월) 오후 8:00에 공개돼요.');
    expect(describePublicationCountdown('2026-08-11T10:00:00.000Z', now)).toBe('8/11 (화) 오후 7:00에 공개돼요.');
    expect(describePublicationCountdown('2026-08-10T09:00:00.000Z', now)).toBe('상대 팀에게 공개됐어요.');
  });

  it('describes the server-computed editability and lock reason', () => {
    expect(describeLineupPhase('DRAFT', true, null).editable).toBe(true);
    expect(describeLineupPhase('SUBMITTED', true, null)).toMatchObject({
      editable: true,
      label: '제출 완료',
    });
    // H5 결정 A — 첫 기록 뒤 결과 확정 전은 "추가만". 취소된 경기는 그래도 취소로 잠긴다(대조군).
    expect(describeLineupPhase('SUBMITTED', false, 'records_exist', false, true)).toMatchObject({
      editable: false,
      label: '경기 중 · 추가만',
    });
    expect(describeLineupPhase('SUBMITTED', false, 'terminal', true, true).label).toBe('취소됨 · 잠김');
    expect(describeLineupPhase('DRAFT', false, 'records_exist')).toMatchObject({
      editable: false,
      label: '기록 시작 · 잠김',
    });
    expect(describeLineupPhase('SUBMITTED', false, 'active_lineups_complete')).toMatchObject({
      editable: false,
      label: '명단 확정',
    });
    expect(describeLineupPhase('LOCKED', false, 'terminal')).toMatchObject({
      editable: false,
      label: '경기 종료 · 잠김',
    });
    expect(describeLineupPhase('DRAFT', false, null).editable).toBe(false);
  });

  // L30 — 서버 lockReason 'terminal' 은 종료와 취소를 구분하지 않는다. 취소는 매치 상태로 가른다.
  it('취소된 경기는 "경기 종료" 가 아니라 취소로 잠긴다', () => {
    expect(describeLineupPhase('LOCKED', false, 'terminal', true)).toMatchObject({
      editable: false,
      label: '취소됨 · 잠김',
      helperText: '취소된 경기의 참석명단은 수정할 수 없어요.',
    });
    // 대조군 — 끝난 경기는 그대로 종료로 잠긴다.
    expect(describeLineupPhase('LOCKED', false, 'terminal', false).label).toBe('경기 종료 · 잠김');
    expect(describeLineupPhase('LOCKED', false, 'terminal').label).toBe('경기 종료 · 잠김');
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

  it('isRosterMemberPlaced tells placed members from waiting ones', () => {
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
          { id: 'participant-2', userId: rosterMember.userId, displayName: rosterMember.displayName, jerseyNumber: 7, position: null, goalkeeper: true, positionX: null, positionY: null },
        ],
      }),
    );
    // Sanity: 재수화된 엔트리는 이제 **사람 연결을 갖고 있다** — 중복 판정이 이름
    // 휴리스틱이 아니라 userId 로 이뤄진다는 뜻이다.
    expect(state.participants[0].userId).toBe(rosterMember.userId);

    expect(isRosterMemberPlaced(state, rosterMember)).toBe(true);
    expect(isRosterMemberPlaced(state, rosterMember2)).toBe(false);

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
  useV1GameMock: vi.fn(),
  // 결장 표시는 이 화면의 부가 정보 — 기본은 "결장 없음"으로 둬 다른 테스트가 신경 쓰지 않게 한다.
  useV1TeamUnavailabilityMock: vi.fn(
    (..._args: unknown[]): { data: { items: unknown[] } | undefined; isError: boolean; refetch: () => unknown } => ({
      data: { items: [] },
      isError: false,
      refetch: vi.fn(),
    }),
  ),
  refetchUnavailability: vi.fn(),
  saveMutate: vi.fn(),
  submitMutate: vi.fn(),
  changeJerseyMutate: vi.fn(),
  useV1TeamLineupHistoryMock: vi.fn(
    (..._args: unknown[]): { data: { items: unknown[] } | undefined; isLoading: boolean } => ({ data: undefined, isLoading: false }),
  ),
  lateAddMutate: vi.fn(),
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
  useV1Game: hoisted.useV1GameMock,
  // "이전 라인업 불러오기"/"프리셋으로 저장"이 쓰는 훅. 시트를 열기 전에는 조회하지
  // 않지만(enabled:false) 훅 자체는 매 렌더 호출되므로 모듈 모킹에 반드시 있어야 한다.
  useV1TeamLineupHistory: (...args: unknown[]) => hoisted.useV1TeamLineupHistoryMock(...args),
  useV1TeamLineupPresets: () => ({ data: undefined, isLoading: false }),
  useV1CreateLineupPreset: () => ({ mutateAsync: async () => undefined, isPending: false }),
  useV1UpdateLineupPreset: () => ({ mutateAsync: async () => undefined, isPending: false }),
  useV1SaveTeamMatchLineup: () => ({ mutate: hoisted.saveMutate, isPending: false }),
  useV1SubmitTeamMatchLineup: () => ({ mutate: hoisted.submitMutate, isPending: false }),
  useV1ChangeMembershipJersey: () => ({ mutate: hoisted.changeJerseyMutate, isPending: false }),
  useV1AddLateTeamMatchLineupParticipant: () => ({ mutate: hoisted.lateAddMutate, isPending: false, isError: false, error: null }),
  // AppChrome 헤더/데스크톱 nav의 알림 벨이 호출한다 — 라인업 화면과 무관하지만 모듈 전체를
  // 모킹하는 이상 실제로 렌더되는 하위 트리가 쓰는 훅도 채워줘야 한다.
  useV1NotificationUnreadSummary: () => ({ data: undefined }),
}));

vi.mock('@/hooks/use-v1-game-roster', () => ({ useV1TeamUnavailability: hoisted.useV1TeamUnavailabilityMock }));

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

/** 명단에 한 명(게스트)이 있으면 "추가할 팀원" 목록이 보인다 — 빈 명단은 시작 카드만 보인다(A-1). */
const GUEST_STARTER = { id: 'p-guest', userId: null, displayName: '용병', jerseyNumber: 50, position: null, goalkeeper: false, positionX: null, positionY: null };

function baseLineup(overrides: Partial<V1TeamMatchLineup> = {}): V1TeamMatchLineup {
  return {
    teamMatchId: 'tm-1',
    gameId: 'game-1',
    sideId: 'side-host',
    role: 'team_manager',
    lineupId: null,
    revision: 0,
    state: 'DRAFT',
    editable: true,
    lockReason: null,
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
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('상대팀 참석명단 정정 요청 영역을 노출하지 않는다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup(),
      isLoading: false,
      isError: false,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.queryByText('상대팀 참석명단 정정 요청')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '정정 요청 보내기' })).not.toBeInTheDocument();
  });

  it('경기 기록이 시작된 참석명단은 확인 모달로 우회하지 않고 잠근다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        gameState: 'LIVE',
        hasRecordedEvents: true,
        editable: false,
        lockReason: 'records_exist',
        state: 'LOCKED',
        starters: [{ id: 'p-live', userId: 'user-1', displayName: '홍길동', jerseyNumber: 7, position: null, goalkeeper: false, positionX: null, positionY: null }],
      }),
      isLoading: false,
      isError: false,
      refetch: hoisted.refetchLineup,
    });
    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('기록 시작 · 잠김')).toBeInTheDocument();
    expect(screen.getByText(/경기 기록이 시작되어 참석명단을 수정할 수 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '참석명단을 수정할까요?' })).not.toBeInTheDocument();
    expect(hoisted.saveMutate).not.toHaveBeenCalled();
  });

  // L30 — 취소된 경기에서 "N시간 후 공개돼요" 카운트다운이 남고 배지가 "경기 종료"로 읽혔다.
  describe('취소된 경기의 참석명단 (L30)', () => {
    const lockedLineup = () => baseLineup({
      state: 'SUBMITTED',
      editable: false,
      lockReason: 'terminal',
      publicLineupAt: futureIso(200),
    });

    function renderWith(matchStatus: string) {
      hoisted.useV1TeamMatchMock.mockReturnValue({
        data: { ...baseTeamMatch(), status: matchStatus, displayState: matchStatus },
        isLoading: false,
        isError: false,
      });
      hoisted.useV1TeamMatchLineupMock.mockReturnValue({
        data: lockedLineup(),
        isLoading: false,
        isError: false,
        refetch: hoisted.refetchLineup,
      });
      render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);
    }

    it('배지는 취소로 잠기고 공개 카운트다운은 숨긴다', () => {
      renderWith('cancelled');

      expect(screen.getByText('취소됨 · 잠김')).toBeInTheDocument();
      expect(screen.queryByText('경기 종료 · 잠김')).not.toBeInTheDocument();
      expect(screen.queryByText(/공개까지|공개돼요/)).not.toBeInTheDocument();
    });

    it('대조군 — 같은 잠금이라도 끝난 경기는 종료 배지와 카운트다운을 그대로 보인다', () => {
      renderWith('completed');

      expect(screen.getByText('경기 종료 · 잠김')).toBeInTheDocument();
      expect(screen.getByText(/^공개까지 \d+시간( \d+분)? 남았어요\.$/)).toBeInTheDocument();
    });
  });

  /**
   * **라벨을 지우면 못 찾고, 항상 띄우면 값으로 읽힌다.**
   *
   * 처음엔 선택됐을 때만 "GK" 가 보이는 네이티브 라디오였는데 "뭘 누르는 버튼인지 모르겠다"
   * 는 지적을 받아 **항상** GK 를 띄우게 바꿨다. 그랬더니 이번엔 QA 가 두 라운드 연속
   * **"전원이 GK 로 보인다"** 고 보고했다 — 글자가 상태가 아니라 값으로 읽힌 것이다.
   * 미지정을 **빈 컨트롤**로 두면 둘 다 피한다. 이 열이 무엇인지는 열 헤더가 말하고,
   * 스크린리더는 각 버튼의 aria-label 에서 같은 문맥을 얻는다(2026-09-08 사용자 확정).
   */
  it('GK 글자는 지정된 행에만 있다 — 미지정 행은 "+" 아이콘만 있는 빈 컨트롤이다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        starters: [
          { id: 'p-1', userId: null, displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null },
          { id: 'p-2', userId: null, displayName: '김철수', jerseyNumber: 2, position: null, goalkeeper: false, positionX: null, positionY: null },
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    const designated = screen.getByRole('button', { name: '홍길동, 골키퍼 지정 해제' });
    // 조사는 받침을 따른다 — '김철수' 는 받침이 없으니 '를' 이다(`josa`).
    const notDesignated = screen.getByRole('button', { name: '김철수를 골키퍼로 지정' });

    expect(designated).toHaveTextContent('GK');
    // 여기가 계약이다 — 미지정 행에 "GK" 글자가 있으면 그게 "이 선수는 GK" 로 읽힌다.
    // "+" 아이콘(2026-09-29, "빈 원이 눌러야 하는지 알 수 없다"는 지적에 대한 A/B/C 3안 중
    // C안)은 값이 아니라 "추가 가능" 신호일 뿐이라 이 계약을 건드리지 않는다.
    expect(notDesignated).not.toHaveTextContent('GK');
    expect(notDesignated.querySelector('svg')).not.toBeNull();
    // 그래도 누를 수 있어야 한다(빈 컨트롤이지 사라진 컨트롤이 아니다).
    expect(notDesignated).toBeEnabled();
  });

  it('열람 전용(editable=false)이면 미지정 행에 "+" 를 보여주지 않는다 — 누를 수 없는데 누르라는 신호를 주지 않는다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        gameState: 'LIVE',
        hasRecordedEvents: true,
        editable: false,
        lockReason: 'records_exist',
        state: 'LOCKED',
        starters: [
          { id: 'p-1', userId: null, displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null },
          { id: 'p-2', userId: null, displayName: '김철수', jerseyNumber: 2, position: null, goalkeeper: false, positionX: null, positionY: null },
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    const notDesignated = screen.getByRole('button', { name: '김철수를 골키퍼로 지정' });
    expect(notDesignated).toBeDisabled();
    expect(notDesignated.querySelector('svg')).toBeNull();
    // 잠긴 명단에서도 머리글이 GK 열의 뜻을 말한다(W4-V1).
    expect(screen.getByText('골키퍼')).toBeInTheDocument();
  });

  // W4-V1 — 행의 두 "+"(번호·골키퍼)는 모양이 같다. 무엇인지는 목록 맨 위 머리글 한 줄이 말한다.
  it('참석명단 맨 위에 "번호 · 이름 · 골키퍼" 머리글이 있고, 화면용이라 스크린리더 트리에는 없다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        starters: [
          { id: 'p-1', userId: null, displayName: '홍길동', jerseyNumber: null, position: null, goalkeeper: false, positionX: null, positionY: null },
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    const header = screen.getByText('골키퍼').closest('[aria-hidden="true"]');
    expect(header).not.toBeNull();
    expect(header).toHaveTextContent(/^번호이름골키퍼/);
    // 스크린리더는 지금처럼 각 버튼 이름으로 듣는다 — 미지정 행에는 여전히 "GK" 글자가 없다(2026-09-08).
    expect(screen.getByRole('button', { name: '홍길동 등번호 넣기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동을 골키퍼로 지정' })).not.toHaveTextContent('GK');
  });

  // H5 A-1 — 빈 목록에서 한 명씩 누르지 않게, 전원 넣기와 지난 경기 명단이 먼저 보인다.
  it('빈 참석명단은 "팀원 N명 모두 넣기"와 "지난 경기 명단으로 채우기"로 시작하고, 후보 목록은 그 뒤에 보인다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup(),
      isLoading: false,
      isError: false,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('참석명단이 비어 있어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지난 경기 명단으로 채우기' })).toBeInTheDocument();
    expect(screen.queryByText(/추가할 팀원/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /팀 일정에서 참석을 먼저 확인/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '팀원 1명 모두 넣기' }));

    expect(screen.getByText('참석명단 (1)')).toBeInTheDocument();
    expect(screen.queryByText('참석명단이 비어 있어요')).not.toBeInTheDocument();
    expect(screen.getByText('추가할 팀원 (0)')).toBeInTheDocument();
  });

  it('상대팀 승인 전에도 호스트 매니저는 참석명단을 작성할 수 있다', () => {
    hoisted.useV1TeamMatchMock.mockReturnValue({
      data: { ...baseTeamMatch(), status: 'recruiting', approvedOpponentTeam: null },
      isLoading: false,
      isError: false,
    });
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        eligibleMembers: [
          { userId: 'user-1', displayName: '홍길동', jerseyNumber: 7, attending: true },
        ],
      }),
      isLoading: false,
      isError: false,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByRole('button', { name: '팀원 1명 모두 넣기' })).toBeEnabled();
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
    expect(screen.getByText('참석명단 (0)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '팀원 1명 모두 넣기' }));

    expect(screen.getByText('참석명단 (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 참석명단 불러오기' })).toBeInTheDocument();
    // 배치되고 나면 대기 목록에서 사라진다 — 같은 사람을 두 번 추가할 방법 자체가 없다.
    expect(screen.getByText('추가할 수 있는 팀원이 없어요')).toBeInTheDocument();
  });

  it('멤버 관리에서 지정한 팀 등번호가 "추가" 때 번호 칩에 채워진다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({ starters: [GUEST_STARTER] }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });
    hoisted.useV1TeamMembersMock.mockReturnValue({
      data: { items: [{ membershipId: 'm-1', userId: 'user-1', displayName: '홍길동', role: 'member', status: 'active', jerseyNumber: 8 }] },
      isLoading: false,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);
    fireEvent.click(screen.getByRole('button', { name: '홍길동 참석명단에 추가' }));

    expect(screen.getByRole('button', { name: '홍길동 등번호 8번 바꾸기' })).toHaveTextContent('8');
  });

  it('팀 번호가 명단의 다른 행과 겹치면 비워 두고 누구와 겹치는지 알린다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({ starters: [GUEST_STARTER] }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });
    hoisted.useV1TeamMembersMock.mockReturnValue({
      data: {
        items: [
          { membershipId: 'm-1', userId: 'user-1', displayName: '홍길동', role: 'member', status: 'active', jerseyNumber: 8 },
          { membershipId: 'm-2', userId: 'user-2', displayName: '김철수', role: 'member', status: 'active', jerseyNumber: 8 },
          { membershipId: 'm-3', userId: 'user-3', displayName: '이영희', role: 'member', status: 'active', jerseyNumber: 9 },
        ],
      },
      isLoading: false,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);
    fireEvent.click(screen.getByRole('button', { name: '홍길동 참석명단에 추가' }));
    expect(screen.getByRole('button', { name: '홍길동 등번호 8번 바꾸기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '김철수 참석명단에 추가' }));

    expect(screen.getByRole('button', { name: '김철수 등번호 넣기' })).toBeInTheDocument();
    expect(screen.getByText(/김철수님의 팀 등번호 8번은 홍길동이 쓰고 있어서 비워 뒀어요/)).toBeInTheDocument();

    // 겹치지 않는 사람을 이어서 넣어도 떠 있던 안내는 남는다.
    fireEvent.click(screen.getByRole('button', { name: '이영희 참석명단에 추가' }));
    expect(screen.getByRole('button', { name: '이영희 등번호 9번 바꾸기' })).toBeInTheDocument();
    expect(screen.getByText(/김철수님의 팀 등번호 8번은 홍길동이 쓰고 있어서 비워 뒀어요/)).toBeInTheDocument();
  });

  it('"팀원 N명 모두 넣기"는 번호순으로 넣고, 팀 번호가 겹친 사람은 비워 두고 알린다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({ data: baseLineup(), isLoading: false, isError: false, error: null, refetch: hoisted.refetchLineup });
    hoisted.useV1TeamMembersMock.mockReturnValue({
      data: {
        items: [
          { membershipId: 'm-1', userId: 'user-1', displayName: '홍길동', role: 'member', status: 'active', jerseyNumber: 8 },
          { membershipId: 'm-2', userId: 'user-2', displayName: '김철수', role: 'member', status: 'active', jerseyNumber: 8 },
          { membershipId: 'm-3', userId: 'user-3', displayName: '이영희', role: 'member', status: 'active', jerseyNumber: 3 },
        ],
      },
      isLoading: false,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);
    fireEvent.click(screen.getByRole('button', { name: '팀원 3명 모두 넣기' }));

    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows[0]).toContain('이영희');
    expect(screen.getByRole('button', { name: '김철수 등번호 8번 바꾸기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 등번호 넣기' })).toBeInTheDocument();
    expect(screen.getByText(/홍길동님은 팀 등번호가 다른 선수와 겹쳐 비워 뒀어요/)).toBeInTheDocument();
  });

  // H5 A-3 — 팀 일정 응답은 후보 행의 읽기 전용 칩일 뿐, 명단 자격을 바꾸지 않는다.
  it('팀장·매니저는 "못 가요"·미응답 팀원도 직접 넣고, 응답은 후보 행의 읽기 전용 칩으로만 보인다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        starters: [GUEST_STARTER],
        eligibleMembers: [
          { userId: 'user-1', displayName: '홍길동', jerseyNumber: null, attending: true, rsvpStatus: 'NO_RESPONSE' },
          { userId: 'user-2', displayName: '김철수', jerseyNumber: null, attending: true, rsvpStatus: 'NOT_GOING' },
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

    expect(screen.getByText('추가할 팀원 (2)')).toBeInTheDocument();
    expect(screen.getByText('미응답')).toHaveClass('tm-badge-orange');
    expect(screen.getByText('못 가요')).toHaveClass('tm-badge-grey');
    expect(screen.queryByText(/참석 미확정/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '김철수 참석명단에 추가' }));
    expect(screen.getByText('참석명단 (2)')).toBeInTheDocument();
    // 명단에 들어간 행에는 응답 칩이 따라가지 않는다 — 명단이 곧 출전이다.
    expect(screen.queryByText('못 가요')).not.toBeInTheDocument();
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
        message: '팀장 또는 매니저만 참석명단을 관리할 수 있어요.',
        timestamp: '2026-08-01T00:00:00.000Z',
      }),
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('팀장 또는 매니저만 참석명단을 관리할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByLabelText('게스트 이름')).not.toBeInTheDocument();
  });

  it('forced 409: a stale submit shows the version-conflict banner, and "새로고침" reloads from the server', async () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({
        revision: 0,
        starters: [{ id: 'participant-1', userId: null, displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null }],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    fireEvent.click(screen.getByRole('button', { name: '참석명단 제출하기' }));
    expect(hoisted.submitMutate).toHaveBeenCalledTimes(1);

    const onError = hoisted.submitMutate.mock.calls[0][1].onError;
    act(() => {
      onError(
        new V1ApiError({
          status: 'error',
          statusCode: 409,
          code: 'VERSION_CONFLICT',
          message: '참석명단이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
          details: { expectedVersion: 0, currentVersion: 2 },
          timestamp: '2026-08-01T00:00:00.000Z',
        }),
      );
    });

    expect(screen.getByText('참석명단이 그새 변경됐어요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

    await waitFor(() => expect(hoisted.refetchLineup).toHaveBeenCalled());
    expect(screen.queryByText('참석명단이 그새 변경됐어요.')).not.toBeInTheDocument();
  });

  it('network loss: going offline blocks editing and surfaces an offline banner', async () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({ starters: [GUEST_STARTER] }),
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
    expect(screen.queryByRole('button', { name: '참석명단 제출하기' })).not.toBeInTheDocument();

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
        data: baseLineup({ starters: [GUEST_STARTER] }),
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

      fireEvent.click(screen.getByRole('button', { name: '홍길동 참석명단에 추가' }));
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
      data: baseLineup({ starters: [GUEST_STARTER] }),
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

    fireEvent.click(screen.getByRole('button', { name: '홍길동 참석명단에 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();

    // 저장이 서버에 나가 있는 동안 편집을 이어가도, 사용자가 누르지 않은 저장이 자동으로
    // 뒤따라 나가지는 않는다 — 명시적 저장 정책의 핵심.
    fireEvent.click(screen.getByRole('button', { name: '김철수 참석명단에 추가' }));
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
  // Before this fix, clicking "참석명단 제출하기" always submitted with state.baseRevision
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
        starters: [{ id: 'participant-1', userId: null, displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null }],
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

    // 대기 팀원을 명단에 추가 → dirty=true. 저장은 아직 나가지 않았다.
    fireEvent.click(screen.getByRole('button', { name: '김철수 참석명단에 추가' }));

    // 곧바로 제출 버튼을 누른다 — 디바운스를 기다리지 않고 저장이 먼저 나가야 한다.
    fireEvent.click(screen.getByRole('button', { name: '참석명단 제출하기' }));
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
        starters: [{ id: 'participant-1', userId: null, displayName: '홍길동', jerseyNumber: 1, position: null, goalkeeper: true, positionX: null, positionY: null }],
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

    fireEvent.click(screen.getByRole('button', { name: '김철수 참석명단에 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '참석명단 제출하기' }));
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
      screen.getByText('변경사항을 저장하지 못해 참석명단을 제출할 수 없어요. 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    // 버튼이 다시 눌러볼 수 있는 상태로 돌아온다(제출 대기 상태에 갇히지 않는다).
    expect(screen.getByRole('button', { name: '참석명단 제출하기' })).toBeInTheDocument();
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
        starters: [{ id: 'participant-1', userId: null, displayName: '홍길동', jerseyNumber: 9, position: null, goalkeeper: true, positionX: null, positionY: null }],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('참석명단 (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '홍길동 참석명단에서 빼기' }));

    expect(screen.getByText('참석명단 (0)')).toBeInTheDocument();
    expect(screen.getByText('홍길동 선수를 명단에서 뺐어요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '실행 취소' }));

    expect(screen.getByText('참석명단 (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동 등번호 9번 바꾸기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동, 골키퍼 지정 해제' })).toBeInTheDocument();
    expect(screen.queryByText('홍길동 선수를 명단에서 뺐어요.')).not.toBeInTheDocument();
  });
});

// L9 — 풋살 5:5 매치에서 프리셋 이름 예시가 "주전 4-4-2"(11인제)였고, 제출한 뒤에도
// "'…' 프리셋으로 저장했어요." 안내가 화면에 남았다.
describe('TeamMatchLineupPageClient — 프리셋 저장 (L9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    hoisted.useV1TeamMatchMock.mockReturnValue({
      data: { ...baseTeamMatch(), sport: { sportId: 'sport-futsal', name: '풋살' } },
      isLoading: false,
      isError: false,
    });
    hoisted.useV1MyTeamsMock.mockReturnValue({ data: [{ teamId: 'team-host', role: 'manager' }], isLoading: false });
    hoisted.useV1TeamMembersMock.mockReturnValue({
      data: { items: [{ membershipId: 'm-1', userId: 'user-1', displayName: '홍길동', role: 'member', status: 'active' }] },
      isLoading: false,
    });
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false });
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({ revision: 3 }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });
  });

  function openPresetDialog() {
    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);
    fireEvent.click(screen.getByRole('button', { name: '팀원 1명 모두 넣기' }));
    fireEvent.click(screen.getByRole('button', { name: '프리셋으로 저장' }));
    return screen.getByRole('dialog', { name: '프리셋으로 저장' });
  }

  it('이름 예시가 이 매치의 종목에 맞다 — 풋살이면 11인제 표기를 보이지 않는다', () => {
    const dialog = openPresetDialog();

    expect(within(dialog).getByLabelText('프리셋 이름')).toHaveAttribute('placeholder', '예: 5:5 기본 멤버');
  });

  it('제출이 끝나면 제출 전 프리셋 저장 안내가 사라진다', async () => {
    const dialog = openPresetDialog();
    fireEvent.change(within(dialog).getByLabelText('프리셋 이름'), { target: { value: '평일 멤버' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await screen.findByText("'평일 멤버' 프리셋으로 저장했어요.")).toBeInTheDocument();

    // 변경 없이 곧바로 제출하면 저장 없이 제출로 이어진다 — 저장이 먼저 필요하면 그 ack 뒤에 제출된다.
    fireEvent.click(screen.getByRole('button', { name: '참석명단 제출하기' }));
    act(() => hoisted.saveMutate.mock.calls[0][1].onSuccess({ revision: 4 }));
    act(() => hoisted.submitMutate.mock.calls[0][1].onSuccess());

    expect(screen.queryByText("'평일 멤버' 프리셋으로 저장했어요.")).not.toBeInTheDocument();
  });

  it('대조군 — 제출이 실패하면 안내는 그대로 남는다', async () => {
    const dialog = openPresetDialog();
    fireEvent.change(within(dialog).getByLabelText('프리셋 이름'), { target: { value: '평일 멤버' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    expect(await screen.findByText("'평일 멤버' 프리셋으로 저장했어요.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '참석명단 제출하기' }));
    act(() => hoisted.saveMutate.mock.calls[0][1].onSuccess({ revision: 4 }));
    act(() => hoisted.submitMutate.mock.calls[0][1].onError(new Error('boom')));

    expect(screen.getByText("'평일 멤버' 프리셋으로 저장했어요.")).toBeInTheDocument();
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
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('피치 배치 탭과 전술보드 안내를 모두 노출하지 않는다', () => {
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

    expect(screen.queryByRole('link', { name: /전술보드/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/선발·배치는 전술보드에서/)).not.toBeInTheDocument();
  });
});

function apiError(statusCode: number, code: string, message: string) {
  return new V1ApiError({ status: 'error', statusCode, code, message, timestamp: '2026-09-29T00:00:00.000Z' });
}

describe('TeamMatchLineupPageClient — 대회·리그 경기는 경기 명단 화면으로 안내한다 (Task 179)', () => {
  const NOTICE = '대회·리그 경기는 경기 명단에서 관리해요';

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.useV1MyTeamsMock.mockReturnValue({ data: [{ teamId: 'team-host', role: 'manager' }], isLoading: false });
    hoisted.useV1TeamMembersMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false });
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup(),
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: hoisted.refetchLineup,
    });
  });

  it('리그 경기는 편집기 대신 우리 팀 경기 명단 화면으로 안내한다', () => {
    hoisted.useV1TeamMatchMock.mockReturnValue({
      data: { ...baseTeamMatch(), league: { leagueId: 'league-1', title: '가을 리그' } },
      isLoading: false,
      isError: false,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '경기 명단 열기' })).toHaveAttribute('href', '/teams/team-host/games/game-1/roster');
    expect(screen.queryByText('참석명단 (0)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /참석명단 제출하기/ })).not.toBeInTheDocument();
  });

  it('대회 경기(팀매치 상세 404)는 명단 응답의 사이드가 속한 팀으로 보낸다', () => {
    hoisted.useV1TeamMatchMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: apiError(404, 'NOT_FOUND_OR_ARCHIVED', 'Team match was not found'),
    });
    // 상대 사이드를 앞에 둔다 — 첫 사이드를 고르면 남의 팀 명단으로 보낸다.
    hoisted.useV1GameMock.mockReturnValue({
      data: {
        sides: [
          { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY', teamId: 'team-rival', displayNameSnapshot: '상대' },
          { id: 'side-host', gameId: 'game-1', sideKey: 'HOME', teamId: 'team-tournament', displayNameSnapshot: '우리' },
        ],
      },
      isLoading: false,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '경기 명단 열기' })).toHaveAttribute(
      'href',
      '/teams/team-tournament/games/game-1/roster',
    );
  });

  it('리그 팀원처럼 명단 조회가 막혀도 안내는 하되 갈 곳을 모르면 버튼을 내지 않는다', () => {
    hoisted.useV1TeamMatchMock.mockReturnValue({
      data: { ...baseTeamMatch(), league: { leagueId: 'league-1', title: '가을 리그' } },
      isLoading: false,
      isError: false,
    });
    hoisted.useV1MyTeamsMock.mockReturnValue({ data: [{ teamId: 'team-host', role: 'member' }], isLoading: false });
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: apiError(403, 'PERMISSION_DENIED', 'denied'),
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByText(/팀 상세의 다가오는 경기에서/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '경기 명단 열기' })).not.toBeInTheDocument();
  });

  it('친선 경기는 안내 없이 참석명단 편집기를 그대로 보여준다', () => {
    hoisted.useV1TeamMatchMock.mockReturnValue({ data: baseTeamMatch(), isLoading: false, isError: false });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.getByText('참석명단 (0)')).toBeInTheDocument();
  });

  it('팀매치도 명단도 없으면 대회로 짐작하지 않고 오류를 보여준다', () => {
    hoisted.useV1TeamMatchMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: apiError(404, 'NOT_FOUND_OR_ARCHIVED', 'Team match was not found'),
    });
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: apiError(404, 'TEAM_MATCH_NOT_FOUND', '팀 매칭을 찾을 수 없어요.'),
      refetch: hoisted.refetchLineup,
    });

    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.getByText('팀매치를 찾을 수 없어요.')).toBeInTheDocument();
  });
});

describe('TeamMatchLineupPageClient — 결장 중인 팀원 표시 (Task 179)', () => {
  const KICKOFF = futureIso(180);
  const members = [
    { membershipId: 'm-1', userId: 'user-1', displayName: '홍길동', role: 'member', status: 'active' },
    { membershipId: 'm-2', userId: 'user-2', displayName: '김철수', role: 'member', status: 'active' },
    { membershipId: 'm-3', userId: 'user-3', displayName: '박영희', role: 'member', status: 'active' },
  ];
  const away = (userId: string, reason: string | null) => ({
    id: `u-${userId}`,
    userId,
    reason,
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2099-01-01T00:00:00.000Z',
    actorRole: 'TEAM_MANAGER',
  });
  const candidateRow = (name: string) => screen.getByText(name).closest('.tm-card') as HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.useV1TeamMatchMock.mockReturnValue({ data: { ...baseTeamMatch(), startsAt: KICKOFF }, isLoading: false, isError: false });
    hoisted.useV1MyTeamsMock.mockReturnValue({ data: [{ teamId: 'team-host', role: 'manager' }], isLoading: false });
    hoisted.useV1TeamMembersMock.mockReturnValue({ data: { items: members }, isLoading: false });
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({ starters: [GUEST_STARTER] }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false });
    hoisted.useV1TeamUnavailabilityMock.mockReturnValue({
      data: { items: [away('user-1', null), away('user-2', 'INJURY')] },
      isError: false,
      refetch: hoisted.refetchUnavailability,
    });
  });

  it('킥오프 시각 기준 결장 중인 후보에 경기 명단과 같은 결장 배지를 붙이고, 그대로 명단에 넣을 수 있다', () => {
    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(hoisted.useV1TeamUnavailabilityMock).toHaveBeenLastCalledWith('team-host', KICKOFF, { enabled: true });
    expect(within(candidateRow('김철수')).getByText('결장 · 부상')).toBeInTheDocument();
    expect(within(candidateRow('홍길동')).getByText('결장')).toBeInTheDocument();
    expect(within(candidateRow('박영희')).queryByText(/결장/)).toBeNull();

    // 자동으로 빼지 않는다 — 결장 중이어도 팀장이 고르면 들어간다.
    fireEvent.click(within(candidateRow('김철수')).getByRole('button', { name: '김철수 참석명단에 추가' }));
    expect(screen.getByText('참석명단 (2)')).toBeInTheDocument();
    // 명단에 넣은 뒤에도 그 행에 결장 배지가 남아 제출 전에 다시 볼 수 있다.
    const placedRow = screen.getByRole('button', { name: '김철수 등번호 넣기' }).closest('li') as HTMLElement;
    expect(within(placedRow).getByText('결장 · 부상')).toBeInTheDocument();
  });

  it('경기 시각을 모르면 결장을 조회하지 않고 편집기는 그대로 동작한다', () => {
    hoisted.useV1TeamMatchMock.mockReturnValue({ data: { ...baseTeamMatch(), startsAt: undefined }, isLoading: false, isError: false });
    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(hoisted.useV1TeamUnavailabilityMock).toHaveBeenLastCalledWith('team-host', null, { enabled: true });
    expect(screen.getAllByRole('button', { name: /참석명단에 추가$/ })).toHaveLength(3);
  });

  it('결장 조회가 실패하면 표시 없이 편집기가 동작하고, 안내와 다시 불러오기를 보여 준다', () => {
    hoisted.useV1TeamUnavailabilityMock.mockReturnValue({
      data: undefined,
      isError: true,
      refetch: hoisted.refetchUnavailability,
    });
    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(screen.getByText('결장 정보를 불러오지 못해 결장 표시 없이 보여요.')).toBeInTheDocument();
    expect(screen.queryByText(/^결장/, { selector: '.tm-badge' })).toBeNull();
    fireEvent.click(within(candidateRow('김철수')).getByRole('button', { name: '김철수 참석명단에 추가' }));
    expect(screen.getByText('참석명단 (2)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '결장 정보 다시 불러오기' }));
    expect(hoisted.refetchUnavailability).toHaveBeenCalledTimes(1);
  });

  it('편집할 수 없는 참석명단에서는 결장을 조회하지 않는다', () => {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({ editable: false, lockReason: 'terminal', state: 'LOCKED' }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });
    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);

    expect(hoisted.useV1TeamUnavailabilityMock).toHaveBeenLastCalledWith('team-host', KICKOFF, { enabled: false });
    expect(screen.queryByRole('button', { name: /참석명단에 추가$/ })).toBeNull();
  });
});

describe('lineup.view-model — H5 안내·순서', () => {
  const config = { positions: [], formations: [], minPlayers: 3, maxPlayers: 6 };

  it('인원 안내(L28)는 기준 밖일 때만, 모자람은 경고·넘침은 참고 톤이다 — 경계 포함', () => {
    expect(describeLineupSizeNotice(2, config)).toMatchObject({ tone: 'warn', emphasis: '지금 2명', before: '이 경기 기준 인원은 3~6명이에요 · ' });
    expect(describeLineupSizeNotice(3, config)).toBeNull();
    expect(describeLineupSizeNotice(6, config)).toBeNull();
    const over = describeLineupSizeNotice(7, config);
    expect(over).toMatchObject({ tone: 'info', emphasis: '지금 7명' });
    // 최대치는 한 번에 뛰는 인원일 수 있다 — 넘쳐도 제출할 수 있다고, 교체 선수 얘기로 오해를 막는다.
    expect(over?.after).toContain('그대로 제출할 수 있어요');
    expect(describeLineupSizeNotice(0, config)).toBeNull();
    expect(describeLineupSizeNotice(9, undefined)).toBeNull();
    expect(describeLineupSizeNotice(1, { positions: [], formations: [], minPlayers: 5, maxPlayers: 5 })?.before).toContain('5명이에요');
  });

  it('GK 안내는 두 명 이상일 때만', () => {
    expect(describeGoalkeeperNotice(1)).toBeNull();
    expect(describeGoalkeeperNotice(2)).toMatchObject({ emphasis: '2명' });
  });

  it('공개 안내(L10)는 누구에게·언제를 말하고, 기본 공개 시각이면 "킥오프 1시간 전"을 붙인다', () => {
    const now = new Date('2026-09-30T06:00:00.000Z').getTime(); // KST 15:00
    expect(describePublicationNotice('2026-09-30T11:00:00.000Z', '2026-09-30T12:00:00.000Z', now)).toBe(
      '킥오프 1시간 전(오후 8:00)에 상대 팀에게 이 명단이 공개돼요. 그 전까지 상대는 제출했는지만 볼 수 있어요.',
    );
    expect(describePublicationNotice('2026-09-30T10:00:00.000Z', '2026-09-30T12:00:00.000Z', now)).toMatch(/^오후 7:00에 상대 팀에게/);
    expect(describePublicationNotice('2026-10-07T11:00:00.000Z', '2026-10-07T12:00:00.000Z', now)).toMatch(/^킥오프 1시간 전\(10\/7 \(수\) 오후 8:00\)/);
  });

  it('명단·후보는 번호순, 번호 없는 사람은 뒤, 같은 번호면 이름순이다', () => {
    const rows = [
      { displayName: '홍', jerseyNumber: null },
      { displayName: '나', jerseyNumber: 10 },
      { displayName: '가', jerseyNumber: 2 },
      { displayName: '다', jerseyNumber: 10 },
    ].sort(compareByJersey);
    expect(rows.map((row) => row.displayName)).toEqual(['가', '나', '다', '홍']);
  });

  it('전원 추가는 이미 있는 사람을 건너뛰고, 팀 번호가 겹친 사람을 알려 준다', () => {
    const start = addRosterMemberToLineup(createEmptyLineupEditorState(1), { userId: 'u-1', displayName: '가', role: 'member', jerseyNumber: 5 });
    const { state, clearedJersey } = addAllRosterMembersToLineup(start, [
      { userId: 'u-1', displayName: '가', role: 'member', jerseyNumber: 5 },
      { userId: 'u-2', displayName: '나', role: 'member', jerseyNumber: 5 },
      { userId: 'u-3', displayName: '다', role: 'member', jerseyNumber: null },
    ]);
    expect(state.participants.map((entry) => [entry.displayName, entry.jerseyNumber])).toEqual([
      ['가', 5],
      ['나', null],
      ['다', null],
    ]);
    expect(clearedJersey).toEqual(['나']);
  });
});

describe('TeamMatchLineupPageClient — H5 참석명단', () => {
  const members = [
    { membershipId: 'm-1', userId: 'user-1', displayName: '홍길동', role: 'member', status: 'active', jerseyNumber: 7 },
    { membershipId: 'm-2', userId: 'user-2', displayName: '김철수', role: 'member', status: 'active', jerseyNumber: 9 },
  ];
  const starter = (userId: string | null, displayName: string, jerseyNumber: number | null, goalkeeper = false) => ({
    id: `p-${displayName}`, userId, displayName, jerseyNumber, position: null, goalkeeper, positionX: null, positionY: null,
  });

  function renderLineup(overrides: Partial<V1TeamMatchLineup>) {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({ data: baseLineup(overrides), isLoading: false, isError: false, error: null, refetch: hoisted.refetchLineup });
    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    hoisted.useV1TeamMatchMock.mockReturnValue({ data: baseTeamMatch(), isLoading: false, isError: false });
    hoisted.useV1MyTeamsMock.mockReturnValue({ data: [{ teamId: 'team-host', role: 'manager' }], isLoading: false });
    hoisted.useV1TeamMembersMock.mockReturnValue({ data: { items: members }, isLoading: false });
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false });
    hoisted.useV1TeamLineupHistoryMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('D-5 번호 시트: "이 경기만"은 초안만, "팀 번호도 함께"는 팀 번호를 저장한 뒤 초안까지 바꾼다', () => {
    hoisted.changeJerseyMutate.mockImplementation((_vars: unknown, options: { onSuccess: () => void }) => options.onSuccess());
    renderLineup({ starters: [starter('user-1', '홍길동', 7)] });

    fireEvent.click(screen.getByRole('button', { name: '홍길동 등번호 7번 바꾸기' }));
    const sheet = screen.getByRole('dialog', { name: '홍길동 등번호' });
    expect(within(sheet).getByLabelText('등번호')).toHaveAttribute('type', 'text');
    expect(within(sheet).getByText(/지금 팀 번호는 7번이에요/)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '저장할 변경이 없어요' })).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('등번호'), { target: { value: '10' } });
    fireEvent.click(within(sheet).getByRole('button', { name: '10번으로 저장' }));
    expect(hoisted.changeJerseyMutate).not.toHaveBeenCalled();
    // L7 — 두 자리 번호가 칩에 온전히 보인다(좁은 숫자 칸·스핀 버튼이 없는 텍스트 입력이라 잘리지 않는다).
    expect(screen.getByRole('button', { name: '홍길동 등번호 10번 바꾸기' })).toHaveTextContent(/^10$/);

    fireEvent.click(screen.getByRole('button', { name: '홍길동 등번호 10번 바꾸기' }));
    const again = screen.getByRole('dialog', { name: '홍길동 등번호' });
    fireEvent.click(within(again).getByLabelText('팀 번호도 함께 바꿔요'));
    fireEvent.change(within(again).getByLabelText('등번호'), { target: { value: '11' } });
    fireEvent.click(within(again).getByRole('button', { name: '11번으로 저장' }));
    expect(hoisted.changeJerseyMutate).toHaveBeenCalledWith({ membershipId: 'm-1', jerseyNumber: 11 }, expect.anything());
    expect(screen.getByRole('button', { name: '홍길동 등번호 11번 바꾸기' })).toBeInTheDocument();
  });

  // W4-V10 결정 C — 전술보드는 팀 번호만 읽는다(H7). 팀 번호가 없는 선수는 입구에서 "함께"가 기본이다.
  it('W4-V10: 팀 번호가 없는 선수는 "팀 번호도 함께"가 기본이라 그대로 저장하면 팀 번호도 생긴다', () => {
    hoisted.changeJerseyMutate.mockImplementation((_vars: unknown, options: { onSuccess: () => void }) => options.onSuccess());
    hoisted.useV1TeamMembersMock.mockReturnValue({
      data: { items: [...members, { membershipId: 'm-3', userId: 'user-3', displayName: '이영희', role: 'member', status: 'active', jerseyNumber: null }] },
      isLoading: false,
    });
    renderLineup({ starters: [starter('user-3', '이영희', null)] });

    fireEvent.click(screen.getByRole('button', { name: '이영희 등번호 넣기' }));
    const sheet = screen.getByRole('dialog', { name: '이영희 등번호' });
    expect(within(sheet).getByLabelText('팀 번호도 함께 바꿔요')).toBeChecked();
    expect(within(sheet).getByText(/지금 팀 번호가 없어서 함께 저장하는 게 기본이에요/)).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('등번호'), { target: { value: '10' } });
    fireEvent.click(within(sheet).getByRole('button', { name: '10번으로 저장' }));

    expect(hoisted.changeJerseyMutate).toHaveBeenCalledWith({ membershipId: 'm-3', jerseyNumber: 10 }, expect.anything());
  });

  it('W4-V10: "이 경기만"으로 팀 번호와 달라지면 그 결과를 바로 알린다 — 팀 번호가 있는 선수는 지금처럼 "이 경기만"이 기본', () => {
    hoisted.useV1TeamMembersMock.mockReturnValue({
      data: { items: [...members, { membershipId: 'm-3', userId: 'user-3', displayName: '이영희', role: 'member', status: 'active', jerseyNumber: null }] },
      isLoading: false,
    });
    renderLineup({ starters: [starter('user-1', '홍길동', 7), starter('user-3', '이영희', null)] });

    fireEvent.click(screen.getByRole('button', { name: '이영희 등번호 넣기' }));
    const sheet = screen.getByRole('dialog', { name: '이영희 등번호' });
    fireEvent.click(within(sheet).getByLabelText('이 경기만 바꿔요'));
    fireEvent.change(within(sheet).getByLabelText('등번호'), { target: { value: '10' } });
    expect(within(sheet).getByText('이 경기 참석명단에만 10번이 돼요. 전술보드와 다음 경기에는 팀 번호(없음)가 보여요.')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: '10번으로 저장' }));
    expect(hoisted.changeJerseyMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '홍길동 등번호 7번 바꾸기' }));
    const other = screen.getByRole('dialog', { name: '홍길동 등번호' });
    expect(within(other).getByLabelText('이 경기만 바꿔요')).toBeChecked();
    // 팀 번호와 같은 동안은 알릴 차이가 없다.
    expect(within(other).queryByText(/이 경기 참석명단에만/)).not.toBeInTheDocument();
    fireEvent.change(within(other).getByLabelText('등번호'), { target: { value: '11' } });
    expect(within(other).getByText('이 경기 참석명단에만 11번이 돼요. 전술보드와 다음 경기에는 팀 번호(7번)가 보여요.')).toBeInTheDocument();
  });

  it('D-5 번호 시트: 팀 번호 저장이 실패하면 초안도 그대로 두고 이유를 보인다', () => {
    hoisted.changeJerseyMutate.mockImplementation((_vars: unknown, options: { onError: (error: Error) => void }) =>
      options.onError(new V1ApiError({ status: 'error', statusCode: 409, code: 'TEAM_JERSEY_NUMBER_TAKEN', message: '이미 같은 등번호를 쓰는 팀원이 있어요.', timestamp: '2026-09-30T00:00:00.000Z' })),
    );
    renderLineup({ starters: [starter('user-1', '홍길동', 7)] });

    fireEvent.click(screen.getByRole('button', { name: '홍길동 등번호 7번 바꾸기' }));
    const sheet = screen.getByRole('dialog', { name: '홍길동 등번호' });
    fireEvent.click(within(sheet).getByLabelText('팀 번호도 함께 바꿔요'));
    fireEvent.change(within(sheet).getByLabelText('등번호'), { target: { value: '9' } });
    fireEvent.click(within(sheet).getByRole('button', { name: '9번으로 저장' }));

    expect(within(sheet).getByText('이미 같은 등번호를 쓰는 팀원이 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홍길동 등번호 9번 바꾸기' })).not.toBeInTheDocument();
  });

  it('D-5 번호 시트: 게스트는 팀 번호 선택지가 없고, 명단의 다른 번호와 겹치면 저장을 막는다', () => {
    renderLineup({ starters: [starter(null, '용병', 5), starter('user-1', '홍길동', 7)] });

    fireEvent.click(screen.getByRole('button', { name: '용병 등번호 5번 바꾸기' }));
    const sheet = screen.getByRole('dialog', { name: '용병 등번호' });
    expect(within(sheet).queryByLabelText('팀 번호도 함께 바꿔요')).not.toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('등번호'), { target: { value: '7' } });
    expect(within(sheet).getByText('7번은 홍길동이 쓰고 있어요. 다른 번호를 넣어 주세요.')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '7번으로 저장' })).toBeDisabled();
  });

  it('L28: 기준 인원을 넘어도 막지 않고 한 줄로 알린다 — 제출 버튼은 그대로 열려 있다', () => {
    renderLineup({
      lineupConfig: { positions: [], formations: [], minPlayers: 3, maxPlayers: 6 },
      starters: Array.from({ length: 7 }, (_, index) => starter(null, `선수${index + 1}`, index + 1, index < 2)),
    });

    expect(screen.getByText('지금 7명')).toBeInTheDocument();
    expect(screen.getByText('2명')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '참석명단 제출하기' })).toBeEnabled();
  });

  it('L10: 공개 전 명단은 누구에게·언제 공개되는지와 남은 시간을 말한다', () => {
    // 시각 문구가 KST 날짜 경계를 넘지 않게 지금을 고정한다(오후 3시, 킥오프 오후 6시).
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-30T06:00:00.000Z'));
      hoisted.useV1TeamMatchMock.mockReturnValue({ data: { ...baseTeamMatch(), startsAt: '2026-09-30T09:00:00.000Z' }, isLoading: false, isError: false });
      renderLineup({ starters: [starter('user-1', '홍길동', 7)], publicLineupAt: null });

      expect(screen.getByText('킥오프 1시간 전(오후 5:00)에 상대 팀에게 이 명단이 공개돼요. 그 전까지 상대는 제출했는지만 볼 수 있어요.')).toBeInTheDocument();
      expect(screen.getByText('공개까지 2시간 남았어요.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('H5 결정 A: 첫 기록 뒤에는 "추가만" — 빼기·번호 칩·GK 토글이 닫히고 늦게 온 선수 시트가 열린다', () => {
    renderLineup({
      state: 'SUBMITTED',
      revision: 2,
      editable: false,
      lockReason: 'records_exist',
      lateAdditionAllowed: true,
      starters: [starter('user-1', '홍길동', 7)],
    });

    expect(screen.getByText('경기 중 · 추가만')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /빼기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홍길동 등번호 7번 바꾸기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홍길동을 골키퍼로 지정' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '늦게 온 선수 추가' }));
    const sheet = screen.getByRole('dialog', { name: '늦게 온 선수 추가' });
    expect(within(sheet).queryByRole('button', { name: '홍길동 명단에 추가' })).not.toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: '김철수 명단에 추가' }));
    expect(hoisted.lateAddMutate).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { userId: 'user-2', jerseyNumber: 9 } }),
      expect.anything(),
    );
  });

  it('대조군 — 같은 기록 잠금이라도 추가가 닫혀 있으면(결과 확정 등) 추가 입구가 없다', () => {
    renderLineup({
      state: 'SUBMITTED',
      revision: 2,
      editable: false,
      lockReason: 'records_exist',
      lateAdditionAllowed: false,
      starters: [starter('user-1', '홍길동', 7)],
    });

    expect(screen.getByText('기록 시작 · 잠김')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '늦게 온 선수 추가' })).not.toBeInTheDocument();
  });

  it('L8: 불러오기 목록은 "날짜 vs 상대 · N명"이고 편집 중인 이 경기는 빠진다', () => {
    hoisted.useV1TeamLineupHistoryMock.mockReturnValue({
      data: {
        items: [
          { lineupId: 'l-self', gameId: 'game-1', source: 'TEAM_MATCH', sourceLabel: '팀 매치', opponentName: '상대팀', playedAt: '2026-09-30T12:00:00.000Z', sportName: null, formation: null, starterCount: 3, benchCount: 0, participants: [] },
          { lineupId: 'l-old', gameId: 'game-0', source: 'TEAM_MATCH', sourceLabel: '팀 매치', opponentName: '합정 유나이티드', playedAt: '2026-09-23T12:00:00.000Z', sportName: null, formation: null, starterCount: 2, benchCount: 0,
            participants: [
              { userId: 'user-1', displayName: '홍길동', jerseyNumber: 7, position: null, positionX: null, positionY: null, started: true, goalkeeper: false },
              { userId: 'user-2', displayName: '김철수', jerseyNumber: 9, position: null, positionX: null, positionY: null, started: true, goalkeeper: false },
            ] },
        ],
      },
      isLoading: false,
    });
    renderLineup({ starters: [] });

    fireEvent.click(screen.getByRole('button', { name: '지난 경기 명단으로 채우기' }));
    const sheet = screen.getByRole('dialog', { name: '이전 참석명단 불러오기' });
    expect(within(sheet).getByText('9/23 (수) vs 합정 유나이티드 · 2명')).toBeInTheDocument();
    expect(within(sheet).queryByText(/상대팀/)).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/선발/)).not.toBeInTheDocument();
  });
});

/**
 * W4-V4 결정 B — 두 팀에 모두 속한 팀원은 알리고(칩) "모두 넣기"에서만 기본으로 뺀다. 한 명씩 추가는 막지 않는다.
 * 대조군을 양쪽에 둔다: 양 팀 소속(홍길동) / 우리 팀만(김철수·이영희). 좁히는 변경이라 "여전히 들어간다"도 함께 잰다.
 */
describe('lineup.view-model — 상대 팀에도 소속된 팀원 (W4-V4)', () => {
  it('전원 추가는 상대 팀에도 소속된 팀원만 빼고, 우리 팀만 소속인 사람은 그대로 넣는다', () => {
    const { state, skippedOpponent } = addAllRosterMembersToLineup(createEmptyLineupEditorState(1), [
      { userId: 'u-1', displayName: '가', role: 'member', jerseyNumber: 1, alsoOpponentMember: true },
      { userId: 'u-2', displayName: '나', role: 'member', jerseyNumber: 2, alsoOpponentMember: false },
      { userId: 'u-3', displayName: '다', role: 'member', jerseyNumber: 3 },
    ]);
    expect(state.participants.map((entry) => entry.displayName)).toEqual(['나', '다']);
    expect(skippedOpponent).toEqual(['가']);
  });

  it('뺀 사람이 없으면 안내가 없고, 한 명이면 이름만, 여럿이면 "외 N명"이다', () => {
    expect(describeOpponentSkipped([])).toBeNull();
    expect(describeOpponentSkipped(['가'])).toBe(
      '상대 팀에도 소속된 가님은 빼고 넣었어요. 이 경기에 우리 팀으로 뛰면 아래에서 한 명씩 추가해 주세요.',
    );
    expect(describeOpponentSkipped(['가', '나', '다', '라'])).toMatch(/^상대 팀에도 소속된 가님 외 3명은 빼고 넣었어요\./);
  });
});

describe('TeamMatchLineupPageClient — 상대 팀에도 소속된 팀원 (W4-V4)', () => {
  const members = [
    { membershipId: 'm-1', userId: 'user-1', displayName: '홍길동', role: 'member', status: 'active', jerseyNumber: 7 },
    { membershipId: 'm-2', userId: 'user-2', displayName: '김철수', role: 'member', status: 'active', jerseyNumber: 9 },
    { membershipId: 'm-3', userId: 'user-3', displayName: '이영희', role: 'member', status: 'active', jerseyNumber: null },
  ];
  const eligible = (userId: string, displayName: string, alsoOpponentMember: boolean) => ({
    userId, displayName, jerseyNumber: null, attending: true, rsvpStatus: null, alsoOpponentMember,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    hoisted.useV1TeamMatchMock.mockReturnValue({ data: baseTeamMatch(), isLoading: false, isError: false });
    hoisted.useV1MyTeamsMock.mockReturnValue({ data: [{ teamId: 'team-host', role: 'manager' }], isLoading: false });
    hoisted.useV1TeamMembersMock.mockReturnValue({ data: { items: members }, isLoading: false });
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false });
    hoisted.useV1TeamLineupHistoryMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  function renderWith(eligibleMembers: ReturnType<typeof eligible>[]) {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({
      data: baseLineup({ eligibleMembers }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: hoisted.refetchLineup,
    });
    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);
  }

  it('"모두 넣기"는 두 팀 소속을 빼고 넣으며 알리고, 그 사람은 칩과 함께 한 명씩 추가할 수 있다', () => {
    renderWith([eligible('user-1', '홍길동', true), eligible('user-2', '김철수', false), eligible('user-3', '이영희', false)]);

    // 버튼이 말하는 인원 = 실제로 들어가는 인원.
    fireEvent.click(screen.getByRole('button', { name: '팀원 2명 모두 넣기' }));

    expect(screen.getByText('참석명단 (2)')).toBeInTheDocument();
    expect(screen.getByText(/^상대 팀에도 소속된 홍길동님은 빼고 넣었어요\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '김철수 등번호 9번 바꾸기' })).toBeInTheDocument();
    expect(screen.getByText('추가할 팀원 (1)')).toBeInTheDocument();
    expect(screen.getAllByText('상대 팀에도 소속')).toHaveLength(1);

    // 막지 않는다 — 우리 팀으로 뛰면 한 번 더 눌러 넣고, 명단 행에도 칩이 따라간다.
    fireEvent.click(screen.getByRole('button', { name: '홍길동 참석명단에 추가' }));
    expect(screen.getByText('참석명단 (3)')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: '홍길동 등번호 7번 바꾸기' }).closest('li');
    expect(row).toHaveTextContent('상대 팀에도 소속');
    expect(screen.getAllByText('상대 팀에도 소속')).toHaveLength(1);
  });

  it('대조군 — 두 팀 소속이 없으면 칩도 안내도 없이 전원이 들어간다', () => {
    renderWith([eligible('user-1', '홍길동', false), eligible('user-2', '김철수', false), eligible('user-3', '이영희', false)]);

    fireEvent.click(screen.getByRole('button', { name: '팀원 3명 모두 넣기' }));

    expect(screen.getByText('참석명단 (3)')).toBeInTheDocument();
    expect(screen.queryByText('상대 팀에도 소속')).not.toBeInTheDocument();
    expect(screen.queryByText(/빼고 넣었어요/)).not.toBeInTheDocument();
  });

  it('남은 팀원이 모두 두 팀 소속이면 "모두 넣기" 대신 후보 목록에서 한 명씩 넣는다', () => {
    renderWith([eligible('user-1', '홍길동', true), eligible('user-2', '김철수', true), eligible('user-3', '이영희', true)]);

    expect(screen.queryByRole('button', { name: /모두 넣기/ })).not.toBeInTheDocument();
    expect(screen.getByText('추가할 팀원 (3)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이영희 참석명단에 추가' }));
    expect(screen.getByText('참석명단 (1)')).toBeInTheDocument();
  });
});

describe('lineup.view-model — 다시 제출 안내 (Task 180 R-2)', () => {
  // KST 오후 3:12 에 다시 냈다.
  const at = Date.parse('2026-10-13T06:12:00.000Z');

  it('공개 전이면 상대에게 언제 바뀐 명단이 보이는지까지 말한다', () => {
    expect(describeResubmitted(at, '2026-10-13T10:00:00.000Z', at)).toBe(
      '다시 제출했어요(오후 3:12). 상대 팀에는 계속 "제출 완료"로 보이고, 오후 7:00에 바뀐 명단이 공개돼요.',
    );
  });

  it('공개 뒤에는 바로 보인다고, 공개 시각을 모르면 낸 시각만 말한다', () => {
    expect(describeResubmitted(at, '2026-10-13T05:00:00.000Z', at)).toBe('다시 제출했어요(오후 3:12). 상대 팀에도 바뀐 명단이 보여요.');
    expect(describeResubmitted(at, null, at)).toBe('다시 제출했어요(오후 3:12).');
  });
});

describe('TeamMatchLineupPageClient — 낸 뒤엔 다시 제출만 (Task 180 R-2)', () => {
  const starters = [
    { id: 'p-1', userId: 'user-1', displayName: '홍길동', jerseyNumber: 7, position: null, goalkeeper: false, positionX: null, positionY: null },
    { id: 'p-2', userId: 'user-2', displayName: '김철수', jerseyNumber: 9, position: null, goalkeeper: false, positionX: null, positionY: null },
  ];
  const submittedLineup = () => baseLineup({ state: 'SUBMITTED', revision: 4, version: 4, starters });
  const draftLineup = () => baseLineup({ state: 'DRAFT', revision: 4, version: 4, starters });

  function renderLineup(data: V1TeamMatchLineup) {
    hoisted.useV1TeamMatchLineupMock.mockReturnValue({ data, isLoading: false, isError: false, error: null, refetch: hoisted.refetchLineup });
    render(<TeamMatchLineupPageClient teamMatchId="tm-1" />);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    hoisted.useV1TeamMatchMock.mockReturnValue({ data: baseTeamMatch(), isLoading: false, isError: false });
    hoisted.useV1MyTeamsMock.mockReturnValue({ data: [{ teamId: 'team-host', role: 'manager' }], isLoading: false });
    hoisted.useV1TeamMembersMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    hoisted.useV1GameMock.mockReturnValue({ data: undefined, isLoading: false });
    hoisted.useV1TeamLineupHistoryMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('낸 명단에는 [저장]이 없고, 고칠 게 없으면 [변경 취소]·[제출 완료]가 모두 쉰다', () => {
    renderLineup(submittedLineup());

    expect(screen.queryByRole('button', { name: /^저장/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '참석명단 제출하기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경 취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '제출 완료' })).toBeDisabled();
  });

  it('한 명을 빼면 [변경 취소]·[다시 제출하기]가 켜지고, 다시 제출은 저장 요청 하나로 끝난다', () => {
    renderLineup(submittedLineup());
    fireEvent.click(screen.getByRole('button', { name: '김철수 참석명단에서 빼기' }));

    expect(screen.getByText('제출한 명단과 달라요. [다시 제출하기]를 눌러야 바뀐 명단이 상대 팀에 보여요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경 취소' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '다시 제출하기' }));

    expect(hoisted.saveMutate).toHaveBeenCalledTimes(1);
    expect(hoisted.saveMutate.mock.calls[0][0].payload).toMatchObject({
      expectedVersion: 4,
      participants: [expect.objectContaining({ userId: 'user-1' })],
    });
    act(() => hoisted.saveMutate.mock.calls[0][1].onSuccess({ revision: 5, state: 'SUBMITTED' }));
    act(() => hoisted.saveMutate.mock.calls[0][1].onSettled());

    // 서버가 저장을 곧바로 제출본으로 만들므로 제출 API 는 더 부르지 않는다(불러도 아무것도 바꾸지 않는 멱등 성공이다).
    expect(hoisted.submitMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/^다시 제출했어요\(오[전후] \d{1,2}:\d{2}\)\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경 취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '제출 완료' })).toBeDisabled();
  });

  it('다시 제출이 실패하면 고친 내용과 [다시 제출하기]가 그대로 남는다', () => {
    renderLineup(submittedLineup());
    fireEvent.click(screen.getByRole('button', { name: '김철수 참석명단에서 빼기' }));
    fireEvent.click(screen.getByRole('button', { name: '다시 제출하기' }));

    act(() => hoisted.saveMutate.mock.calls[0][1].onError(apiError(409, 'LINEUP_LOCKED_FOR_DIRECT_EDIT', '경기 기록이 시작된 뒤에는 참석명단을 수정할 수 없어요.')));
    act(() => hoisted.saveMutate.mock.calls[0][1].onSettled());

    expect(screen.getByText('경기 기록이 시작된 뒤에는 참석명단을 수정할 수 없어요.')).toBeInTheDocument();
    expect(screen.getByText('참석명단 (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 제출하기' })).toBeEnabled();
  });

  it('[변경 취소]는 서버의 제출본을 다시 불러와 고친 내용과 실행 취소 안내를 버린다', async () => {
    hoisted.refetchLineup.mockResolvedValue({ data: submittedLineup() });
    renderLineup(submittedLineup());
    fireEvent.click(screen.getByRole('button', { name: '김철수 참석명단에서 빼기' }));
    expect(screen.getByText('참석명단 (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '변경 취소' }));

    await waitFor(() => expect(screen.getByText('참석명단 (2)')).toBeInTheDocument());
    expect(hoisted.refetchLineup).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('김철수 선수를 명단에서 뺐어요.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경 취소' })).toBeDisabled();
    expect(hoisted.saveMutate).not.toHaveBeenCalled();
  });

  it('처음 낸 직후부터 [변경 취소]·[제출 완료]로 바뀐다 — 재조회 전에도 [저장]으로 초안을 만들 길이 없다', () => {
    renderLineup(draftLineup());
    fireEvent.click(screen.getByRole('button', { name: '참석명단 제출하기' }));
    expect(hoisted.submitMutate).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 4 }), expect.anything());

    act(() => hoisted.submitMutate.mock.calls[0][1].onSuccess());

    expect(screen.queryByRole('button', { name: /^저장/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '변경 취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '제출 완료' })).toBeDisabled();
  });

  it('대조군 — 내기 전 초안은 그대로 [저장]·[참석명단 제출하기]다', () => {
    renderLineup(draftLineup());
    fireEvent.click(screen.getByRole('button', { name: '김철수 참석명단에서 빼기' }));

    expect(screen.queryByRole('button', { name: '변경 취소' })).not.toBeInTheDocument();
    expect(screen.getByText('저장하지 않은 변경사항이 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '참석명단 제출하기' })).toBeEnabled();
  });
});
