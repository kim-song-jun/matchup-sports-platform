import { randomUuid } from '@/lib/uuid';
import { computeFormationPositions, suggestedFormations, type LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import type { GameLineup } from '@/types/game-operations';
import type { V1SaveGameLineupPayload } from '@/hooks/use-v1-api';

export { computeFormationPositions, suggestedFormations };

/**
 * 대회 경기(tournament fixture) 라인업 편집기 상태 — team-match 쪽
 * (lineup.view-model.ts)과 구조는 비슷하지만 CAS 토큰이 다르다(lineup의
 * revision이 아니라 games.service.ts saveLineup/submitLineup이 쓰는
 * game.version). 로스터 풀 연동 없이 이름을 직접 입력해 추가한다 — 대회
 * 참가팀 등록 로스터 연동은 TODO(후속 작업)로 남긴다.
 */
export type FixtureLineupState = {
  starters: LineupEntryDraft[];
  bench: LineupEntryDraft[];
  formation: string | null;
  /** 다음 저장에 실어 보낼 expectedVersion == 서버의 game.version. */
  gameVersion: number;
  /** 마지막으로 저장에 성공한 DRAFT 라인업 id — 제출(submit) 대상. */
  lineupId: string | null;
  lineupState: 'DRAFT' | 'SUBMITTED' | 'LOCKED' | null;
  dirty: boolean;
};

export function createEmptyFixtureLineupState(gameVersion: number): FixtureLineupState {
  return { starters: [], bench: [], formation: null, gameVersion, lineupId: null, lineupState: null, dirty: false };
}

/** GET /games/:gameId/lineups 응답에서 내 sideId의 최신 라인업만 뽑아 수화한다.
 * (서버가 이미 자기 사이드로 필터링해서 주지만, 방어적으로 한 번 더 좁힌다.) */
export function hydrateFixtureLineupState(
  lineups: GameLineup[],
  mySideId: string,
  gameVersion: number,
): FixtureLineupState {
  const own = lineups
    .filter((lineup) => lineup.sideId === mySideId)
    .sort((a, b) => b.revision - a.revision)[0];
  if (own === undefined) return createEmptyFixtureLineupState(gameVersion);
  const starters: LineupEntryDraft[] = [];
  const bench: LineupEntryDraft[] = [];
  for (const participant of own.participants) {
    const entry: LineupEntryDraft = {
      key: randomUuid(),
      userId: null,
      displayName: participant.displayNameSnapshot,
      jerseyNumber: participant.jerseyNumber,
      goalkeeper: participant.position === 'GK',
      position: participant.position === 'GK' ? null : participant.position,
      positionX: participant.positionX,
      positionY: participant.positionY,
    };
    // started 여부는 저장 시점 DTO에만 있고 GET 응답 참여자 스냅샷(V1GameParticipant)에는
    // 컬럼 자체가 없다 — 그래서 다시 불러오면 전원 선발로 취급한다(후보를 저장해도
    // 새로고침하면 선발 목록에 합쳐진다). TODO: 후보를 살리려면 백엔드
    // V1GameParticipant에 started 컬럼을 추가하고 listLineups 응답에 실어야 한다.
    starters.push(entry);
  }
  return {
    starters,
    bench,
    formation: own.formation,
    gameVersion,
    lineupId: own.id,
    lineupState: own.state,
    dirty: false,
  };
}

export function addPlayer(state: FixtureLineupState, displayName: string): FixtureLineupState {
  const name = displayName.trim();
  if (name === '') return state;
  return {
    ...state,
    bench: [
      ...state.bench,
      { key: randomUuid(), userId: null, displayName: name, jerseyNumber: null, goalkeeper: false, position: null, positionX: null, positionY: null },
    ],
    dirty: true,
  };
}

export function removePlayer(state: FixtureLineupState, key: string): FixtureLineupState {
  return {
    ...state,
    starters: state.starters.filter((entry) => entry.key !== key),
    bench: state.bench.filter((entry) => entry.key !== key),
    dirty: true,
  };
}

export function moveToStarters(state: FixtureLineupState, key: string): FixtureLineupState {
  const entry = state.bench.find((row) => row.key === key);
  if (entry === undefined) return state;
  return { ...state, bench: state.bench.filter((row) => row.key !== key), starters: [...state.starters, entry], dirty: true };
}

export function moveToBench(state: FixtureLineupState, key: string): FixtureLineupState {
  const entry = state.starters.find((row) => row.key === key);
  if (entry === undefined) return state;
  return {
    ...state,
    starters: state.starters.filter((row) => row.key !== key),
    bench: [...state.bench, { ...entry, goalkeeper: false, positionX: null, positionY: null }],
    dirty: true,
  };
}

export function setJerseyNumber(state: FixtureLineupState, key: string, value: number | null): FixtureLineupState {
  const patch = (entry: LineupEntryDraft) => (entry.key === key ? { ...entry, jerseyNumber: value } : entry);
  return { ...state, starters: state.starters.map(patch), bench: state.bench.map(patch), dirty: true };
}

export function setGoalkeeper(state: FixtureLineupState, key: string): FixtureLineupState {
  return {
    ...state,
    starters: state.starters.map((entry) => ({ ...entry, goalkeeper: entry.key === key })),
    dirty: true,
  };
}

export function setPlayerPosition(state: FixtureLineupState, key: string, positionX: number, positionY: number): FixtureLineupState {
  return {
    ...state,
    starters: state.starters.map((entry) => (entry.key === key ? { ...entry, positionX, positionY } : entry)),
    dirty: true,
  };
}

export function clearPlayerPosition(state: FixtureLineupState, key: string): FixtureLineupState {
  return {
    ...state,
    starters: state.starters.map((entry) => (entry.key === key ? { ...entry, positionX: null, positionY: null } : entry)),
    dirty: true,
  };
}

/** team-match 쪽 applyFormation(lineup.view-model.ts)과 로직은 같지만 상태 타입이
 * 달라(gameVersion vs baseRevision) 그대로 재사용할 수 없다 — computeFormationPositions는
 * 순수 함수라 그대로 재사용하고, 상태 조립만 여기서 다시 한다. */
export function applyFormation(state: FixtureLineupState, formation: string): FixtureLineupState {
  const goalkeeperKey = state.starters.find((entry) => entry.goalkeeper)?.key ?? null;
  const outfield = state.starters.filter((entry) => entry.key !== goalkeeperKey);
  const positions = computeFormationPositions(formation, outfield.length);
  if (positions === null) {
    return { ...state, formation, dirty: true };
  }
  let cursor = 0;
  return {
    ...state,
    formation,
    starters: state.starters.map((entry) => {
      if (entry.key === goalkeeperKey) return { ...entry, positionX: 50, positionY: 6 };
      const next = positions[cursor];
      cursor += 1;
      return next ? { ...entry, positionX: next.positionX, positionY: next.positionY } : entry;
    }),
    dirty: true,
  };
}

export function buildSavePayload(state: FixtureLineupState): V1SaveGameLineupPayload {
  return {
    expectedVersion: state.gameVersion,
    ...(state.formation !== null ? { formation: state.formation } : {}),
    participants: [
      ...state.starters.map((entry) => ({
        displayNameSnapshot: entry.displayName,
        ...(entry.jerseyNumber !== null ? { jerseyNumber: entry.jerseyNumber } : {}),
        ...(entry.goalkeeper ? { position: 'GK' } : entry.position !== null ? { position: entry.position } : {}),
        ...(entry.positionX !== null && entry.positionY !== null
          ? { positionX: entry.positionX, positionY: entry.positionY }
          : {}),
        started: true,
      })),
      ...state.bench.map((entry) => ({
        displayNameSnapshot: entry.displayName,
        ...(entry.jerseyNumber !== null ? { jerseyNumber: entry.jerseyNumber } : {}),
        started: false,
      })),
    ],
  };
}
