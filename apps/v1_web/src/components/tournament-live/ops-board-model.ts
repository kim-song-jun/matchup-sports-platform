import type { BoardCardState } from '@/components/tournament-ops/badges';
import { classifyEndedResult } from '@/components/tournament-ops/result-kind';
import { canAssignOperations, canManageTournamentResults } from '@/components/tournament-ops/role-context';
import { DAY_MS, isoToKstDatetimeLocal, kstMidnightMs } from '@/lib/kst-calendar';
import type {
  V1TournamentField,
  V1TournamentOperationsBoardItem,
  V1TournamentOperationsWarningCode,
  V1TournamentStaffAssignment,
  V1TournamentStaffRole,
} from '@/types/api';

export const NO_FIELD_KEY = '__no_field__';

export type CardState = BoardCardState;
export type CardActionKind = 'console' | 'confirm-result' | 'fix-result' | 'view-result' | 'assign-staff';
export interface CardAction {
  kind: CardActionKind;
  label: string;
  emphasis: 'primary' | 'secondary' | 'warning';
}
/** 「확인할 것」으로 세는 코드. 구장 미배정은 「구장 미정」 열이 이미 보여 줘서 뺀다. */
export type CheckCode = Exclude<V1TournamentOperationsWarningCode, 'NO_FIELD_ASSIGNED'>;

export interface BoardCard {
  fixtureId: string;
  item: V1TournamentOperationsBoardItem;
  /** 경기 시각이 없으면 null. */
  dayKey: string | null;
  timeLabel: string | null;
  fieldKey: string;
  fieldName: string | null;
  title: string;
  subtitle: string;
  state: CardState;
  action: CardAction | null;
  staffMissing: boolean;
  checks: readonly CheckCode[];
  isFieldNext: boolean;
}

export interface BuildBoardCardsInput {
  items: readonly V1TournamentOperationsBoardItem[];
  liveWarnings: ReadonlyMap<string, readonly V1TournamentOperationsWarningCode[]>;
  labelFor: (item: V1TournamentOperationsBoardItem) => { title: string; subtitle: string };
  staff: readonly V1TournamentStaffAssignment[];
  role: V1TournamentStaffRole;
  now: Date;
}

const CONSOLE_LABEL = '경기 콘솔 열기';

/** `'YYYY-MM-DD'` (KST). */
export function kstDayKey(iso: string): string {
  return isoToKstDatetimeLocal(iso).slice(0, 10);
}

/** `'HH:mm'` (KST). */
export function kstTimeLabel(iso: string): string {
  return isoToKstDatetimeLocal(iso).slice(11, 16);
}

function activeFieldOperators(staff: readonly V1TournamentStaffAssignment[]): V1TournamentStaffAssignment[] {
  return staff.filter((a) => a.role === 'FIELD_OPERATOR' && a.revokedAt === null);
}

/** 구장 담당자 배정이 한 건이라도 있는 대회만 「담당자 없음」을 판정한다 — 혼자 운영하는 대회가 전부 경고로 덮이지 않게. */
export function usesFieldStaff(staff: readonly V1TournamentStaffAssignment[]): boolean {
  return activeFieldOperators(staff).length > 0;
}

function coversAt(assignment: V1TournamentStaffAssignment, item: V1TournamentOperationsBoardItem, atMs: number): boolean {
  const inScope =
    (assignment.fieldId !== null && assignment.fieldId === item.fieldId) || assignment.fixtureIds.includes(item.fixtureId);
  if (!inScope) return false;
  return assignment.expiresAt === null || Date.parse(assignment.expiresAt) > atMs;
}

function stateOf(item: V1TournamentOperationsBoardItem, overdue: boolean): CardState {
  switch (item.gameState) {
    case 'LIVE':
    case 'PAUSED':
      return 'live';
    case 'ENDED': {
      const kind = classifyEndedResult(item, overdue);
      return kind === 'pending' ? 'result-pending' : kind === 'void' ? 'result-void' : 'result-done';
    }
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

function compareCards(a: V1TournamentOperationsBoardItem, b: V1TournamentOperationsBoardItem): number {
  const at = a.scheduledAt ? Date.parse(a.scheduledAt) : Number.POSITIVE_INFINITY;
  const bt = b.scheduledAt ? Date.parse(b.scheduledAt) : Number.POSITIVE_INFINITY;
  if (at !== bt) return at < bt ? -1 : 1;
  const an = a.fixtureNumber ?? Number.POSITIVE_INFINITY;
  const bn = b.fixtureNumber ?? Number.POSITIVE_INFINITY;
  if (an !== bn) return an < bn ? -1 : 1;
  return a.fixtureId.localeCompare(b.fixtureId);
}

export function buildBoardCards(input: BuildBoardCardsInput): BoardCard[] {
  const { liveWarnings, labelFor, staff, role, now } = input;
  const sorted = [...input.items].sort(compareCards);
  const staffInUse = usesFieldStaff(staff);
  const operators = activeFieldOperators(staff);
  const canResults = canManageTournamentResults(role);
  const canAssign = canAssignOperations(role);
  const todayKey = kstDayKey(now.toISOString());
  const seenField = new Set<string>();
  // 구장이 없는 경기에는 구장별 다음이 없다 — 앞으로의 가장 이른 시각 묶음 전체가 다음이다.
  let noFieldNextAt: string | null = null;

  return sorted.map((item) => {
    const live = liveWarnings.get(item.fixtureId) ?? [];
    const overdue = live.includes('RESULT_REVIEW_OVERDUE');
    const state = stateOf(item, overdue);
    const fieldKey = item.fieldId ?? NO_FIELD_KEY;

    const baseline = Math.max(now.getTime(), item.scheduledAt ? Date.parse(item.scheduledAt) : now.getTime());
    const open = state === 'live' || state === 'scheduled';
    // 구장이 없는 경기는 「구장 미정」 열에서 먼저 해결하므로 담당자 없음으로 겹쳐 세지 않는다.
    const staffMissing = staffInUse && open && item.fieldId !== null && !operators.some((a) => coversAt(a, item, baseline));

    // 지난 날 예정으로 남은 경기가 오늘의 다음 경기 자리를 차지하지 않는다.
    let isFieldNext = false;
    const upcoming = state === 'scheduled' && (item.scheduledAt === null || kstDayKey(item.scheduledAt) >= todayKey);
    if (upcoming && fieldKey === NO_FIELD_KEY) {
      if (noFieldNextAt === null) noFieldNextAt = item.scheduledAt ?? '';
      isFieldNext = (item.scheduledAt ?? '') === noFieldNextAt;
    } else if (upcoming && !seenField.has(fieldKey)) {
      seenField.add(fieldKey);
      isFieldNext = true;
    }

    let action: CardAction | null = null;
    if (state === 'live') {
      action = { kind: 'console', label: CONSOLE_LABEL, emphasis: 'primary' };
    } else if (state === 'result-pending' || state === 'result-done' || state === 'result-void') {
      // 지원은 결과 화면을 읽기만 한다 — 확정·고치기 버튼은 서버가 거부하므로 두지 않는다.
      if (!canResults) action = { kind: 'view-result', label: '결과 보기', emphasis: 'secondary' };
      else if (state === 'result-pending') action = { kind: 'confirm-result', label: '결과 확정', emphasis: 'primary' };
      else if (state === 'result-void') action = { kind: 'fix-result', label: '결과 다시 입력', emphasis: 'primary' };
      else action = { kind: 'fix-result', label: '결과 고치기', emphasis: 'secondary' };
    } else if (state === 'scheduled') {
      if (staffMissing) {
        if (canAssign) action = { kind: 'assign-staff', label: '담당자 배정하기', emphasis: 'warning' };
      } else if (isFieldNext) {
        action = { kind: 'console', label: CONSOLE_LABEL, emphasis: 'secondary' };
      }
    }

    const checks: CheckCode[] = [];
    for (const code of [...item.warnings, ...live]) {
      if (code === 'NO_FIELD_ASSIGNED' || code === 'NO_STAFF_ASSIGNED') continue;
      if (!checks.includes(code)) checks.push(code);
    }
    if (staffMissing) checks.push('NO_STAFF_ASSIGNED');

    const { title, subtitle } = labelFor(item);
    return {
      fixtureId: item.fixtureId,
      item,
      dayKey: item.scheduledAt ? kstDayKey(item.scheduledAt) : null,
      timeLabel: item.scheduledAt ? kstTimeLabel(item.scheduledAt) : null,
      fieldKey,
      fieldName: item.fieldName,
      title,
      subtitle,
      state,
      action,
      staffMissing,
      checks,
      isFieldNext,
    };
  });
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** `'2026-12-20'` → `'12. 20.(일)'`. */
export function formatDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return `${month}. ${day}.(${WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]})`;
}

/** 경기가 있는 날을 오름차순으로. 시간 미정 경기는 날이 없어 빠진다. */
export function listMatchDays(cards: readonly BoardCard[]): string[] {
  return [...new Set(cards.flatMap((c) => (c.dayKey === null ? [] : [c.dayKey])))].sort();
}

function dayDistance(a: string, b: string): number {
  return Math.abs(kstMidnightMs(a) - kstMidnightMs(b)) / DAY_MS;
}

/** 오늘 경기가 있으면 오늘, 없으면 가장 가까운 경기일(같으면 앞날). */
export function pickBoardDay(days: readonly string[], todayKey: string): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const day of days) {
    const distance = dayDistance(day, todayKey);
    if (distance < bestDistance || (distance === bestDistance && best !== null && day < best)) {
      best = day;
      bestDistance = distance;
    }
  }
  return best;
}

export interface FieldColumn {
  key: string;
  name: string;
  staffLine: string;
  expiresLabel: string | null;
  count: number;
}

const NO_FIELD_NAME = '구장 미정';

export function buildFieldColumns(
  cards: readonly BoardCard[],
  dayKey: string | null,
  fields: readonly V1TournamentField[],
  staff: readonly V1TournamentStaffAssignment[],
): FieldColumn[] {
  if (dayKey === null) return [];
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const card of cards) {
    if (card.dayKey !== dayKey) continue;
    counts.set(card.fieldKey, (counts.get(card.fieldKey) ?? 0) + 1);
    if (card.fieldKey !== NO_FIELD_KEY && card.fieldName !== null) names.set(card.fieldKey, card.fieldName);
  }

  const registered = new Map(fields.map((f) => [f.id, f]));
  const orderOf = (key: string) => registered.get(key)?.sortOrder ?? Number.POSITIVE_INFINITY;
  const nameOf = (key: string) => registered.get(key)?.name ?? names.get(key) ?? '구장';
  const fieldKeys = [...counts.keys()]
    .filter((key) => key !== NO_FIELD_KEY)
    .sort((a, b) => orderOf(a) - orderOf(b) || nameOf(a).localeCompare(nameOf(b), 'ko'));

  const operators = activeFieldOperators(staff);
  const columns: FieldColumn[] = fieldKeys.map((key) => {
    const assigned = operators.filter(
      (a) => a.fieldId === key && (a.expiresAt === null || kstDayKey(a.expiresAt) >= dayKey),
    );
    const nicknames = assigned.map((a) => a.nickname?.trim() || '이름 없는 사용자');
    const endsToday = assigned
      .flatMap((a) => (a.expiresAt !== null && kstDayKey(a.expiresAt) === dayKey ? [a.expiresAt] : []))
      .sort();
    return {
      key,
      name: nameOf(key),
      staffLine: nicknames.length === 0 ? '구장 담당자 없음' : `구장 담당자 ${nicknames.join(', ')}`,
      expiresLabel: endsToday.length === 0 ? null : `${kstTimeLabel(endsToday[0])}까지`,
      count: counts.get(key) ?? 0,
    };
  });

  const noFieldCount = counts.get(NO_FIELD_KEY);
  if (noFieldCount !== undefined) {
    columns.push({ key: NO_FIELD_KEY, name: NO_FIELD_NAME, staffLine: '구장을 정해 주세요', expiresLabel: null, count: noFieldCount });
  }
  return columns;
}

/** 시작 시각마다 한 줄. 시각이 없는 카드는 넣지 않는다. */
export function groupByTime(cards: readonly BoardCard[]): { time: string; cards: BoardCard[] }[] {
  const groups = new Map<string, BoardCard[]>();
  for (const card of cards) {
    if (card.timeLabel === null) continue;
    const list = groups.get(card.timeLabel);
    if (list) list.push(card);
    else groups.set(card.timeLabel, [card]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, list]) => ({ time, cards: list }));
}
