import { describe, expect, it } from 'vitest';
import {
  resolveMyTeamRegion,
  resolveTeamListRegionPreference,
  teamListRegionNotice,
  type MasterRegionLike,
  type MyTeamRegion,
  type TeamListRegionPreference,
} from './team-list-region-preference';

const master: MasterRegionLike[] = [
  { id: 'r-seoul', name: '서울', parentId: null },
  { id: 'r-mapo', name: '마포구', parentId: 'r-seoul' },
  { id: 'r-gg', name: '경기', parentId: null },
  { id: 'r-seongnam', name: '성남시', parentId: 'r-gg' },
  { id: 'r-busan', name: '부산', parentId: null },
];

const saved: MyTeamRegion = { status: 'ready', provinceId: 'r-seoul', provinceName: '서울', savedName: '서울 마포구' };
const noSaved: MyTeamRegion = { status: 'none' };

const resolve = (over: Partial<Parameters<typeof resolveTeamListRegionPreference>[0]> = {}) =>
  resolveTeamListRegionPreference({
    applicable: true,
    signedIn: true,
    linkRegionId: undefined,
    isContinuation: false,
    myRegion: saved,
    master,
    ...over,
  });

describe('resolveMyTeamRegion', () => {
  it('저장한 구/군을 시/도로 올리고, 기본(primary) 지역을 쓴다', () => {
    expect(resolveMyTeamRegion({
      unresolved: false,
      saved: [{ regionId: 'r-seongnam', primary: false }, { regionId: 'r-mapo', primary: true }],
      master,
    })).toEqual(saved);
  });

  it('로딩 중이거나 마스터에서 못 찾으면 모르는 상태이고, 저장이 없으면 none 이다', () => {
    expect(resolveMyTeamRegion({ unresolved: true, saved: undefined, master })).toEqual({ status: 'unknown' });
    expect(resolveMyTeamRegion({ unresolved: false, saved: [{ regionId: 'r-none', primary: true }], master })).toEqual({ status: 'unknown' });
    expect(resolveMyTeamRegion({ unresolved: false, saved: [], master })).toEqual({ status: 'none' });
  });
});

describe('resolveTeamListRegionPreference — 어느 지역을 앞에 둘지', () => {
  it('저장한 활동 지역(시/도)이 있으면 그것을 쓴다', () => {
    expect(resolve()).toEqual({ status: 'ready', regionId: 'r-seoul', name: '서울', source: 'saved' });
  });

  it('저장한 활동 지역이 없으면 none(설정을 권한다)이다 — 소속 팀이 있든 없든 같은 결과다', () => {
    // 소속 팀의 지역으로 대신하지 않는다. 판정 입력에 내 팀 목록 자체가 없다.
    expect(resolve({ myRegion: noSaved })).toEqual({ status: 'none' });
    expect(Object.keys(resolve({ myRegion: noSaved }))).toEqual(['status']);
  });

  it('아직 모르는 동안(프로필 로딩·조회 실패)은 pending — 설정을 권하지도 요청에 싣지도 않는다', () => {
    expect(resolve({ myRegion: { status: 'unknown' } })).toEqual({ status: 'pending' });
  });

  it('비로그인은 적용하지 않는다', () => {
    expect(resolve({ signedIn: false, myRegion: noSaved })).toEqual({ status: 'off' });
  });

  it('다른 정렬·지역을 직접 고른 목록(applicable=false)은 적용하지 않는다 — 주소의 near 가 있어도', () => {
    expect(resolve({ applicable: false })).toEqual({ status: 'off' });
    expect(resolve({ applicable: false, linkRegionId: 'r-seoul' })).toEqual({ status: 'off' });
  });

  it('이어 보기 주소의 near 는 내 지역이 달라졌어도 그대로 쓴다 — 커서가 가리키던 순서를 잇는다', () => {
    expect(resolve({ linkRegionId: 'r-busan', isContinuation: true, myRegion: saved })).toEqual({ status: 'ready', regionId: 'r-busan', name: '부산', source: 'link' });
    // 비로그인도 near 가 실려 온 주소는 그 순서로 읽는다.
    expect(resolve({ linkRegionId: 'r-busan', isContinuation: true, signedIn: false })).toMatchObject({ status: 'ready', source: 'link' });
  });

  it('기준(near) 없이 커서만 있는 주소는 기본 순서로 읽던 목록이라 지역을 새로 얹지 않는다', () => {
    expect(resolve({ isContinuation: true })).toEqual({ status: 'off' });
  });
});

describe('teamListRegionNotice — 목록 머리의 한 줄', () => {
  const href = '/my/settings/location';
  const notice = (preference: TeamListRegionPreference) => teamListRegionNotice(preference, href);

  it('저장한 활동 지역을 쓰면 안내만 한다(링크 없음)', () => {
    expect(notice({ status: 'ready', regionId: 'r-seoul', name: '서울', source: 'saved' })).toEqual({ text: '내 활동 지역(서울)의 팀을 먼저 보여 줘요' });
  });

  it('저장한 활동 지역이 없으면 설정을 권한다 — 링크는 이 경우에만 있다', () => {
    expect(notice({ status: 'none' })).toEqual({ text: '활동 지역을 정하면 가까운 팀을 먼저 보여 줘요', link: { label: '지역 설정', href } });
  });

  it('이어 보기 주소의 기준은 지역 이름을 모르면 이름 없이 말한다', () => {
    expect(notice({ status: 'ready', regionId: 'x', name: '', source: 'link' })).toEqual({ text: '내 지역의 팀을 먼저 보여 줘요' });
  });

  it('모르는 상태와 적용하지 않는 목록에는 내지 않는다', () => {
    expect(notice({ status: 'pending' })).toBeUndefined();
    expect(notice({ status: 'off' })).toBeUndefined();
  });
});
