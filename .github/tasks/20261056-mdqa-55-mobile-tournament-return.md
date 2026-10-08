# Task 20261056: MD-QA #55 모바일 대회 목록 더 보기 복원

Status: Review
**Owner**: Codex
**Created**: 2026-10-08

## Context

모바일 `/tournaments`에서 `더 보기`로 두 페이지 이상 불러온 뒤 대회 상세에 들어갔다가 돌아오면 컴포넌트 로컬 상태가 초기화되어 첫 20개만 남는다. 데스크톱 page URL 복귀는 #42에서 해결됐지만 모바일 cursor 누적 상태는 범위 밖이었다.

## Goal

모바일 대회 목록의 마지막 성공 cursor와 누적 카드를 상세 왕복 동안 복원하고, 필터 변경이나 캐시 무효화 때는 안전하게 첫 페이지부터 시작한다.

## Original Conditions (must all be satisfied)

- [x] 모바일에서 `더 보기`로 불러온 카드가 상세 복귀 후 첫 페이지로 초기화되지 않는다.
- [x] 상세 상단 뒤로가기와 브라우저 Back을 모두 지원한다.
- [x] 기존 데스크톱 page URL 동작은 유지한다.
- [x] 수정 후 PR을 생성한다.

## User Scenarios

### Scenario 1: 모바일 상세 왕복

As a 대회 탐색 사용자, I want to 상세를 확인한 뒤 같은 누적 목록으로 돌아가 so that 다시 `더 보기`를 반복하지 않는다.

Steps:
1. 모바일 대회 목록에서 40개까지 불러온다.
2. 대회 상세에 들어간다.
3. 화면의 뒤로가기 또는 브라우저 Back으로 돌아온다.

Expected result: 기존 40개가 즉시 보이고 다음 페이지를 계속 불러올 수 있다.

## Test Scenarios

### Happy path
- [x] 실제 API 훅·QueryClient를 사용하는 통합 테스트에서 20 → 40 → 상세 → 40 → 45를 검증한다.
- [x] 상단 뒤로가기와 브라우저 Back을 각각 검증한다.

### Edge cases
- [x] 저장된 현재 cursor 페이지가 invalidated/GC 되면 누적 snapshot을 버린다.
- [x] 필터 키가 바뀌면 이전 cursor와 카드가 새 조회에 섞이지 않는다.
- [x] pending placeholder와 실패 응답은 성공 snapshot으로 저장하지 않는다.

### Error paths
- [x] 저장된 pagination snapshot이 없거나 유효하지 않으면 첫 페이지로 안전하게 시작한다.

### Mock data updates needed
- [x] `tournaments-list-return.test.tsx`에 45개 cursor 응답 fixture를 추가한다.
- [x] API/DB schema 변경이 없어 backend fixture와 migration은 불필요하다.

## Parallel Work Breakdown

### Frontend
- [x] 모바일 pagination snapshot을 React Query 메모리 캐시에 보관한다.
- [x] 기존 실제 목록·상세 복귀 테스트를 확장한다.

### Sequential
- [x] 관련 테스트·타입 검사와 diff 검증
- [ ] PR 생성 및 CI 확인
- [ ] 머지 후 Alpha 모바일 실측

## Acceptance Criteria

- [x] Original conditions 전부 충족
- [x] RED(복귀 후 20개) → GREEN(복귀 후 40개) 증거 확보
- [x] 관련 테스트와 타입 검사 통과
- [x] 범위 내 tech debt marker·diff·tracked import 검증
- [x] 데이터가 localStorage에 남지 않고 계정 전환용 QueryClient clear 계약을 따른다.
- [x] Code review: Critical=0, Warning=0

## Tech Debt Resolved

- 모바일 대회 목록만 상세 왕복 시 커서 누적 상태를 잃던 목록 간 동작 불일치를 제거한다.
- 팀매치 목록에만 있던 복원 로직을 대회 목록에 복사하는 대신 공용 훅(`hooks/use-cursor-pagination.ts`)으로 모아 매치·팀매치·대회 세 목록이 함께 쓴다. 같은 결함이 남아 있던 개인매치 목록도 이 훅으로 해소한다.

## Security Notes

- 누적 목록은 기존 QueryClient 메모리에만 저장하며 영구 브라우저 저장소에는 기록하지 않는다.
- 실제 현재 cursor 페이지 캐시가 성공·유효한 경우에만 snapshot을 복원한다.

## Risks & Dependencies

- 브라우저 탭 새로고침까지 상태를 영구 보존하는 기능은 범위 밖이다.
- 머지 전 Alpha에는 변경이 없으므로 실제 배포 검증은 PR 머지 후 수행한다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-08 | Codex | URL에 cursor를 노출할지 여부 | 서버 cursor를 공유 URL로 고정하지 않고 기존 팀매치와 같은 유효 캐시 기반 복원을 사용한다. |

## Progress Snapshot

- Tracker: https://teameet.jmandu.kr/issues/55/
- Branch: `codex/fix-mobile-tournament-list-return`
- RED: 상세 복귀 후 기대 40개, 실제 20개.
- GREEN: 상단 뒤로가기·브라우저 Back 각각 20 → 40 → 상세 → 40 → 45 통과.
- Validation: 대회 paging/return 36/36, `tsc --noEmit`, v1 pattern gate, `git diff --check` 통과.
- Manual Alpha: 머지 전 배포에는 변경이 없어 PR 머지 후 모바일 실측 예정.
