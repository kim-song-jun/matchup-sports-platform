# 결선 경기일정 홈·어웨이 기본 문구 복구

Status: Review
Created: 2026-10-21

## Context
사용자 경기일정은 진출 연결을 읽지 않아 미배정 결승의 홈·어웨이 문구 대신 대진 확정 전을 표시한다. 대진표는 같은 연결을 읽어 승자/패자를 표시한다.

## Goal
저장된 진출 연결의 원천 라운드·경기 번호·승자/패자를 공개 일정의 기존 라벨 필드에 제공하고 dev 대상 PR을 만든다.

## Original Conditions
- 기존 팀명, 참가팀 비공개 정책, 직접 입력 문구, 슬롯 문구를 보존한다.
- DB/진출 연결/실제 팀 배정을 변경하지 않는다.

## User Scenarios
결승·3위전의 팀이 미정이어도 사용자는 어느 경기의 승자/패자가 참가하는지 일정에서 확인한다.

## Test Scenarios
- 승자/패자 연결, 시간 미정 경기, 필터·페이지 밖 원천 경기.
- 실제 팀/직접 문구/슬롯 문구 우선, 연결 없는 빈 경기, 리그 회귀.
- 삭제된 원천 경기의 연결은 제외한다.

## Parallel Work Breakdown
단독 순차 진행. Owned: 공개 일정 service/spec, 실제 DB 통합 회귀, API 문서, scenario hub, changeset, 이 task. Forbidden: shared WIP, schema/migration, UI 디자인, 원격 데이터 변경.

## Acceptance Criteria
- [x] 일정 API가 실제 저장된 연결로 홈·어웨이 문구를 반환한다.
- [x] 관련 좁은 회귀와 API 타입 검증 증거를 기록한다.
- [x] base=dev [PR #2026](https://github.com/kim-song-jun/matchup-sports-platform/pull/2026) 생성. 머지/배포는 이번 요청 범위에 포함하지 않는다.

## Tech Debt Resolved
대진표에서만 해석하던 진출 연결이 공개 일정에서는 유실되던 문제를 수정한다.

## Security Notes
기존 공개 상태/권한/팀명 가림 유지. 팀 이름 없이 원천 경기의 공개 라운드·번호만 표시한다.

## Risks & Dependencies
API만 수정한다. alpha 변경 후 수동 화면 확인은 배포 이후에 가능하며 PR 검증과 구분한다.

## Ambiguity Log
사용자가 특정 대회 URL을 제공하지 않아 공개 alpha 20팀·8명 12강 01 대회에서 저장된 결승 진출 연결과 빈 라벨을 확인했다. 연결 없는 경기는 추정하지 않는다.

## Progress Snapshot
최신 origin/dev b6a7a1a21에서 격리 worktree 생성. 원본 트리 변경 보존.

- RED: 예정/시간 미정 결선의 진출 라벨 누락 2실패, 대조군35통과.
- GREEN: 일정 service37 + 리그 일정/순위22 = 59 PASS. 최초 네이티브 Node 실행은 WSL 의존성 해석 실패, 최초 리그 테스트 경로 오타는 ENOENT로 실패했으며 통과 증거에 포함하지 않았다. 올바른 WSL 경로에서 검증했다.
- 실제 PostgreSQL 회귀 추가: 템플릿 생성 → 결선 필터/limit → 최신 원천 번호/승자/패자 → 원천 soft delete 제외. 로컬 Docker 엔진 미가동으로 실행하지 못했으며 CI에서 확인해야 한다.
- API `tsc --noEmit` 및 surface 검사 PASS. 새 debt marker 없음, `git diff --check` PASS. Alpha after 화면 확인 0/3(미배포); 원격 데이터 변경0.
- 구현 커밋 `97fd02a89`, PR #2026 head/base 확인 완료. CI 및 실제 DB 회귀는 PR에서 후속 확인한다.
