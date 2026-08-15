# Task 143 — Admin individual awards editor

## Scope

- Target: backend + frontend + docs
- Route: `apps/v1_web/src/app/admin/tournaments/[id]`
- Table: `v1_tournament_awards`

## Problem

개인 어워드 관리 화면이 저장 여부와 무관하게 기본 4개 행을 항상 생성한다. 필요한 어워드만 관리하기 어렵고, 어워드 아이콘도 `awardType`에 따라 프론트에서 고정되어 관리자가 선택할 수 없다.

## Acceptance Criteria

- [x] 저장되지 않은 기본 4개 어워드 행을 자동 생성하지 않는다.
- [x] 기존에 저장된 어워드는 종류와 무관하게 그대로 불러온다.
- [x] 빈 상태에서 필요한 항목을 추가하라는 안내를 제공한다.
- [x] 작성 중인 행의 어워드명 또는 수상자가 비어 있으면 저장 전에 안내한다.
- [x] 저장 실패 시 API가 반환한 실제 오류 메시지를 표시한다.
- [x] 각 어워드에서 아이콘을 선택하고 DB에 저장할 수 있다.
- [x] 공개 시상 화면은 저장된 아이콘을 표시하며, 기존 데이터는 종전 `awardType` 아이콘을 유지한다.
- [x] 변경 범위의 자동 검증과 diff 검사를 통과한다.

## Security and compatibility

- DTO는 허용된 9개 아이콘 키만 받는다.
- 기존 admin mutation 권한과 로스터 검증은 그대로 유지한다.
- nullable 컬럼으로 추가해 기존 행과 롤링 배포 호환성을 유지한다.

## Progress Snapshot

- `v1_tournament_awards.icon_key` nullable 컬럼과 migration을 추가했다.
- 기본 4행 강제 병합을 제거하고 아이콘 선택 UI를 추가했다.
- API awards service 테스트 33/33, Web 아이콘 계약 테스트 2/2 통과.
- v1 API/Web `tsc --noEmit` 통과.
