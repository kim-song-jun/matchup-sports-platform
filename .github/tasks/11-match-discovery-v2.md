# Match Discovery 2.0

## Context

- `/home`의 종목 더보기는 `/matches?sport=...`를 보내고 있었지만 `/matches`가 URL query를 읽지 않아 탐색 맥락이 끊겼다.
- `/matches`의 검색/필터 대부분이 로컬 UI 상태에 머물러 새로고침, deep link, 다중 탭 재현성이 약했다.
- 백엔드 `GET /matches`는 discovery 용도로 필요한 `q`, quick filter, 정렬 계약이 충분하지 않았다.

## Goal

- `/matches`를 URL 기반 discovery surface로 만든다.
- 홈 deep link, quick filter, advanced filter, reload persistence를 실제 제품 동작으로 고정한다.
- 프론트와 백엔드 query contract를 테스트 가능한 형태로 정리한다.

## Original Conditions

- 프론트: 종목 칩/검색 UI는 있었지만 URL sync가 없거나 부분적이었다.
- 백엔드: `sportType`, `city`, `date`, `level`, 일부 sort만 지원했다.
- E2E: match create/join은 있었지만 discovery persistence smoke는 없었다.

## User Scenarios

1. 홈에서 특정 종목을 보고 있다가 더보기를 누르면 `/matches?sport=...`로 이동하고 같은 종목이 활성화된다.
2. 사용자가 `/matches`에서 검색어, 지역, 무료, 자리 있음, 정렬을 조합하면 URL이 같은 상태를 재현한다.
3. 사용자가 새로고침해도 필터 UI와 결과 맥락이 유지된다.
4. 사용자가 필터를 빠르게 연속 조작해도 앞선 선택이 뒤 액션에서 유실되지 않는다.

## Test Scenarios

- helper unit: query parse/build/count/date helper
- hook unit: `useMatches` query param passthrough
- backend unit: `MatchesService.findAll` filter/sort branch
- Playwright: sport deep link, advanced filter URL sync, reload persistence, `/home -> /matches?sport=...`

## Parallel Work Breakdown

- frontend: discovery helper, `/matches` URL sync, quick/advanced filter UX
- backend: DTO/query contract와 `findAll` filter/sort 확장
- qa: discovery-specific Playwright smoke 추가

## Acceptance Criteria

- Given `/home`에서 풋살 카드 섹션을 보고 있을 때
  When 더보기를 누르면
  Then `/matches?sport=futsal`로 이동하고 풋살 칩이 활성화된다.

- Given `/matches`에서 지역/무료/정렬 필터를 조합했을 때
  When 페이지를 새로고침하면
  Then URL, 입력값, 활성 칩 상태가 유지된다.

- Given 사용자가 필터를 빠르게 연속 조작할 때
  When `router.replace`가 비동기로 반영되면
  Then stale query overwrite 없이 마지막 의도 상태가 유지된다.

## Tech Debt Resolved

- query-sync 화면에서 stale `searchParams` snapshot에 다음 필터를 병합하던 패턴을 `pendingFiltersRef` 기반 merge로 교체했다.

## Security Notes

- 이번 작업은 공개 목록 query 확장만 다루며 권한/토큰/개인화 추천 로직은 건드리지 않는다.

## Risks

- personalized recommendation, why-recommended badge, GPS distance filter는 아직 후속 범위다.
- `deadline` 정렬은 현재 discovery 우선순위용 근사 정렬이며 개인화 랭킹은 아니다.

## Ambiguity Log

- saved search와 recommendation reason은 이번 라운드에서 제외했다.
