# Task 20261070: 매치·대회·리그 장소 검색 선택 + 지도·길찾기

Status: In Progress
**Owner**: Claude(오케스트레이터) → sonnet 구현 레인
**Created**: 2026-10-10

## Context

카카오맵·네이버맵 등으로 장소 정보를 "올바르게" 보여 주려 했지만 alpha·운영 어디에도 지도가 뜨지 않았다.
2026-10-10 실측 원인:

1. 카카오 JS·REST 키가 alpha·운영 모두 미설정 — `/public/integrations/kakao-maps-key` 가 null, 대회 46개 좌표 0.
2. nginx CSP `script-src` 에 카카오 지도 SDK 도메인이 없어 키를 넣어도 지도 SDK 가 막힌다.
3. 좌표 칸이 대회(`V1Tournament.latitude/longitude`)뿐 — 개인 매치·팀매치·리그/대회 경기는 글자만 있다.
4. 대회 저장 때 서버가 장소 글자로 카카오 검색 첫 결과를 그대로 저장한다(`KakaoGeocodingService`) — 사람이 확인하지 않는 추측.
5. 좌표가 없으면 지도뿐 아니라 길찾기 버튼까지 숨는다.

결정(사용자, 결정 HTML 에서 6건 모두 추천안 A):

| # | 결정 |
|---|---|
| D1 | 카카오 지도 임베드 + 카카오맵·네이버맵·티맵 길찾기 앱 버튼 |
| D2 | 카카오 장소 검색으로 고르기 + "이름만 직접 입력" 탈출구(지도 없음). 서버 추측 저장 폐지 |
| D3 | 상세는 공용 장소 카드: 지도 미리보기(비대화형) + 앱 3버튼 펼침 + 주소 복사 |
| D4 | 대회·리그는 기본 장소(대회 `venue`) 1곳, 새 경기가 상속, 경기별 변경 가능 |
| D5 | 각 행에 장소 스냅샷 칸 추가(공용 구장 테이블 아님) — expand 전용 |
| D6 | 기존 데이터 백필 없음. 좌표 없으면 지도 앱 "이름 검색" 버튼으로 폴백 |
| D10 | (2026-10-11 후속) 모든 지도 미리보기 높이 = 폭의 절반, 160~240px. 상세 160 고정·고르기 120/240 고정(MD-QA #74)을 대체 |

## Goal

alpha 에서 매치·팀매치·대회·리그를 만들 때 장소를 검색해 고르고, 모든 상세 화면에서 그 위치가 지도와 길찾기 버튼으로 보인다.

## Original Conditions (must all be satisfied)

- [ ] 카카오맵·네이버맵 등으로 대회·장소 정보를 "올바르게" 추가할 수 있다(추측 저장 없음)
- [ ] alpha 먼저 반영한다(main 승격은 사용자 전용)
- [ ] UI/UX 목업을 먼저 보고 결정한다 — 완료(결정 HTML, D1~D6 = A)
- [ ] 매치 / 대회 / 리그 전부에 들어간다
- [ ] 카카오 콘솔은 사용자가 ego 에서 로그인만 하고 키 확인·도메인 등록·카카오맵 ON·alpha 어드민 키 입력은 Claude 가 한다

## 계약 (모든 레인 공통 — 바꾸려면 오케스트레이터에게 BLOCKED 보고)

### DB (`20261010090000_v1_place_snapshots`, 칸 추가만)

- `v1_matches`·`v1_team_matches`: `place_latitude`, `place_longitude`(double), `place_provider`, `place_provider_id`(text)
  → Prisma `placeLatitude`, `placeLongitude`, `placeProvider`, `placeProviderId`. 주소는 기존 `placeAddress` 에 도로명(없으면 지번)을 담는다.
- `v1_tournaments`: `venue_address`, `venue_provider`, `venue_provider_id` → `venueAddress`, `venueProvider`, `venueProviderId`. 좌표는 기존 `latitude`/`longitude`.

### 검증 규칙의 단일 출처 — `apps/v1_api/src/places/place-snapshot.ts`

- `resolvePlaceSnapshot()` — 이름이 비면 null, provider·id·위도·경도는 넷 다 있거나 넷 다 없어야 한다(아니면 400 `PLACE_SNAPSHOT_INCOMPLETE`).
- `toPlaceColumns()` / `toPlaceView()` 와 DTO 데코레이터 `IsPlaceLatitude` 등. 도메인 코드에서 규칙을 다시 쓰지 않는다.
- **수정(PATCH) 규칙**: 이름 필드가 요청에 있으면 스냅샷 전체를 교체한다(좌표가 안 오면 null 로 지운다 — 새 이름에 옛 핀이 남지 않게).

### API

| 도메인 | 입력(기존 + 추가) | 응답 |
|---|---|---|
| 개인 매치·팀매치(사용자·어드민 모집) | `manualPlaceName`, `addressText` + `placeLatitude`, `placeLongitude`, `placeProvider`, `placeProviderId` | `place: V1PlaceView \| null` (`addressText` 키는 `address` 로 바뀐다), 수정 폼 프리필에 같은 4필드, 최근 장소 항목에 좌표·provider 포함 |
| 리그 경기(생성·재생성·수동·템플릿·수정) | `placeName`(+`placeAddress`) + 같은 4필드. **`placeName` 이 비면 리그(대회) 기본 장소 스냅샷 상속**, 기본 장소도 없으면 '장소 미정' | 기존 `placeName` 유지 + `place: V1PlaceView \| null`. 어드민 `recentVenues` 는 `V1PlaceView[]` |
| 대회 경기(대진) | 어드민 대진 경기 `venue` + `venueAddress`, `venueLatitude`, `venueLongitude`, `venueProvider`, `venueProviderId`. 대진 생성 시 대회 기본 장소 스냅샷 복사 | 경기 응답에 `place: V1PlaceView \| null` 추가 |
| 대회·리그(어드민 생성·수정) | `venue` + `venueAddress`, `venueLatitude`, `venueLongitude`, `venueProvider`, `venueProviderId`. 서버 추측 지오코딩 제거 | 기존 `venue`·`latitude`·`longitude` + `venueAddress`, `venueProvider`, `venueProviderId` |
| 장소 검색(신규) | `GET /places/search?query=&page=` — `V1AuthGuard`, 분당 30회 | `{ items: V1PlaceSearchItem[], hasMore }`. 키 없음 503 `PLACE_SEARCH_UNAVAILABLE`, 카카오 실패 502 `PLACE_SEARCH_FAILED` |

`V1PlaceView = { name, address, latitude, longitude, provider: 'kakao' \| null, providerPlaceId }`
`V1PlaceSearchItem = { provider: 'kakao', providerPlaceId, name, address, jibunAddress, category, latitude, longitude }`

### 웹 공용 부품

- `components/v1-ui/place-picker.tsx` — 검색 콤보박스(디바운스) → 결과 → 고른 장소 카드 + 미니 지도 + "바꾸기", "이름만 직접 입력", 최근 장소 칩, 검색 불가 시 안내 + 직접 입력.
- `components/v1-ui/place-card.tsx` — 이름·주소·주소 복사·지도 미리보기·카카오맵/네이버맵/티맵 3버튼. 좌표가 없으면 지도 없이 앱 "이름 검색" 링크(D6).
- `components/v1-ui/kakao-map-preview.tsx` — 기존 `tournament-venue-map.tsx` 를 옮겨 화면에 들어올 때 로드, 드래그·확대 끔, 실패 시 칸을 접는다.
- `lib/place.ts` — 폼 값 타입, 응답→폼 값 변환, 길찾기 링크(기존 `getVenueNavigationLinks` 이전·확장).

## User Scenarios

1. 팀장이 팀매치를 만들며 "망원 풋살"을 검색해 한 곳을 고른다 → 상세에서 팀원이 지도와 카카오맵 버튼을 본다.
2. 어드민이 리그를 만들며 기본 장소를 고르고 일정을 자동 생성한다 → 모든 경기에 같은 장소가 들어간다. 3주차만 다른 구장으로 바꾸면 그 경기 상세에 "이 경기만 장소가 달라요".
3. 검색에 없는 동네 운동장 → "이름만 직접 입력" → 상세엔 이름과 지도 앱 이름 검색 버튼만.
4. 좌표 없는 기존 대회 상세 → 지도 없이 이름 검색 버튼(빈칸·깨짐 없음).

## Test Scenarios

- happy: 고른 장소가 4필드 그대로 저장·응답 / 리그 생성이 기본 장소 상속 / 대진 생성이 대회 장소 복사 / 검색 결과 매핑
- edge: 이름만 바꾼 PATCH 가 좌표를 지운다 / 기본 장소 없는 리그는 '장소 미정' / 최근 장소 칩이 좌표까지 복원 / 좌표 없는 카드 폴백
- error: 부분 핀 400 / 검색 키 없음 503 → UI 안내 + 직접 입력 / 카카오 실패 502 / 지도 SDK 실패 시 카드에서 지도 칸만 접힘
- mock updates: API 스펙 fixture·`test/fixtures`, 웹 MSW `fixtures.ts`·`handlers.ts`(`/places/search` 추가), 관련 컴포넌트 테스트 fixture

## Parallel Work Breakdown

- 순차(오케스트레이터): CSP 9곳, 스키마·마이그레이션, `place-snapshot.ts`, 이 문서
- 병렬 1: BE-A 매치·팀매치·어드민 모집 / BE-B 대회·리그·대진·장소 검색·지오코딩 제거 / FE-A 타입·훅·MSW·공용 부품
- 병렬 2(FE-A 뒤): FE-B 매치·팀매치 폼+상세·어드민 팀매치 / FE-C 대회·리그 어드민 폼·일정 모달·대진 패널·대회/리그/경기 상세
- 운영: 카카오 콘솔(키·도메인·카카오맵 ON) → alpha 어드민 키 입력 → 머지 → alpha ego E2E + 3폭 갤러리

## Acceptance Criteria

- [ ] UI 는 결정 HTML 3안 제시 → 선택(D1~D6=A) 단계를 거쳤다
- [ ] 위 계약대로 API·웹이 동작하고 `tsc`·영향 테스트·lint 가 녹색
- [ ] alpha 에서 시나리오 1~4 를 ego 로 실제 클릭해 확인, 390/768/1440 + 다크 갤러리를 PR 에 게시
- [ ] 지도 키를 비워도 카드가 깨지지 않는다

## Tech Debt Resolved

- `KakaoGeocodingService`(첫 결과 추측 저장) 삭제, 어드민 안내문 "서버에서 지도 좌표를 찾아 저장해요" 제거
- 위로 펼치는 길찾기 팝오버(`tournament-venue-navigation-button.tsx`, 390 에서 위로 잘림) 제거 → 공용 3버튼
- 대회 전용 지도 코드를 공용 부품으로 이동(대회·매치가 각자 갖지 않게)

## Security Notes

- REST 키는 서버에만 둔다(검색은 서버 프록시). JS 키는 도메인 제한 키라 공개 API 로 내려도 된다(기존).
- 장소 검색은 로그인 필수 + 분당 30회 제한 — 카카오 쿼터 소진 방어.
- 클라이언트가 보낸 좌표는 범위 검증만 한다. 엉뚱한 좌표는 엉뚱한 장소 글자와 같은 수준의 위험(호스트가 쓰는 정보).
- CSP `script-src` 에 카카오 세 도메인을 둔다 — **셋 다 빼지 말 것**: `dapi.kakao.com`(SDK 로더), `t1.kakaocdn.net`(로더가 받는 지도 본체
  `mapjsapi/js/main/<버전>/kakao.js` — 이게 빠지면 지도가 회색 상자만 남는다, #1767 alpha QA), `t1.daumcdn.net`(본체가 가리키는 로드뷰 자원 경로,
  지금은 쓰지 않지만 SDK 가 같은 CDN 계열로 옮겨 다닌다). 지도 타일·요청은 기존 `img-src https:`·`connect-src https:` 로 충분.

## Risks & Dependencies

- 카카오 콘솔 설정(도메인·카카오맵 ON)이 빠지면 지도 빈칸·검색 `OPEN_MAP_AND_LOCAL` 오류 → 운영 반영 때 운영 도메인·키도 필요
- 카카오 지도는 다크 지도가 없다(다크 화면에서 지도만 밝음 — 알려진 한계)
- 리그 생성기 payload 해시가 `venue: null` 을 포함 — 상속으로 바꿀 때 멱등 재생 의미를 깨지 않는지 BE-B 가 확인

## Ambiguity Log

- (2026-10-10) 매치 응답 `place.addressText` → `address` 로 통일(도메인마다 다른 이름을 남기지 않음). 웹 소비처는 같은 PR 에서 고친다.
- (2026-10-10) 리그 어드민에는 장소를 정하는 곳이 없었다(공개 리그의 장소는 시드 값). D4 를 위해
  `PATCH /admin/league-matches/:leagueId/venue` 와 어드민 상세 `defaultPlace` 를 추가한다. 기본 장소를 바꿔도 이미 만든 경기는 그대로다.
- (2026-10-10) 사용자 생성·수정에서 빈 장소 이름은 서버도 400 `VALIDATION_FAILED`(`manualPlaceName`) — 웹 폼은 이미 필수였다.
- (2026-10-10, #1762 머지 후 alpha QA) 지도 SDK 본체가 `t1.kakaocdn.net` 에서 와서 CSP 에 추가(#1767). 지도 키 조회가 브라우저 캐시 저장 대상이라
  지도 미리보기는 마운트 뒤에만 그린다(서버 렌더 대회 페이지 React #418).
- (2026-10-10) 리그 생성기 멱등 해시는 `venue: null` 그대로 두고, 저장 값만 리그 기본 장소 스냅샷으로 바꾼다(재시도가 payload 불일치로 실패하지 않게).
- (2026-10-11) alpha 실측에서 상세 지도가 768·1440 에서 526×160·566×160(3.3~3.5:1) 띠였고, PC 에선 고르기 지도(406×240)가
  상세(566×160)보다 컸다. D10 으로 한 규칙(2:1, 160~240)에 묶고, SDK 는 상자 크기 변화를 모르므로 ResizeObserver 로 relayout 한다.
