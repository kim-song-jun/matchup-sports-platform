import type { Query } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/**
 * persist 스냅샷이 저장되는 단일 localStorage 키. clearV1IdentityCache()
 * (query-keys.ts)가 계정 전환 시 이 키를 통째로 지운다.
 */
export const PERSIST_STORAGE_KEY = 'teameet.v1.rq-cache';

/**
 * Tier-1 응답 타입이 바뀔 때(필드 삭제/이름 변경 등) 개발자가 수동으로 올린다.
 * 값이 바뀌면 persistQueryClient가 저장된 스냅샷 전체를 무효화하고 빈 캐시로 시작한다.
 *
 * release-version-watcher.tsx 의 배포 감지와는 **의도적으로 분리**했다 — 매 alpha
 * 배포마다 이 캐시를 지우면 이 웨이브의 목적(재방문 즉시 로드)이 대부분 무력화된다.
 * Tier-1 데이터(마스터/공지/캠페인)는 스키마가 실제로 바뀌는 빈도가 낮으므로, 개발자가
 * "이 PR은 그 타입을 바꿨다"고 알 때만 올리는 수동 버스터가 더 정확하다.
 */
export const PERSIST_BUSTER = 'p1';

/** persistQueryClient의 maxAge — 이 기간을 넘긴 스냅샷은 buster 일치 여부와 무관하게
 * 통째로 버려진다(며칠씩 앱을 안 연 사용자의 옛 데이터를 무기한 신뢰하지 않기 위함). */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24시간

/**
 * localStorage 에 남겨도 되는 쿼리 화이트리스트 — **기본은 거부**.
 *
 * 아래 4개 도메인만 실제로 타입 확인을 거쳐 안전하다고 검증됐다(app-persistence-optimization.md
 * §1.3 참고):
 *  - master   : masterSports/masterRegions — V1MasterSportsResponse/V1MasterRegionsResponse,
 *               viewer 필드 없음. 스포츠/지역 분류표, 로그인 여부와 무관.
 *  - notices  : notices/notice — V1Notice, viewer 필드 없음. 공개 공지.
 *  - public   : publicKakaoMapsKey — 코드 주석이 이미 "공개돼도 안전"이라고 명시.
 *  - tournaments/campaigns 세그먼트 : tournamentCampaigns/tournamentCampaign(slug) —
 *               V1PublicTournamentCampaign(타입명 자체가 Public), viewer 필드 없음.
 *
 * **여기 도메인을 추가하기 전에 반드시**: 1) 그 쿼리의 응답 TS 타입을 열어
 * viewer/applicationId/participantId/canApply 류 개인화 필드가 없는지 확인하고,
 * 2) 이 배열과 위 문서의 표에 함께 추가한다. 예: `useV1Matches`/`useV1Match`는 얼핏
 * 공개 목록처럼 보이지만 `V1Match` 타입(apps/v1_web/src/types/api.ts:405-412)이
 * `viewer.applicationId`/`viewer.participantId`/`viewer.canApply`를 포함해서(실측
 * 확인됨) 이 화이트리스트에 넣지 않았다 — 계정을 바꿔도 캐시가 지워지지 않으면
 * 새 사용자 화면에 "이전 사용자가 신청한 매치" CTA가 잠깐 보일 수 있다.
 */
const PERSIST_ALLOWED_DOMAINS = new Set(['master', 'notices', 'public']);

/** 세그먼트 어디에라도 이 값이 나오면 도메인이 허용 목록에 있어도 무조건 거부한다 —
 * 화이트리스트가 실수로 넓어지는 미래 변경에 대비한 이중 방어선. */
const BLOCKED_SEGMENTS = new Set(['me', 'admin', 'auth']);

export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false; // 에러/로딩 상태는 저장할 이유가 없다.

  const key = query.queryKey as readonly unknown[];
  if (key[0] !== 'v1') return false; // v1Keys 밖의 독립 키 팩토리(resultReviewKeys 등)는
  // 이 조건에서 이미 걸러진다 — v1Keys 컨벤션을 따르지 않는 새 쿼리는 안전한 방향
  // (미persist)으로 기본 실패한다.

  if (key.some((seg) => typeof seg === 'string' && BLOCKED_SEGMENTS.has(seg))) return false;

  const domain = key[1];
  if (typeof domain === 'string' && PERSIST_ALLOWED_DOMAINS.has(domain)) return true;
  // tournaments 도메인은 campaigns 세그먼트만 허용 — tournament(id) 상세는 개인화
  // 가능성이 있어 제외한다(§1.3 표의 Tier 2 참고, 아직 미검증).
  if (domain === 'tournaments' && key[2] === 'campaigns') return true;

  return false;
}

export function createV1Persister() {
  return createSyncStoragePersister({
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
    key: PERSIST_STORAGE_KEY,
    throttleTime: 1_000, // 연속 쓰기를 1초로 묶는다 — 목록 스크롤 중 매 페이지 로드마다
    // 동기 localStorage 쓰기가 걸리는 것을 막는다.
  });
}
