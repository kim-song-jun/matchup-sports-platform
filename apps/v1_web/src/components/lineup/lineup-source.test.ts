import { describe, expect, it } from 'vitest';
import {
  buildRecentJerseyMap,
  describeSkipped,
  resolveJerseyNumber,
  resolveLoadableEntries,
  type EligibleMember,
  type LoadableEntry,
} from './lineup-source';

function entry(overrides: Partial<LoadableEntry> = {}): LoadableEntry {
  return {
    userId: null,
    displayName: '홍길동',
    jerseyNumber: null,
    position: null,
    positionX: null,
    positionY: null,
    started: true,
    goalkeeper: false,
    ...overrides,
  };
}

function member(overrides: Partial<EligibleMember> & { userId: string }): EligibleMember {
  return { displayName: '홍길동', ...overrides };
}

describe('resolveLoadableEntries', () => {
  it('userId로 이어진 사람은 그 사이 닉네임을 바꿨어도 현재 이름으로 불러온다', () => {
    const result = resolveLoadableEntries({
      entries: [entry({ userId: 'u1', displayName: '옛날닉' })],
      eligible: [member({ userId: 'u1', displayName: '새닉' })],
      allowGuests: false,
      missingReason: 'not_registered',
    });

    expect(result.skipped).toEqual([]);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].userId).toBe('u1');
    expect(result.applied[0].displayName).toBe('새닉');
  });

  it('같은 이름의 다른 사람을 userId가 갈라준다 — 이름만 보면 섞인다', () => {
    const result = resolveLoadableEntries({
      entries: [entry({ userId: 'u2', displayName: '김철수' })],
      eligible: [
        member({ userId: 'u1', displayName: '김철수' }),
        member({ userId: 'u2', displayName: '김철수' }),
      ],
      allowGuests: false,
      missingReason: 'not_registered',
    });

    expect(result.applied[0].userId).toBe('u2');
  });

  it('userId가 없는 과거 엔트리는 이름으로 이어 붙인다', () => {
    const result = resolveLoadableEntries({
      entries: [entry({ userId: null, displayName: '박영희', jerseyNumber: 10 })],
      eligible: [member({ userId: 'u9', displayName: '박영희' })],
      allowGuests: false,
      missingReason: 'not_registered',
    });

    expect(result.applied[0].userId).toBe('u9');
    expect(result.applied[0].jerseyNumber).toBe(10);
  });

  it('같은 사람을 두 번 넣지 않는다 — 이름이 겹쳐도 자격 항목은 한 번만 소비된다', () => {
    const result = resolveLoadableEntries({
      entries: [
        entry({ userId: null, displayName: '이수민' }),
        entry({ userId: null, displayName: '이수민' }),
      ],
      eligible: [member({ userId: 'u1', displayName: '이수민' })],
      allowGuests: false,
      missingReason: 'not_registered',
    });

    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toEqual([{ displayName: '이수민', reason: 'not_registered' }]);
  });

  it('자격 목록에 없는 사람은 이유와 함께 제외된다', () => {
    const result = resolveLoadableEntries({
      entries: [entry({ userId: 'gone', displayName: '떠난사람' })],
      eligible: [],
      allowGuests: false,
      missingReason: 'not_registered',
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([{ displayName: '떠난사람', reason: 'not_registered' }]);
  });

  it('구체적인 제외 사유가 있으면 기본 사유 대신 그걸 쓴다', () => {
    const result = resolveLoadableEntries({
      entries: [entry({ userId: 'u1', displayName: '미참석자' })],
      eligible: [],
      allowGuests: true,
      missingReason: 'not_in_team',
      ineligibleReasonByUserId: { u1: 'not_attending' },
    });

    expect(result.skipped).toEqual([{ displayName: '미참석자', reason: 'not_attending' }]);
  });

  it('게스트를 허용하는 화면에서는 연동되지 않은 사람이 그대로 남는다', () => {
    const result = resolveLoadableEntries({
      entries: [entry({ userId: null, displayName: '용병친구' })],
      eligible: [],
      allowGuests: true,
      missingReason: 'not_in_team',
    });

    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].userId).toBeNull();
    expect(result.skipped).toEqual([]);
  });

  it('게스트를 허용하지 않는 화면에서는 같은 사람이 제외된다', () => {
    const result = resolveLoadableEntries({
      entries: [entry({ userId: null, displayName: '용병친구' })],
      eligible: [],
      allowGuests: false,
      missingReason: 'not_registered',
    });

    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  it('선발 여부와 배치 좌표는 그대로 옮겨진다', () => {
    const result = resolveLoadableEntries({
      entries: [
        entry({ userId: 'u1', started: true, positionX: 40, positionY: 70, position: 'MF', goalkeeper: false }),
      ],
      eligible: [member({ userId: 'u1' })],
      allowGuests: false,
      missingReason: 'not_registered',
    });

    expect(result.applied[0]).toMatchObject({
      started: true,
      positionX: 40,
      positionY: 70,
      position: 'MF',
      goalkeeper: false,
    });
  });
});

describe('등번호 결정 순서', () => {
  it('불러온 번호가 팀 고정 번호를 이긴다', () => {
    expect(resolveJerseyNumber({ loaded: 7, teamFixed: 10, recent: 99 })).toBe(7);
  });

  it('불러온 번호가 없으면 팀 고정 번호를 쓴다', () => {
    expect(resolveJerseyNumber({ loaded: null, teamFixed: 10, recent: 99 })).toBe(10);
  });

  it('둘 다 없으면 직전에 달았던 번호를 쓴다', () => {
    expect(resolveJerseyNumber({ loaded: null, teamFixed: null, recent: 99 })).toBe(99);
  });

  it('아무것도 없으면 빈칸이다', () => {
    expect(resolveJerseyNumber({})).toBeNull();
  });

  it('0번은 값이 없는 것으로 취급되지 않는다', () => {
    expect(resolveJerseyNumber({ loaded: 0, teamFixed: 10 })).toBe(0);
  });

  it('불러오기가 팀 고정 등번호를 자동으로 채운다', () => {
    const result = resolveLoadableEntries({
      entries: [entry({ userId: 'u1', jerseyNumber: null })],
      eligible: [member({ userId: 'u1', jerseyNumber: 23 })],
      allowGuests: false,
      missingReason: 'not_registered',
    });

    expect(result.applied[0].jerseyNumber).toBe(23);
  });
});

describe('buildRecentJerseyMap', () => {
  it('가장 최근 경기의 등번호가 옛 번호에 덮이지 않는다', () => {
    const map = buildRecentJerseyMap([
      { participants: [entry({ userId: 'u1', jerseyNumber: 7 })] },
      { participants: [entry({ userId: 'u1', jerseyNumber: 30 })] },
    ]);

    expect(map.get('u1')).toBe(7);
  });

  it('등번호가 없던 기록은 건너뛴다', () => {
    const map = buildRecentJerseyMap([
      { participants: [entry({ userId: 'u1', jerseyNumber: null })] },
      { participants: [entry({ userId: 'u1', jerseyNumber: 11 })] },
    ]);

    expect(map.get('u1')).toBe(11);
  });
});

describe('describeSkipped', () => {
  it('제외된 사람이 없으면 배너를 띄우지 않는다', () => {
    expect(describeSkipped(11, [])).toBeNull();
  });

  it('제외 사유별로 묶어서 알려준다', () => {
    const message = describeSkipped(10, [
      { displayName: '홍길동', reason: 'not_attending' },
      { displayName: '김철수', reason: 'not_attending' },
      { displayName: '이영희', reason: 'not_in_team' },
    ]);

    expect(message).toBe('13명 중 10명을 불러왔어요 · 홍길동·김철수(참석 응답이 없어요), 이영희(지금은 팀에 없어요)');
  });
});
