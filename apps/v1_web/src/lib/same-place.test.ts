import { describe, expect, it } from 'vitest';
import { isSamePlace } from './same-place';
import type { V1PlaceView } from '@/types/api';

const place = (over: Partial<V1PlaceView>): V1PlaceView => ({
  name: '성산 풋살파크',
  address: null,
  latitude: null,
  longitude: null,
  provider: null,
  providerPlaceId: null,
  ...over,
});

describe('isSamePlace', () => {
  it('둘 다 카카오 id 가 있으면 이름이 달라도 id 로 같은 곳을 판정한다', () => {
    const a = place({ name: 'A구장', provider: 'kakao', providerPlaceId: '1' });
    expect(isSamePlace(a, place({ name: 'B구장', provider: 'kakao', providerPlaceId: '1' }))).toBe(true);
    expect(isSamePlace(a, place({ name: 'A구장', provider: 'kakao', providerPlaceId: '2' }))).toBe(false);
  });

  it('id 가 한쪽이라도 없으면 이름으로 비교한다', () => {
    const picked = place({ provider: 'kakao', providerPlaceId: '1' });
    expect(isSamePlace(picked, place({ name: ' 성산 풋살파크 ' }))).toBe(true);
    expect(isSamePlace(picked, place({ name: '다른 곳' }))).toBe(false);
  });

  it('둘 다 없으면 같고 한쪽만 없으면 다르다', () => {
    expect(isSamePlace(null, undefined)).toBe(true);
    expect(isSamePlace(place({}), null)).toBe(false);
  });
});
