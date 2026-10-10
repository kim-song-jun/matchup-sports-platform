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

/**
 * ios·android = 팀밋 앱 셸 안(앱 스킴 — 미설치면 셸이 스토어로 보낸다),
 * ios-web·android-web = 앱 밖 휴대폰 브라우저, web = 데스크톱 브라우저.
 */
export type PlaceNavPlatform = 'ios' | 'android' | 'ios-web' | 'android-web' | 'web';

export type PlaceNavLink = {
  key: 'kakao' | 'naver' | 'tmap';
  label: string;
  iconSrc: string;
  description: string;
  /** route: 좌표 길찾기, search: 이름 검색(좌표 없을 때). */
  mode: 'route' | 'search';
} & (
  | { href: string; newTab: boolean; onSelect?: undefined }
  | { onSelect: () => void; href?: undefined; newTab?: undefined }
);

const NAVER_MAP_APP_NAME = 'teameet.kr';
const TMAP_ANDROID_PACKAGE = 'com.skt.tmap.ku';
const TMAP_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${TMAP_ANDROID_PACKAGE}`;
const TMAP_APP_STORE_URL = 'https://apps.apple.com/kr/app/tmap/id431589174';
const TMAP_APP_STORE_FALLBACK_MS = 1500;

type NavTarget = { name: string; latitude: number | null; longitude: number | null };

/**
 * iOS Safari 는 스킴이 열리지 않으면 "주소가 유효하지 않다"는 경고창을 띄우고 대체 주소를 줄 수 없다.
 * 그래서 스킴으로 이동한 뒤 앱이 떴는지(탭이 숨겨졌는지)를 보고, 그대로 보이면 App Store 로 보낸다.
 */
export function openTmapOnIosWeb(schemeUrl: string): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', cancel);
  };
  function onVisibility() {
    if (document.visibilityState === 'hidden') cancel();
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', cancel);
  timer = setTimeout(() => {
    const stillHere = document.visibilityState === 'visible';
    cancel();
    if (stillHere) window.location.href = TMAP_APP_STORE_URL;
  }, TMAP_APP_STORE_FALLBACK_MS);
  window.location.href = schemeUrl;
}

/**
 * 카카오맵·네이버 지도·티맵 링크. 앱 셸 안에서만 앱 스킴을 직접 쓴다 — 앱 밖 휴대폰 브라우저는
 * 카카오·네이버를 웹 지도로 열고(앱 열기 버튼을 자체 제공), 티맵만 웹 대상이 없어 안드로이드는
 * intent URL, iOS 는 스킴 + 스토어 폴백으로 연다. 데스크톱은 새 창의 웹 지도 둘뿐이다.
 */
export function placeNavigationLinks(
  place: NavTarget,
  platform: PlaceNavPlatform = 'web',
): PlaceNavLink[] {
  const inShell = platform === 'ios' || platform === 'android';
  const desktop = platform === 'web';
  const name = encodeURIComponent(place.name);
  const appName = encodeURIComponent(NAVER_MAP_APP_NAME);
  const { latitude, longitude } = place;
  const routable = typeof latitude === 'number' && typeof longitude === 'number';
  const mode: PlaceNavLink['mode'] = routable ? 'route' : 'search';

  const kakaoHref = routable
    ? inShell
      ? `kakaomap://route?ep=${latitude},${longitude}&by=CAR`
      : `https://map.kakao.com/link/to/${name},${latitude},${longitude}`
    : inShell
      ? `kakaomap://search?q=${name}`
      : `https://map.kakao.com/?q=${name}`;

  const naverHref = routable
    ? inShell
      ? `nmap://route/car?dlat=${latitude}&dlng=${longitude}&dname=${name}&appname=${appName}`
      : `https://map.naver.com/v5/directions/-/-/-/car?destination=${longitude},${latitude}`
    : inShell
      ? `nmap://search?query=${name}&appname=${appName}`
      : `https://map.naver.com/p/search/${name}`;

  const tmapPath = routable
    ? `route?goalx=${longitude}&goaly=${latitude}&goalname=${name}`
    : `search?name=${name}`;

  const webDescription = (appLabel: string) =>
    desktop
      ? routable ? `새 창에서 ${appLabel} 길찾기` : '새 창에서 이름으로 검색'
      : routable ? '웹에서 길찾기' : '이름으로 검색';
  const appDescription = routable ? '앱으로 길찾기' : '이름으로 검색';

  // /map-apps/*.webp 는 각사가 앱스토어에 올린 공식 앱 아이콘(2026-10-10 받음)이다 — 상표라 변형하지 말고, 바뀌면 파일을 교체한다.
  const links: PlaceNavLink[] = [
    {
      key: 'kakao', label: '카카오맵', iconSrc: '/map-apps/kakaomap.webp', mode, href: kakaoHref, newTab: desktop,
      description: inShell ? appDescription : webDescription('카카오맵'),
    },
    {
      key: 'naver', label: '네이버 지도', iconSrc: '/map-apps/navermap.webp', mode, href: naverHref, newTab: desktop,
      description: inShell ? appDescription : webDescription('네이버 지도'),
    },
  ];
  const tmapBase = { key: 'tmap', label: '티맵', iconSrc: '/map-apps/tmap.webp', mode } as const;
  if (inShell) {
    links.push({ ...tmapBase, href: `tmap://${tmapPath}`, newTab: false, description: appDescription });
  } else if (platform === 'android-web') {
    links.push({
      ...tmapBase,
      href: `intent://${tmapPath}#Intent;scheme=tmap;package=${TMAP_ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(TMAP_PLAY_STORE_URL)};end`,
      newTab: false,
      description: `${appDescription} · 앱이 없으면 스토어로 이동해요`,
    });
  } else if (platform === 'ios-web') {
    links.push({
      ...tmapBase,
      onSelect: () => openTmapOnIosWeb(`tmap://${tmapPath}`),
      description: `${appDescription} · 앱이 없으면 스토어로 이동해요`,
    });
  }
  return links;
}

/** 지도 미리보기를 눌렀을 때 여는 카카오맵 웹 페이지(핀이 꽂힌 지도). */
export function placeKakaoMapUrl(place: { name: string; latitude: number; longitude: number }): string {
  return `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.latitude},${place.longitude}`;
}

export function detectPlaceNavPlatform(): PlaceNavPlatform {
  const shell = detectNativeShell();
  if (shell) return shell;
  if (typeof navigator === 'undefined') return 'web';
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'ios-web';
  if (/Android/i.test(navigator.userAgent)) return 'android-web';
  return 'web';
}
