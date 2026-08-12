import type { FormationSlot } from '@/components/lineup/formation-slots';
import { randomUuid } from '@/lib/uuid';
import type { LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import type { GameLineup } from '@/types/game-operations';
import type { V1SaveGameLineupPayload } from '@/hooks/use-v1-api';

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
  /** [알파 감사 E] 이 종목의 실제 골키퍼 포지션 코드(예: 축구 'GK', 풋살 'GOLEIRO') —
   * formation-slots.ts의 goalkeeperPositionCode(lineupConfig.positions)로 구한다.
   * 하드코딩된 'GK'로 비교하면 풋살처럼 코드가 다른 종목에서 저장된 골키퍼를
   * 다시 골키퍼로 인식하지 못한다. */
  goalkeeperCode: string,
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
      goalkeeper: participant.position === goalkeeperCode,
      position: participant.position === goalkeeperCode ? null : participant.position,
      positionX: participant.positionX,
      positionY: participant.positionY,
    };
    // V1GameParticipant.started 컬럼(2026-08 추가)으로 선발/후보를 그대로 되살린다 —
    // 예전엔 이 컬럼이 없어 새로고침하면 후보가 전원 선발로 합쳐졌다(실사용 QA 재현).
    if (participant.started) starters.push(entry);
    else bench.push(entry);
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

/** team-match 쪽 selectFormation(lineup.view-model.ts)과 로직은 같지만 상태 타입이
 * 달라(gameVersion vs baseRevision) 그대로 재사용할 수 없다. */
export function selectFormation(state: FixtureLineupState, formation: string | null): FixtureLineupState {
  return { ...state, formation, dirty: true };
}

export function placeInSlot(state: FixtureLineupState, key: string, slot: FormationSlot): FixtureLineupState {
  const isGoalkeeperSlot = slot.positionCode === 'GK';
  return {
    ...state,
    starters: state.starters.map((entry) => {
      if (entry.key !== key) {
        return isGoalkeeperSlot && entry.goalkeeper ? { ...entry, goalkeeper: false } : entry;
      }
      return {
        ...entry,
        positionX: slot.x,
        positionY: slot.y,
        position: isGoalkeeperSlot ? null : slot.positionCode,
        goalkeeper: isGoalkeeperSlot,
      };
    }),
    dirty: true,
  };
}

export function unplaceFromSlot(state: FixtureLineupState, key: string): FixtureLineupState {
  return {
    ...state,
    starters: state.starters.map((entry) =>
      entry.key === key
        ? { ...entry, positionX: null, positionY: null, position: null, goalkeeper: false }
        : entry,
    ),
    dirty: true,
  };
}

export function buildSavePayload(
  state: FixtureLineupState,
  /** [알파 감사 E] hydrateFixtureLineupState와 동일한 종목별 골키퍼 코드. 여기서
   * 하드코딩된 'GK'를 그대로 저장하면 풋살 골키퍼가 축구 코드로 저장돼 종목 사전과
   * 어긋난다(lineupConfig.positions는 GOLEIRO/FIXO/ALA/PIVO). */
  goalkeeperCode: string,
): V1SaveGameLineupPayload {
  return {
    expectedVersion: state.gameVersion,
    ...(state.formation !== null ? { formation: state.formation } : {}),
    participants: [
      ...state.starters.map((entry) => ({
        displayNameSnapshot: entry.displayName,
        ...(entry.jerseyNumber !== null ? { jerseyNumber: entry.jerseyNumber } : {}),
        ...(entry.goalkeeper ? { position: goalkeeperCode } : entry.position !== null ? { position: entry.position } : {}),
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
