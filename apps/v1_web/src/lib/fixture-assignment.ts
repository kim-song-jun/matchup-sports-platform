import { fixtureVenueValue } from '@/components/admin/bracket-canvas/fixture-venue-patch';
import { toVenuePayload, type PlaceValue } from '@/lib/place';
import type { V1AdminBracketFixture, V1TournamentField, V1UpdateFixturePayload } from '@/types/api';

export type AssignmentMode = 'time' | 'court';
export type CourtChoice = { key: string; name: string; fieldId: string | null; place: PlaceValue | null; active: boolean };
export const instant = (value: string) => new Date(value).toISOString();

export function assignmentTimes(fixtures: readonly Pick<V1AdminBracketFixture, 'scheduledAt'>[], presets: readonly { scheduledAt: string }[]) {
  return [...new Set([...presets.map(row => instant(row.scheduledAt)), ...fixtures.flatMap(f => f.scheduledAt ? [instant(f.scheduledAt)] : [])])].sort();
}
export function fixtureCourtKey(fixture: V1AdminBracketFixture) {
  if (fixture.fieldId) return `field:${fixture.fieldId}`;
  const place = fixtureVenueValue(fixture);
  return place ? `venue:${JSON.stringify(toVenuePayload(place))}` : null;
}
export function assignmentCourts(fixtures: readonly V1AdminBracketFixture[], fields: readonly V1TournamentField[]): CourtChoice[] {
  const choices = new Map<string, CourtChoice>(fields.map(field => [`field:${field.id}`, {
    key: `field:${field.id}`, name: field.name, fieldId: field.id, place: null, active: field.active,
  }]));
  for (const fixture of fixtures) {
    const key = fixtureCourtKey(fixture);
    if (key && !choices.has(key)) choices.set(key, { key, name: fixtureVenueValue(fixture)?.name ?? fixture.venue ?? '현재 배정된 구장',
      fieldId: fixture.fieldId ?? null, place: fixtureVenueValue(fixture), active: !fixture.fieldId });
  }
  return [...choices.values()];
}
export function assignmentPatch(mode: AssignmentMode, value: string | CourtChoice | null): V1UpdateFixturePayload {
  if (mode === 'time') return { scheduledAt: value as string | null };
  if (!value) return { fieldId: null, venue: '' };
  const court = value as CourtChoice;
  return court.fieldId ? { fieldId: court.fieldId } : { fieldId: null, ...toVenuePayload(court.place) };
}
export function isAssigned(fixture: V1AdminBracketFixture, mode: AssignmentMode, key: string) {
  return mode === 'time' ? Boolean(fixture.scheduledAt && instant(fixture.scheduledAt) === key) : fixtureCourtKey(fixture) === key;
}
export function hasAssignmentCollision(fixtures: readonly V1AdminBracketFixture[]) {
  const seen = new Set<string>();
  for (const fixture of fixtures) {
    const court = fixtureCourtKey(fixture);
    if (!fixture.scheduledAt || !court || fixture.game?.state === 'CANCELLED') continue;
    const key = `${instant(fixture.scheduledAt)}|${court}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
