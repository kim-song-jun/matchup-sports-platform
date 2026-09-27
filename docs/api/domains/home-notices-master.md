# Domain Contract — Home, Search, Notices, Popups, Master Data

## Source Of Truth Priority

1. `apps/v1_api/src/home/home.controller.ts`, `apps/v1_api/src/notices/notices.controller.ts`,
   `apps/v1_api/src/popups/popups.controller.ts`, `apps/v1_api/src/master/master.controller.ts`,
   `apps/v1_api/src/search/search.controller.ts`, `apps/v1_api/src/health/health.controller.ts`
2. `apps/v1_api/src/admin/admin.controller.ts` (notices/popups/content-assets admin CRUD)
3. `apps/v1_api/src/admin/dto/*.ts`

## Endpoint Matrix

| Method | Path | Auth | Query / Body | Response |
|---|---|---|---|---|
| GET | `/api/v1/health` | public | none | runtime health |
| GET | `/api/v1/master/sports` | public | none | sports and levels |
| GET | `/api/v1/master/regions` | public | none | region tree/list |
| GET | `/api/v1/home` | optional user | `sportId?`, `regionId?` | aggregate with independent popup and notices |
| GET | `/api/v1/home/recommendations` | optional user | `sportId?`, `regionId?`, `limit?` max 20 | recommendation list |
| GET | `/api/v1/popups/active` | public | `screen`, `path?` | `{ popup: active popup or null }` |
| GET | `/api/v1/notices` | public | service-defined list filters | published notice list |
| GET | `/api/v1/notices/:noticeId` | visibility-dependent | path id | notice detail (includes `updatedAt`, used as Article `dateModified`) |
| GET | `/api/v1/search/recent` | optional user | `x-v1-search-session-id` header | recent search history for the user/session |
| POST | `/api/v1/search/recent` | optional user | `x-v1-search-session-id` header + `RecordSearchDto` | records one search term |
| GET | `/api/v1/admin/notices` | active admin | `status?`, `category?`, `audience?`, `q?`, `cursor?`, `limit?` | notice cursor page |
| POST | `/api/v1/admin/notices` | owner/ops | `{ audience, category, title, content, status }` | created notice with content + derived body |
| PATCH | `/api/v1/admin/notices/:noticeId` | owner/ops | same notice payload | updated notice |
| DELETE | `/api/v1/admin/notices/:noticeId` | owner/ops | path id | `{ noticeId, deleted: true }` |
| GET | `/api/v1/admin/popups` | active admin | `status?`, `q?`, `cursor?`, `limit?` | popup cursor page |
| GET | `/api/v1/admin/popups/:popupId` | active admin | path id | popup detail |
| POST | `/api/v1/admin/popups` | owner/ops | `{ audience, title, content, status, targetScreens[], targetPaths[], linkUrl?, linkLabel?, displayStartAt?, displayEndAt? }` | created popup with content + derived body |
| PATCH | `/api/v1/admin/popups/:popupId` | owner/ops | same popup payload | updated popup |
| DELETE | `/api/v1/admin/popups/:popupId` | owner/ops | path id | `{ popupId, deleted: true }` |
| POST | `/api/v1/admin/content-assets` | owner/ops | multipart file (JPEG/PNG/WebP, max 5MB) | temporary managed asset |
| DELETE | `/api/v1/admin/content-assets/:assetId` | owner/ops | temporary asset id | `{ assetId, deleted: true }` |

`GET /api/v1/popups/active?screen={screen}&path={exactPath}`는 활성 exact-path 팝업을 우선하고,
없으면 기존 screen 팝업을 반환한다. `path`는 query/hash 없는 내부 사용자 경로만 허용한다.

## Contract Notes

- `v1_notices`와 `v1_popups`는 독립된 콘텐츠 소스다.
- 공지·팝업 콘텐츠는 정본 Tiptap JSON이다. `body`는 검색·요약·레거시 행을 위해 서버가 파생한 평문 투영이다.
- 허용 콘텐츠: 문단, 2~3단계 헤딩, 불릿/순서 목록, 인용, 구분선, 줄바꿈, 좌/중/우 정렬, 굵게/기울임/밑줄/취소선, 안전한 링크, 관리형 이미지.
- Tiptap이 정렬 없는 문단/헤딩을 `textAlign=null`로 직렬화할 수 있다 — API는 이를 기본 정렬로 취급하고 저장 전 속성을 제거한다. 다른 정렬 값은 그대로면 무효다.
- Tiptap Image 3.28은 `title`/`width`/`height`를 `null`로 직렬화할 수 있다 — 이 기본 전송 속성은 저장 전 제거되며, non-null 크기와 알 수 없는 이미지 속성은 여전히 무효다.
- 빈 문단/헤딩 노드는 `content`를 생략할 수 있고 빈 배열로 정규화된다. Tiptap Link의 기본 target/rel/class/title 전송 속성은 제거되고, 커스텀 링크 표시 속성은 여전히 무효다.
- Raw HTML, 알 수 없는 노드/속성, 안전하지 않은 링크, base64/외부 이미지, alt 텍스트 없는 이미지, 서버 한도 초과 콘텐츠는 `400 INVALID_RICH_CONTENT`.
- 관리형 이미지는 같은 관리자가 업로드한 임시 asset을 참조해야 한다. 저장하면 그 공지/팝업이 소유권을 갖고, 참조를 제거하면 미참조 asset 레코드와 파일이 삭제된다.
- 에디터에서 명시적으로 취소/전환하면 그 세션에서 올린 임시 asset을 삭제한다. 브라우저·탭이 정리 전에 종료되면 API가 24시간 뒤 시작 시점 + 매시간 sweep으로 여전히 미부착인 임시 asset을 제거한다.
- Stale cleanup은 레코드와 저장 파일을 지우기 전에 임시 상태·나이·공지/팝업 소유권 부재를 원자적으로 검증한다 — 동시에 소유권이 생긴 asset은 삭제하지 않는다.
- Admin mutation DTO가 받는 공지 카테고리는 `안내 | 업데이트`다. `pinned`는 공지 필드가 아니다.
- 팝업 상태 라벨은 UI 전용 매핑이다: `published`=공개, `archived`=비공개, `draft`=초안.
- 팝업 노출 종료는 시작보다 늦어야 한다. 잘못된 범위는 `400 INVALID_DISPLAY_WINDOW`.
- 팝업 타깃 화면은 `home, matches, team_matches, teams, tournaments, lessons, marketplace, mercenary, venues, community, chat, notifications, profile, my`다. 최소 1개 필수.
- 팝업 링크는 root-relative 내부 경로 또는 HTTPS URL만 허용한다. URL 없는 label, 안전하지 않은 scheme은 `400 INVALID_POPUP_LINK`.
- 활성 팝업 조회는 요청 화면을 타깃하는 published + public 팝업 중 가장 최근 것을, 선택적 시작이 지금 이전이고 선택적 종료가 지금 이후인 것만 선택한다.
- 홈 팝업은 하위호환을 위해 `screen=home`으로 같은 조회를 쓴다.
- 홈 공지는 최근 published + public 공지를 담으며 팝업 콘텐츠는 함께 제공하지 않는다.
- 팝업 삭제는 `popup.delete`, 공지 삭제는 `notice.delete` 감사 이벤트를 남긴다.
- 마스터 데이터(`master/sports`, `master/regions`)는 v1 사용자 API에서 read-only다.

## 통합 검색은 아직 없다

`GET /api/v1/search`(unified search)는 컨트롤러가 없다 — 검색 화면은 도메인별 목록 API를 직접
호출하거나 mock 상태로 남아 있어야 한다. 실제로 존재하는 `search.controller.ts`는 **다른 기능**인
"최근 검색어" 기록(`GET/POST /search/recent`, `x-v1-search-session-id` 헤더로 비로그인 세션도 추적)
이며, 통합 검색 결과 자체를 반환하지 않는다.

## Primary Tables

- `v1_sports`
- `v1_sport_levels`
- `v1_regions`
- `v1_notices`
- `v1_popups`
- `v1_content_assets`
- `v1_matches`
- `v1_teams`
- `v1_team_matches`
- `v1_notifications`
