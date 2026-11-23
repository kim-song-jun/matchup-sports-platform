import {
  baseListStatusGroup,
  groupIdsByListStatus,
  LIST_STATUS_GROUPS,
  listGroupOrderBy,
  listStatusGroupsFor,
  PREFERRED_GROUP_SUFFIX,
} from './list-status-groups';

describe('LIST_STATUS_GROUPS — 공개 목록 묶음 순서(2026-10-21 사용자 확정)', () => {
  it('진행 중 → 신청 가능 → 경기 예정 → 신청 마감 → 끝난 경기 → 일정 미정', () => {
    expect(LIST_STATUS_GROUPS).toEqual(['live', 'open', 'scheduled', 'closed', 'ended', 'unscheduled']);
  });
});

describe('listGroupOrderBy — 묶음 안 순서', () => {
  it('신청 가능은 기본·추천순이면 경기 가까운 순이다', () => {
    expect(listGroupOrderBy('open', undefined)).toEqual([{ startAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]);
    expect(listGroupOrderBy('open', 'recommended')).toEqual(listGroupOrderBy('open', undefined));
  });

  it('마감임박은 신청 가능 묶음을 마감 가까운 순(마감 없는 글은 뒤, 경기 가까운 순)으로 세운다', () => {
    expect(listGroupOrderBy('open', 'deadline')).toEqual([
      { deadlineAt: { sort: 'asc', nulls: 'last' } },
      { startAt: 'asc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('최신순은 신청 가능 묶음만 등록 최신순이다', () => {
    expect(listGroupOrderBy('open', 'latest')).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it.each(['deadline', 'latest', undefined] as const)('정렬(%s)은 다른 묶음의 순서를 바꾸지 않는다', (sort) => {
    expect(listGroupOrderBy('live', sort)).toEqual([{ startAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]);
    expect(listGroupOrderBy('scheduled', sort)).toEqual([{ startAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]);
    expect(listGroupOrderBy('closed', sort)).toEqual([{ startAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]);
    expect(listGroupOrderBy('ended', sort)).toEqual([{ startAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]);
    expect(listGroupOrderBy('unscheduled', sort)).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('모든 묶음·정렬의 마지막 기준은 id 다 — 커서로 이어 읽어도 겹치거나 빠지지 않게', () => {
    for (const group of LIST_STATUS_GROUPS) {
      for (const sort of ['recommended', 'latest', 'starts_at', 'deadline', undefined] as const) {
        expect(listGroupOrderBy(group, sort).at(-1)).toEqual({ id: 'desc' });
      }
    }
  });
});

describe('groupIdsByListStatus', () => {
  it('행마다 정한 묶음별로 id 를 모은다 — 빈 묶음도 키가 있다', () => {
    const ids = groupIdsByListStatus([{ id: 'a' }, { id: 'b' }, { id: 'c' }], (row) => (row.id === 'b' ? 'live' : 'open'));
    expect(ids.get('live')).toEqual(['b']);
    expect(ids.get('open')).toEqual(['a', 'c']);
    expect(ids.get('ended')).toEqual([]);
  });
});

describe('활동 지역 우선 — 내 지역 하위 묶음', () => {
  it('지역을 주지 않으면 묶음 목록은 원래 그대로다', () => {
    expect(listStatusGroupsFor(false)).toBe(LIST_STATUS_GROUPS);
  });

  it('지역을 주면 묶음마다 내 지역 하위 묶음이 그 묶음 바로 앞에 서고, 묶음 순서는 그대로다', () => {
    expect(listStatusGroupsFor(true)).toEqual([
      'live~region', 'live', 'open~region', 'open', 'scheduled~region', 'scheduled', 'closed~region', 'closed', 'ended~region', 'ended', 'unscheduled~region', 'unscheduled',
    ]);
    expect(listStatusGroupsFor(true).filter((group) => !group.endsWith(PREFERRED_GROUP_SUFFIX))).toEqual([...LIST_STATUS_GROUPS]);
  });

  it('하위 묶음 이름에는 콜론이 없다 — 커서(<묶음>:<id>)가 첫 콜론으로 묶음과 id 를 가른다', () => {
    for (const group of listStatusGroupsFor(true)) expect(group).not.toContain(':');
  });

  it('하위 묶음에서 원래 묶음을 되돌리고, 원래 묶음은 그대로 둔다', () => {
    expect(baseListStatusGroup('open~region')).toBe('open');
    expect(baseListStatusGroup('open')).toBe('open');
    expect(baseListStatusGroup('unscheduled~region')).toBe('unscheduled');
  });

  it('내 지역 행은 같은 묶음의 하위 묶음으로, 나머지는 원래 묶음으로 모은다', () => {
    const rows = [{ id: 'a', mine: false }, { id: 'b', mine: true }, { id: 'c', mine: true }, { id: 'd', mine: false }];
    const ids = groupIdsByListStatus(rows, () => 'open', (row) => row.mine);

    expect(ids.get('open~region')).toEqual(['b', 'c']);
    expect(ids.get('open')).toEqual(['a', 'd']);
    expect(ids.get('live~region')).toEqual([]);
  });

  it('지역 판정을 주지 않으면 하위 묶음이 없다', () => {
    const ids = groupIdsByListStatus([{ id: 'a' }], () => 'open');

    expect(ids.get('open')).toEqual(['a']);
    expect(ids.has('open~region')).toBe(false);
  });
});
