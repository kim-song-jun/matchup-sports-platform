import { describe, expect, it } from 'vitest';
import * as publicListSeed from './public-list-seed';
import {
  TEAM_LIST_PAGE_SIZE,
  TEAM_LIST_SEED_PATH,
  teamListSeedPath,
  tournamentListSeedPath,
} from './public-list-seed';
import type { V1Sport } from '@/types/api';

describe('TEAM_LIST_SEED_PATH', () => {
  it('클라이언트 첫 페이지 요청과 같이 includeFacets 를 보내 시드 첫 렌더에도 totalCount 가 실린다', () => {
    const [path, query] = TEAM_LIST_SEED_PATH.split('?');
    const params = new URLSearchParams(query);

    expect(path).toBe('/teams');
    expect(params.get('limit')).toBe(String(TEAM_LIST_PAGE_SIZE));
    expect(params.get('includeFacets')).toBe('true');
  });
});

describe('filtered public-list seed requests', () => {
  it('builds a crawlable UI URL from normalized filters while preserving the UI query dialect', () => {
    const path = publicListSeed.teamListContinuationPath({
      sportId: 'sport-futsal',
      regionId: 'region-seoul',
      genderRule: '남',
      levels: '입문, novice,unknown',
      sort: 'member_count',
      q: '  마포 FC  ',
      cursor: 'cursor/opaque +value',
    });
    expect(path).toBeDefined();
    const params = new URL(path!, 'https://teameet.test').searchParams;

    expect(params.get('sportId')).toBe('sport-futsal');
    expect(params.get('regionId')).toBe('region-seoul');
    expect(params.get('genderRule')).toBe('남');
    expect(params.get('levelCodes')).toBe('beginner,novice');
    expect(params.get('sort')).toBe('member_count');
    expect(params.get('joinPolicy')).toBeNull();
    expect(params.get('q')).toBe('마포 FC');
    expect(params.get('query')).toBeNull();
    expect(params.get('cursor')).toBe('cursor/opaque +value');
    expect(params.get('limit')).toBeNull();
    expect(params.get('includeFacets')).toBeNull();
  });

  it('uses cursor rows for direct SSR while keeping aggregate metadata on the matching first-page request', () => {
    const cursorPath = teamListSeedPath({ sportId: 'sport-futsal', cursor: 'cursor-2' });
    const cursorParams = new URL(cursorPath, 'https://teameet.test').searchParams;
    expect(cursorParams.get('sportId')).toBe('sport-futsal');
    expect(cursorParams.get('cursor')).toBe('cursor-2');
    expect(cursorParams.get('includeFacets')).toBeNull();

    const metadata = new URL(publicListSeed.teamListMetadataPath({ sportId: 'sport-futsal', cursor: 'cursor-2' }), 'https://teameet.test').searchParams;
    expect(metadata.get('sportId')).toBe('sport-futsal');
    expect(metadata.get('cursor')).toBeNull();
    expect(metadata.get('limit')).toBe('1');
    expect(metadata.get('includeFacets')).toBe('true');
  });

  it('normalizes team filters exactly like the list client, including query trim and level aliases', () => {
    const path = teamListSeedPath({
      sportId: ['sport-futsal', 'ignored'],
      q: '  마포 FC  ',
      sort: 'member_count',
      genderRule: '남',
      levels: '입문, novice,unknown',
      regionId: 'region-seoul',
      status: 'unknown',
      kind: 'unknown',
    });
    const params = new URL(path, 'https://teameet.test').searchParams;

    expect(params.get('sportId')).toBe('sport-futsal');
    expect(params.get('query')).toBe('마포 FC');
    expect(params.get('joinPolicy')).toBeNull();
    expect(params.get('genderRule')).toBe('남');
    expect(params.get('levelCodes')).toBe('beginner,novice');
    expect(params.get('regionId')).toBe('region-seoul');
    expect(params.get('sort')).toBe('member_count');
    expect(params.get('status')).toBeNull();
    expect(params.get('limit')).toBe(String(TEAM_LIST_PAGE_SIZE));
    expect(params.get('includeFacets')).toBe('true');
  });

  // 서버 정렬은 등록순·멤버 많은순·활동 많은순 셋이고 기본은 활동 많은순이다. 예전 메뉴가 만든 값은 공유 링크에 남아 있어도 기본 순서로 연다.
  it.each(['recommended', 'deadline', 'trust', 'unknown'])('옛 정렬값 %s 은 기본(활동 많은순)으로 열고 주소에는 싣지 않는다', (sort) => {
    const filters = publicListSeed.teamListQueryFilters({ sort });
    expect(filters).toEqual({ sort: 'activity' });
    expect(new URL(teamListSeedPath({ sort }), 'https://teameet.test').searchParams.get('sort')).toBe('activity');
    expect(publicListSeed.teamListContinuationPath({ sort, cursor: 'c1' })).toBe('/teams?cursor=c1');
  });

  it('정렬이 없으면 API 에는 기본 정렬(활동 많은순)을 명시하고 주소에는 싣지 않는다', () => {
    expect(publicListSeed.teamListQueryFilters({})).toEqual({ sort: 'activity' });
    expect(new URL(teamListSeedPath(), 'https://teameet.test').searchParams.get('sort')).toBe('activity');
    expect(publicListSeed.teamListContinuationPath({ sort: 'activity', cursor: 'c1' })).toBe('/teams?cursor=c1');
  });

  it.each(['member_count', 'latest'])('기본이 아닌 정렬값 %s 은 API 쿼리와 이어 보기 링크에 그대로 싣는다', (sort) => {
    expect(publicListSeed.teamListQueryFilters({ sort })).toEqual({ sort });
    expect(new URL(teamListSeedPath({ sort }), 'https://teameet.test').searchParams.get('sort')).toBe(sort);
    expect(publicListSeed.teamListContinuationPath({ sort, cursor: 'c1' })).toBe(`/teams?sort=${sort}&cursor=c1`);
  });

  describe('내 지역 먼저(near)', () => {
    it('기본 정렬이면 API 에는 preferRegionId 로, 이어 보기 주소에는 near 로 실어 순서를 이어 간다', () => {
      expect(publicListSeed.teamListQueryFilters({ near: 'region-seoul' })).toEqual({ sort: 'activity', preferRegionId: 'region-seoul' });
      expect(new URL(teamListSeedPath({ near: 'region-seoul' }), 'https://teameet.test').searchParams.get('preferRegionId')).toBe('region-seoul');
      expect(publicListSeed.teamListContinuationPath({ near: 'region-seoul', cursor: 'c1' })).toBe('/teams?near=region-seoul&cursor=c1');
    });

    it('near 가 없으면 아무것도 싣지 않는다 — 공개 첫 화면의 시드 주소가 그대로다', () => {
      expect(new URL(teamListSeedPath(), 'https://teameet.test').searchParams.has('preferRegionId')).toBe(false);
      expect(publicListSeed.teamListContinuationPath({ cursor: 'c1' })).toBe('/teams?cursor=c1');
    });

    it.each(['member_count', 'latest'])('활동순이 아닌 정렬(%s)에서는 near 를 무시한다', (sort) => {
      expect(publicListSeed.teamListQueryFilters({ sort, near: 'region-seoul' })).toEqual({ sort });
      expect(publicListSeed.teamListContinuationPath({ sort, near: 'region-seoul', cursor: 'c1' })).toBe(`/teams?sort=${sort}&cursor=c1`);
    });

    it('지역을 직접 고른 목록에서는 near 를 무시한다 — 그 지역 팀뿐이라 순서를 바꿀 이유가 없다', () => {
      expect(publicListSeed.teamListQueryFilters({ regionId: 'region-busan', near: 'region-seoul' })).toEqual({ sort: 'activity', regionId: 'region-busan' });
    });

    it('near 가 있는 주소는 필터가 걸린 목록으로 본다 — 무필터 첫 페이지 전용 구조화 데이터를 내지 않는다', () => {
      expect(publicListSeed.TEAM_LIST_FILTER_PARAMS).toContain('near');
    });
  });

  it('uses the effective tournament filters and ignores invalid filter values', () => {
    const sports = [{ id: 'sport-futsal' }] as V1Sport[];

    expect(tournamentListSeedPath('league', {
      status: ['draft', 'completed'],
      sportId: 'sport-futsal',
      genderCategory: 'mixed',
    }, sports)).toBe('/tournaments?limit=20&kind=league&status=draft&sportId=sport-futsal&genderCategory=mixed');
    expect(tournamentListSeedPath('tournament', {
      status: 'draft',
      sportId: 'not-a-master-sport',
      genderCategory: 'invalid',
      kind: 'unknown',
    }, sports)).toBe('/tournaments?limit=20&kind=tournament');
  });

  it('does not treat a missing master-sport response as proof that a requested sport is invalid', () => {
    expect(tournamentListSeedPath('all', { sportId: 'sport-futsal' }, [])).toBeNull();
  });
});
