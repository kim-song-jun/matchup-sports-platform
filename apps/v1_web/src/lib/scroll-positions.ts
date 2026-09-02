const SCROLL_POSITIONS_KEY = 'teameet.v1.scrollPositions';
const MAX_ENTRIES = 30; // 무제한 증가 방지 — 한 세션에 30개 라우트 이상 방문하면 가장
  // 오래된 것부터 버린다(LRU 근사: 삽입 순서 = 접근 순서로 취급, JS 객체 키 순서 보장 이용).

type PositionMap = Record<string, number>;

function readAll(): PositionMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(SCROLL_POSITIONS_KEY);
    return raw ? (JSON.parse(raw) as PositionMap) : {};
  } catch {
    return {}; // 손상된 JSON·프라이빗 모드 등 — 빈 맵으로 시작해도 안전(그냥 복원 안 됨).
  }
}

function writeAll(map: PositionMap) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(map));
  } catch {
    // 쿼터 초과 등 — 스크롤 복원은 순수 UX 개선이라 실패해도 앱 동작에 영향 없다.
  }
}

export function saveScrollPosition(routeKey: string, top: number) {
  const map = readAll();
  delete map[routeKey]; // 재삽입으로 "가장 최근" 자리로 옮긴다(LRU 근사).
  map[routeKey] = top;
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) delete map[keys[0]];
  writeAll(map);
}

export function readScrollPosition(routeKey: string): number | null {
  const map = readAll();
  return routeKey in map ? map[routeKey] : null;
}
