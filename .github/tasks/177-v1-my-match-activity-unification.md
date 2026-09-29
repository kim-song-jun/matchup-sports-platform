# Task 177 — 마이페이지 개인·팀 매치 활동 통합

## Context

`/my`의 `신청·참여 매치`와 `생성한 매치`는 `GET /me/matches`만 사용해 개인매치만 노출한다. 팀매치는 `GET /me/team-matches` 계약이 있지만 현재 v1 마이페이지 목록에 연결되지 않았다.

## Goal

기존 두 행동 축을 유지하면서 개인매치와 팀매치를 한 목록에서 확인하고, `전체 / 개인 매치 / 팀 매치`로 좁혀 볼 수 있게 한다.

## Original Conditions

- [x] `신청·참여 매치` 기본 화면에 개인 신청·참여와 소속 팀의 신청 팀매치가 함께 보인다.
- [x] `생성한 매치` 기본 화면에 개인매치와 사용자가 직접 생성한 팀매치가 함께 보인다.
- [x] 일반 팀원은 호스트팀 소속이라는 이유만으로 팀매치를 자신이 만든 것으로 보지 않는다.
- [x] 개인/팀 필터와 각 도메인의 상세·관리·리뷰 경로가 실제 계약에 연결된다.
- [x] 한 도메인 조회만 실패하면 나머지 목록을 유지하되 부분 실패를 명시한다.
- [x] 변경은 `dev`에만 반영하고 `main`에는 올리지 않는다.

## User Scenarios

1. 사용자가 `신청·참여 매치`에 들어가면 개인매치와 우리 팀이 신청한 팀매치를 시간순으로 확인한다.
2. 사용자가 `생성한 매치`에 들어가면 본인이 만든 개인매치와 팀매치를 함께 확인한다.
3. 사용자가 `팀 매치` 필터를 선택하면 URL에 선택이 남고 팀매치만 표시된다.
4. 팀매치 생성 후 팀 권한이 사라진 사용자는 이력을 볼 수 있지만 관리 CTA는 보지 않는다.

## Test Scenarios

### Happy

- 개인·팀 응답을 공통 카드로 정규화하고 유형 배지, 관계 상태, 팀 이름을 표시한다.
- `created` 팀매치 조회가 `createdByUserId`를 사용한다.
- 팀매치 완료 항목은 실제 `team_match` 리뷰 경로를 사용한다.

### Edge

- 개인/팀 ID가 같아도 서로 다른 카드로 유지한다.
- 한 목록만 비어 있어도 `전체`가 비어 있다고 표시하지 않는다.
- 팀 권한이 없는 생성자는 상세만 볼 수 있다.

### Error

- 두 조회가 모두 실패하면 전체 오류와 재시도를 표시한다.
- 하나만 실패하면 성공한 목록과 부분 오류 경고를 함께 표시한다.

### Mock Updates

- `my-matches-client.test.tsx`의 훅 mock에 팀매치 무한 조회를 추가한다.
- 팀매치 서비스 단위 테스트에 `scope=created`와 관리 권한 회귀를 추가한다.

## Parallel Work Breakdown

단일 작업자가 아래 순서로 수행한다.

1. Backend contract: DTO, service, unit test, API docs
2. Frontend data: API type, infinite hook, client normalization
3. Frontend UI: 유형 필터, 카드 배지/CTA, empty/error 상태
4. Validation: narrow tests, type check/build gate, browser visual QA

## Acceptance Criteria

- [x] `전체 / 개인 매치 / 팀 매치` 필터가 두 모드에서 동작한다.
- [x] 개인·팀 카드가 올바른 상세 경로와 `from` 경로를 가진다.
- [x] 팀매치 생성 목록은 `createdByUserId = current user`만 포함한다.
- [x] 관리 권한이 없는 팀원/과거 생성자에게 관리 링크를 노출하지 않는다.
- [x] 개인·팀 소스의 로딩, 전체 실패, 부분 실패, 더 보기 상태가 정직하게 표시된다.
- [x] 관련 API·프론트 테스트와 타입 검증이 통과한다.
- [x] 모바일 390, 태블릿 768, 데스크톱 1440에서 레이아웃과 console/network를 확인한다.

## Tech Debt Resolved

- 팀매치 호스트팀의 일반 멤버에게 `manageRoute`가 내려가던 권한 불일치를 제거한다.
- 마이페이지 메뉴 설명을 개인매치 전용 문구에서 개인·팀 공통 문구로 바꾼다.

## Security Notes

- 팀매치 관리 권한은 기존 owner/manager 서비스 가드를 우회하지 않는다.
- 목록이 관리 경로를 내려줘도 서버 권한 검사는 그대로 유지한다.

## Risks & Dependencies

- 개인·팀 API는 독립 cursor를 사용한다. `전체`의 더 보기는 두 소스의 다음 페이지를 함께 요청하고, 현재까지 로드한 항목을 시간순으로 정렬한다.
- 팀매치 `applied`는 사용자의 현재 active 팀이 신청한 경기 관계다. 실제 개인 출전 확정과 동일한 의미로 표시하지 않고 `우리 팀 신청/확정`으로 표현한다.

## Ambiguity Log

- 팀 소속 관계와 개인 출전 관계는 같은 의미가 아니다. 이번 범위에서는 팀 목록을 `우리 팀 신청/확정`으로 정직하게 표시하고, 라인업/공식 결과 기반 개인 출전 여부는 별도 확장으로 남긴다.

## Progress Snapshot

- 2026-09-29: 최신 `origin/dev` (`18b2456a8`)에서 별도 작업 트리와 `feat/v1-my-match-activity-unification` 브랜치를 만들었다.
- 2026-09-29: 개인·팀 무한 목록을 통합하고 유형 필터, 관계 라벨, 권한 기반 관리 CTA, 부분 실패 상태를 구현했다.
- 2026-09-29: `scope=created`를 실제 `createdByUserId` 기준으로 추가하고 현재 owner/manager에게만 유효한 관리 경로를 내려주도록 고쳤다.
- 2026-09-29: API 서비스 테스트 69개, 마이페이지 집중 테스트 20개, 양쪽 TypeScript 및 production build가 통과했다.
- 2026-09-29: headed Chrome에서 390/768/1440 레이아웃, 전체/팀 필터, 생성 팀매치 관리 링크, overflow, console/network를 확인했고 이슈 0건이었다. 증거는 `output/playwright/visual-audit/task177-my-match-activity/`에 남겼다.
- 2026-09-29: `v1-surface-check`와 `v1-pattern-check`는 Windows `cmd`에서 Unix `find`/`grep`를 찾지 못하는 기존 runner 호환성 때문에 실행 단계가 실패했다. 두 패키지 `tsc --noEmit`은 독립 실행으로 통과했다.
