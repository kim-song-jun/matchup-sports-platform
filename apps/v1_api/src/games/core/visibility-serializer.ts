import type {
  GameVisibilityPolicyInput,
  GameVisibilitySnapshot,
  PublicGameVisibilityMode,
  SerializedGameVisibility,
} from '../games.types';

/**
 * D-06 킬스위치 강등의 **방어적 사본**이다. 유일한 호출자(`GamesService#getVisibility`)가
 * 이미 `effectivePublicVisibilityMode` 로 해석한 모드를 넘기므로 지금은 발동하지 않는다 —
 * 해석 안 된 원시 모드를 넘기는 호출자가 생기면 그때 다시 동작한다.
 */
function effectiveMode(policy: GameVisibilityPolicyInput): PublicGameVisibilityMode {
  if (policy.mode === 'live' && !policy.publicLiveEnabled) {
    return 'official_only';
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
