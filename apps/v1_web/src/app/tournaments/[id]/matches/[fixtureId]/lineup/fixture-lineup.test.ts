import { describe, expect, it } from 'vitest';
import type { FormationSlot } from '@/components/lineup/formation-slots';
import type { GameLineup } from '@/types/game-operations';
import {
  addPlayer, buildSavePayload, createEmptyFixtureLineupState, hydrateFixtureLineupState, linkedUserIds, moveToStarters,
  placeInSlot, selectFormation, setEntryUserId, setGoalkeeper, unplaceFromSlot,
} from './fixture-lineup.view-model';

function withOneStarter() {
  let state = createEmptyFixtureLineupState(1);
  state = addPlayer(state, '홍길동');
  state = moveToStarters(state, state.bench[0].key);
  return state;
}

describe('fixture-lineup.view-model', () => {
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
    state = addPlayer(state, '김철수');
    state = moveToStarters(state, state.bench[0].key);
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
    const lineup: GameLineup = {
      id: 'lineup-1',
      gameId: 'game-1',
      sideId: 'side-1',
      revision: 1,
      state: 'DRAFT',
      version: 1,
      submittedAt: null,
      supersedesId: null,
      formation: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      participants: [
        {
          id: 'p1',
          gameId: 'game-1',
          sideId: 'side-1',
          lineupId: 'lineup-1',
          displayNameSnapshot: '홍길동',
          jerseyNumber: 1,
          position: 'GOLEIRO',
          positionX: 50,
          positionY: 6,
          started: true,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    };
    const state = hydrateFixtureLineupState([lineup], 'side-1', 1, 'GOLEIRO');
    expect(state.starters[0]).toMatchObject({ goalkeeper: true, position: null });
  });

  // F1: 팀원 연결 — 라인업 행을 계정(userId)에 붙이면 저장 payload에 실제로 실려야
  // 백엔드가 ROSTER_ASSERTED 신원 연결을 만든다(games.service.ts saveLineup 계약).
  it('setEntryUserId links an entry to a userId and buildSavePayload carries it through', () => {
    let state = withOneStarter();
    state = setEntryUserId(state, state.starters[0].key, 'user-1');
    expect(state.starters[0].userId).toBe('user-1');
    const payload = buildSavePayload(state, 'GK');
    expect(payload.participants[0]).toMatchObject({ userId: 'user-1' });
  });

  it('setEntryUserId(null) unlinks — buildSavePayload omits userId entirely (stays a guest)', () => {
    let state = withOneStarter();
    state = setEntryUserId(state, state.starters[0].key, 'user-1');
    state = setEntryUserId(state, state.starters[0].key, null);
    expect(state.starters[0].userId).toBeNull();
    const payload = buildSavePayload(state, 'GK');
    expect(payload.participants[0]).not.toHaveProperty('userId');
  });

  it('linkedUserIds collects userIds from both starters and bench, ignoring unlinked guests', () => {
    let state = withOneStarter();
    state = addPlayer(state, '이영희'); // 후보로 들어가는 게스트
    state = setEntryUserId(state, state.starters[0].key, 'user-1');
    state = setEntryUserId(state, state.bench[0].key, 'user-2');
    expect(linkedUserIds(state)).toEqual(new Set(['user-1', 'user-2']));
  });
});
