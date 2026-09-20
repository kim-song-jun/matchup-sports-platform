import type {
  GameVisibilityPolicyInput,
  GameVisibilitySnapshot,
  PublicGameVisibilityMode,
  SerializedGameVisibility,
} from '../games.types';

/**
 * D-06 의 런타임 강등. `public-visibility.ts` 의 `effectivePublicVisibilityMode` 와
 * **같은 답을 내야 하는 두 번째 구현**이다(그쪽 docblock 이 이 쌍을 명시한다) —
 * 한쪽만 고치면 `/games/:id/visibility` 와 공개 기록 라우트가 같은 경기에 다른 말을 한다.
 * 킬스위치는 진행 중 노출만 끊고 확정 결과는 남긴다.
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
