import { applyDecorators, BadRequestException } from '@nestjs/common';
import { IsIn, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export const PLACE_PROVIDERS = ['kakao'] as const;
export type PlaceProvider = (typeof PLACE_PROVIDERS)[number];

/**
 * 한 장소의 저장 단위. `provider` 가 있으면 장소 검색에서 고른 장소이고 좌표·id 가 반드시 함께 있다.
 * 직접 입력한 장소는 이름(과 선택적 주소)만 있고 나머지는 null 이다 — 좌표만 있고 출처가 없는
 * 상태는 만들지 않는다(누가 찍었는지 모르는 핀은 틀린 위치와 구분할 수 없다).
 */
export interface PlaceSnapshot {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  provider: PlaceProvider | null;
  providerPlaceId: string | null;
}

export interface PlaceSnapshotInput {
  name: string | null | undefined;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  provider?: string | null;
  providerPlaceId?: string | null;
}

/** 응답에 싣는 모양. 웹 `V1PlaceView` 와 같은 계약이다. */
export interface PlaceView {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  provider: PlaceProvider | null;
  providerPlaceId: string | null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 입력 묶음을 저장 가능한 스냅샷으로 정리한다. 이름이 비면 null(호출부가 '장소 미정' 등 기본값을 정한다).
 * 출처·좌표·id 가 일부만 오면 400 `PLACE_SNAPSHOT_INCOMPLETE` — 부분 저장은 하지 않는다.
 */
export function resolvePlaceSnapshot(input: PlaceSnapshotInput): PlaceSnapshot | null {
  const name = blankToNull(input.name);
  if (name === null) return null;

  const provider = blankToNull(input.provider);
  const providerPlaceId = blankToNull(input.providerPlaceId);
  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;
  const pinned = [provider, providerPlaceId, latitude, longitude];
  const pinnedCount = pinned.filter((value) => value !== null).length;

  if (pinnedCount !== 0 && pinnedCount !== pinned.length) {
    throw new BadRequestException({
      code: 'PLACE_SNAPSHOT_INCOMPLETE',
      message: '장소 정보가 일부만 왔어요. 장소를 다시 골라 주세요.',
    });
  }
  if (provider !== null && !(PLACE_PROVIDERS as readonly string[]).includes(provider)) {
    throw new BadRequestException({ code: 'PLACE_PROVIDER_UNSUPPORTED', message: '지원하지 않는 장소 정보예요.' });
  }

  return {
    name,
    address: blankToNull(input.address),
    latitude,
    longitude,
    provider: provider as PlaceProvider | null,
    providerPlaceId,
  };
}

/** Prisma 행(`place*` 칸)에서 응답 모양을 만든다. 이름이 없으면 null. */
export function toPlaceView(row: {
  placeName: string | null;
  placeAddress: string | null;
  placeLatitude: number | null;
  placeLongitude: number | null;
  placeProvider: string | null;
  placeProviderId: string | null;
}): PlaceView | null {
  if (!row.placeName) return null;
  return {
    name: row.placeName,
    address: row.placeAddress,
    latitude: row.placeLatitude,
    longitude: row.placeLongitude,
    provider: (row.placeProvider as PlaceProvider | null) ?? null,
    providerPlaceId: row.placeProviderId,
  };
}

/** 스냅샷을 `place*` 칸 묶음으로 펼친다(매치·팀매치·리그/대회 경기 공통). */
export function toPlaceColumns(snapshot: PlaceSnapshot | null) {
  return {
    placeName: snapshot?.name ?? null,
    placeAddress: snapshot?.address ?? null,
    placeLatitude: snapshot?.latitude ?? null,
    placeLongitude: snapshot?.longitude ?? null,
    placeProvider: snapshot?.provider ?? null,
    placeProviderId: snapshot?.providerPlaceId ?? null,
  };
}

// DTO 필드 데코레이터 — 도메인마다 필드 이름(place*/venue*)은 다르지만 규칙은 하나다.
export const IsPlaceLatitude = () => applyDecorators(IsOptional(), ValidateIf((_o, v) => v !== null), IsLatitude());
export const IsPlaceLongitude = () => applyDecorators(IsOptional(), ValidateIf((_o, v) => v !== null), IsLongitude());
export const IsPlaceProvider = () => applyDecorators(IsOptional(), ValidateIf((_o, v) => v !== null), IsIn([...PLACE_PROVIDERS]));
export const IsPlaceProviderId = () =>
  applyDecorators(IsOptional(), ValidateIf((_o, v) => v !== null), IsString(), MaxLength(64));
