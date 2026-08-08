import { describe, expect, it } from 'vitest';
import type { FormationSlot } from '@/components/lineup/formation-slots';
import {
  addPlayer, buildSavePayload, createEmptyFixtureLineupState, moveToStarters,
  placeInSlot, selectFormation, setGoalkeeper, unplaceFromSlot,
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
    const payload = buildSavePayload(state);
    expect(payload.participants[0]).toMatchObject({ position: 'FIXO', positionX: 33, positionY: 43, started: true });
  });
});
