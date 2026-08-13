import { describe, expect, it } from 'vitest';
import type { FormationSlot } from '@/components/lineup/formation-slots';
import type { GameLineup, GameLineupParticipant } from '@/types/game-operations';
import {
  buildSavePayload, hydrateFixtureLineupState, placeInSlot, selectFormation, setGoalkeeper,
  toggleStarter, unplaceFromSlot, type FixtureRosterPlayer,
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

function lineup(participants: GameLineupParticipant[], formation: string | null = null): GameLineup {
  return {
    id: 'lineup-1',
    gameId: 'game-1',
    sideId: 'side-1',
    revision: 1,
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

  it('저장 페이로드는 등록 명단의 userId를 함께 실어 보낸다', () => {
    const payload = buildSavePayload(withOneStarter(), 'GK');
    expect(payload.participants).toEqual([
      expect.objectContaining({ userId: 'user-hong', displayNameSnapshot: '홍길동', started: true }),
      expect.objectContaining({ userId: 'user-kim', displayNameSnapshot: '김철수', started: false }),
    ]);
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
