import { describe, expect, it } from 'vitest';
import type { FormationSlot } from '@/components/lineup/formation-slots';
import type { GameLineup, GameLineupParticipant } from '@/types/game-operations';
import {
  applyLoadedSelection, buildSavePayload, dropPlayerOnPitch, hydrateFixtureLineupState, placeInSlot,
  selectFormation, setGoalkeeper, toggleStarter, unplaceFromSlot, type FixtureRosterPlayer,
} from './fixture-lineup.view-model';

const HONG: FixtureRosterPlayer = { userId: 'user-hong', name: '홍길동' };
const KIM: FixtureRosterPlayer = { userId: 'user-kim', name: '김철수' };

function participant(overrides: Partial<GameLineupParticipant>): GameLineupParticipant {
  return {
    id: 'p1',
    gameId: 'game-1',
    sideId: 'side-1',
    lineupId: 'lineup-1',
    userId: null,
    displayNameSnapshot: '홍길동',
    jerseyNumber: null,
    position: null,
    positionX: null,
    positionY: null,
    started: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * 기본은 **저장을 한 번 거친** 라인업(revision 2)이다 — revision 1 + DRAFT 는 대진 확정 때
 * 백엔드가 깔아 두는 초기 라인업이라 "아직 아무도 고르지 않음"으로 해석된다(아래 전용 테스트).
 */
function lineup(participants: GameLineupParticipant[], formation: string | null = null): GameLineup {
  return {
    id: 'lineup-1',
    gameId: 'game-1',
    sideId: 'side-1',
    revision: 2,
    state: 'DRAFT',
    version: 1,
    submittedAt: null,
    supersedesId: null,
    formation,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    participants,
  };
}

/** 저장된 라인업이 없는 상태에서 로스터 첫 사람만 선발로 올린 상태. */
function withOneStarter() {
  const state = hydrateFixtureLineupState([], 'side-1', 1, 'GK', [HONG, KIM]);
  return toggleStarter(state, HONG.userId);
}

describe('fixture-lineup.view-model — 등록 명단이 유일한 출처', () => {
  it('저장된 라인업이 없으면 등록 명단 전원이 후보로 시작한다', () => {
    const state = hydrateFixtureLineupState([], 'side-1', 1, 'GK', [HONG, KIM]);
    expect(state.starters).toHaveLength(0);
    expect(state.bench.map((entry) => entry.displayName)).toEqual(['홍길동', '김철수']);
    expect(state.lineupId).toBeNull();
  });

  it('선발 체크는 후보↔선발을 오간다 — 체크하지 않은 사람은 후보로 남는다', () => {
    const state = withOneStarter();
    expect(state.starters.map((entry) => entry.displayName)).toEqual(['홍길동']);
    expect(state.bench.map((entry) => entry.displayName)).toEqual(['김철수']);
    const back = toggleStarter(state, HONG.userId);
    expect(back.starters).toHaveLength(0);
    expect(back.bench.map((entry) => entry.displayName)).toEqual(['김철수', '홍길동']);
  });

  // 이름이 같은 두 사람이 있을 때 이름으로 이으면 선발 표시가 엉뚱한 사람에게 붙는다.
  // userId로 잇는 한 이 테스트는 통과하고, 이름 매칭으로 되돌아가면 깨진다.
  it('저장된 선발을 userId로 되살린다 — 동명이인이 있어도 사람이 바뀌지 않는다', () => {
    const twinA: FixtureRosterPlayer = { userId: 'user-a', name: '박지성' };
    const twinB: FixtureRosterPlayer = { userId: 'user-b', name: '박지성' };
    const state = hydrateFixtureLineupState(
      [lineup([participant({ id: 'p1', userId: 'user-b', displayNameSnapshot: '박지성', jerseyNumber: 7, started: true })])],
      'side-1',
      1,
      'GK',
      [twinA, twinB],
    );
    expect(state.starters).toHaveLength(1);
    expect(state.starters[0]).toMatchObject({ userId: 'user-b', jerseyNumber: 7 });
    expect(state.bench.map((entry) => entry.userId)).toEqual(['user-a']);
  });

  // userId 컬럼이 생기기 전에 저장된 라인업 — 이름으로라도 이어야 기존 선발이 유지된다.
  it('userId가 없는 옛 참가자는 이름으로 이어 붙인다', () => {
    const state = hydrateFixtureLineupState(
      [lineup([participant({ userId: null, displayNameSnapshot: '김철수', jerseyNumber: 10, started: true })])],
      'side-1',
      1,
      'GK',
      [HONG, KIM],
    );
    expect(state.starters).toHaveLength(1);
    expect(state.starters[0]).toMatchObject({ userId: 'user-kim', jerseyNumber: 10 });
    expect(state.droppedUnrosteredCount).toBe(0);
  });

  // 등록 명단이 유일한 출처라는 원칙의 실제 귀결 — 명단 밖 선수는 화면에 오르지 않는다.
  it('등록 명단에 없는 저장 참가자는 버리고 그 수를 남긴다', () => {
    const state = hydrateFixtureLineupState(
      [
        lineup([
          participant({ id: 'p1', userId: 'user-hong', displayNameSnapshot: '홍길동', started: true }),
          participant({ id: 'p2', userId: 'user-ghost', displayNameSnapshot: '이방인', started: true }),
        ]),
      ],
      'side-1',
      1,
      'GK',
      [HONG],
    );
    expect([...state.starters, ...state.bench].map((entry) => entry.displayName)).toEqual(['홍길동']);
    expect(state.droppedUnrosteredCount).toBe(1);
  });

  // 대진 확정 시 백엔드가 등록 명단 전원을 담은 초기 라인업(revision 1 DRAFT)을 깔아 두는데,
  // 그 참가자들은 컬럼 기본값 때문에 전원 started=true 다 — "정해졌다"가 아니라 "아직 아무도
  // 고르지 않았다"는 뜻이다. 그대로 옮기면 팀장의 일이 "선발 고르기"가 아니라 "빼기"가 된다.
  it('아무도 손대지 않은 초기 라인업(revision 1 DRAFT)은 전원 후보로 시작한다', () => {
    const state = hydrateFixtureLineupState(
      [
        {
          ...lineup([
            participant({ id: 'p1', userId: 'user-hong', displayNameSnapshot: '홍길동', started: true }),
            participant({ id: 'p2', userId: 'user-kim', displayNameSnapshot: '김철수', started: true }),
          ]),
          revision: 1,
        },
      ],
      'side-1',
      1,
      'GK',
      [HONG, KIM],
    );
    expect(state.starters).toHaveLength(0);
    expect(state.bench.map((entry) => entry.userId)).toEqual(['user-hong', 'user-kim']);
  });

  // 화면에는 후보로 보이는 사람이 제출로 선발 확정되면 최악이다 — 먼저 저장하게 만든다.
  it('초기 라인업은 제출 대상이 아니다 — 저장을 거쳐야 제출할 수 있다', () => {
    const state = hydrateFixtureLineupState(
      [{ ...lineup([participant({ userId: 'user-hong', displayNameSnapshot: '홍길동', started: true })]), revision: 1 }],
      'side-1',
      1,
      'GK',
      [HONG],
    );
    expect(state.lineupId).toBeNull();
    expect(state.lineupState).toBeNull();
  });

  // 한 번이라도 저장했으면 그건 사람이 고른 결과다 — 그대로 되살려야 한다.
  it('저장을 거친 라인업(revision 2+)의 선발은 그대로 복원한다', () => {
    const saved = {
      ...lineup([
        participant({ id: 'p1', userId: 'user-hong', displayNameSnapshot: '홍길동', started: true }),
        participant({ id: 'p2', userId: 'user-kim', displayNameSnapshot: '김철수', started: false }),
      ]),
      revision: 2,
    };
    const state = hydrateFixtureLineupState([saved], 'side-1', 1, 'GK', [HONG, KIM]);
    expect(state.starters.map((entry) => entry.userId)).toEqual(['user-hong']);
    expect(state.bench.map((entry) => entry.userId)).toEqual(['user-kim']);
    expect(state.lineupId).toBe('lineup-1');
  });

  // 제출·잠금된 라인업은 revision 1이어도 사람이 확정한 결과다(스태프가 대신 제출한 경우 등).
  it('revision 1이어도 이미 제출(SUBMITTED)됐으면 그 선발을 그대로 살린다', () => {
    const submitted = {
      ...lineup([participant({ userId: 'user-hong', displayNameSnapshot: '홍길동', started: true })]),
      state: 'SUBMITTED' as const,
    };
    const state = hydrateFixtureLineupState([submitted], 'side-1', 1, 'GK', [HONG, KIM]);
    expect(state.starters.map((entry) => entry.userId)).toEqual(['user-hong']);
    expect(state.lineupState).toBe('SUBMITTED');
  });

  it('저장 페이로드는 등록 명단의 userId를 함께 실어 보낸다', () => {
    const payload = buildSavePayload(withOneStarter(), 'GK');
    expect(payload.expectedVersion).toBe(0);
    expect(payload.participants).toEqual([
      expect.objectContaining({ userId: 'user-hong', displayNameSnapshot: '홍길동', started: true }),
      expect.objectContaining({ userId: 'user-kim', displayNameSnapshot: '김철수', started: false }),
    ]);
  });

  it('상대 팀과 공유하는 game version이 아니라 내 사이드의 최신 lineup revision을 CAS로 쓴다', () => {
    const saved = lineup([participant({ userId: HONG.userId, started: true })]);
    const state = hydrateFixtureLineupState([saved], 'side-1', 99, 'GK', [HONG, KIM]);

    expect(state.lineupRevision).toBe(2);
    expect(buildSavePayload(toggleStarter(state, KIM.userId), 'GK').expectedVersion).toBe(2);
  });
});

describe('fixture-lineup.view-model — 피치 배치', () => {
  it('selectFormation relabels without moving an already-placed starter', () => {
    let state = withOneStarter();
    const fixoSlot: FormationSlot = { positionCode: 'FIXO', label: '픽소', x: 33, y: 43 };
    state = placeInSlot(state, state.starters[0].key, fixoSlot);
    const next = selectFormation(state, '2-2');
    expect(next.formation).toBe('2-2');
    expect(next.starters[0]).toMatchObject({ positionX: 33, positionY: 43 });
  });

  it('placeInSlot on the GK slot sets goalkeeper=true and clears position, and unseats any prior goalkeeper', () => {
    let state = withOneStarter();
    state = toggleStarter(state, KIM.userId);
    state = setGoalkeeper(state, state.starters[0].key);
    const gkSlot: FormationSlot = { positionCode: 'GK', label: 'GK', x: 50, y: 6 };
    const next = placeInSlot(state, state.starters[1].key, gkSlot);
    expect(next.starters[0].goalkeeper).toBe(false);
    expect(next.starters[1]).toMatchObject({ goalkeeper: true, position: null, positionX: 50, positionY: 6 });
  });

  it('unplaceFromSlot clears position, coordinates, and goalkeeper together', () => {
    let state = withOneStarter();
    const fixoSlot: FormationSlot = { positionCode: 'FIXO', label: '픽소', x: 33, y: 43 };
    state = placeInSlot(state, state.starters[0].key, fixoSlot);
    const cleared = unplaceFromSlot(state, state.starters[0].key);
    expect(cleared.starters[0]).toMatchObject({ position: null, positionX: null, positionY: null, goalkeeper: false });
  });

  it('buildSavePayload already carries positionCode for slot-placed starters (fixture side had no toParticipantInput bug)', () => {
    let state = withOneStarter();
    const fixoSlot: FormationSlot = { positionCode: 'FIXO', label: '픽소', x: 33, y: 43 };
    state = placeInSlot(state, state.starters[0].key, fixoSlot);
    const payload = buildSavePayload(state, 'GK');
    expect(payload.participants[0]).toMatchObject({ position: 'FIXO', positionX: 33, positionY: 43, started: true });
  });

  // [알파 감사 E] 저장 시 종목별 골키퍼 코드를 실제로 쓰는지 검증한다 — 회귀하면
  // 풋살 골키퍼가 축구 코드 'GK'로 저장돼 lineupConfig.positions(GOLEIRO/FIXO/ALA/PIVO)와
  // 어긋난다. 하드코딩된 'GK'로 되돌아가면 이 테스트가 깨진다.
  it('buildSavePayload writes the sport-specific goalkeeper code (futsal GOLEIRO), not a hardcoded GK', () => {
    let state = withOneStarter();
    state = setGoalkeeper(state, state.starters[0].key);
    const payload = buildSavePayload(state, 'GOLEIRO');
    expect(payload.participants[0]).toMatchObject({ position: 'GOLEIRO' });
    expect(payload.participants[0].position).not.toBe('GK');
  });

  // [알파 감사 E] 재수화(새로고침·재편집 진입)도 같은 종목 코드로 비교해야 한다 —
  // 하드코딩된 'GK' 비교로 되돌아가면 풋살에서 저장된 골키퍼(position: 'GOLEIRO')를
  // 다시 열었을 때 goalkeeper 플래그가 꺼진 채로(그리고 position: 'GOLEIRO'가 그대로
  // 일반 포지션인 것처럼) 복원된다.
  it('hydrateFixtureLineupState recognizes a futsal goalkeeper saved under its sport-specific code', () => {
    const state = hydrateFixtureLineupState(
      [
        lineup([
          participant({
            userId: 'user-hong',
            displayNameSnapshot: '홍길동',
            jerseyNumber: 1,
            position: 'GOLEIRO',
            positionX: 50,
            positionY: 6,
            started: true,
          }),
        ]),
      ],
      'side-1',
      1,
      'GOLEIRO',
      [HONG],
    );
    expect(state.starters[0]).toMatchObject({ goalkeeper: true, position: null });
  });
});

describe('applyLoadedSelection', () => {
  /** 등록 명단 두 명이 모두 후보로 시작하는 상태 — 불러오기 전의 기본 모습이다. */
  function emptyState() {
    return hydrateFixtureLineupState([], 'side-1', 1, 'GK', [HONG, KIM]);
  }

  function loaded(overrides: Partial<{
    userId: string | null;
    jerseyNumber: number | null;
    position: string | null;
    positionX: number | null;
    positionY: number | null;
    started: boolean;
    goalkeeper: boolean;
  }> = {}) {
    return {
      userId: HONG.userId,
      jerseyNumber: null,
      position: null,
      positionX: null,
      positionY: null,
      started: true,
      goalkeeper: false,
      ...overrides,
    };
  }

  it('명단 크기는 그대로 두고 선발 선택만 복원한다', () => {
    const next = applyLoadedSelection(emptyState(), [loaded()], { formation: null, keepPlacement: true });

    expect(next.starters).toHaveLength(1);
    expect(next.bench).toHaveLength(1);
    expect(next.starters[0].userId).toBe(HONG.userId);
    expect(next.starters.length + next.bench.length).toBe(2);
  });

  it('불러온 라인업에 없던 사람은 후보로 내려간다', () => {
    const next = applyLoadedSelection(emptyState(), [loaded()], { formation: null, keepPlacement: true });

    expect(next.bench.map((entry) => entry.userId)).toEqual([KIM.userId]);
  });

  it('등번호와 배치 좌표를 함께 되살린다', () => {
    const next = applyLoadedSelection(
      emptyState(),
      [loaded({ jerseyNumber: 7, position: 'MF', positionX: 40, positionY: 70 })],
      { formation: '4-4-2', keepPlacement: true },
    );

    expect(next.starters[0]).toMatchObject({ jerseyNumber: 7, position: 'MF', positionX: 40, positionY: 70 });
    expect(next.formation).toBe('4-4-2');
  });

  it('종목이 다르면 배치를 버리고 명단 구성만 가져온다', () => {
    const next = applyLoadedSelection(
      emptyState(),
      [loaded({ jerseyNumber: 7, position: 'PIVO', positionX: 40, positionY: 70 })],
      { formation: '1-2-1', keepPlacement: false },
    );

    // 있지도 않은 포지션에 선수가 서지 않도록 좌표·포지션·포메이션을 버린다.
    expect(next.starters[0]).toMatchObject({ positionX: null, positionY: null, position: null });
    expect(next.formation).toBeNull();
    // 명단 구성(누가 선발인지)과 등번호는 그대로 살아 있다.
    expect(next.starters[0].jerseyNumber).toBe(7);
    expect(next.starters[0].userId).toBe(HONG.userId);
  });

  it('후보로 불러온 사람에게는 골키퍼 표시나 좌표가 남지 않는다', () => {
    const next = applyLoadedSelection(
      emptyState(),
      [loaded({ started: false, goalkeeper: true, positionX: 50, positionY: 6 })],
      { formation: null, keepPlacement: true },
    );

    const hong = next.bench.find((entry) => entry.userId === HONG.userId);
    expect(hong).toMatchObject({ goalkeeper: false, positionX: null, positionY: null });
  });

  it('불러오면 저장해야 할 변경으로 표시된다', () => {
    const next = applyLoadedSelection(emptyState(), [loaded()], { formation: null, keepPlacement: true });

    expect(next.dirty).toBe(true);
  });
});

/**
 * 오너 요청(2026-08-18) — 명단 카드를 피치로 끌어다 놓는 경로. 예전에는 ①명단에서 선발
 * 체크 → ②피치에서 다시 배치, 두 단계였다. 한 제스처로 **선발 승격 + 배치**가 함께
 * 일어나지 않으면 "끌어다 놓았는데 아무 데도 안 들어갔다"가 된다.
 */
describe('fixture-lineup.view-model — 명단에서 피치로 끌어다 놓기', () => {
  const SLOT: FormationSlot = { positionCode: 'PIVO', label: '피보', x: 50, y: 70 };

  it('후보를 좌표에 놓으면 선발로 올라가고 그 자리에 배치된다', () => {
    const state = hydrateFixtureLineupState([], 'side-1', 1, 'GK', [HONG, KIM]);
    expect(state.starters).toHaveLength(0);

    const next = dropPlayerOnPitch(state, HONG.userId, { kind: 'point', x: 40, y: 60 });

    expect(next.starters.map((entry) => entry.displayName)).toEqual(['홍길동']);
    expect(next.bench.map((entry) => entry.displayName)).toEqual(['김철수']);
    const placed = next.starters[0];
    expect([placed.positionX, placed.positionY]).toEqual([40, 60]);
  });

  it('후보를 빈 슬롯에 놓으면 선발로 올라가고 그 슬롯 좌표·포지션을 갖는다', () => {
    const state = hydrateFixtureLineupState([], 'side-1', 1, 'GK', [HONG, KIM]);

    const next = dropPlayerOnPitch(state, KIM.userId, { kind: 'slot', slot: SLOT });

    const placed = next.starters.find((entry) => entry.key === KIM.userId);
    expect(placed).toBeDefined();
    expect([placed!.positionX, placed!.positionY]).toEqual([SLOT.x, SLOT.y]);
    expect(placed!.position).toBe('PIVO');
  });

  it('이미 선발인 선수를 옮기면 후보로 되돌리지 않고 위치만 바뀐다', () => {
    const state = dropPlayerOnPitch(withOneStarter(), HONG.userId, { kind: 'point', x: 20, y: 20 });

    const moved = dropPlayerOnPitch(state, HONG.userId, { kind: 'point', x: 80, y: 90 });

    expect(moved.starters).toHaveLength(1);
    expect(moved.bench.map((entry) => entry.displayName)).toEqual(['김철수']);
    expect([moved.starters[0].positionX, moved.starters[0].positionY]).toEqual([80, 90]);
  });

  it('명단에 없는 key 는 아무 일도 일으키지 않는다', () => {
    const state = hydrateFixtureLineupState([], 'side-1', 1, 'GK', [HONG, KIM]);

    expect(dropPlayerOnPitch(state, 'user-ghost', { kind: 'point', x: 50, y: 50 })).toBe(state);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1차 대회(2026-08-15~16) 회고: "라인업에서 선수 번호 등록을 처음에만 하고 추후에는
// 안하는 문제 / 라인업 불러오기시 번호는 등록이 안된건지 확인 필요".
//
// 등번호 결정은 `loaded ?? teamFixed ?? recent` 3단계로 **설계는 돼 있었지만**
// 2순위(팀 고정 등번호)가 死문이었다 — 로스터 응답에 그 번호가 아예 없어서 프론트가
// 넘길 값을 갖지 못했다. 결과적으로 팀장이 매 경기 번호를 다시 타이핑해야 했고,
// 그 반복이 곧 오탈자 발생원이다.
//
// 이 스위트가 지키는 계약:
//   ① 저장된 번호가 있으면 그것이 이긴다 (팀 고정 번호가 개별 조정을 덮으면 안 된다)
//   ② 저장된 번호가 없으면 팀 고정 번호로 채운다 — **'불러오기'를 누르지 않아도**
// ─────────────────────────────────────────────────────────────────────────────
describe('hydrateFixtureLineupState — 팀 고정 등번호', () => {
  const HONG_WITH_JERSEY: FixtureRosterPlayer = { ...HONG, teamJerseyNumber: 7 };
  const KIM_WITH_JERSEY: FixtureRosterPlayer = { ...KIM, teamJerseyNumber: 11 };

  // ② 화면에 처음 들어오는 순간부터 채워져야 한다.
  it('저장된 라인업이 아예 없어도 팀 고정 등번호로 채운다', () => {
    const state = hydrateFixtureLineupState([], 'side-1', 1, 'GK', [HONG_WITH_JERSEY, KIM_WITH_JERSEY]);

    const byName = new Map([...state.starters, ...state.bench].map((e) => [e.displayName, e.jerseyNumber]));
    expect(byName.get('홍길동')).toBe(7);
    expect(byName.get('김철수')).toBe(11);
  });

  // ① 개별 조정이 팀 기본값에 덮이면, 이 경기만 다른 번호를 단 선수가 매번 되돌려진다.
  it('저장된 번호가 있으면 팀 고정 번호보다 우선한다', () => {
    const lineup: GameLineup = {
      id: 'lineup-1', gameId: 'game-1', sideId: 'side-1', revision: 2, state: 'DRAFT', version: 0,
      submittedAt: null, supersedesId: null, formation: null,
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      participants: [participant({ userId: 'user-hong', displayNameSnapshot: '홍길동', jerseyNumber: 99 })],
    };

    const state = hydrateFixtureLineupState([lineup], 'side-1', 1, 'GK', [HONG_WITH_JERSEY, KIM_WITH_JERSEY]);

    const byName = new Map([...state.starters, ...state.bench].map((e) => [e.displayName, e.jerseyNumber]));
    expect(byName.get('홍길동')).toBe(99);
    // 저장된 적 없는 사람은 여전히 팀 고정 번호로 채워진다.
    expect(byName.get('김철수')).toBe(11);
  });

  it('팀 고정 번호가 없는 선수는 빈칸으로 둔다 (0 이나 임의 번호를 지어내지 않는다)', () => {
    const state = hydrateFixtureLineupState([], 'side-1', 1, 'GK', [HONG, KIM_WITH_JERSEY]);

    const byName = new Map([...state.starters, ...state.bench].map((e) => [e.displayName, e.jerseyNumber]));
    expect(byName.get('홍길동')).toBeNull();
    expect(byName.get('김철수')).toBe(11);
  });

  it('teamJerseyNumber 를 아예 안 넘기는 기존 호출부도 그대로 동작한다', () => {
    const state = hydrateFixtureLineupState([], 'side-1', 1, 'GK', [HONG, KIM]);

    expect([...state.starters, ...state.bench].every((e) => e.jerseyNumber === null)).toBe(true);
  });
});
