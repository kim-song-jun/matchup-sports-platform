import { describe, expect, it } from 'vitest';
import type {
  V1TournamentField,
  V1TournamentOperationsBoardItem,
  V1TournamentStaffAssignment,
  V1TournamentOperationsWarningCode,
} from '@/types/api';
import {
  NO_FIELD_KEY,
  buildBoardCards,
  buildFieldColumns,
  formatDayLabel,
  groupByTime,
  kstDayKey,
  kstTimeLabel,
  listMatchDays,
  pickBoardDay,
  usesFieldStaff,
  type BoardCard,
  type BuildBoardCardsInput,
} from './ops-board-model';

function fx(
  id: string,
  fieldId: string | null,
  scheduledAt: string | null,
  over: Partial<V1TournamentOperationsBoardItem> = {},
): V1TournamentOperationsBoardItem {
  return {
    fixtureId: id,
    tournamentId: 't-1',
    round: '조별리그 1라운드',
    fixtureNumber: 1,
    legNumber: null,
    groupName: 'A조',
    gameId: `g-${id}`,
    gameState: 'SCHEDULED',
    fieldId,
    fieldName: fieldId === null ? null : `구장 ${fieldId.replace('f', '')}`,
    homeRegistrationId: 'r-h',
    awayRegistrationId: 'r-a',
    scheduledAt,
    currentScore: null,
    currentRevisionState: null,
    warnings: [],
    version: 1,
    revisionId: null,
    stableRevision: 'v1',
    ...over,
  };
}

function op(
  fieldId: string | null,
  expiresAt: string | null,
  over: Partial<V1TournamentStaffAssignment> = {},
): V1TournamentStaffAssignment {
  return {
    id: `s-${fieldId}-${expiresAt}`,
    tournamentId: 't-1',
    userId: `u-${fieldId}`,
    role: 'FIELD_OPERATOR',
    fieldId,
    fixtureIds: [],
    version: 1,
    expiresAt,
    revokedAt: null,
    grantedByUserId: null,
    createdAt: '2026-12-01T00:00:00.000Z',
    nickname: '이서연',
    ...over,
  };
}

function field(id: string, name: string, sortOrder: number): V1TournamentField {
  return { id, tournamentId: 't-1', scopeKey: id, name, sortOrder, active: true, version: 1 };
}

const base: BuildBoardCardsInput = {
  items: [],
  liveWarnings: new Map(),
  labelFor: (item) => ({ title: `경기 ${item.fixtureId}`, subtitle: item.round ?? '' }),
  staff: [],
  role: 'PLATFORM_OPS',
  now: new Date('2026-12-20T01:15:00Z'),
};

function byId(cards: readonly BoardCard[], id: string): BoardCard {
  const card = cards.find((c) => c.fixtureId === id);
  if (!card) throw new Error(`card ${id} not found`);
  return card;
}

describe('KST 날짜·시각', () => {
  it('KST 23:30 과 00:30 은 다른 날이다', () => {
    expect(kstDayKey('2026-12-20T14:30:00Z')).toBe('2026-12-20');
    expect(kstDayKey('2026-12-20T15:30:00Z')).toBe('2026-12-21');
  });

  it('시각 글자는 KST 벽시계다', () => {
    expect(kstTimeLabel('2026-12-20T14:30:00Z')).toBe('23:30');
    expect(kstTimeLabel('2026-12-20T15:30:00Z')).toBe('00:30');
  });
});

describe('formatDayLabel', () => {
  it('KST 날짜 글자에 요일을 붙인다', () => {
    expect(formatDayLabel('2026-12-20')).toBe('12. 20.(일)');
    expect(formatDayLabel('2027-01-01')).toBe('1. 1.(금)');
  });
});

describe('pickBoardDay', () => {
  it.each([
    [['2026-12-19', '2026-12-21'], '2026-12-20', '2026-12-19'],
    [['2026-12-18', '2026-12-22'], '2026-12-20', '2026-12-18'],
    [['2026-12-20'], '2026-12-20', '2026-12-20'],
    [['2026-12-19', '2026-12-20', '2026-12-21'], '2026-12-20', '2026-12-20'],
    [['2026-12-25', '2026-12-30'], '2026-12-20', '2026-12-25'],
    [[], '2026-12-20', null],
  ])('days=%j today=%s -> %s', (days, today, want) => {
    expect(pickBoardDay(days as string[], today as string)).toBe(want);
  });
});

describe('buildBoardCards — 날짜·시각·정렬', () => {
  it('시간 미정 경기는 dayKey·timeLabel 이 null 이고 listMatchDays 에서 빠지며 맨 뒤에 놓인다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('none', 'f1', null), fx('b', 'f1', '2026-12-20T02:00:00Z'), fx('a', 'f1', '2026-12-20T01:00:00Z')],
    });
    expect(cards.map((c) => c.fixtureId)).toEqual(['a', 'b', 'none']);
    expect(byId(cards, 'none')).toMatchObject({ dayKey: null, timeLabel: null });
    expect(listMatchDays(cards)).toEqual(['2026-12-20']);
  });

  it('여러 날을 오름차순 중복 없이 모은다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('c', 'f1', '2026-12-21T02:00:00Z'), fx('a', 'f1', '2026-12-19T02:00:00Z'), fx('b', 'f1', '2026-12-21T05:00:00Z')],
    });
    expect(listMatchDays(cards)).toEqual(['2026-12-19', '2026-12-21']);
  });

  it('같은 구장 같은 시각 두 경기는 groupByTime 한 줄에 둘 다 있고, 줄은 시각 오름차순이다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        fx('late', 'f1', '2026-12-20T03:00:00Z'),
        fx('x', 'f1', '2026-12-20T01:00:00Z', { fixtureNumber: 2 }),
        fx('y', 'f1', '2026-12-20T01:00:00Z', { fixtureNumber: 1 }),
        fx('none', 'f1', null),
      ],
    });
    const groups = groupByTime(cards);
    expect(groups.map((g) => g.time)).toEqual(['10:00', '12:00']);
    expect(groups[0].cards.map((c) => c.fixtureId)).toEqual(['y', 'x']);
  });
});

describe('buildBoardCards — 상태와 할 일', () => {
  const ended = (id: string, over: Partial<V1TournamentOperationsBoardItem>) =>
    fx(id, 'f1', '2026-12-20T00:00:00Z', { gameState: 'ENDED', ...over });

  it('진행 중·일시중지 경기는 경기 콘솔 열기(primary)다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('l', 'f1', '2026-12-20T01:00:00Z', { gameState: 'LIVE' }), fx('p', 'f2', '2026-12-20T01:00:00Z', { gameState: 'PAUSED' })],
    });
    for (const id of ['l', 'p']) {
      expect(byId(cards, id)).toMatchObject({ state: 'live', action: { kind: 'console', label: '경기 콘솔 열기', emphasis: 'primary' } });
    }
  });

  it('운영자: ENDED+revisionId null → 결과 확정(primary), ENDED+OFFICIAL → 결과 고치기(secondary)', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        ended('pending', { revisionId: null }),
        ended('submitted', { revisionId: 'r1', currentRevisionState: 'SUBMITTED' }),
        ended('done', { revisionId: 'r2', currentRevisionState: 'OFFICIAL' }),
      ],
    });
    expect(byId(cards, 'pending')).toMatchObject({ state: 'result-pending', action: { kind: 'confirm-result', label: '결과 확정', emphasis: 'primary' } });
    expect(byId(cards, 'submitted').state).toBe('result-pending');
    expect(byId(cards, 'done')).toMatchObject({ state: 'result-done', action: { kind: 'fix-result', label: '결과 고치기', emphasis: 'secondary' } });
  });

  it('공식 결과가 있어도 검토 기한 초과면 결과 확정 대기로 남는다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [ended('late', { revisionId: 'r1', currentRevisionState: 'OFFICIAL' })],
      liveWarnings: new Map<string, readonly V1TournamentOperationsWarningCode[]>([['late', ['RESULT_REVIEW_OVERDUE']]]),
    });
    expect(byId(cards, 'late')).toMatchObject({ state: 'result-pending', action: { kind: 'confirm-result' } });
    expect(byId(cards, 'late').checks).toContain('RESULT_REVIEW_OVERDUE');
  });

  it('취소된 경기는 할 일이 없다', () => {
    const cards = buildBoardCards({ ...base, items: [fx('c', 'f1', '2026-12-20T01:00:00Z', { gameState: 'CANCELLED' })] });
    expect(byId(cards, 'c')).toMatchObject({ state: 'cancelled', action: null });
  });

  it('지원: 결과 카드는 확정·고치기 대신 결과 보기만 얻고 상태는 그대로다', () => {
    const cards = buildBoardCards({
      ...base,
      role: 'SUPPORT_READONLY',
      items: [
        ended('pending', { revisionId: null }),
        ended('done', { revisionId: 'r2', currentRevisionState: 'OFFICIAL' }),
        ended('void', { revisionId: 'r3', currentRevisionState: 'VOID' }),
      ],
    });
    expect(byId(cards, 'pending')).toMatchObject({ state: 'result-pending', action: { kind: 'view-result', label: '결과 보기', emphasis: 'secondary' } });
    expect(byId(cards, 'done')).toMatchObject({ state: 'result-done', action: { kind: 'view-result' } });
    expect(byId(cards, 'void')).toMatchObject({ state: 'result-void', action: { kind: 'view-result' } });
  });

  it('무효 처리된 결과는 확정 대기가 아니라 결과 무효이고, 운영자는 결과를 다시 입력한다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        ended('void', { revisionId: 'r3', currentRevisionState: 'VOID' }),
        ended('void-late', { revisionId: 'r4', currentRevisionState: 'VOID' }),
      ],
      liveWarnings: new Map<string, readonly V1TournamentOperationsWarningCode[]>([['void-late', ['RESULT_REVIEW_OVERDUE']]]),
    });
    for (const id of ['void', 'void-late']) {
      expect(byId(cards, id)).toMatchObject({ state: 'result-void', action: { kind: 'fix-result', label: '결과 다시 입력', emphasis: 'primary' } });
    }
  });

  it('구장마다 첫 예정 경기에만 경기 콘솔 열기(secondary)와 isFieldNext 가 붙는다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        fx('live', 'f1', '2026-12-20T01:00:00Z', { gameState: 'LIVE' }),
        fx('f1-next', 'f1', '2026-12-20T02:00:00Z'),
        fx('f1-far', 'f1', '2026-12-20T03:00:00Z'),
        fx('f2-next', 'f2', '2026-12-20T02:30:00Z'),
        fx('f2-done', 'f2', '2026-12-20T00:00:00Z', { gameState: 'ENDED', revisionId: 'r', currentRevisionState: 'OFFICIAL' }),
      ],
    });
    expect(byId(cards, 'f1-next')).toMatchObject({ isFieldNext: true, action: { kind: 'console', emphasis: 'secondary' } });
    expect(byId(cards, 'f1-far')).toMatchObject({ isFieldNext: false, action: null });
    expect(byId(cards, 'f2-next')).toMatchObject({ isFieldNext: true });
    expect(byId(cards, 'live').isFieldNext).toBe(false);
  });

  it('지난 날 예정으로 남은 경기는 다음 경기가 아니고, 오늘 구장의 첫 예정 경기가 다음 경기가 된다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        fx('stale', 'f1', '2026-12-18T02:00:00Z'),
        fx('today-first', 'f1', '2026-12-20T02:00:00Z'),
        fx('today-second', 'f1', '2026-12-20T03:00:00Z'),
        fx('next-week', 'f1', '2026-12-27T02:00:00Z'),
      ],
    });
    expect(byId(cards, 'stale')).toMatchObject({ isFieldNext: false, action: null });
    expect(byId(cards, 'today-first')).toMatchObject({ isFieldNext: true, action: { kind: 'console', emphasis: 'secondary' } });
    expect(byId(cards, 'today-second').isFieldNext).toBe(false);
    expect(byId(cards, 'next-week').isFieldNext).toBe(false);
  });

  it('오늘 남은 예정 경기가 없으면 앞으로의 첫 경기일 경기가 다음 경기다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        fx('stale', 'f1', '2026-12-18T02:00:00Z'),
        fx('upcoming', 'f1', '2026-12-27T02:00:00Z'),
        fx('upcoming-2', 'f1', '2026-12-27T03:00:00Z'),
      ],
    });
    expect(byId(cards, 'stale').isFieldNext).toBe(false);
    expect(byId(cards, 'upcoming').isFieldNext).toBe(true);
    expect(byId(cards, 'upcoming-2').isFieldNext).toBe(false);
  });

  it('KST 자정 직전과 직후는 다른 날이다 — 어제 밤 예정 경기는 지난 날이다', () => {
    const cards = buildBoardCards({
      ...base,
      now: new Date('2026-12-20T15:10:00Z'),
      items: [
        fx('late-yesterday', 'f1', '2026-12-20T14:30:00Z'),
        fx('after-midnight', 'f1', '2026-12-20T16:00:00Z'),
      ],
    });
    expect(byId(cards, 'late-yesterday').isFieldNext).toBe(false);
    expect(byId(cards, 'after-midnight').isFieldNext).toBe(true);
  });

  it('구장 미정 경기는 구장별 다음이 없어서, 앞으로의 가장 이른 시각 묶음이 모두 다음 경기다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        fx('stale', null, '2026-12-18T02:00:00Z'),
        fx('same-a', null, '2026-12-20T02:00:00Z'),
        fx('same-b', null, '2026-12-20T02:00:00Z'),
        fx('later', null, '2026-12-20T03:00:00Z'),
      ],
    });
    expect(byId(cards, 'stale').isFieldNext).toBe(false);
    expect(byId(cards, 'same-a')).toMatchObject({ isFieldNext: true, action: { kind: 'console' } });
    expect(byId(cards, 'same-b')).toMatchObject({ isFieldNext: true, action: { kind: 'console' } });
    expect(byId(cards, 'later')).toMatchObject({ isFieldNext: false, action: null });
  });

  it('가장 앞 예정 경기가 구장 담당자 없음이면 담당자 배정이 우선이고 isFieldNext 는 유지된다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('a', 'f2', '2026-12-20T05:30:00Z')],
      staff: [op('f2', '2026-12-20T05:00:00Z')],
    });
    expect(byId(cards, 'a')).toMatchObject({ staffMissing: true, isFieldNext: true, action: { kind: 'assign-staff' } });
  });
});

describe('buildBoardCards — 구장 담당자 없음', () => {
  it('구장 담당자 만료(14:00)가 14:30 경기만 담당자 없음으로 만든다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('a', 'f2', '2026-12-20T00:30:00Z'), fx('b', 'f2', '2026-12-20T05:30:00Z')],
      staff: [op('f2', '2026-12-20T05:00:00Z')],
      now: new Date('2026-12-20T01:15:00Z'),
      role: 'PLATFORM_OPS',
    });
    expect(cards.map((c) => c.staffMissing)).toEqual([false, true]);
    expect(cards[1].action).toMatchObject({ kind: 'assign-staff', label: '담당자 배정하기', emphasis: 'warning' });
  });

  it('구장 담당자 배정이 한 건도 없으면 어떤 카드도 staffMissing 이 아니고 서버의 담당자 없음 경고도 걸러진다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('a', 'f1', '2026-12-20T05:30:00Z'), fx('b', null, '2026-12-20T06:30:00Z')],
      liveWarnings: new Map<string, readonly V1TournamentOperationsWarningCode[]>([['a', ['NO_STAFF_ASSIGNED']]]),
      staff: [op(null, null, { role: 'SUPPORT_READONLY' }), op('f1', null, { revokedAt: '2026-12-10T00:00:00.000Z' })],
    });
    expect(usesFieldStaff([op(null, null, { role: 'SUPPORT_READONLY' })])).toBe(false);
    expect(cards.map((c) => c.staffMissing)).toEqual([false, false]);
    expect(byId(cards, 'a').checks).toEqual([]);
  });

  it('경기 범위(fixtureIds) 배정이 그 경기를 덮는다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('a', 'f2', '2026-12-20T05:30:00Z'), fx('b', 'f2', '2026-12-20T06:00:00Z')],
      staff: [op('f2', '2026-12-20T05:00:00Z'), op(null, null, { fixtureIds: ['a'], userId: 'u-x' })],
    });
    expect(cards.map((c) => c.staffMissing)).toEqual([false, true]);
  });

  it('구장이 없는 경기는 담당자 없음으로 겹쳐 세지 않는다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('nf', null, '2026-12-20T05:30:00Z')],
      staff: [op('f2', null)],
    });
    expect(cards[0]).toMatchObject({ staffMissing: false, checks: [] });
  });

  it('이미 지난 경기·끝난 경기는 담당자 없음으로 세지 않는다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        fx('done', 'f2', '2026-12-20T00:00:00Z', { gameState: 'ENDED', revisionId: 'r', currentRevisionState: 'OFFICIAL' }),
        fx('cancel', 'f2', '2026-12-20T05:30:00Z', { gameState: 'CANCELLED' }),
      ],
      staff: [op('f2', '2026-12-20T00:10:00Z')],
    });
    expect(cards.map((c) => c.staffMissing)).toEqual([false, false]);
  });

  it('이미 시작했어야 할 경기의 기준 시각은 지금이다 — 지금 만료된 배정은 담당자 없음', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('a', 'f2', '2026-12-20T00:00:00Z')],
      staff: [op('f2', '2026-12-20T01:00:00Z')],
      now: new Date('2026-12-20T01:15:00Z'),
    });
    expect(cards[0].staffMissing).toBe(true);
  });

  it('지원: 담당자 없음 카드에 버튼은 없고 표시(staffMissing)만 남는다', () => {
    const cards = buildBoardCards({
      ...base,
      role: 'SUPPORT_READONLY',
      items: [fx('a', 'f2', '2026-12-20T05:30:00Z')],
      staff: [op('f2', '2026-12-20T05:00:00Z')],
    });
    expect(cards[0]).toMatchObject({ staffMissing: true, action: null });
  });
});

describe('buildBoardCards — 확인할 것', () => {
  it('구장 미배정(NO_FIELD_ASSIGNED)은 없고 득점자 미기재·담당자 없음은 있다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        fx('a', null, '2026-12-20T05:30:00Z', { warnings: ['NO_FIELD_ASSIGNED', 'MISSING_SCORER'] }),
        fx('b', 'f2', '2026-12-20T05:30:00Z'),
      ],
      liveWarnings: new Map<string, readonly V1TournamentOperationsWarningCode[]>([['a', ['LINEUP_NOT_SUBMITTED']]]),
      staff: [op('f2', '2026-12-20T05:00:00Z')],
    });
    expect(byId(cards, 'a').checks).toEqual(['MISSING_SCORER', 'LINEUP_NOT_SUBMITTED']);
    expect(byId(cards, 'b').checks).toEqual(['NO_STAFF_ASSIGNED']);
  });

  it('결과 확정 대기는 확인할 것에 세지 않는다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [fx('p', 'f1', '2026-12-20T00:00:00Z', { gameState: 'ENDED', revisionId: null })],
    });
    expect(cards[0]).toMatchObject({ state: 'result-pending', checks: [] });
  });
});

describe('buildFieldColumns', () => {
  const fields = [field('f2', '구장 2', 2), field('f1', '구장 1', 1), field('f3', '구장 3', 3)];

  it('경기 없는 구장은 빠지고 구장 미정 열은 그날 미정 경기가 있을 때만 마지막에 온다', () => {
    const cards = buildBoardCards({
      ...base,
      items: [
        fx('a', 'f2', '2026-12-20T01:00:00Z'),
        fx('b', 'f1', '2026-12-20T01:00:00Z'),
        fx('c', 'f1', '2026-12-20T02:00:00Z'),
        fx('other-day', 'f3', '2026-12-21T01:00:00Z'),
        fx('nf', null, '2026-12-20T03:00:00Z'),
        fx('no-time', 'f3', null),
      ],
    });
    const columns = buildFieldColumns(cards, '2026-12-20', fields, []);
    expect(columns.map((c) => [c.key, c.name, c.count])).toEqual([
      ['f1', '구장 1', 2],
      ['f2', '구장 2', 1],
      [NO_FIELD_KEY, '구장 미정', 1],
    ]);
    expect(buildFieldColumns(cards, '2026-12-21', fields, []).map((c) => c.key)).toEqual(['f3']);
  });

  it('그날 구장 미정 경기가 없으면 구장 미정 열이 없다', () => {
    const cards = buildBoardCards({ ...base, items: [fx('a', 'f1', '2026-12-20T01:00:00Z'), fx('nf', null, '2026-12-21T01:00:00Z')] });
    expect(buildFieldColumns(cards, '2026-12-20', fields, []).map((c) => c.key)).toEqual(['f1']);
  });

  it('날짜가 없으면(시간 미정 경기만) 열이 없다', () => {
    const cards = buildBoardCards({ ...base, items: [fx('a', 'f1', null)] });
    expect(buildFieldColumns(cards, null, fields, [])).toEqual([]);
  });

  it('열 머리에 구장 담당자 이름과 그날 끝나는 시각이 나온다', () => {
    const cards = buildBoardCards({ ...base, items: [fx('a', 'f2', '2026-12-20T05:30:00Z'), fx('b', 'f1', '2026-12-20T01:00:00Z')] });
    const staff = [
      op('f2', '2026-12-20T05:00:00Z', { nickname: '이서연' }),
      op('f2', null, { nickname: '박지훈', userId: 'u-2', id: 's-2' }),
      op('f2', '2026-12-10T05:00:00Z', { nickname: '지난 담당', userId: 'u-3', id: 's-3' }),
      op('f2', null, { nickname: '취소됨', userId: 'u-4', id: 's-4', revokedAt: '2026-12-11T00:00:00.000Z' }),
    ];
    const [f1, f2] = buildFieldColumns(cards, '2026-12-20', fields, staff);
    expect(f1).toMatchObject({ staffLine: '구장 담당자 없음', expiresLabel: null });
    expect(f2.staffLine).toBe('구장 담당자 이서연, 박지훈');
    expect(f2.expiresLabel).toBe('14:00까지');
  });
});
