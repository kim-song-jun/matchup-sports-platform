# 대회 정보 수정의 형식 선택

Status: In Progress
Owner: Codex (단일 세션)
Created: 2026-10-18

## Context
기존 대회 정보 수정 모달에는 형식 입력이 없고 API는 무제한 변경을 허용했다.
## Goal
기존 수정 창에서 형식을 변경하고 조/대진 생성 이후 또는 진행/완료 상태에는 제한한다.
## Original Conditions
- [x] 기존 대회 정보 수정 창 안에 선택란 추가 (사용자 승인)
- [x] 현재 형식 hydrate, 변경분만 PATCH
- [x] 조/경기 존재 또는 진행/완료 상태에서 형식 변경 제한
## User Scenarios
1. 어드민 → 대회 → 대회 정보 → 대회 정보 수정 → 형식 선택 → 저장.
2. 조/대진이 있으면 선택 비활성화 및 경기·조 삭제 안내; 이름 등은 계속 수정 가능.
## Test Scenarios
- 세 형식 저장·재조회, 참가 신청 존재 허용, 동일 형식 재전송 허용.
- 조만 존재/경기 존재/진행/완료/저장 도중 조 생성 시 409 및 무변경.
- 모달 초기값·변경 payload·잠금 사유·다른 정보 수정.
- 템플릿은 잠금 후 다시 읽은 형식과 맞는지 검사.
## Parallel Work Breakdown
병렬 에이전트 없이 backend → frontend → tests/docs 순차 실행.
Owned: tournaments-admin.service(.spec).ts, templates/bracket-template.service.ts, templates/bracket-template.service.spec.ts, info-section(.test).tsx, types/api.ts, docs/api/README.md, docs/api/global-contract.md, docs/api/domains/tournaments.md, 본 문서, changeset.
Forbidden: 다른 세션의 WIP 전부.
## Acceptance Criteria
- [x] UI/API 변경 및 감사 로그 형식 기록
- [x] 좁은 회귀 테스트 통과
- [ ] alpha 390/768/1440 화면·console/network 검증
## Tech Debt Resolved
API 직접 호출 시 대진 구조와 format 불일치가 발생하던 경로 제한. 템플릿의 잠금 전 format 검사와 잠금 후 생성 사이 경쟁도 재검사.
## Security Notes
기존 mutation admin 권한 및 expectedVersion CAS 유지. 대진 생성과 동일 advisory lock 안에서 구조 재확인. 스키마 변경/마이그레이션 없음.
## Risks & Dependencies
alpha 화면 검증은 배포 및 실제 로그인 필요. 현재 세션은 미배포 작업트리다.
## Ambiguity Log
- 사용자가 기존 수정 모달 내 추가안을 명시 승인. 별도 디자인 선택 재요청 없이 기존 select 패턴 적용.
- 잠금은 조만 있는 상태도 포함. 참가 신청만 있는 상태는 허용.
## Progress Snapshot
- 구현 및 회귀 테스트 통과. backend 두 파일 127 PASS, frontend info-section 19 PASS, frontend tsc --noEmit --incremental false PASS.
- backend 첫 실행은 stale Prisma Client의 기존 isPublic 타입 부재로 0 tests 실패. prisma generate 후 동일 대상 + 템플릿 경쟁 회귀를 실행해 127 PASS. DB 변경 없음.
- API 테스트는 서비스/트랜잭션 mock 경계 검증이며 실DB 동시성 검증은 수행하지 않음.
- git diff --check 및 touched-path debt marker 검사 PASS. production import에 새 untracked 의존성 없음. 새 spec/task/changeset은 아직 untracked이며 커밋/PR 준비 완료로 표시하지 않음.
- alpha manual QA 미실행: 미배포 상태이고 실제 로그인 자격증명 없음. 390/768/1440 스크린샷·console/network·실제 저장/재조회는 배포 후 필요. 로컬 Next 서버와 브라우저는 띄우지 않았고, 실행한 테스트/타입 검사 프로세스는 모두 종료됨.
- mock/fixture 변경은 서비스 및 UI 테스트 내 응답에 반영. schema/공용 MSW 라우트 변경 불필요.
- API README/global/domain 문서 동기화 및 API/Web patch changeset 추가.
- 시작 HEAD e60c8576c. 공유 작업트리의 기존 변경은 보존.
- git fetch origin dev는 상대 경로가 읽기 전용이라 실패; 원격 기준 최신화는 아직 확인하지 못함.

## Deployment Progress
- 사용자 alpha 배포 승인. origin/dev 84a2c092ee 기준 fix/admin-tournament-format-edit 전용 /tmp worktree에 12개 파일만 이식.
- 원격 fetch 성공; 이전 fetch 제한 해소. 다른 세션의 변경은 전용 worktree에 포함하지 않음.
- 최신 dev worktree에서 API/Web tsc 및 surface/pattern 검사 PASS, Changeset 정책 PASS. 기존 구현 테스트의 대상 source bytes를 그대로 이식했고 CI에서 PR 커밋본 전체 검증 예정.
