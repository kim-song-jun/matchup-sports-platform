import {
  compareGameResultSnapshots,
  evaluateConsecutiveZeroGate,
  selectGameReadAuthority,
} from './compare-game-result-reads';

describe('Task 10 measured game result compare-read', () => {
  it('reports the exact entity, revision, and nested field when reads differ', () => {
    // Given
    const pair = {
      identity: {
        entityType: 'TOURNAMENT_FIXTURE' as const,
        entityId: 'fixture-1',
        revisionId: 'revision-2',
      },
      legacy: { score: { regulation: { home: 3, away: 1 } } },
      projected: { score: { regulation: { home: 4, away: 1 } } },
    };

    // When
    const result = compareGameResultSnapshots({
      populationHash: 'a'.repeat(64),
      sourceRows: 1,
      partial: 0,
      quarantined: 0,
      pairs: [pair],
    });

    // Then
    expect(result).toEqual({
      counts: {
        sourceRows: 1,
        compared: 1,
        matched: 0,
        mismatched: 1,
        partial: 0,
        quarantined: 0,
      },
      populationHash: 'a'.repeat(64),
      mismatches: [
        {
          entityType: 'TOURNAMENT_FIXTURE',
          entityId: 'fixture-1',
          revisionId: 'revision-2',
          field: 'score.regulation.home',
          legacy: 3,
          projected: 4,
        },
      ],
    });
  });

  it('keeps legacy response authority in compare mode while surfacing mismatches', () => {
    // Given
    const comparison = compareGameResultSnapshots({
      populationHash: 'b'.repeat(64),
      sourceRows: 1,
      partial: 0,
      quarantined: 0,
      pairs: [
        {
          identity: {
            entityType: 'TEAM_MATCH',
            entityId: 'match-1',
            revisionId: 'revision-1',
          },
          legacy: { score: 1 },
          projected: { score: 2 },
        },
      ],
    });

    // When
    const decision = selectGameReadAuthority(
      'compare',
      { source: 'legacy' },
      { source: 'new' },
      comparison,
    );

    // Then
    expect(decision).toEqual({
      authority: 'legacy',
      response: { source: 'legacy' },
      comparison,
    });
  });

  it('changes authority to old reads immediately when the pre-latch kill switch selects legacy', () => {
    // Given
    const comparison = compareGameResultSnapshots({
      populationHash: 'c'.repeat(64),
      sourceRows: 0,
      partial: 0,
      quarantined: 0,
      pairs: [],
    });

    // When
    const decision = selectGameReadAuthority(
      'legacy',
      { source: 'legacy' },
      { source: 'new' },
      comparison,
    );

    // Then
    expect(decision).toEqual({
      authority: 'legacy',
      response: { source: 'legacy' },
      comparison: null,
    });
  });

  it('blocks cutover until the required consecutive runs cover the full population with zero mismatches', () => {
    // Given
    const incomplete = {
      populationHash: 'd'.repeat(64),
      sourceRows: 5,
      compared: 2,
      quarantined: 2,
      mismatched: 0,
    };
    const mismatch = {
      populationHash: 'e'.repeat(64),
      sourceRows: 5,
      compared: 3,
      quarantined: 2,
      mismatched: 1,
    };
    const zero = {
      populationHash: 'f'.repeat(64),
      sourceRows: 5,
      compared: 3,
      quarantined: 2,
      mismatched: 0,
    };

    // When
    const blocked = evaluateConsecutiveZeroGate(
      [incomplete, zero, mismatch, zero, zero],
      3,
    );
    const passed = evaluateConsecutiveZeroGate(
      [incomplete, mismatch, zero, zero, zero],
      3,
    );

    // Then
    expect(blocked).toEqual({
      passed: false,
      requiredConsecutiveRuns: 3,
      consecutiveZeroRuns: 2,
      latestPopulationHash: 'f'.repeat(64),
      blocker: 'CONSECUTIVE_ZERO_RUNS_REQUIRED',
    });
    expect(passed).toEqual({
      passed: true,
      requiredConsecutiveRuns: 3,
      consecutiveZeroRuns: 3,
      latestPopulationHash: 'f'.repeat(64),
      blocker: null,
    });
  });
});
