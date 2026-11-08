export type SameGroupSlot = { id: string; position: number };
export type SameGroupFixture = {
  id: string; homeSlotId: string | null; awaySlotId: string | null;
  bracketSources?: Array<{ fixtureId: string; side: 'HOME' | 'AWAY' }>;
};

/**
 * For every fixture of one tournament, the pairs of same-group teams that could still meet there,
 * read from the saved advancement links with seed `n` sitting in the slot at position `n`.
 * A pending side stands for every team that can still win through it.
 */
export function sameGroupPairs({ fixtures, slots, seeds, groupOf }: {
  fixtures: readonly SameGroupFixture[]; slots: readonly SameGroupSlot[]; seeds: readonly string[]; groupOf: (registrationId: string) => string | undefined;
}): Map<string, Array<[string, string]>> {
  const byId = new Map(fixtures.map(fixture => [fixture.id, fixture]));
  const slotTeam = (slotId: string | null) => {
    const slot = slots.find(row => row.id === slotId);
    return slot ? seeds[slot.position - 1] : undefined;
  };
  const reachable = new Map<string, string[]>();
  const sideTeams = (fixture: SameGroupFixture, side: 'HOME' | 'AWAY', trail: ReadonlySet<string>): string[] => {
    const seeded = slotTeam(side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId);
    if (seeded !== undefined) return [seeded];
    const source = fixture.bracketSources?.find(row => row.side === side);
    const upstream = source ? byId.get(source.fixtureId) : undefined;
    return upstream ? teamsIn(upstream, trail) : [];
  };
  const teamsIn = (fixture: SameGroupFixture, trail: ReadonlySet<string>): string[] => {
    const known = reachable.get(fixture.id);
    if (known) return known;
    if (trail.has(fixture.id)) return [];
    const next = new Set(trail).add(fixture.id);
    const teams = [...new Set([...sideTeams(fixture, 'HOME', next), ...sideTeams(fixture, 'AWAY', next)])];
    reachable.set(fixture.id, teams);
    return teams;
  };
  const result = new Map<string, Array<[string, string]>>();
  for (const fixture of fixtures) {
    const none = new Set<string>([fixture.id]);
    const home = sideTeams(fixture, 'HOME', none);
    const away = sideTeams(fixture, 'AWAY', none);
    result.set(fixture.id, home.flatMap(first => away.flatMap((second): Array<[string, string]> => {
      const group = groupOf(first);
      return first !== second && group !== undefined && group === groupOf(second) ? [[first, second]] : [];
    })));
  }
  return result;
}
