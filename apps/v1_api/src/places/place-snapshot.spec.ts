import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  IsPlaceLatitude,
  IsPlaceLongitude,
  IsPlaceProvider,
  IsPlaceProviderId,
  resolvePlaceSnapshot,
  toPlaceColumns,
  toPlaceView,
} from './place-snapshot';

const picked = {
  name: ' 망원한강공원 풋살장 ',
  address: '서울 마포구 마포나루길 467',
  latitude: 37.5551,
  longitude: 126.8946,
  provider: 'kakao',
  providerPlaceId: '27355437',
};

describe('resolvePlaceSnapshot', () => {
  it('keeps a picked place whole and trims the name', () => {
    expect(resolvePlaceSnapshot(picked)).toEqual({
      name: '망원한강공원 풋살장',
      address: '서울 마포구 마포나루길 467',
      latitude: 37.5551,
      longitude: 126.8946,
      provider: 'kakao',
      providerPlaceId: '27355437',
    });
  });

  it('stores a manually typed place as name only', () => {
    expect(resolvePlaceSnapshot({ name: '동네 운동장', address: '  ' })).toEqual({
      name: '동네 운동장',
      address: null,
      latitude: null,
      longitude: null,
      provider: null,
      providerPlaceId: null,
    });
  });

  it('returns null for a blank name so the caller can apply its own default', () => {
    expect(resolvePlaceSnapshot({ name: '   ', ...{ latitude: 37.5 } })).toBeNull();
  });

  it.each([
    ['coordinates without provider', { latitude: 37.5, longitude: 127 }],
    ['provider without coordinates', { provider: 'kakao', providerPlaceId: '1' }],
    ['missing only the place id', { provider: 'kakao', latitude: 37.5, longitude: 127 }],
  ])('rejects a partial pin (%s)', (_label, partial) => {
    expect(() => resolvePlaceSnapshot({ name: '구장', ...partial })).toThrow(BadRequestException);
  });

  it('rejects an unknown provider', () => {
    expect(() => resolvePlaceSnapshot({ ...picked, provider: 'naver' })).toThrow(BadRequestException);
  });
});

describe('toPlaceColumns / toPlaceView', () => {
  it('round-trips a picked place through the place_* columns', () => {
    const columns = toPlaceColumns(resolvePlaceSnapshot(picked));
    expect(toPlaceView(columns)).toEqual({
      name: '망원한강공원 풋살장',
      address: '서울 마포구 마포나루길 467',
      latitude: 37.5551,
      longitude: 126.8946,
      provider: 'kakao',
      providerPlaceId: '27355437',
    });
  });

  it('clears every column when the place is removed', () => {
    expect(toPlaceColumns(null)).toEqual({
      placeName: null,
      placeAddress: null,
      placeLatitude: null,
      placeLongitude: null,
      placeProvider: null,
      placeProviderId: null,
    });
  });

  it('has no view without a name', () => {
    expect(toPlaceView(toPlaceColumns(null))).toBeNull();
  });
});

describe('place DTO decorators', () => {
  class Dto {
    @IsPlaceLatitude() lat?: number | null;
    @IsPlaceLongitude() lng?: number | null;
    @IsPlaceProvider() provider?: string | null;
    @IsPlaceProviderId() id?: string | null;
  }
  const errorsOf = (plain: object) => validateSync(plainToInstance(Dto, plain)).map((e) => e.property);

  it('accepts absent and null values', () => {
    expect(errorsOf({})).toEqual([]);
    expect(errorsOf({ lat: null, lng: null, provider: null, id: null })).toEqual([]);
  });

  it('rejects out-of-range coordinates, unknown providers and oversized ids', () => {
    expect(errorsOf({ lat: 91, lng: 181, provider: 'naver', id: 'x'.repeat(65) }).sort()).toEqual(
      ['id', 'lat', 'lng', 'provider'],
    );
  });
});
