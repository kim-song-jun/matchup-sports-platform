/**
 * 불러온 라인업(과거 경기 또는 프리셋)을 **지금 이 화면에 쓸 수 있는 형태**로 옮기는
 * 순수 로직. 두 라인업 화면이 이 판정을 공유한다 — 대회 경기와 팀 매치는 서버가 요구하는
 * 자격 조건이 서로 다르지만, "누가 같은 사람인가"와 "등번호를 무엇으로 채울까"는 같다.
 *
 * 네트워크도 React도 없이 단독으로 테스트할 수 있게 분리했다.
 */

/** 불러올 원본 한 명분. 히스토리 참가자와 프리셋 엔트리가 같은 모양을 쓴다. */
export type LoadableEntry = {
  userId: string | null;
  displayName: string;
  jerseyNumber: number | null;
  position: string | null;
  positionX: number | null;
  positionY: number | null;
  started: boolean;
  goalkeeper: boolean;
};

/** 지금 이 화면에서 실제로 라인업에 넣을 수 있는 사람. */
export type EligibleMember = {
  userId: string;
  displayName: string;
  /** 팀 고정 등번호. 없으면 null. */
  jerseyNumber?: number | null;
};

/** 불러오지 못한 이유. 화면이 사용자에게 그대로 문구로 보여준다. */
export type SkipReason = 'not_attending' | 'not_in_team' | 'not_registered';

export type ResolvedEntry = LoadableEntry;

export type SkippedEntry = { displayName: string; reason: SkipReason };

export type ResolveResult = {
  applied: ResolvedEntry[];
  skipped: SkippedEntry[];
};

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  not_attending: '참석 응답이 없어요',
  not_in_team: '지금은 팀에 없어요',
  not_registered: '이 대회에 등록되지 않았어요',
};

/**
 * 불러온 엔트리를 현재 자격 목록과 대조한다.
 *
 * 매칭 순서가 중요하다:
 *  1. `userId`가 있으면 그걸로 잇는다. 표시 이름은 **자격 목록의 현재 이름**을 쓴다 —
 *     그 사이 닉네임을 바꿨다면 새 이름이 맞다.
 *  2. `userId`가 없으면(게스트이거나, userId 컬럼이 생기기 전에 저장된 과거 라인업)
 *     이름 완전일치로 한 번 이어본다. 같은 이름이 여럿이면 앞선 사람이 먼저 가져간다 —
 *     구분할 근거가 애초에 없다.
 *  3. 그래도 못 찾았는데 게스트를 허용하는 화면이면 게스트로 남긴다.
 *  4. 아니면 제외하고 이유를 남긴다.
 *
 * 한 사람이 두 번 들어가지 않게, 이미 쓴 자격 항목은 소비 처리한다.
 */
export function resolveLoadableEntries(input: {
  entries: readonly LoadableEntry[];
  eligible: readonly EligibleMember[];
  /** 팀 매치는 비연동 게스트를 명단에 둘 수 있고, 대회는 등록 명단만 허용한다. */
  allowGuests: boolean;
  /** 자격 목록에 없을 때 붙일 이유. 화면마다 다르다(대회는 미등록, 팀 매치는 미참석 등). */
  missingReason: SkipReason;
  /** 자격은 있지만 참석하지 않아 제외된 사람을 따로 구분하고 싶을 때 쓴다. */
  ineligibleReasonByUserId?: Readonly<Record<string, SkipReason>>;
}): ResolveResult {
  const byUserId = new Map<string, EligibleMember>();
  const byName = new Map<string, EligibleMember[]>();
  for (const member of input.eligible) {
    byUserId.set(member.userId, member);
    const bucket = byName.get(member.displayName);
    if (bucket === undefined) byName.set(member.displayName, [member]);
    else bucket.push(member);
  }

  const consumed = new Set<string>();
  const applied: ResolvedEntry[] = [];
  const skipped: SkippedEntry[] = [];

  for (const entry of input.entries) {
    const matched = matchMember(entry, byUserId, byName, consumed);
    if (matched !== null) {
      consumed.add(matched.userId);
      applied.push({
        ...entry,
        userId: matched.userId,
        // 자격 목록 쪽이 현재의 진실이다.
        displayName: matched.displayName,
        jerseyNumber: resolveJerseyNumber({ loaded: entry.jerseyNumber, teamFixed: matched.jerseyNumber }),
      });
      continue;
    }

    // 연동된 사람인데 자격 목록에 없다 — 왜 없는지 구체적인 이유가 있으면 그걸 쓴다.
    const specificReason =
      entry.userId !== null ? input.ineligibleReasonByUserId?.[entry.userId] : undefined;
    if (entry.userId === null && input.allowGuests) {
      applied.push({ ...entry });
      continue;
    }
    skipped.push({ displayName: entry.displayName, reason: specificReason ?? input.missingReason });
  }

  return { applied, skipped };
}

function matchMember(
  entry: LoadableEntry,
  byUserId: Map<string, EligibleMember>,
  byName: Map<string, EligibleMember[]>,
  consumed: Set<string>,
): EligibleMember | null {
  if (entry.userId !== null) {
    const direct = byUserId.get(entry.userId);
    if (direct !== undefined && !consumed.has(direct.userId)) return direct;
    return null;
  }
  const candidates = byName.get(entry.displayName) ?? [];
  return candidates.find((candidate) => !consumed.has(candidate.userId)) ?? null;
}

/**
 * 등번호를 무엇으로 채울지 정한다. 앞에서 값이 나오면 뒤는 보지 않는다.
 *
 *  1. 불러온 라인업/프리셋에 적혀 있던 번호 — 그 라인업을 그대로 쓰겠다는 뜻이다
 *  2. 팀이 지정한 고정 등번호 — 팀의 영구 번호
 *  3. 그 선수가 직전 경기에 달았던 번호 — 아무도 정해주지 않았지만 실제로 쓰던 번호
 *  4. 없으면 빈칸
 */
export function resolveJerseyNumber(input: {
  loaded?: number | null;
  teamFixed?: number | null;
  recent?: number | null;
}): number | null {
  return input.loaded ?? input.teamFixed ?? input.recent ?? null;
}

/**
 * 히스토리에서 사람별 "가장 최근에 달았던 등번호"를 뽑는다.
 *
 * 입력은 최신 경기부터 정렬돼 있다고 가정한다(서버가 그렇게 준다) — 그래서 처음 만난
 * 값이 곧 가장 최근 값이고, 뒤에 나오는 옛 번호가 덮어쓰지 않는다.
 */
export function buildRecentJerseyMap(
  history: ReadonlyArray<{ participants: readonly LoadableEntry[] }>,
): Map<string, number> {
  const recent = new Map<string, number>();
  for (const item of history) {
    for (const participant of item.participants) {
      if (participant.userId === null || participant.jerseyNumber === null) continue;
      if (!recent.has(participant.userId)) recent.set(participant.userId, participant.jerseyNumber);
    }
  }
  return recent;
}

/** 제외된 사람들을 한 줄 문구로 정리한다. 없으면 null — 화면은 배너를 아예 띄우지 않는다. */
export function describeSkipped(applied: number, skipped: readonly SkippedEntry[]): string | null {
  if (skipped.length === 0) return null;
  const byReason = new Map<SkipReason, string[]>();
  for (const entry of skipped) {
    const bucket = byReason.get(entry.reason);
    if (bucket === undefined) byReason.set(entry.reason, [entry.displayName]);
    else bucket.push(entry.displayName);
  }
  const details = [...byReason.entries()]
    .map(([reason, names]) => `${names.join('·')}(${SKIP_REASON_LABEL[reason]})`)
    .join(', ');
  return `${applied + skipped.length}명 중 ${applied}명을 불러왔어요 · ${details}`;
}
