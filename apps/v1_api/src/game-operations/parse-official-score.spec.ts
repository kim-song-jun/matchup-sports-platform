/**
 * parse-official-score.spec.ts
 *
 * Regression test for the "team record shows 0 games" bug (outbox-handler +
 * team-record-facts backfill task): `game-result-backfill.ts`'s
 * `createImportedGame()` persists `V1GameResultRevision.score` in a SECOND,
 * nested shape (`{ regulation: { home, away } | null, penalty, goals,
 * incomplete, provenance }`) that coexists with the flat `{ home, away,
 * penalties? }` shape every live OFFICIAL producer writes. The DB trigger
 * `v1_guard_game_official_fact_insert()` (migration
 * `20260810130000_v1_official_fact_backfill_score_shape`) already accepts
 * both shapes via `COALESCE(score->'home', score->'regulation'->'home')` --
 * this spec proves the app-level `parseOfficialScore()` (shared by the live
 * `GAME_RESULT_OFFICIAL` handler and `team-record-facts-backfill.ts`) now
 * mirrors that same fallback, instead of throwing on every nested-shape
 * revision and quarantining it as `CORRUPT_SCORE`.
 */
import { parseOfficialScore } from './parse-official-score';

describe('parseOfficialScore', () => {
  it('parses the flat live-producer shape', () => {
    expect(parseOfficialScore({ home: 3, away: 1 })).toEqual({ home: 3, away: 1 });
  });

  it('parses the flat shape with penalties', () => {
    expect(parseOfficialScore({ home: 1, away: 1, penalties: { home: 5, away: 4 } })).toEqual({
      home: 1,
      away: 1,
      penalties: { home: 5, away: 4 },
    });
  });

  it('falls back to the nested regulation shape createImportedGame() persists', () => {
    expect(
      parseOfficialScore({
        regulation: { home: 2, away: 0 },
        penalty: null,
        goals: [],
        incomplete: false,
        provenance: 'TOURNAMENT_FIXTURE_RESULT',
      }),
    ).toEqual({ home: 2, away: 0 });
  });

  it('중첩 형태의 승부차기(penalty, 단수)도 읽는다', () => {
    // 이 폴백이 없으면 중첩 형태로 저장된 경기만 승부차기가 조용히 사라져,
    // resolveTeamRecordResult()가 승부차기로 갈린 경기를 DRAWN 으로 기록한다.
    expect(
      parseOfficialScore({
        regulation: { home: 1, away: 1 },
        penalty: { home: 5, away: 4 },
        goals: [],
        incomplete: false,
        provenance: 'TOURNAMENT_FIXTURE_RESULT',
      }),
    ).toEqual({ home: 1, away: 1, penalties: { home: 5, away: 4 } });
  });

  it('중첩 형태의 승부차기가 malformed 면 평평한 형태와 똑같이 거부한다', () => {
    expect(() =>
      parseOfficialScore({ regulation: { home: 1, away: 1 }, penalty: { home: 5 } }),
    ).toThrow('OFFICIAL revision penalties must be non-negative integer home and away scores');
  });

  it('prefers the flat top-level key over a co-present nested regulation key', () => {
    // Never actually co-present in persisted data (the two producers are
    // mutually exclusive), but proves the COALESCE-style precedence the DB
    // trigger uses is mirrored exactly, not "nested wins if present".
    expect(parseOfficialScore({ home: 9, away: 9, regulation: { home: 1, away: 1 } })).toEqual({
      home: 9,
      away: 9,
    });
  });

  it('throws for a nested shape whose regulation is null (incomplete import, no real result)', () => {
    expect(() =>
      parseOfficialScore({ regulation: null, penalty: null, goals: [], incomplete: true, provenance: 'TEAM_MATCH_COMPLETION_ONLY' }),
    ).toThrow('OFFICIAL revision requires non-negative integer home and away scores');
  });

  it('throws when neither the flat nor the nested key is present', () => {
    expect(() => parseOfficialScore({ foo: 'bar' })).toThrow(
      'OFFICIAL revision requires non-negative integer home and away scores',
    );
  });

  it('throws for a negative or non-integer score in either shape', () => {
    expect(() => parseOfficialScore({ home: -1, away: 0 })).toThrow();
    expect(() => parseOfficialScore({ home: 1.5, away: 0 })).toThrow();
    expect(() => parseOfficialScore({ regulation: { home: -1, away: 0 } })).toThrow();
  });

  it('throws for null, array, or non-object score JSON', () => {
    expect(() => parseOfficialScore(null)).toThrow();
    expect(() => parseOfficialScore([1, 2])).toThrow();
    expect(() => parseOfficialScore('not-a-score')).toThrow();
  });
});
