import { describe, expect, it } from 'vitest';
import { makeFixture } from '@/test/bracket-canvas-fixtures';
import { assignmentCourts, assignmentPatch, assignmentTimes, fixtureCourtKey, hasAssignmentCollision } from './fixture-assignment';
import type { V1TournamentField } from '@/types/api';

const first = makeFixture({ id: 'a', groupId: null, fixtureNumber: 1, scheduledAt: '2026-11-21T10:00:00+09:00', venue: '기존 구장' });
describe('fixture assignment canonical fields', () => {
  it('merges equivalent timezone instants and existing manual values without duplicates', () => {
    expect(assignmentTimes([first], [{ scheduledAt: '2026-11-21T01:00:00.000Z' }, { scheduledAt: '2026-11-21T02:00:00Z' }])).toEqual(['2026-11-21T01:00:00.000Z', '2026-11-21T02:00:00.000Z']);
  });
  it('writes only time for time changes/clears and only place fields for court changes/clears', () => {
    expect(assignmentPatch('time', '2026-11-21T01:30:00Z')).toEqual({ scheduledAt: '2026-11-21T01:30:00Z' });
    expect(assignmentPatch('time', null)).toEqual({ scheduledAt: null });
    const field = { key: 'field:a', fieldId: 'a', name: 'A구장', place: null, active: true };
    expect(assignmentPatch('court', field)).toEqual({ fieldId: 'a' });
    expect(assignmentPatch('court', null)).toEqual({ fieldId: null, venue: '' });
  });
  it('keeps existing place snapshots and disables missing/inactive field assignments', () => {
    const place = { name: '구장', address: '서울', latitude: 37, longitude: 127, provider: 'kakao' as const, providerPlaceId: 'p' };
    const f = { ...first, place };
    const choices = assignmentCourts([f, { ...first, id: 'b', fieldId: 'missing' }], [{ id: 'inactive', name: '미사용', active: false } as V1TournamentField]);
    const manual = choices.find(row => row.key === fixtureCourtKey(f))!;
    expect(assignmentPatch('court', manual)).toMatchObject({ fieldId: null, venue: '구장', venueAddress: '서울', venueLatitude: 37, venueLongitude: 127, venueProvider: 'kakao', venueProviderId: 'p' });
    expect(choices.find(row => row.fieldId === 'inactive')?.active).toBe(false);
    expect(choices.find(row => row.fieldId === 'missing')?.active).toBe(false);
  });
  it('warns only when both the instant and court match', () => {
    expect(hasAssignmentCollision([first, { ...first, id: 'b', venue: '다른 구장' }])).toBe(false);
    expect(hasAssignmentCollision([first, { ...first, id: 'b', scheduledAt: '2026-11-21T02:00:00Z' }])).toBe(false);
    expect(hasAssignmentCollision([first, { ...first, id: 'b', scheduledAt: '2026-11-21T01:00:00Z' }])).toBe(true);
  });
});
