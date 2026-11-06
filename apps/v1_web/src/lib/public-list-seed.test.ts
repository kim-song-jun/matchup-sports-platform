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
      sort: 'deadline',
      q: '  마포 FC  ',
      cursor: 'cursor/opaque +value',
    });
    expect(path).toBeDefined();
    const params = new URL(path!, 'https://teameet.test').searchParams;

    expect(params.get('sportId')).toBe('sport-futsal');
    expect(params.get('regionId')).toBe('region-seoul');
    expect(params.get('genderRule')).toBe('남');
    expect(params.get('levelCodes')).toBe('beginner,novice');
    expect(params.get('sort')).toBe('deadline');
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
      sort: 'deadline',
      genderRule: '남',
      levels: '입문, novice,unknown',
      regionId: 'region-seoul',
      status: 'unknown',
      kind: 'unknown',
    });
    const params = new URL(path, 'https://teameet.test').searchParams;

    expect(params.get('sportId')).toBe('sport-futsal');
    expect(params.get('query')).toBe('마포 FC');
    expect(params.get('joinPolicy')).toBe('approval_required');
    expect(params.get('genderRule')).toBe('남');
    expect(params.get('levelCodes')).toBe('beginner,novice');
    expect(params.get('regionId')).toBe('region-seoul');
    expect(params.get('sort')).toBeNull();
    expect(params.get('status')).toBeNull();
    expect(params.get('limit')).toBe(String(TEAM_LIST_PAGE_SIZE));
    expect(params.get('includeFacets')).toBe('true');
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
