import { describe, expect, it } from 'vitest';
import type { V1PlaceView } from '@/types/api';
import { fixtureVenuePatch, fixtureVenueValue } from './fixture-venue-patch';

const picked: V1PlaceView = {
  name: '상암 풋살파크',
  address: '서울 마포구 월드컵로 240',
  latitude: 37.5683,
  longitude: 126.8972,
  provider: 'kakao',
  providerPlaceId: 'kakao-sangam',
};

describe('fixtureVenuePatch', () => {
  it('place 가 없는 옛 응답은 이름만 있는 값으로 복원하고, 그대로면 아무것도 보내지 않는다', () => {
    const fixture = { venue: '탄천 구장', place: null };
    const value = fixtureVenueValue(fixture);
    expect(value).toEqual({ kind: 'manual', name: '탄천 구장' });
    expect(fixtureVenuePatch(value, fixture)).toEqual({});
  });

  it('장소를 다른 곳으로 고르면 이름·주소·좌표 스냅샷 전체를 보낸다', () => {
    const fixture = { venue: '탄천 구장', place: null };
    expect(fixtureVenuePatch({ kind: 'picked', ...picked, provider: 'kakao', providerPlaceId: 'kakao-sangam', latitude: 37.5683, longitude: 126.8972 }, fixture)).toEqual({
      venue: '상암 풋살파크',
      venueAddress: '서울 마포구 월드컵로 240',
      venueLatitude: 37.5683,
      venueLongitude: 126.8972,
      venueProvider: 'kakao',
      venueProviderId: 'kakao-sangam',
    });
  });

  it('고른 장소를 이름만 직접 입력으로 바꾸면 좌표 키 없이 이름만 보낸다 — 서버가 옛 핀을 지운다', () => {
    const patch = fixtureVenuePatch({ kind: 'manual', name: '동네 운동장' }, { venue: picked.name, place: picked });
    expect(patch).toEqual({ venue: '동네 운동장' });
  });

  it('장소를 비우면 빈 이름으로 지우고, 원래 비어 있으면 아무것도 보내지 않는다', () => {
    expect(fixtureVenuePatch(null, { venue: picked.name, place: picked })).toEqual({ venue: '' });
    expect(fixtureVenuePatch(null, { venue: null, place: null })).toEqual({});
  });
});
