import { periodsActor, periodsCreateInput, teamMatchPeriodsFixture } from './team-match-periods.service.fixtures';
import { competitionConfigContentHash } from '../tournaments/competition-config/competition-config';
import { V1CompetitionConfigStatus } from '@prisma/client';

describe('MD-QA #141 ordinary team-match period persistence', () => {
  let fixture: Awaited<ReturnType<typeof teamMatchPeriodsFixture>>;
  beforeEach(async () => { fixture = await teamMatchPeriodsFixture(); });
  afterEach(async () => { await fixture.module.close(); });

  it('pins a single custom period into both persisted sources when the owner creates a one-period match', async () => {
    // Given a default two-half futsal preset and an authorized active host.
    const input = { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] };
    // When the ordinary host creates the match through the existing service.
    await fixture.service.create(periodsActor, input);
    // Then the persisted Game uses one requested period, never the default's two halves.
    const stored = fixture.configs.get(fixture.game.competitionConfigVersionId);
    expect(stored?.periods).toEqual([{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 37, extraTime: false }]);
    expect(fixture.match.competitionConfigVersionId).toBe(fixture.game.competitionConfigVersionId);
    expect(stored?.name).not.toBe('futsal-v1');
    expect(fixture.periods.map(period => period.number)).toEqual([1]);
    expect(fixture.baseConfig.periods.map(period => period.durationMinutes)).toEqual([20, 20]);
    expect(fixture.lineups.map(lineup => [lineup.state, lineup.revision])).toEqual([['DRAFT', 1], ['DRAFT', 1]]);
    expect(fixture.participants.map(participant => participant.displayNameSnapshot)).toEqual(['호스트']);
  });

  it('stores both independently requested durations when the owner creates a two-half match', async () => {
    // Given non-default durations that cannot accidentally equal the preset.
    const input = { ...periodsCreateInput, periods: [{ durationMinutes: 31 }, { durationMinutes: 29 }] };
    // When the ordinary service creates a two-half match.
    await fixture.service.create(periodsActor, input);
    // Then both actual duration values and all non-period rules survive.
    const stored = fixture.configs.get(fixture.game.competitionConfigVersionId);
    expect(stored?.periods.map(period => period.durationMinutes)).toEqual([31, 29]);
    expect(stored?.lineup).toEqual(fixture.baseConfig.lineup);
    expect(stored?.events).toEqual(fixture.baseConfig.events);
    expect(stored?.result).toEqual(fixture.baseConfig.result);
    expect(stored?.visibility).toEqual(fixture.baseConfig.visibility);
  });

  it('keeps the default immutable pin when periods are omitted during create', async () => {
    // Given a legacy-compatible create payload without rule customization.
    // When the existing create service is called.
    await fixture.service.create(periodsActor, periodsCreateInput);
    // Then the original default and source-created DRAFT aggregate are preserved.
    expect(fixture.game.competitionConfigVersionId).toBe(fixture.baseConfig.id);
    expect(fixture.periods.map(period => period.number)).toEqual([1, 2]);
    expect(fixture.lineups).toHaveLength(2);
    expect(fixture.prisma.v1CompetitionConfigVersion.create).not.toHaveBeenCalled();
  });

  it('re-pins an untouched source-created DRAFT aggregate while preserving its participant and lineup identities', async () => {
    // Given the real production aggregate writer has created revision-1 DRAFT lineups.
    await fixture.service.create(periodsActor, periodsCreateInput);
    const rosterBefore = structuredClone({ lineups: fixture.lineups, participants: fixture.participants });
    const input = { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 41 }] };
    // When the owner changes rules before any gameplay or lineup submission.
    await fixture.service.update(periodsActor, fixture.match.id, input);
    // Then both pins change and the draft roster is retained rather than deleted or rejected.
    expect(fixture.configs.get(fixture.game.competitionConfigVersionId)?.periods.map(period => period.durationMinutes)).toEqual([41]);
    expect(fixture.match.competitionConfigVersionId).toBe(fixture.game.competitionConfigVersionId);
    expect(fixture.game.version).toBe(1);
    expect(fixture.periods.map(period => period.number)).toEqual([1]);
    expect({ lineups: fixture.lineups, participants: fixture.participants }).toEqual(rosterBefore);
  });

  it('retains the current pin and period rows when a legacy edit omits periods', async () => {
    // Given a normally created match with existing period rows.
    await fixture.service.create(periodsActor, periodsCreateInput);
    const periodsBefore = structuredClone(fixture.periods);
    // When a caller edits only existing non-rule fields.
    await fixture.service.update(periodsActor, fixture.match.id, { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString() });
    // Then rule omission cannot reset or rebuild the stored periods.
    expect(fixture.game.competitionConfigVersionId).toBe(fixture.baseConfig.id);
    expect(fixture.periods).toEqual(periodsBefore);
    expect(fixture.game.version).toBe(0);
  });

  it.each(['LIVE', 'PAUSED', 'ENDED'] as const)('rejects a period change without mutating pins when the Game is %s', async state => {
    // Given an existing aggregate has entered gameplay.
    await fixture.service.create(periodsActor, periodsCreateInput);
    fixture.game.state = state;
    const input = { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 33 }] };
    // When an owner attempts to re-pin historical gameplay rules.
    // Then the source rejects the request and preserves both actual pins.
    await expect(fixture.service.update(periodsActor, fixture.match.id, input)).rejects.toMatchObject({
      status: 409, response: { code: 'TEAM_MATCH_RULES_LOCKED' },
    });
    expect(fixture.game.competitionConfigVersionId).toBe(fixture.baseConfig.id);
    expect(fixture.match.competitionConfigVersionId).toBe(fixture.baseConfig.id);
  });

  it('rejects an otherwise scheduled match after a lineup was submitted', async () => {
    // Given initial lineups exist and one has a genuine submission marker.
    await fixture.service.create(periodsActor, periodsCreateInput);
    const homeLineup = fixture.lineups[0];
    if (!homeLineup) throw new Error('Source aggregate must create a HOME lineup');
    homeLineup.state = 'SUBMITTED'; homeLineup.submittedAt = new Date('2026-10-13T00:01:00.000Z');
    // When the host submits new periods.
    // Then submitted roster history prevents repinning.
    const input = { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 33 }] };
    await expect(fixture.service.update(periodsActor, fixture.match.id, input)).rejects.toMatchObject({ status: 409, response: { code: 'TEAM_MATCH_RULES_LOCKED' } });
    expect(fixture.game.competitionConfigVersionId).toBe(fixture.baseConfig.id);
  });

  it('preserves a custom immutable pin when a later edit omits periods', async () => {
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] });
    const pin = fixture.game.competitionConfigVersionId;
    const rows = structuredClone(fixture.periods);
    await fixture.service.update(periodsActor, fixture.match.id, { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString() });
    expect(fixture.game.competitionConfigVersionId).toBe(pin);
    expect(fixture.match.competitionConfigVersionId).toBe(pin);
    expect(fixture.periods).toEqual(rows);
    expect(fixture.game.version).toBe(0);
  });

  it('restores authoritative half identities when changing a single period back to two halves', async () => {
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] });
    await fixture.service.update(periodsActor, fixture.match.id, { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 31 }, { durationMinutes: 29 }] });
    expect(fixture.configs.get(fixture.game.competitionConfigVersionId)?.periods).toEqual([
      { ...fixture.baseConfig.periods[0], durationMinutes: 31 }, { ...fixture.baseConfig.periods[1], durationMinutes: 29 },
    ]);
    expect(fixture.periods.map(period => period.number)).toEqual([1, 2]);
    expect(fixture.lineups).toHaveLength(2);
  });

  it('does not rebuild period identities or increment the Game version for identical rule input', async () => {
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] });
    const rows = structuredClone(fixture.periods);
    const updated = await fixture.service.update(periodsActor, fixture.match.id, { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 37 }] });
    expect(fixture.periods).toEqual(rows);
    expect(fixture.game.version).toBe(0);
    expect(fixture.configs.size).toBe(2);
    expect(fixture.prisma.v1GamePeriod.deleteMany).not.toHaveBeenCalled();
    expect(updated.gameId).toBe(fixture.game.id);
  });

  it('reuses an identical ACTIVE same-sport config from another lineage', async () => {
    const rules = { periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 37, extraTime: false }], events: fixture.baseConfig.events, lineup: fixture.baseConfig.lineup, result: fixture.baseConfig.result, tieBreak: fixture.baseConfig.tieBreak, visibility: fixture.baseConfig.visibility };
    const config = { ...fixture.baseConfig, ...rules, id: 'existing-other-lineage', name: 'event-custom', contentHash: competitionConfigContentHash(rules) };
    fixture.configs.set(config.id, config);
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] });
    expect(fixture.game.competitionConfigVersionId).toBe(config.id);
    expect(fixture.match.competitionConfigVersionId).toBe(config.id);
    expect(fixture.prisma.v1CompetitionConfigVersion.createMany).not.toHaveBeenCalled();
  });

  it.each(['different-sport', 'retired'])('rejects an identical content hash belonging to %s', async scenario => {
    const rules = { periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 37, extraTime: false }], events: fixture.baseConfig.events, lineup: fixture.baseConfig.lineup, result: fixture.baseConfig.result, tieBreak: fixture.baseConfig.tieBreak, visibility: fixture.baseConfig.visibility };
    const config = { ...fixture.baseConfig, ...rules, id: 'non-reusable', name: 'other-lineage', contentHash: competitionConfigContentHash(rules) };
    if (scenario === 'different-sport') config.sportCode = 'football';
    else config.status = V1CompetitionConfigStatus.RETIRED;
    fixture.configs.set(config.id, config);
    await expect(fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] })).rejects.toMatchObject({ status: 409, response: { code: 'COMPETITION_CONFIG_CONTENT_HASH_COLLISION' } });
    expect(fixture.prisma.v1TeamMatch.create).not.toHaveBeenCalled();
  });

  it('reuses a matching ACTIVE config published by another transaction during the insert race', async () => {
    fixture.prisma.v1CompetitionConfigVersion.createMany.mockImplementationOnce(({ data }) => {
      const attempted = data[0];
      if (!attempted) throw new Error('Expected an immutable config publication');
      fixture.configs.set('external-race-winner', { ...attempted, id: 'external-race-winner', name: 'another-lineage' });
      return Promise.resolve({ count: 0 });
    });
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] });
    expect(fixture.game.competitionConfigVersionId).toBe('external-race-winner');
    expect(fixture.match.competitionConfigVersionId).toBe('external-race-winner');
  });

  it.each<{ history: 'events' | 'results' }>([{ history: 'events' }, { history: 'results' }])('protects retained $history history even if the Game is currently SCHEDULED', async ({ history }) => {
    await fixture.service.create(periodsActor, periodsCreateInput);
    fixture[history].push({ id: 'historical-record' });
    await expect(fixture.service.update(periodsActor, fixture.match.id, { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 37 }] })).rejects.toMatchObject({ status: 409, response: { code: 'TEAM_MATCH_RULES_LOCKED' } });
    expect(fixture.prisma.v1Game.update).not.toHaveBeenCalled();
  });

  it('protects pause clock history even after the current pause marker has been cleared', async () => {
    await fixture.service.create(periodsActor, periodsCreateInput);
    const first = fixture.periods[0];
    if (!first) throw new Error('Expected source-created period');
    first.pausedTotalMs = 1000;
    await expect(fixture.service.update(periodsActor, fixture.match.id, { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 37 }] })).rejects.toMatchObject({ status: 409, response: { code: 'TEAM_MATCH_RULES_LOCKED' } });
    expect(fixture.prisma.v1GamePeriod.deleteMany).not.toHaveBeenCalled();
  });

  it('rechecks revoked owner permissions inside the locked transaction before changing rules', async () => {
    await fixture.service.create(periodsActor, periodsCreateInput);
    fixture.prisma.v1TeamMembership.findFirst.mockResolvedValueOnce({ id: 'owner-member', team: { sportId: periodsCreateInput.sportId } }).mockResolvedValueOnce(null);
    await expect(fixture.service.update(periodsActor, fixture.match.id, { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 37 }] })).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
    expect(fixture.prisma.v1Game.update).not.toHaveBeenCalled();
    expect(fixture.prisma.v1TeamMatch.update).not.toHaveBeenCalled();
  });

  it('hydrates edit periods from the current pin and reports gameplay locking separately from general editability', async () => {
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] });
    expect(await fixture.service.edit(periodsActor, fixture.match.id)).toMatchObject({ rulesEditable: true, rulesLockedReason: null, competitionConfigVersionId: fixture.game.competitionConfigVersionId, form: { periods: [{ durationMinutes: 37 }] } });
    fixture.game.state = 'LIVE';
    expect(await fixture.service.edit(periodsActor, fixture.match.id)).toMatchObject({ editable: true, rulesEditable: false, rulesLockedReason: 'TEAM_MATCH_RULES_LOCKED', form: { periods: [{ durationMinutes: 37 }] } });
  });

  it('reads authoritative host defaults and rejects missing host permission', async () => {
    expect(await fixture.service.ruleOptions(periodsActor, periodsCreateInput.hostTeamId)).toEqual({ hostTeamId: periodsCreateInput.hostTeamId, sportId: periodsCreateInput.sportId, competitionConfigVersionId: fixture.baseConfig.id, periods: fixture.baseConfig.periods, twoPeriodDefaults: fixture.baseConfig.periods });
    fixture.prisma.v1TeamMembership.findFirst.mockResolvedValueOnce(null);
    await expect(fixture.service.ruleOptions(periodsActor, periodsCreateInput.hostTeamId)).rejects.toMatchObject({ status: 403, response: { code: 'PERMISSION_DENIED' } });
  });

  it.each(['missing', 'retired'])('reports unavailable rules honestly when the global default is %s but the custom pin is ACTIVE', async availability => {
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] });
    const pin = fixture.game.competitionConfigVersionId;
    if (availability === 'missing') fixture.configs.delete(fixture.baseConfig.id);
    else fixture.baseConfig.status = V1CompetitionConfigStatus.RETIRED;
    expect(await fixture.service.edit(periodsActor, fixture.match.id)).toMatchObject({ rulesEditable: false, rulesLockedReason: 'COMPETITION_CONFIG_REQUIRED', competitionConfigVersionId: pin, form: { periods: [{ durationMinutes: 37 }] } });
    await expect(fixture.service.update(periodsActor, fixture.match.id, { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 39 }] })).rejects.toMatchObject({ status: 409, response: { code: 'COMPETITION_CONFIG_REQUIRED' } });
    expect(fixture.game.competitionConfigVersionId).toBe(pin);
    expect(fixture.prisma.v1Game.update).not.toHaveBeenCalled();
  });

  it('does not offer one/two-period edits when the authoritative default has an unsupported third period', async () => {
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] });
    fixture.configs.set('new-default-v2', { ...fixture.baseConfig, id: 'new-default-v2', version: 2, periods: [...fixture.baseConfig.periods, { code: 'EXTRA_TIME', label: '연장', durationMinutes: 5, extraTime: true }] });
    expect(await fixture.service.edit(periodsActor, fixture.match.id)).toMatchObject({ rulesEditable: false, rulesLockedReason: 'COMPETITION_PERIODS_UNAVAILABLE' });
    await expect(fixture.service.ruleOptions(periodsActor, periodsCreateInput.hostTeamId)).rejects.toMatchObject({ status: 409, response: { code: 'COMPETITION_PERIODS_UNAVAILABLE' } });
    await expect(fixture.service.update(periodsActor, fixture.match.id, { ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 30 }, { durationMinutes: 30 }] })).rejects.toMatchObject({ status: 409, response: { code: 'COMPETITION_PERIODS_UNAVAILABLE' } });
    expect(fixture.prisma.v1Game.update).not.toHaveBeenCalled();
  });

  it.each(['host first', 'tournament first'] as const)('shares immutable same-sport content across the actual host and tournament writers (%s)', async order => {
    const originalDefault = structuredClone(fixture.baseConfig);
    const requested = [{ durationMinutes: 37 }];
    const saveTournament = () => fixture.tournamentService.update(periodsActor, fixture.tournament.id, {
      expectedVersion: fixture.tournament.updatedAt.toISOString(), periods: requested,
    });
    if (order === 'host first') {
      await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: requested });
      expect(fixture.configs.get(fixture.game.competitionConfigVersionId)?.name).toBe('futsal-team-match-rules-v1');
      expect([...fixture.configs.values()].filter(row => row.name === 'futsal-v1')).toEqual([originalDefault]);
      await saveTournament();
    } else {
      await saveTournament();
      await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: requested });
    }
    const shared = fixture.configs.get(fixture.game.competitionConfigVersionId);
    expect(shared?.periods).toEqual([{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 37, extraTime: false }]);
    expect(fixture.tournament.competitionConfigVersionId).toBe(shared?.id);
    expect(fixture.match.competitionConfigVersionId).toBe(shared?.id);
    expect(fixture.configs.size).toBe(2);
    expect(fixture.baseConfig).toEqual(originalDefault);
    for (const field of ['events', 'lineup', 'result', 'tieBreak', 'visibility'] as const) {
      expect(shared?.[field]).toEqual(originalDefault[field]);
    }
    const identicalSave = await saveTournament();
    expect(identicalSave).toMatchObject({ changed: false, fixturesRepointed: 0, competitionConfigVersionId: shared?.id });
    expect(fixture.configs.size).toBe(2);
  });

  it.each(['different-sport', 'retired'] as const)('does not make a %s host-published hash reusable by the tournament writer', async scenario => {
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] });
    const published = fixture.configs.get(fixture.game.competitionConfigVersionId);
    if (!published) throw new Error('The host writer must publish its requested config');
    if (scenario === 'different-sport') published.sportCode = 'football';
    else published.status = V1CompetitionConfigStatus.RETIRED;
    await expect(fixture.tournamentService.update(periodsActor, fixture.tournament.id, {
      expectedVersion: fixture.tournament.updatedAt.toISOString(), periods: [{ durationMinutes: 37 }],
    })).rejects.toMatchObject({ status: 409, response: { code: 'COMPETITION_CONFIG_CONTENT_HASH_COLLISION' } });
    expect(fixture.tournament.competitionConfigVersionId).toBe(fixture.baseConfig.id);
    expect(fixture.prisma.v1Tournament.updateMany).not.toHaveBeenCalled();
  });

  it.each(['host', 'tournament'] as const)('rejects a hash match whose actual canonical JSON differs through the %s writer', async writer => {
    const requestedConfig = { ...structuredClone(fixture.baseConfig), periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 37, extraTime: false }] };
    fixture.configs.set('false-hash-match', {
      ...requestedConfig, id: 'false-hash-match',
      name: writer === 'host' ? 'futsal-team-match-rules-v1' : fixture.baseConfig.name,
      version: writer === 'host' ? 1 : 2,
      contentHash: competitionConfigContentHash({
        periods: requestedConfig.periods, events: requestedConfig.events, lineup: requestedConfig.lineup,
        result: requestedConfig.result, tieBreak: requestedConfig.tieBreak, visibility: requestedConfig.visibility,
      }),
      result: { ...requestedConfig.result, penaltyShootout: { earlyStop: false } },
    });
    const save = writer === 'host'
      ? fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 37 }] })
      : fixture.tournamentService.update(periodsActor, fixture.tournament.id, {
        expectedVersion: fixture.tournament.updatedAt.toISOString(), periods: [{ durationMinutes: 37 }],
      });
    await expect(save).rejects.toMatchObject({ status: 409, response: { code: 'COMPETITION_CONFIG_CONTENT_HASH_COLLISION' } });
    expect(fixture.game.competitionConfigVersionId).toBe(fixture.baseConfig.id);
    expect(fixture.match.competitionConfigVersionId).toBe(fixture.baseConfig.id);
    expect(fixture.tournament.competitionConfigVersionId).toBe(fixture.baseConfig.id);
    expect(fixture.prisma.v1CompetitionConfigVersion.createMany).not.toHaveBeenCalled();
    expect(fixture.prisma.v1Tournament.updateMany).not.toHaveBeenCalled();
  });

  const addSinglePeriodDefault = (durationMinutes = 37, version = 2) => {
    const { events, lineup, result, tieBreak, visibility } = structuredClone(fixture.baseConfig);
    const config = { periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes, extraTime: false }], events, lineup, result, tieBreak, visibility };
    const row = { ...fixture.baseConfig, ...config, id: `single-default-v${version}`, version, contentHash: competitionConfigContentHash(config) };
    fixture.configs.set(row.id, row);
    return row;
  };

  it('returns a legal latest SINGLE_PERIOD global default through the real rule-options consumer', async () => {
    const current = addSinglePeriodDefault();
    await expect(fixture.service.ruleOptions(periodsActor, periodsCreateInput.hostTeamId)).resolves.toEqual({
      hostTeamId: periodsCreateInput.hostTeamId, sportId: periodsCreateInput.sportId,
      competitionConfigVersionId: current.id, periods: current.periods, twoPeriodDefaults: fixture.baseConfig.periods,
    });
  });

  it('keeps a valid single default available and reports no two-period defaults when no ACTIVE same-sport half history exists', async () => {
    const current = addSinglePeriodDefault();
    fixture.configs.delete(fixture.baseConfig.id);
    const retiredHalves = { ...structuredClone(fixture.baseConfig), id: 'retired-halves', status: V1CompetitionConfigStatus.RETIRED };
    const otherSportHalves = {
      ...structuredClone(fixture.baseConfig), id: 'football-halves', sportCode: 'football', name: 'football-v1',
      periods: fixture.baseConfig.periods.map(period => ({ ...period, durationMinutes: 45 })),
    };
    const { periods, events, lineup, result, tieBreak, visibility } = otherSportHalves;
    otherSportHalves.contentHash = competitionConfigContentHash({ periods, events, lineup, result, tieBreak, visibility });
    fixture.configs.set(retiredHalves.id, retiredHalves);
    fixture.configs.set(otherSportHalves.id, otherSportHalves);
    await expect(fixture.service.ruleOptions(periodsActor, periodsCreateInput.hostTeamId)).resolves.toEqual({
      hostTeamId: periodsCreateInput.hostTeamId, sportId: periodsCreateInput.sportId,
      competitionConfigVersionId: current.id, periods: current.periods, twoPeriodDefaults: null,
    });
  });

  it.each([37, 39])('creates a requested %i-minute match when the latest same-sport default is SINGLE_PERIOD', async durationMinutes => {
    const current = addSinglePeriodDefault();
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes }] });
    const stored = fixture.configs.get(fixture.game.competitionConfigVersionId);
    expect(stored?.periods).toEqual([{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes, extraTime: false }]);
    expect(fixture.match.competitionConfigVersionId).toBe(stored?.id);
    expect(fixture.periods.map(period => period.number)).toEqual([1]);
    expect(stored?.lineup).toEqual(current.lineup);
    expect(stored?.events).toEqual(current.events);
    expect(stored?.name).toBe(durationMinutes === 37 ? 'futsal-v1' : 'futsal-team-match-rules-v1');
    expect(fixture.configs.get(current.id)).toEqual(current);
  });

  it('keeps an ACTIVE custom pin editable after the legal global default changes to SINGLE_PERIOD', async () => {
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 41 }] });
    addSinglePeriodDefault();
    expect(await fixture.service.edit(periodsActor, fixture.match.id)).toMatchObject({
      rulesEditable: true, rulesLockedReason: null, form: { periods: [{ durationMinutes: 41 }] },
    });
    await fixture.service.update(periodsActor, fixture.match.id, {
      ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 39 }],
    });
    const stored = fixture.configs.get(fixture.game.competitionConfigVersionId);
    expect(stored?.periods.map(period => period.durationMinutes)).toEqual([39]);
    expect(fixture.match.competitionConfigVersionId).toBe(stored?.id);
    expect(fixture.periods.map(period => period.number)).toEqual([1]);
  });

  it('expands a SINGLE_PERIOD default using authoritative same-sport historical half identities', async () => {
    const first = fixture.baseConfig.periods[0];
    const second = fixture.baseConfig.periods[1];
    if (!first || !second) throw new Error('The authoritative original default must contain two halves');
    first.label = '공식 전반'; second.label = '공식 후반';
    const { periods, events, lineup, result, tieBreak, visibility } = fixture.baseConfig;
    fixture.baseConfig.contentHash = competitionConfigContentHash({ periods, events, lineup, result, tieBreak, visibility });
    // More than one query page of legal, distinct single-period publications must not hide the original halves.
    for (let version = 2; version <= 25; version += 1) addSinglePeriodDefault(35 + version, version);
    await fixture.service.create(periodsActor, periodsCreateInput);
    await fixture.service.update(periodsActor, fixture.match.id, {
      ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(),
      periods: [{ durationMinutes: 31 }, { durationMinutes: 29 }],
    });
    const stored = fixture.configs.get(fixture.game.competitionConfigVersionId);
    expect(stored?.periods).toEqual([{ ...first, durationMinutes: 31 }, { ...second, durationMinutes: 29 }]);
    expect(fixture.match.competitionConfigVersionId).toBe(stored?.id);
    expect(fixture.periods.map(period => period.number)).toEqual([1, 2]);
    expect(stored?.lineup).toEqual(fixture.baseConfig.lineup);
  });

  it('persists the PostgreSQL durationMinutes integer upper boundary through the direct create service', async () => {
    await fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 2147483647 }] });
    expect(fixture.configs.get(fixture.game.competitionConfigVersionId)?.periods[0]?.durationMinutes).toBe(2147483647);
    expect(fixture.match.competitionConfigVersionId).toBe(fixture.game.competitionConfigVersionId);
  });

  it('rejects the first PostgreSQL integer overflow before the direct create service mutates any aggregate', async () => {
    const snapshot = () => structuredClone({ configs: [...fixture.configs.entries()], match: fixture.match, game: fixture.game, periods: fixture.periods, lineups: fixture.lineups, participants: fixture.participants });
    const before = snapshot();
    await expect(fixture.service.create(periodsActor, { ...periodsCreateInput, periods: [{ durationMinutes: 2147483648 }] }))
      .rejects.toMatchObject({ status: 422, response: { code: 'TEAM_MATCH_PERIODS_INVALID' } });
    expect(snapshot()).toEqual(before);
    expect(fixture.prisma.v1CompetitionConfigVersion.createMany).not.toHaveBeenCalled();
    expect(fixture.prisma.v1TeamMatch.create).not.toHaveBeenCalled();
  });

  it('rejects the first PostgreSQL integer overflow before direct edit changes pins or retained DRAFT identities', async () => {
    await fixture.service.create(periodsActor, periodsCreateInput);
    const snapshot = () => structuredClone({ configs: [...fixture.configs.entries()], match: fixture.match, game: fixture.game, periods: fixture.periods, lineups: fixture.lineups, participants: fixture.participants });
    const before = snapshot();
    await expect(fixture.service.update(periodsActor, fixture.match.id, {
      ...periodsCreateInput, version: fixture.match.updatedAt.toISOString(), periods: [{ durationMinutes: 2147483648 }],
    })).rejects.toMatchObject({ status: 422, response: { code: 'TEAM_MATCH_PERIODS_INVALID' } });
    expect(snapshot()).toEqual(before);
    expect(fixture.prisma.v1CompetitionConfigVersion.createMany).not.toHaveBeenCalled();
    expect(fixture.prisma.v1Game.update).not.toHaveBeenCalled();
    expect(fixture.prisma.v1GamePeriod.deleteMany).not.toHaveBeenCalled();
  });
});
