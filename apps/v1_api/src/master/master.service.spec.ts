import { normalizeDistrictName, normalizeRegionName } from './master.service';

describe('normalizeRegionName', () => {
  it.each([
    ['서울특별시', '서울'],
    ['경기도', '경기'],
    ['부산광역시', '부산'],
    ['세종특별자치시', '세종'],
    ['제주특별자치도', '제주'],
    ['강원특별자치도', '강원'],
  ])('%s 를 %s 로 정규화한다', (raw, expected) => {
    expect(normalizeRegionName(raw)).toBe(expected);
  });

  it('입력이 없으면 null을 반환한다', () => {
    expect(normalizeRegionName(null)).toBeNull();
    expect(normalizeRegionName(undefined)).toBeNull();
    expect(normalizeRegionName('')).toBeNull();
  });
});

describe('normalizeDistrictName', () => {
  it('공백으로 구분된 구·군 이름의 첫 토큰만 취한다', () => {
    expect(normalizeDistrictName('강남구 역삼동')).toBe('강남구');
  });

  it('입력이 없으면 null을 반환한다', () => {
    expect(normalizeDistrictName(null)).toBeNull();
    expect(normalizeDistrictName(undefined)).toBeNull();
  });
});
