# 11. Fix Production Frontend Image Fallbacks

## Context

- 2026-04-08 실서버 프론트엔드 검수에서 `/home`, `/matches`, `/lessons`, `/teams`에 깨진 썸네일이 반복 노출되었다.
- 현재 이미지 helper는 API가 준 원격 URL을 우선 반환하지만, 카드/상세 화면은 런타임 `onError` fallback 없이 raw `<img>`를 렌더링한다.
- FAQ 라우트는 route metadata와 루트 title template가 중복 적용되어 브라우저 타이틀이 `자주 묻는 질문 | TeamMeet | TeamMeet`로 노출된다.

## Goal

다음 두 가지를 같은 변경에서 정리한다.

1. `runtime-image-fallback-hardening`
2. `faq-metadata-dedup`

## Original Conditions

- 사용자-facing 카드/상세 이미지 슬롯은 업로드/원격 URL 실패 시에도 깨진 이미지 아이콘을 노출하면 안 된다.
- 런타임 fallback은 기존 로컬 mock catalog를 재사용해야 한다.
- helper가 remote URL을 반환하더라도 렌더 단계에서 fallback resilience가 있어야 한다.
- FAQ 메타데이터는 루트 title template와 충돌하지 않아야 한다.

## User Scenarios

- 사용자는 홈, 매치, 강좌, 팀, 장터 목록에서 원격 이미지가 깨져도 로컬 mock 이미지로 자연스럽게 대체된 카드를 본다.
- 사용자는 매치/강좌/팀/장터 상세에서 hero, gallery, logo, venue preview가 깨진 상태로 남지 않는다.
- 사용자는 FAQ 페이지 탭 타이틀에서 브랜드명이 중복되지 않은 정상 타이틀을 본다.

## Test Scenarios

1. `/home` 팀 로고, 장터 카드, 추천 매치 이미지가 remote failure 시 로컬 mock으로 대체된다.
2. `/matches`, `/lessons`, `/teams`, `/marketplace` 목록 카드 이미지가 broken icon 없이 유지된다.
3. `/matches/[id]`, `/lessons/[id]`, `/teams/[id]`, `/marketplace/[id]` hero/gallery 이미지가 fallback을 가진다.
4. `/faq` 브라우저 타이틀이 `자주 묻는 질문 | TeamMeet` 한 번만 표시된다.
5. 신규 공통 이미지 컴포넌트 도입 후 `pnpm --filter web exec tsc --noEmit`가 통과한다.

## Parallel Work Breakdown

### Frontend

- 공통 `SafeImage` 도입
- 카드/상세 페이지 raw `<img>`를 runtime fallback 지원 컴포넌트로 교체
- FAQ metadata title 수정

### Docs

- AGENTS / workflow에 runtime image fallback 규칙 추가

## Acceptance Criteria

- Given API가 만료되었거나 깨진 원격 이미지 URL을 반환하면
  When 사용자가 목록/상세 화면을 연다
  Then 깨진 이미지 아이콘 대신 로컬 mock 이미지가 즉시 렌더링된다

- Given FAQ 페이지를 연다
  When 브라우저 타이틀이 생성된다
  Then 브랜드명이 한 번만 포함된다

## Tech Debt Resolved

- helper return 값만 신뢰하고 렌더 단계 fallback이 없던 카드/상세 이미지 패턴
- route metadata와 root title template 중복 결합

## Security Notes

- 이미지 fallback은 기존 public mock asset만 사용하며 신규 외부 origin 의존을 추가하지 않는다.
- 원격 URL 실패를 숨기더라도 auth, permission, API payload에는 영향을 주지 않는다.

## Risks

- 일부 상세 페이지는 gallery index별 fallback 매핑을 새로 갖게 되므로 디자인 QA가 필요하다.
- 클라이언트 이미지 wrapper 도입으로 SSR/CSR hydration에 영향이 없는지 타입 검증이 필요하다.

## Ambiguity Log

- 2026-04-08: 원격 이미지 실패는 API 단계에서 사전 검증할 수도 있지만, 이번 범위는 사용자 노출 방지에 필요한 렌더 단계 resilience까지로 제한한다.
