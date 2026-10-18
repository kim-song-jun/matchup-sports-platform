import { describe, expect, it } from 'vitest';
import { makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { placedRegistrationIdsForSlot } from './bracket-slot-candidates';

const groups = [makeGroup({ id: 'stage', name: 'A조', phase: 'group' }), makeGroup({ id: 'finals', name: '12강', phase: 'round12' })];
const stage = makeSlot({ id: 'stage-entry', kind: 'ENTRY', groupId: 'stage', registrationId: 'stage-team' });
const entry = makeSlot({ id: 'final-entry', kind: 'ENTRY', groupId: 'finals', registrationId: 'entry-team' });
const rank = makeSlot({ id: 'final-rank', kind: 'GROUP_RANK', groupId: 'finals', registrationId: 'rank-team' });
const bye = makeSlot({ id: 'final-bye', kind: 'BYE', groupId: 'finals', registrationId: 'bye-team' });
const slots = [stage, entry, rank, bye];

describe('slot candidate exclusions follow the placement contract', () => {
  it('allows group-stage ENTRY advancement to BYE, while protecting every other knockout placement', () => {
    expect([...placedRegistrationIdsForSlot(slots, bye, groups)].sort()).toEqual(['entry-team', 'rank-team']);
    expect([...placedRegistrationIdsForSlot(slots, { ...bye, id: 'empty-bye', registrationId: null }, groups)].sort())
      .toEqual(['bye-team', 'entry-team', 'rank-team']);
  });
  it('preserves the different group-stage ENTRY, knockout ENTRY and GROUP_RANK duplicate rules', () => {
    expect([...placedRegistrationIdsForSlot(slots, stage, groups)]).toEqual(['entry-team']);
    expect([...placedRegistrationIdsForSlot(slots, entry, groups)].sort()).toEqual(['bye-team', 'stage-team']);
    expect([...placedRegistrationIdsForSlot(slots, rank, groups)]).toEqual(['bye-team']);
  });
});
