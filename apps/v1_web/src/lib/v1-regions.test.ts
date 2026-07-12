import { describe, expect, it } from 'vitest';
import { toDistrictRegionOptions, toTeamRegionOptions } from './v1-regions';
import type { V1Region } from '@/types/api';

const regions: V1Region[] = [
  {
    id: 'seoul',
    code: 'seoul',
    name: '서울',
    parentId: null,
    level: 1,
    children: [
      {
        id: 'seoul-gangnam',
        code: 'seoul-gangnam',
        name: '강남구',
        parentId: 'seoul',
        level: 2,
      },
    ],
  },
];

describe('v1 region options', () => {
  it('keeps district-only options unchanged for existing flows', () => {
    expect(toDistrictRegionOptions(regions)).toEqual([
      {
        id: 'seoul-gangnam',
        name: '서울 강남구',
        shortName: '강남구',
        parentName: '서울',
      },
    ]);
  });

  it('adds city-wide 전체 options for team create and edit flows', () => {
    expect(toTeamRegionOptions(regions)).toEqual([
      {
        id: 'seoul',
        name: '서울 전체',
        shortName: '전체',
        parentName: '서울',
      },
      {
        id: 'seoul-gangnam',
        name: '서울 강남구',
        shortName: '강남구',
        parentName: '서울',
      },
    ]);
  });
});
