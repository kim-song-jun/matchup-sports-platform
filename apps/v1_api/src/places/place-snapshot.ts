import { applyDecorators, BadRequestException } from '@nestjs/common';
import { IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

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
 * 수정(PATCH)에서 이름 키 없이 주소·핀 키만 온 요청을 거절한다 — 이름 키로 교체 여부를 정하는 경로에선 조용히
 * 버려지고, 그렇지 않으면 옛 핀과 새 주소가 섞인다. `null` 도 보낸 것으로 친다(이름 없이 비우는 부분 수정).
 */
export function rejectPartialPlaceUpdate(name: string | null | undefined, others: readonly unknown[]): void {
  if (name === undefined && others.some((value) => value !== undefined)) {
    throw new BadRequestException({ code: 'PLACE_NAME_REQUIRED', message: '장소를 바꾸려면 장소를 다시 골라 주세요.' });
  }
}

/**
 * 입력 묶음을 저장 가능한 스냅샷으로 정리한다. 이름이 비고 다른 칸도 비면 null(호출부가 '장소 미정' 등 기본값을 정한다),
 * 이름 없이 다른 칸만 오면 400 `PLACE_NAME_REQUIRED`. 출처·좌표·id 가 일부만 오면 400 `PLACE_SNAPSHOT_INCOMPLETE`.
 */
export function resolvePlaceSnapshot(input: PlaceSnapshotInput): PlaceSnapshot | null {
  const name = blankToNull(input.name);
  if (name === null) {
    const orphan = [input.address, input.provider, input.providerPlaceId].some((v) => blankToNull(v) !== null) ||
      input.latitude != null || input.longitude != null;
    // 이름 없이 주소·핀만 온 요청을 null(=기본값·미변경)로 읽으면 고른 장소가 조용히 버려진다.
    if (orphan) {
      throw new BadRequestException({ code: 'PLACE_NAME_REQUIRED', message: '장소 이름이 없어요. 장소를 다시 골라 주세요.' });
    }
    return null;
  }

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
// IsLatitude 는 "37.5" 같은 문자열도 통과시킨다 — 그대로 Float 칸에 가면 400 이 아니라 500 이 난다.
const FINITE_NUMBER = { allowNaN: false, allowInfinity: false };
export const IsPlaceLatitude = () =>
  applyDecorators(IsOptional(), ValidateIf((_o, v) => v !== null), IsNumber(FINITE_NUMBER), IsLatitude());
export const IsPlaceLongitude = () =>
  applyDecorators(IsOptional(), ValidateIf((_o, v) => v !== null), IsNumber(FINITE_NUMBER), IsLongitude());
export const IsPlaceProvider = () => applyDecorators(IsOptional(), ValidateIf((_o, v) => v !== null), IsIn([...PLACE_PROVIDERS]));
export const IsPlaceProviderId = () =>
  applyDecorators(IsOptional(), ValidateIf((_o, v) => v !== null), IsString(), MaxLength(64));
