import type { FormationSlot } from '@/components/lineup/formation-slots';
import { applyAssignmentToEntries, planFormationAssignment } from '@/components/lineup/formation-assignment';
import { randomUuid } from '@/lib/uuid';
import type { LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import type { GameLineup } from '@/types/game-operations';
import type { V1SaveGameLineupPayload } from '@/hooks/use-v1-api';

/**
 * 대회 경기(tournament fixture) 라인업 편집기 상태 — team-match 쪽
 * (lineup.view-model.ts)과 구조는 비슷하지만 CAS 토큰이 다르다(lineup의
 * revision이 아니라 games.service.ts saveLineup/submitLineup이 쓰는
 * game.version).
 *
 * **선수의 유일한 출처는 대회 참가 등록 명단**(V1TournamentPlayer)이다. 예전에는 이
 * 화면에서 이름을 직접 타이핑해 선수를 만들 수 있었는데, 그러면 등록하지 않은 사람이
 * 경기 기록에 남고 등록 명단과 라인업이 서로 다른 진실을 갖게 된다. 이제 `starters`와
 * `bench`를 합치면 항상 등록 명단 전체이며, 편집이란 **그 안에서 누가 선발인지 고르는
 * 일**뿐이다(나머지는 자동으로 후보).
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
  /** 저장돼 있었지만 지금 등록 명단에는 없어 떨어져 나간 참가자 수 — 화면이 "왜 명단이
   * 달라졌는지"를 설명하는 데 쓴다. 조용히 사라지면 팀장은 자기가 지운 줄 안다. */
  droppedUnrosteredCount: number;
};

/** 라인업을 짤 수 있는 등록 명단의 한 사람. `useV1FixtureLineupRoster` 응답 행과 같은 모양. */
export type FixtureRosterPlayer = { userId: string; name: string };

export function createEmptyFixtureLineupState(gameVersion: number): FixtureLineupState {
  return {
    starters: [],
    bench: [],
    formation: null,
    gameVersion,
    lineupId: null,
    lineupState: null,
    dirty: false,
    droppedUnrosteredCount: 0,
  };
}

/**
 * 등록 명단을 기준으로 화면 상태를 만든다 — 저장된 라인업은 그 위에 "누가 선발이었고
 * 등번호·배치가 무엇이었는지"를 덧입히는 역할만 한다.
 *
 * 저장된 참가자와 명단을 잇는 열쇠는 `userId`다. 이름 문자열로 이으면 동명이인이 섞여
 * 선발 표시가 엉뚱한 사람에게 붙는다. 다만 `userId` 컬럼이 생기기 전에 저장된 라인업이
 * 이미 있으므로, userId가 없는 참가자에 한해 이름으로 한 번만 이어준다(같은 이름이
 * 여럿이면 앞선 사람이 먼저 가져간다 — 이 경우는 어차피 구분할 근거가 없다).
 *
 * 명단에 없는 참가자는 **버린다**. 등록 명단이 유일한 출처라는 원칙의 실제 귀결이고,
 * 버린 수는 `droppedUnrosteredCount`로 화면에 알린다.
 */
export function hydrateFixtureLineupState(
  lineups: GameLineup[],
  mySideId: string,
  gameVersion: number,
  /** [알파 감사 E] 이 종목의 실제 골키퍼 포지션 코드(예: 축구 'GK', 풋살 'GOLEIRO') —
   * formation-slots.ts의 goalkeeperPositionCode(lineupConfig.positions)로 구한다.
   * 하드코딩된 'GK'로 비교하면 풋살처럼 코드가 다른 종목에서 저장된 골키퍼를
   * 다시 골키퍼로 인식하지 못한다. */
  goalkeeperCode: string,
  roster: readonly FixtureRosterPlayer[],
): FixtureLineupState {
  const own = lineups
    .filter((lineup) => lineup.sideId === mySideId)
    .sort((a, b) => b.revision - a.revision)[0];
  /**
   * 대진이 확정되면 백엔드가 등록 명단 전원을 담은 초기 라인업을 미리 깔아 둔다
   * (tournament-bracket.service.ts → createFromSourceInTransaction). 그 참가자들은
   * `started` 컬럼 기본값 때문에 **전원 선발**로 저장돼 있는데, 그건 "이 사람들이 선발로
   * 정해졌다"는 뜻이 아니라 **아직 아무도 고르지 않았다**는 뜻이다. 그대로 화면에 옮기면
   * 팀장의 일이 "선발 고르기"가 아니라 "안 뛸 사람 하나씩 빼기"가 된다.
   *
   * 자동 생성분은 `revision === 1 && state === 'DRAFT'` 로 정확히 식별된다 — 저장
   * (saveLineup)은 언제나 `previous.revision + 1` 로 새 리비전을 만들기 때문에, 누군가
   * 한 번이라도 선발을 고르고 저장했다면 revision 이 2 이상이다.
   */
  const untouchedInitialLineup = own !== undefined && own.revision === 1 && own.state === 'DRAFT';
  const participants = own?.participants ?? [];
  const byUserId = new Map<string, (typeof participants)[number]>();
  const legacyByName = new Map<string, (typeof participants)[number][]>();
  for (const participant of participants) {
    if (participant.userId !== null && participant.userId !== undefined) {
      if (!byUserId.has(participant.userId)) byUserId.set(participant.userId, participant);
      continue;
    }
    const bucket = legacyByName.get(participant.displayNameSnapshot);
    if (bucket === undefined) legacyByName.set(participant.displayNameSnapshot, [participant]);
    else bucket.push(participant);
  }

  const starters: LineupEntryDraft[] = [];
  const bench: LineupEntryDraft[] = [];
  let matched = 0;
  for (const player of roster) {
    const saved = byUserId.get(player.userId) ?? legacyByName.get(player.name)?.shift();
    if (saved !== undefined) matched += 1;
    const entry: LineupEntryDraft = {
      // 등록 명단의 userId를 그대로 key로 쓴다 — 명단이 곧 정체성이라 별도 UUID가
      // 필요 없고, 저장/재수화를 거쳐도 같은 사람이 같은 key를 유지한다.
      key: player.userId,
      userId: player.userId,
      displayName: player.name,
      jerseyNumber: saved?.jerseyNumber ?? null,
      goalkeeper: saved?.position === goalkeeperCode,
      position: saved === undefined || saved.position === goalkeeperCode ? null : saved.position,
      positionX: saved?.positionX ?? null,
      positionY: saved?.positionY ?? null,
    };
    // V1GameParticipant.started 컬럼(2026-08 추가)으로 선발/후보를 그대로 되살린다 —
    // 예전엔 이 컬럼이 없어 새로고침하면 후보가 전원 선발로 합쳐졌다(실사용 QA 재현).
    // 저장된 적 없는 사람은 후보에서 시작한다 — "선발만 고르면 나머지는 후보"라는
    // 이 화면의 기본 규칙 그대로다. 아무도 손대지 않은 초기 라인업이면 저장된 started 를
    // 신뢰하지 않는다(위 untouchedInitialLineup 주석 참고).
    if (!untouchedInitialLineup && saved?.started === true) starters.push(entry);
    else bench.push(entry);
  }

  return {
    starters,
    bench,
    formation: own?.formation ?? null,
    gameVersion,
    // 초기 라인업은 **제출 대상이 아니다.** 그 리비전을 그대로 제출하면 화면에는 후보로
    // 보이는 사람들이 전원 선발로 확정된다 — 화면과 저장된 내용이 어긋나는 최악의 경우다.
    // lineupId 를 비워 두면 화면이 "먼저 저장" 경로를 강제하고, 저장이 만든 새 리비전
    // (지금 화면 그대로)이 제출 대상이 된다.
    lineupId: untouchedInitialLineup ? null : (own?.id ?? null),
    lineupState: untouchedInitialLineup ? null : (own?.state ?? null),
    dirty: false,
    droppedUnrosteredCount: participants.length - matched,
  };
}

/**
 * 불러온 라인업을 이 화면에 적용한다.
 *
 * **명단 자체는 절대 바뀌지 않는다.** 이 화면의 선수 목록은 대회 등록 명단이 유일한
 * 출처이므로(위 모듈 주석), 불러오기가 하는 일은 그 명단 위에 "누가 선발이었고 등번호와
 * 자리가 무엇이었는지"를 덧입히는 것뿐이다. 불러온 라인업에 없던 사람은 후보로 내려가고,
 * 불러온 라인업에만 있고 지금 명단에 없는 사람은 애초에 여기까지 오지 않는다(자격 필터가
 * 걸러낸다).
 *
 * `keepPlacement`가 false면 좌표·포지션·포메이션을 버리고 명단 구성만 가져온다 — 종목이
 * 다른 라인업(예: 풋살 라인업을 축구 경기에)을 불러올 때 포지션 코드와 좌표를 그대로
 * 옮기면 있지도 않은 자리에 선수가 서게 된다.
 */
export function applyLoadedSelection(
  state: FixtureLineupState,
  loaded: ReadonlyArray<{
    userId: string | null;
    jerseyNumber: number | null;
    position: string | null;
    positionX: number | null;
    positionY: number | null;
    started: boolean;
    goalkeeper: boolean;
  }>,
  options: { formation: string | null; keepPlacement: boolean },
): FixtureLineupState {
  const byUserId = new Map(
    loaded
      .filter((entry): entry is typeof entry & { userId: string } => entry.userId !== null)
      .map((entry) => [entry.userId, entry]),
  );

  const starters: LineupEntryDraft[] = [];
  const bench: LineupEntryDraft[] = [];
  for (const entry of [...state.starters, ...state.bench]) {
    const hit = entry.userId !== null ? byUserId.get(entry.userId) : undefined;
    if (hit === undefined) {
      // 불러온 라인업에 없던 사람 — 이 화면의 기본 규칙대로 후보에서 시작한다.
      bench.push({ ...entry, goalkeeper: false, positionX: null, positionY: null });
      continue;
    }
    const next: LineupEntryDraft = {
      ...entry,
      jerseyNumber: hit.jerseyNumber,
      goalkeeper: hit.started && hit.goalkeeper,
      position: options.keepPlacement && !hit.goalkeeper ? hit.position : null,
      positionX: options.keepPlacement ? hit.positionX : null,
      positionY: options.keepPlacement ? hit.positionY : null,
    };
    if (hit.started) starters.push(next);
    else bench.push({ ...next, goalkeeper: false, positionX: null, positionY: null });
  }

  return {
    ...state,
    starters,
    bench,
    formation: options.keepPlacement ? options.formation : null,
    dirty: true,
  };
}

/** 체크 하나로 선발↔후보를 오간다 — 이 화면의 유일한 명단 편집 조작이다. */
export function toggleStarter(state: FixtureLineupState, key: string): FixtureLineupState {
  return state.starters.some((entry) => entry.key === key)
    ? moveToBench(state, key)
    : moveToStarters(state, key);
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

/** 포메이션 프리셋 적용 — 배치된 선수를 새 슬롯으로 재배치한다. 재배치 규칙 자체는
 * formation-assignment.ts가 단독으로 갖고 있어 team-match 화면과 완전히 동일하게 동작한다
 * (상태 타입만 여기서 감싼다). */
export function applyFormationPreset(
  state: FixtureLineupState,
  formation: string,
  slots: FormationSlot[],
): FixtureLineupState {
  const plan = planFormationAssignment(slots, state.starters);
  return {
    ...state,
    formation,
    starters: applyAssignmentToEntries(state.starters, plan),
    dirty: true,
  };
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
        // userId는 등록 명단과 라인업을 잇는 열쇠다 — 이걸 보내야 다음에 화면을 열 때
        // 이름이 아니라 사람으로 대조된다.
        ...(entry.userId !== null ? { userId: entry.userId } : {}),
        displayNameSnapshot: entry.displayName,
        ...(entry.jerseyNumber !== null ? { jerseyNumber: entry.jerseyNumber } : {}),
        ...(entry.goalkeeper ? { position: goalkeeperCode } : entry.position !== null ? { position: entry.position } : {}),
        ...(entry.positionX !== null && entry.positionY !== null
          ? { positionX: entry.positionX, positionY: entry.positionY }
          : {}),
        started: true,
      })),
      ...state.bench.map((entry) => ({
        ...(entry.userId !== null ? { userId: entry.userId } : {}),
        displayNameSnapshot: entry.displayName,
        ...(entry.jerseyNumber !== null ? { jerseyNumber: entry.jerseyNumber } : {}),
        started: false,
      })),
    ],
  };
}
