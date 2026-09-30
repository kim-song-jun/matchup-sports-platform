import type { LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import { applyAssignmentToEntries, planFormationAssignment } from '@/components/lineup/formation-assignment';
import {
  GOALKEEPER_SLOT_CODE,
  presetsFromLineupConfig,
  slotsWithGoalkeeper,
  type FormationPreset,
  type FormationSlot,
} from '@/components/lineup/formation-slots';
import type { V1SaveTacticsBoardInput, V1TacticsBoard } from '@/hooks/use-v1-api';

/**
 * 전술보드 화면 상태(Task 180 H7 A안) — 팀 내부 도구다(정본 §3). 참석명단·경기 명단을 읽지 않고,
 * 명단·kickoff·결과도 이 보드를 읽지 않는다. 선수 풀은 **팀원 전체**, 번호는 **팀 등번호**다.
 *
 * - 코트 = 선발(`started`)이면서 좌표가 있는 사람. 그 밖은 전부 "대기".
 * - 저장은 코트 위 사람 + 코트 밖 게스트(userId 없음)만 싣는다. 코트 밖 팀원은 팀원 목록에서
 *   늘 다시 만들어지므로 싣지 않는다 — 옛 판의 "후보"·"선발 · 배치 전" 도 같은 대기로 읽힌다.
 */
export type BoardEntryDraft = LineupEntryDraft & { started: boolean };

/** 팀원 목록에서 보드가 쓰는 칸만. */
export type BoardMember = { userId: string; displayName: string; jerseyNumber?: number | null };

export function isOnCourt(entry: BoardEntryDraft): boolean {
  return entry.started && entry.positionX !== null && entry.positionY !== null;
}

/** 서버 판 → 화면 초안. 서버는 엔트리 id 를 주지 않아 사람(없으면 자리 순서)으로 키를 만든다. */
export function hydrate(board: V1TacticsBoard): BoardEntryDraft[] {
  return board.entries.map((entry, index) => ({
    key: entry.userId !== null ? `member-${entry.userId}` : `guest-${index}`,
    userId: entry.userId,
    displayName: entry.displayName,
    jerseyNumber: entry.jerseyNumber,
    goalkeeper: entry.goalkeeper,
    position: entry.position,
    positionX: entry.positionX,
    positionY: entry.positionY,
    started: entry.started,
  }));
}

/** 이 경기 인원(GK 제외 필드 인원)에 맞는 대형. 저장된 대형은 인원이 달라도 남긴다. */
export function formationOptionsFor(board: V1TacticsBoard): FormationPreset[] {
  if (board.lineupConfig === undefined) return [];
  const outfield = board.playersPerSide === undefined ? null : board.playersPerSide - 1;
  return presetsFromLineupConfig(board.lineupConfig, outfield, board.formation);
}

/** 저장한 적 없는 판은 첫 대형으로 연다(A-1). 저장본은 저장된 값 그대로 — 옛 자유 배치 판(null)을
 * 대형으로 열면 좌표가 옮겨진다. */
export function initialFormation(board: V1TacticsBoard, options: FormationPreset[]): string | null {
  return board.version === 0 ? (options[0]?.code ?? null) : board.formation;
}

export function formationNoteFor(board: V1TacticsBoard, options: FormationPreset[]): string | null {
  if (options.length === 0) return '지금은 자유 배치예요. 선수를 피치 위 원하는 자리에 놓아 주세요.';
  const players = board.playersPerSide;
  return players === undefined ? null : `${players}:${players} 경기예요. 필드 ${players - 1}명 대형만 보여요.`;
}

/** 팀원인 엔트리의 이름·번호를 지금 팀 값으로 바꾼다(번호는 팀 등번호 — 멤버 관리에서 바꾸면 따라온다). */
function withTeamValues(entries: BoardEntryDraft[], members: BoardMember[]): BoardEntryDraft[] {
  const memberById = new Map(members.map((member) => [member.userId, member]));
  return entries.map((entry) => {
    const member = entry.userId === null ? undefined : memberById.get(entry.userId);
    return member === undefined
      ? entry
      : { ...entry, displayName: member.displayName, jerseyNumber: member.jerseyNumber ?? null };
  });
}

function byNumberThenName(a: BoardEntryDraft, b: BoardEntryDraft): number {
  if (a.jerseyNumber !== b.jerseyNumber) {
    if (a.jerseyNumber === null) return 1;
    if (b.jerseyNumber === null) return -1;
    return a.jerseyNumber - b.jerseyNumber;
  }
  return a.displayName.localeCompare(b.displayName, 'ko');
}

/**
 * 코트 위 / 대기. 대기 = 코트 밖 엔트리 중 팀원·게스트 + 아직 엔트리가 없는 팀원, 등번호 순.
 * 코트 밖에 남은 옛 팀원(팀을 떠난 사람)은 뺀다 — 보드의 선수 풀은 지금 팀원이다.
 *
 * 게스트 엔트리(userId 없음)는 이름이 유일한 신원이라 **게스트에만** 이름 대조를 건다. 모든
 * 엔트리에 걸면 보드의 "김철수(X)" 때문에 다른 팀원 "김철수(Y)" 가 아무 안내 없이 사라진다.
 */
export function buildBoardPeople(entries: BoardEntryDraft[], members: BoardMember[]) {
  const current = withTeamValues(entries, members);
  const memberIds = new Set(members.map((member) => member.userId));
  const takenUserIds = new Set(entries.flatMap((entry) => (entry.userId === null ? [] : [entry.userId])));
  const takenGuestNames = new Set(entries.filter((entry) => entry.userId === null).map((entry) => entry.displayName));
  const newcomers: BoardEntryDraft[] = members
    .filter((member) => !takenUserIds.has(member.userId) && !takenGuestNames.has(member.displayName))
    .map((member) => ({
      key: `member-${member.userId}`,
      userId: member.userId,
      displayName: member.displayName,
      jerseyNumber: member.jerseyNumber ?? null,
      goalkeeper: false,
      position: null,
      positionX: null,
      positionY: null,
      started: false,
    }));
  const offCourt = current.filter(
    (entry) => !isOnCourt(entry) && (entry.userId === null || memberIds.has(entry.userId)),
  );
  return {
    onCourt: current.filter(isOnCourt),
    waiting: [...offCourt, ...newcomers].sort(byNumberThenName),
  };
}

/** 사람 하나를 바꾼다 — 아직 엔트리가 없는 팀원(대기 칩)이면 새로 넣는다. */
export function upsertEntry(
  entries: BoardEntryDraft[],
  person: BoardEntryDraft,
  patch: Partial<BoardEntryDraft>,
): BoardEntryDraft[] {
  if (entries.some((entry) => entry.key === person.key)) {
    return entries.map((entry) => (entry.key === person.key ? { ...entry, ...patch } : entry));
  }
  return [...entries, { ...person, ...patch }];
}

/** 대형 자리에 앉힌다. GK 자리면 골키퍼, 아니면 그 자리의 포지션 코드. */
export function slotPatch(slot: FormationSlot): Partial<BoardEntryDraft> {
  const goalkeeper = slot.positionCode === GOALKEEPER_SLOT_CODE;
  return {
    started: true,
    positionX: slot.x,
    positionY: slot.y,
    position: goalkeeper ? null : slot.positionCode,
    goalkeeper,
  };
}

export const OFF_COURT_PATCH: Partial<BoardEntryDraft> = {
  started: false,
  positionX: null,
  positionY: null,
  position: null,
  goalkeeper: false,
};

/** 대형을 바꾸면 코트 위 선수를 새 자리로 옮기고, 자리를 못 받은 선수는 대기로 내린다
 * (편집기 확인 모달이 예고한 것과 같은 계획 — formation-assignment). */
export function applyFormation(entries: BoardEntryDraft[], preset: FormationPreset | null): BoardEntryDraft[] {
  if (preset === null) return entries;
  const onCourt = entries.filter(isOnCourt);
  const plan = planFormationAssignment(slotsWithGoalkeeper(preset), onCourt);
  const moved = new Map(applyAssignmentToEntries(onCourt, plan).map((entry) => [entry.key, entry]));
  return entries.map((entry) => {
    const next = moved.get(entry.key);
    if (next === undefined) return entry;
    return next.positionX === null ? { ...next, started: false } : next;
  });
}

export function toSaveInput(
  entries: BoardEntryDraft[],
  members: BoardMember[],
  formation: string | null,
  expectedVersion: number,
): V1SaveTacticsBoardInput {
  return {
    formation,
    expectedVersion,
    entries: withTeamValues(entries, members)
      .filter((entry) => isOnCourt(entry) || entry.userId === null)
      .map((entry) => {
        const onCourt = isOnCourt(entry);
        return {
          userId: entry.userId,
          displayName: entry.displayName,
          jerseyNumber: entry.jerseyNumber,
          position: onCourt ? entry.position : null,
          positionX: onCourt ? entry.positionX : null,
          positionY: onCourt ? entry.positionY : null,
          started: onCourt,
          goalkeeper: entry.goalkeeper,
        };
      }),
  };
}
