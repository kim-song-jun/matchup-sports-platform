# 결과 정정 카드 타임라인

Status: Review

## Context
결과 정정은 카드 합계만 저장하고 공개 타임라인은 현장 CARD 이벤트만 읽어 서로 달랐다.

## Goal
기존·신규 옐로/레드카드를 득점과 같은 타임라인에서 편집하고 공식화 후 개인 기록·공개 경기·일정 카드에 반영한다.

## Original Conditions
- [x] 기존 카드 표시, 추가·수정·삭제, 피리어드·분 입력.
- [x] 시간이 없는 카드는 시간 미입력으로 보존.
- [x] 합계와 타임라인 일치, 취소 이벤트 제외, 정정 삭제 후 재등장 방지.

## User Scenarios
운영자가 결과 정정에서 기존 카드를 확인하고 선수·종류·시간을 수정해 공식화한다. 관중과 선수는 같은 카드 기록을 확인한다.

## Test Scenarios
- 기존 현장 카드, 합계만 있는 카드, 명시적 빈 타임라인, 카드 추가·이동·삭제.
- DTO의 음수·소수·잘못된 종류·합계 불일치 거부.
- 공개 상세·일정의 공식 기록 우선 및 동의 게이트 유지.

## Parallel Work Breakdown
단일 에이전트 순차 작업. Owned: 결과 정정 UI/DTO, cards JSON 계약, 공개 기록 프로젝션 및 관련 테스트·문서. Forbidden: 다른 WIP, 권한·운영 배포 설정.

## Acceptance Criteria
- [x] A/B/C 제시 후 사용자 A안 선택(득점 양식 재사용).
- [x] 카드 타임라인과 개인 합계가 함께 저장된다.
- [ ] dev 대상 PR 생성, 검사 결과·alpha 미검증 여부 명시.

## Tech Debt Resolved
카드 합계와 공개 타임라인의 소스 불일치를 수정한다.

## Security Notes
기존 권한·공개 동의 게이트를 유지하고 카드 JSON을 중첩 검증한다.

## Risks & Dependencies
V1GameResultParticipant.cards JSON에 events를 추가한다. 테이블/Prisma 모델 변경 및 DB migration은 필요 없다. 기존 yellow/red와 호환된다. alpha 시각 검증은 dev 배포 후 가능하다.

## Ambiguity Log
기존 합계만 있는 카드에는 시간을 추측하지 않는다. 기존 현장 이벤트는 합계 범위 내에서 복원하고 부족한 기록은 시간 미입력으로 표시한다.

## Progress Snapshot
- 브랜치: fix/result-correction-card-timeline (base dev).
- 구현: cards JSON events 계약, 중첩 DTO·합계 검증, 경기 피리어드·중복 id 검증, 정정/재제출 타임라인 편집과 합계 동기화.
- 공개 경기·일정·팀 전적은 같은 공식 카드 스냅샷을 읽는다. 기존 개인 기록 합계 경로는 유지한다.
- 검증: 프론트 편집기/복원 53 tests, 정정/재제출 화면 31 tests, 검토 패널/오류 카피 33 tests PASS. 백엔드 카드 DTO 10, 카드 복원 3, 정정 서비스 59, 기존 결과 DTO 27, 공개 경기/일정 10, 팀/개인 기록 28 tests PASS.
- API `tsc --noEmit` + surface 검사 PASS. Web의 기존 unrelated 리그 목록 WIP 오류는 보존하고, commit `76ce11717`의 별도 clean worktree에서 `tsc --noEmit` + pattern 검사 PASS. PR diff 25 files 및 `git diff --check` 확인.
- 초기 환경: Windows에서는 Linux pnpm symlink를 실행할 수 없어 기존 WSL Node로 실행. 현재 스키마와 달랐던 Prisma Client는 generate만 수행(DB 변경 없음).
- alpha manual QA: 아직 dev 미머지·미배포. 390/768/1440 before/after 스크린샷과 console/network 판정은 미실시이며 완료로 주장하지 않는다. 로컬 Next 서버는 띄우지 않았다.
- 기존 unrelated dirty files는 커밋 제외. 테스트를 위해 서버/브라우저/DB 프로세스를 만들지 않았다.
