import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectPlaceNavPlatform,
  placeFromEditForm,
  placeFromRecentVenue,
  placeFromSearchItem,
  placeFromView,
  placeNavigationLinks,
  toLeaguePlacePayload,
  toMatchPlacePayload,
  toVenuePayload,
  type PlaceValue,
} from './place';

const picked: PlaceValue = {
  kind: 'picked',
  name: '망원한강공원 풋살장',
  address: '서울 마포구 마포나루길 467',
  latitude: 37.5558,
  longitude: 126.8985,
  provider: 'kakao',
  providerPlaceId: 'kakao-1',
};

describe('placeNavigationLinks', () => {
  const route = { name: '망원 풋살장', latitude: 37.5, longitude: 127.1 };
  const nameOnly = { name: '망원 풋살장', latitude: null, longitude: null };
  const enc = encodeURIComponent('망원 풋살장');
  const tmapRoute = `route?goalx=127.1&goaly=37.5&goalname=${enc}`;

  it('앱 셸 + 좌표: 앱 스킴 3개와 "앱으로 길찾기" 설명', () => {
    const links = placeNavigationLinks(route, 'android');
    expect(links.map((l) => [l.key, l.label])).toEqual([
      ['kakao', '카카오맵'],
      ['naver', '네이버 지도'],
      ['tmap', '티맵'],
    ]);
    expect(links[0].href).toBe('kakaomap://route?ep=37.5,127.1&by=CAR');
    expect(links[1].href).toContain('nmap://route/car?dlat=37.5&dlng=127.1');
    expect(links[1].href).toContain(`dname=${enc}`);
    expect(links[2].href).toBe(`tmap://${tmapRoute}`);
    expect(links.every((l) => l.mode === 'route' && l.description === '앱으로 길찾기' && !l.newTab)).toBe(true);
    expect(links.map((l) => l.iconSrc)).toEqual(['/map-apps/kakaomap.webp', '/map-apps/navermap.webp', '/map-apps/tmap.webp']);
  });

  it('데스크톱 + 좌표: 새 창 웹 URL 2개이고 티맵은 없다', () => {
    const links = placeNavigationLinks(route, 'web');
    expect(links.map((l) => l.key)).toEqual(['kakao', 'naver']);
    expect(links[0].href).toBe(`https://map.kakao.com/link/to/${enc},37.5,127.1`);
    expect(links[1].href).toBe('https://map.naver.com/v5/directions/-/-/-/car?destination=127.1,37.5');
    expect(links.map((l) => [l.newTab, l.description])).toEqual([
      [true, '새 창에서 카카오맵 길찾기'],
      [true, '새 창에서 네이버 지도 길찾기'],
    ]);
  });

  it('안드로이드 웹: 카카오·네이버는 웹 URL, 티맵은 스토어 폴백이 든 intent URL', () => {
    const links = placeNavigationLinks(route, 'android-web');
    expect(links[0].href).toMatch(/^https:\/\/map\.kakao\.com\/link\/to\//);
    expect(links[1].href).toMatch(/^https:\/\/map\.naver\.com\//);
    expect(links[0].description).toBe('웹에서 길찾기');
    expect(links[0].newTab).toBe(false);
    const play = encodeURIComponent('https://play.google.com/store/apps/details?id=com.skt.tmap.ku');
    expect(links[2].href).toBe(
      `intent://${tmapRoute}#Intent;scheme=tmap;package=com.skt.tmap.ku;S.browser_fallback_url=${play};end`,
    );
    expect(links[2].description).toBe('앱으로 길찾기 · 앱이 없으면 스토어로 이동해요');
  });

  it('iOS 웹: 티맵은 href 가 아니라 핸들러를 가진다', () => {
    const links = placeNavigationLinks(nameOnly, 'ios-web');
    expect(links.map((l) => l.key)).toEqual(['kakao', 'naver', 'tmap']);
    expect(links[2].href).toBeUndefined();
    expect(typeof links[2].onSelect).toBe('function');
    expect(links[0].description).toBe('이름으로 검색');
  });

  it.each([
    ['쉼표', '풋살장, 별관'],
    ['앰퍼샌드', 'A&B 구장'],
    ['해시', '#1 구장'],
    ['공백', '망원 풋살 파크'],
  ])('이름에 %s 가 있어도 구분자로 쓰이지 않게 인코딩한다', (_label, name) => {
    const encoded = encodeURIComponent(name);
    const web = placeNavigationLinks({ name, latitude: 37.5, longitude: 127.1 }, 'web');
    expect(web[0].href).toBe(`https://map.kakao.com/link/to/${encoded},37.5,127.1`);
    expect(web[0].href!.replace('https://map.kakao.com/link/to/', '').split(',')).toHaveLength(3);
    const app = placeNavigationLinks({ name, latitude: 37.5, longitude: 127.1 }, 'android');
    expect(app[1].href).toContain(`dname=${encoded}&appname=`);
    expect(app[2].href).toBe(`tmap://route?goalx=127.1&goaly=37.5&goalname=${encoded}`);
  });

  it('좌표 없음: 앱 셸은 앱 이름 검색, 데스크톱은 웹 검색 URL', () => {
    const mobile = placeNavigationLinks(nameOnly, 'ios');
    expect(mobile.map((l) => l.href)).toEqual([
      `kakaomap://search?q=${enc}`,
      `nmap://search?query=${enc}&appname=teameet.kr`,
      `tmap://search?name=${enc}`,
    ]);
    expect(mobile.every((l) => l.mode === 'search' && l.description === '이름으로 검색')).toBe(true);
    const desktop = placeNavigationLinks(nameOnly, 'web');
    expect(desktop.map((l) => l.href)).toEqual([`https://map.kakao.com/?q=${enc}`, `https://map.naver.com/p/search/${enc}`]);
    expect(desktop[0].description).toBe('새 창에서 이름으로 검색');
  });
});

describe('iOS 웹 티맵 핸들러', () => {
  const originalLocation = window.location;
  let assigned: string[];

  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    assigned = [];
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { set href(v: string) { assigned.push(v); } },
    });
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  const tmapLink = () =>
    placeNavigationLinks({ name: '구장', latitude: 37.5, longitude: 127 }, 'ios-web').find((l) => l.key === 'tmap')!;

  it('스킴으로 이동하고, 1.5초 뒤에도 화면이 보이면 App Store 로 보낸다', () => {
    tmapLink().onSelect!();
    expect(assigned).toEqual([`tmap://route?goalx=127&goaly=37.5&goalname=${encodeURIComponent('구장')}`]);
    vi.advanceTimersByTime(1499);
    expect(assigned).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(assigned[1]).toBe('https://apps.apple.com/kr/app/tmap/id431589174');
  });

  it('앱이 떠서 탭이 숨겨지면 스토어로 보내지 않는다', () => {
    tmapLink().onSelect!();
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(3000);
    expect(assigned).toHaveLength(1);
  });

  it('pagehide 가 오면 스토어로 보내지 않는다', () => {
    tmapLink().onSelect!();
    window.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(3000);
    expect(assigned).toHaveLength(1);
  });

  it('타이머 시점에 이미 숨겨져 있으면 스토어로 보내지 않는다', () => {
    tmapLink().onSelect!();
    setVisibility('hidden');
    vi.advanceTimersByTime(1500);
    expect(assigned).toHaveLength(1);
  });
});

describe('PlaceValue 변환', () => {
  it('좌표·provider 가 모두 있는 view 만 picked 로 복원하고, 하나라도 빠지면 manual 로 둔다', () => {
    expect(
      placeFromView({ name: '구장', address: '주소', latitude: 1, longitude: 2, provider: 'kakao', providerPlaceId: 'p' }),
    ).toMatchObject({ kind: 'picked', latitude: 1, longitude: 2, providerPlaceId: 'p' });
    expect(
      placeFromView({ name: '구장', address: '주소', latitude: 1, longitude: null, provider: 'kakao', providerPlaceId: 'p' }),
    ).toEqual({ kind: 'manual', name: '구장', address: '주소' });
    expect(placeFromView({ name: '  ', address: null, latitude: null, longitude: null, provider: null, providerPlaceId: null })).toBeNull();
  });

  it('최근 장소 칩과 수정 폼 프리필이 좌표까지 복원한다', () => {
    expect(
      placeFromRecentVenue({ placeName: '구장', addressText: null, latitude: 3, longitude: 4, provider: 'kakao', providerPlaceId: 'r1' }),
    ).toMatchObject({ kind: 'picked', providerPlaceId: 'r1' });
    expect(
      placeFromEditForm({ manualPlaceName: '구장', addressText: '주소', placeLatitude: 3, placeLongitude: 4, placeProvider: 'kakao', placeProviderId: 'e1' }),
    ).toMatchObject({ kind: 'picked', address: '주소', latitude: 3 });
  });

  it('검색 결과는 도로명 주소가 없으면 지번 주소를 쓴다', () => {
    expect(
      placeFromSearchItem({ provider: 'kakao', providerPlaceId: 'x', name: 'n', address: '', jibunAddress: '지번', category: null, latitude: 1, longitude: 2 }).address,
    ).toBe('지번');
  });
});

describe('payload 헬퍼', () => {
  it('매치 계열: picked 는 4필드를 모두 보내고, manual 은 좌표 키를 빼 서버가 옛 핀을 지우게 한다', () => {
    expect(toMatchPlacePayload(picked)).toEqual({
      manualPlaceName: '망원한강공원 풋살장',
      addressText: '서울 마포구 마포나루길 467',
      placeLatitude: 37.5558,
      placeLongitude: 126.8985,
      placeProvider: 'kakao',
      placeProviderId: 'kakao-1',
    });
    const manual = toMatchPlacePayload({ kind: 'manual', name: '동네 운동장' });
    expect(manual).toEqual({ manualPlaceName: '동네 운동장', addressText: null });
    expect('placeLatitude' in manual).toBe(false);
    expect(toMatchPlacePayload(null)).toEqual({ manualPlaceName: '' });
    expect(toMatchPlacePayload({ kind: 'manual', name: '  동네 운동장  ' }).manualPlaceName).toBe('동네 운동장');
    expect(toLeaguePlacePayload({ kind: 'manual', name: '  동네 운동장 ' }).placeName).toBe('동네 운동장');
    expect(toVenuePayload({ kind: 'manual', name: ' 동네 운동장  ' }).venue).toBe('동네 운동장');
  });

  it('리그 계열: 값이 없으면 키를 비워 기본 장소 상속을 허용한다', () => {
    expect(toLeaguePlacePayload(null)).toEqual({});
    expect(toLeaguePlacePayload(picked)).toMatchObject({ placeName: '망원한강공원 풋살장', placeAddress: '서울 마포구 마포나루길 467', placeProviderId: 'kakao-1' });
  });

  it('대회 계열: venue* 이름으로 좌표를 보낸다', () => {
    expect(toVenuePayload(picked)).toEqual({
      venue: '망원한강공원 풋살장',
      venueAddress: '서울 마포구 마포나루길 467',
      venueLatitude: 37.5558,
      venueLongitude: 126.8985,
      venueProvider: 'kakao',
      venueProviderId: 'kakao-1',
    });
    expect(toVenuePayload({ kind: 'manual', name: '운동장' })).toEqual({ venue: '운동장' });
  });
});

describe('detectPlaceNavPlatform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { TeameetNative?: unknown }).TeameetNative;
  });

  it('앱 밖 아이폰 브라우저는 ios-web', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
    expect(detectPlaceNavPlatform()).toBe('ios-web');
  });

  it('앱 밖 안드로이드 브라우저는 android-web, 데스크톱은 web', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' });
    expect(detectPlaceNavPlatform()).toBe('android-web');
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    expect(detectPlaceNavPlatform()).toBe('web');
  });

  it('팀밋 앱 셸 안이면 UA 와 상관없이 셸 플랫폼', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
    (window as { TeameetNative?: unknown }).TeameetNative = { postMessage: () => undefined };
    expect(detectPlaceNavPlatform()).toBe('android');
  });
});
