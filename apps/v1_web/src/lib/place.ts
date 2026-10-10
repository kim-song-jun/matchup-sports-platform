import type {
  V1PlaceSearchItem,
  V1PlaceSnapshotPayload,
  V1PlaceView,
  V1RecentVenue,
  V1VenueSnapshotPayload,
} from '@/types/api';
import { detectNativeShell } from '@/lib/native-bridge';

/**
 * 폼이 들고 다니는 장소 값. `picked` 는 카카오 검색에서 고른 스냅샷(좌표 포함),
 * `manual` 은 "이름만 직접 입력"(좌표 없음 — 지도 앱 이름 검색으로 폴백).
 * manual 의 `address` 는 편집 화면에서 불러온 옛 주소를 잃지 않으려는 보존용이다(입력 UI 는 없다).
 */
export type PickedPlace = {
  kind: 'picked';
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  provider: 'kakao';
  providerPlaceId: string;
};

export type ManualPlace = {
  kind: 'manual';
  name: string;
  address?: string | null;
};

export type PlaceValue = PickedPlace | ManualPlace;

// ── 변환 ────────────────────────────────────────────────────────────────────

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** 좌표·provider 가 모두 있어야 picked, 하나라도 비면 manual(부분 핀은 서버도 400 이다). */
function fromSnapshotParts(parts: {
  name: string | null | undefined;
  address: string | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  provider: 'kakao' | null | undefined;
  providerPlaceId: string | null | undefined;
}): PlaceValue | null {
  const name = cleanText(parts.name);
  if (!name) return null;
  const address = cleanText(parts.address);
  const { latitude, longitude, provider, providerPlaceId } = parts;
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    provider === 'kakao' &&
    providerPlaceId
  ) {
    return { kind: 'picked', name, address, latitude, longitude, provider, providerPlaceId };
  }
  return { kind: 'manual', name, address };
}

export function placeFromView(view: V1PlaceView | null | undefined): PlaceValue | null {
  if (!view) return null;
  return fromSnapshotParts(view);
}

export function placeFromSearchItem(item: V1PlaceSearchItem): PickedPlace {
  return {
    kind: 'picked',
    name: item.name,
    address: cleanText(item.address) ?? cleanText(item.jibunAddress),
    latitude: item.latitude,
    longitude: item.longitude,
    provider: item.provider,
    providerPlaceId: item.providerPlaceId,
  };
}

export function placeFromRecentVenue(venue: V1RecentVenue): PlaceValue | null {
  return fromSnapshotParts({
    name: venue.placeName,
    address: venue.addressText,
    latitude: venue.latitude,
    longitude: venue.longitude,
    provider: venue.provider,
    providerPlaceId: venue.providerPlaceId,
  });
}

/** 수정 폼 프리필(매치·팀매치 edit 응답의 평평한 필드) → 폼 값. */
export function placeFromEditForm(form: {
  manualPlaceName: string;
  addressText?: string | null;
  placeLatitude?: number | null;
  placeLongitude?: number | null;
  placeProvider?: 'kakao' | null;
  placeProviderId?: string | null;
}): PlaceValue | null {
  return fromSnapshotParts({
    name: form.manualPlaceName,
    address: form.addressText,
    latitude: form.placeLatitude,
    longitude: form.placeLongitude,
    provider: form.placeProvider,
    providerPlaceId: form.placeProviderId,
  });
}

/** 칩·콤보박스 하이라이트 등 화면 표시용 `V1PlaceView` 로 되돌린다. */
export function placeToView(value: PlaceValue): V1PlaceView {
  if (value.kind === 'picked') {
    return {
      name: value.name,
      address: value.address,
      latitude: value.latitude,
      longitude: value.longitude,
      provider: value.provider,
      providerPlaceId: value.providerPlaceId,
    };
  }
  return {
    name: value.name,
    address: cleanText(value.address),
    latitude: null,
    longitude: null,
    provider: null,
    providerPlaceId: null,
  };
}

export function recentVenueFromView(view: V1PlaceView): V1RecentVenue {
  return {
    placeName: view.name,
    addressText: view.address,
    latitude: view.latitude,
    longitude: view.longitude,
    provider: view.provider,
    providerPlaceId: view.providerPlaceId,
  };
}

// ── payload ─────────────────────────────────────────────────────────────────
// manual 은 좌표 4필드를 보내지 않는다 — 수정(PATCH)에서 키가 없으면 서버가 옛 핀을 지운다.

function snapshotFields(value: PlaceValue): V1PlaceSnapshotPayload {
  if (value.kind !== 'picked') return {};
  return {
    placeLatitude: value.latitude,
    placeLongitude: value.longitude,
    placeProvider: value.provider,
    placeProviderId: value.providerPlaceId,
  };
}

/** 개인 매치·팀매치·어드민 모집: `manualPlaceName` + `addressText` + `place*` 4필드. */
export function toMatchPlacePayload(value: PlaceValue | null): {
  manualPlaceName: string;
  addressText?: string | null;
} & V1PlaceSnapshotPayload {
  if (!value) return { manualPlaceName: '' };
  return {
    manualPlaceName: value.name.trim(),
    addressText: cleanText(value.address),
    ...snapshotFields(value),
  };
}

/** 리그 경기: `placeName` + `placeAddress` + `place*` 4필드. 값이 없으면 키를 빼서 서버가 기본 장소를 상속하게 한다. */
export function toLeaguePlacePayload(value: PlaceValue | null): {
  placeName?: string;
  placeAddress?: string;
} & V1PlaceSnapshotPayload {
  if (!value) return {};
  const address = cleanText(value.address);
  return {
    placeName: value.name.trim(),
    ...(address ? { placeAddress: address } : {}),
    ...snapshotFields(value),
  };
}

/** 대회·대진 경기: `venue` + `venueAddress` + `venue*` 좌표·provider. 값이 없으면 키를 뺀다. */
export function toVenuePayload(value: PlaceValue | null): {
  venue?: string;
} & V1VenueSnapshotPayload {
  if (!value) return {};
  const address = cleanText(value.address);
  return {
    venue: value.name.trim(),
    ...(address ? { venueAddress: address } : {}),
    ...(value.kind === 'picked'
      ? {
          venueLatitude: value.latitude,
          venueLongitude: value.longitude,
          venueProvider: value.provider,
          venueProviderId: value.providerPlaceId,
        }
      : {}),
  };
}

/** 대회 응답(`venue`·`venueAddress`·`latitude`…)을 폼 값으로. */
export function placeFromVenueFields(fields: {
  venue: string | null | undefined;
  venueAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  venueProvider?: 'kakao' | null;
  venueProviderId?: string | null;
}): PlaceValue | null {
  return fromSnapshotParts({
    name: fields.venue,
    address: fields.venueAddress,
    latitude: fields.latitude,
    longitude: fields.longitude,
    provider: fields.venueProvider,
    providerPlaceId: fields.venueProviderId,
  });
}

export function hasCoordinates(
  place: Pick<V1PlaceView, 'latitude' | 'longitude'>,
): place is { latitude: number; longitude: number } {
  return typeof place.latitude === 'number' && typeof place.longitude === 'number';
}

// ── 길찾기 링크 ──────────────────────────────────────────────────────────────

/** ios·android = 팀밋 앱 셸 안(앱 스킴 — 미설치면 셸이 스토어로 보낸다), web = 일반 브라우저(모바일 포함). */
export type PlaceNavPlatform = 'ios' | 'android' | 'web';

export type PlaceNavLink = {
  key: 'kakao' | 'naver' | 'tmap';
  label: string;
  href: string;
  /** route: 좌표 길찾기, search: 이름 검색(좌표 없을 때). */
  mode: 'route' | 'search';
};

const NAVER_MAP_APP_NAME = 'teameet.kr';

type NavTarget = { name: string; latitude: number | null; longitude: number | null };

/**
 * 카카오맵·네이버지도·티맵 링크. 앱 셸 안에서만 앱 스킴을 쓴다 — 일반 모바일 브라우저는 앱이 없을 때
 * 스킴 링크가 아무 반응도 없어서 웹 지도(앱 열기 버튼을 자체 제공)를 연다. 티맵은 웹 대상이 없어 앱 셸에서만 보인다.
 */
export function placeNavigationLinks(
  place: NavTarget,
  platform: PlaceNavPlatform = 'web',
): PlaceNavLink[] {
  const mobile = platform !== 'web';
  const name = encodeURIComponent(place.name);
  const { latitude, longitude } = place;
  const routable = typeof latitude === 'number' && typeof longitude === 'number';
  const mode: PlaceNavLink['mode'] = routable ? 'route' : 'search';

  const kakaoHref = routable
    ? mobile
      ? `kakaomap://route?ep=${latitude},${longitude}&by=CAR`
      : `https://map.kakao.com/link/to/${name},${latitude},${longitude}`
    : mobile
      ? `kakaomap://search?q=${name}`
      : `https://map.kakao.com/?q=${name}`;

  const naverHref = routable
    ? mobile
      ? `nmap://route/car?dlat=${latitude}&dlng=${longitude}&dname=${name}&appname=${encodeURIComponent(NAVER_MAP_APP_NAME)}`
      : `https://map.naver.com/v5/directions/-/-/-/car?destination=${longitude},${latitude}`
    : mobile
      ? `nmap://search?query=${name}&appname=${encodeURIComponent(NAVER_MAP_APP_NAME)}`
      : `https://map.naver.com/p/search/${name}`;

  const links: PlaceNavLink[] = [
    { key: 'kakao', label: '카카오맵', href: kakaoHref, mode },
    { key: 'naver', label: '네이버맵', href: naverHref, mode },
  ];
  if (mobile) {
    links.push({
      key: 'tmap',
      label: '티맵',
      href: routable
        ? `tmap://route?goalx=${longitude}&goaly=${latitude}&goalname=${name}`
        : `tmap://search?name=${name}`,
      mode,
    });
  }
  return links;
}

/** 지도 미리보기를 눌렀을 때 여는 카카오맵 웹 페이지(핀이 꽂힌 지도). */
export function placeKakaoMapUrl(place: { name: string; latitude: number; longitude: number }): string {
  return `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.latitude},${place.longitude}`;
}

export function detectPlaceNavPlatform(): PlaceNavPlatform {
  return detectNativeShell() ?? 'web';
}
