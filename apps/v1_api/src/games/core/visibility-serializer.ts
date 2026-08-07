import type {
  GameVisibilityPolicyInput,
  GameVisibilitySnapshot,
  PublicGameVisibilityMode,
  SerializedGameVisibility,
} from '../games.types';

function effectiveMode(policy: GameVisibilityPolicyInput): PublicGameVisibilityMode {
  if (policy.mode === 'live' && !policy.publicLiveEnabled) {
    return 'status_only';
  }
  return policy.mode;
}

export function serializeGameVisibility<TLineup, TEvent, TRecord>(
  snapshot: GameVisibilitySnapshot<TLineup, TEvent, TRecord>,
  policy: GameVisibilityPolicyInput,
): SerializedGameVisibility<TLineup, TEvent, TRecord> | null {
  const mode = effectiveMode(policy);
  if (mode === 'hidden') {
    return null;
  }
  if (mode === 'status_only') {
    return {
      gameId: snapshot.gameId,
      state: snapshot.state,
      effectiveMode: mode,
      scoreStatus:
        snapshot.officialScore !== null
          ? 'official'
          : snapshot.liveScore === null
            ? 'unavailable'
            : 'live',
      lineup: null,
      score: null,
      events: [],
      records: snapshot.officialRecords,
    };
  }
  if (mode === 'official_only') {
    return {
      gameId: snapshot.gameId,
      state: snapshot.state,
      effectiveMode: mode,
      scoreStatus: snapshot.officialScore === null ? 'unavailable' : 'official',
      lineup: null,
      score: snapshot.officialScore,
      events: snapshot.officialEvents,
      records: snapshot.officialRecords,
    };
  }
  return {
    gameId: snapshot.gameId,
    state: snapshot.state,
    effectiveMode: mode,
    scoreStatus: snapshot.liveScore === null ? 'unavailable' : 'live',
    lineup: policy.lineupEligible ? snapshot.lineup : null,
    score: snapshot.liveScore,
    events: snapshot.liveEvents,
    records: snapshot.officialRecords,
  };
}
