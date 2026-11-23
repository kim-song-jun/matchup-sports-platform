import { isInPreferredRegion, PREFERRED_REGION_SELECT } from './preferred-region';

describe('isInPreferredRegion — 활동 지역 우선 판정', () => {
  const SEOUL = 'region-seoul';
  const row = (regionId: string | null, parentId: string | null | undefined = undefined) => ({
    regionId,
    region: parentId === undefined ? null : { parentId },
  });

  it('지역을 주지 않으면 누구도 내 지역이 아니다', () => {
    expect(isInPreferredRegion(row(SEOUL), undefined)).toBe(false);
    expect(isInPreferredRegion(row(SEOUL), '')).toBe(false);
  });

  it('같은 지역이면 내 지역이다', () => {
    expect(isInPreferredRegion(row(SEOUL, null), SEOUL)).toBe(true);
  });

  it('시/도를 주면 그 하위 구/군도 내 지역이다 — 저장된 지역은 구/군 단위다', () => {
    expect(isInPreferredRegion(row('region-mapo', SEOUL), SEOUL)).toBe(true);
  });

  it('다른 시/도의 구/군은 내 지역이 아니다', () => {
    expect(isInPreferredRegion(row('region-haeundae', 'region-busan'), SEOUL)).toBe(false);
  });

  it('구/군을 주면 그 구/군만이고, 같은 시/도의 다른 구/군은 아니다', () => {
    expect(isInPreferredRegion(row('region-mapo', SEOUL), 'region-mapo')).toBe(true);
    expect(isInPreferredRegion(row('region-gangnam', SEOUL), 'region-mapo')).toBe(false);
  });

  it('지역이 없는 행은 어느 지역에도 속하지 않는다', () => {
    expect(isInPreferredRegion({ regionId: null, region: null }, SEOUL)).toBe(false);
    expect(isInPreferredRegion({ regionId: null }, SEOUL)).toBe(false);
  });

  it('select 조각은 지역 id 와 상위 지역 id 를 읽는다', () => {
    expect(PREFERRED_REGION_SELECT).toEqual({ regionId: true, region: { select: { parentId: true } } });
  });
});
