# Task 182: 친선 참석명단의 빈 저장 검증 일치 (#1407)

Status: Review
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
#1407은 저장된 명단의 마지막 선수를 제거한 dirty-empty 상태에서도 저장 버튼이 켜지고 서버가 `LINEUP_EMPTY`로 거절하는 결함이다. pristine-empty와 구분한다. 최신 `origin/dev` e90a2268에서 최근 수정 PR 120개와 이슈 댓글을 대조했고 연결된 수정 PR은 없었다.

## Goal
서버의 최소 한 명 계약을 유지하며 초안 저장과 제출의 클라이언트 검증을 일치시켜 이슈별 Draft PR로 전달한다.

## Original Conditions (must all be satisfied)
- [ ] 독립 worktree와 이슈 브랜치에서 내 파일만 커밋·푸시한다.
- [ ] #1407과 연결된 Draft PR에 원인·테스트·실제 alpha before·잔여 검증을 기록한다.
- [ ] 병합·자동병합·배포를 하지 않는다. alpha after는 별도 배포 대기로 표시한다.
- [x] QA179 `bafbfa44-3280-465c-9f98-089617394288` 및 완료 QA 공식 결과를 변경하지 않는다.

## User Scenarios
- pristine-empty: 저장된 것으로 보이는 빈 초기 화면에서 서버 요청을 보내지 않는다.
- dirty-empty: 마지막 선수를 제거하면 저장·제출을 막고 이유를 표시한다.
- 복구: 실행 취소 또는 선수 추가 후 정상 명단을 저장할 수 있다.
- 제출본 편집: 마지막 선수를 제거해도 다시 제출할 수 없고 변경 취소로 원본을 복원한다.
- 제출 중 편집: 저장 응답 전에 명단을 비우면 빈 후속 저장·옛 명단 제출로 이어지지 않는다.

## Test Scenarios
### Happy path
- [x] 실행 취소 및 재추가 후 정상 payload 저장
### Edge cases
- [x] pristine-empty와 dirty-empty 구분
- [x] 제출된 명단의 변경 취소
- [x] 저장 응답 전 마지막 선수 제거
### Error paths
- [x] 기존 저장 실패·버전 충돌·오프라인 테스트 회귀
### Mock data updates needed
- API/DTO/schema 변경 없음. 현재 실제 라우트 컴포넌트 테스트의 외부 API 경계 mock을 재사용한다.

## Parallel Work Breakdown
### Frontend
- [x] 실패 회귀 테스트 → 최소 로직 수정 → 관련 테스트·lint
### Sequential
- [ ] 명시 pathspec 커밋·원격 SHA·Draft PR·CI 확인
- [ ] QA 담당의 공개 SHA 고정 alpha before URL 재사용

### Owned / Forbidden files
- Owned: `apps/v1_web/src/app/team-matches/[id]/lineup/lineup-client.tsx`, `lineup.test.tsx`, 검증 설명이 필요한 `lineup.view-model.ts`, 이 문서, 이슈 전용 changeset.
- Forbidden: backend/schema/migrations, 다른 작업자의 PR 브랜치, 공유 main worktree, 실제 QA 명단·공식 결과·권한·결제·통신.

## Acceptance Criteria
- [x] 빈 명단 저장 요청이 나가지 않고 이유가 보인다(실제 라우트 컴포넌트 회귀 테스트).
- [x] 정상 원본으로 복구 후 저장과 제출이 계속 동작한다(컴포넌트 테스트).
- [x] 회귀 테스트 RED → GREEN, 관련 테스트·frontend lint·필수 aggregate checks.
- [ ] 원격 커밋과 CI 상태 확인, 미검증 범위 명시.
- [ ] before는 alpha 실제 화면 또는 원본 이슈 증거만 사용하며 after 미확보를 숨기지 않는다.

## Tech Debt Resolved
- 초안 저장 버튼·실행부에 누락된 서버 계약 검증.

## Security Notes
인증·권한·API 계약을 바꾸지 않는다. 자격증명·토큰·환경 파일을 읽거나 공개하지 않는다.

## Risks & Dependencies
- alpha-only 정책과 병합·배포 금지로 수정 후 화면은 이번 Draft 단계에서 확보할 수 없다.
- 호스트: 12 cores, load 88, Node 153개, swap 20.5GB/21.5GB. 검증은 단일 worker·직렬, 전체 반복 검증은 CI로 위임한다.
- before 공개 이미지 링크는 별도 QA 세션에서 전달 대기.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | 0명 초안을 서버가 허용하도록 바꿀지 | 부모 지시: 서버 LINEUP_EMPTY 계약 유지, UI 검증만 일치 |
| 2026-10-02 | Codex | Draft 단계 after 확보 방식 | 사용자 지시: alpha만 사용, 새 수정 after는 배포 대기로 정직하게 표시 |

## Progress Snapshot
- base e90a2268; worktree `/tmp/teameet-issue-1483-20261002`; branch `fix/issue-1407-empty-lineup-save`.
- 최소 수정 완료. 신규 5개 회귀: 수정 전 pristine-empty 1 PASS / dirty-empty·복원·제출 대기 경계 4 FAIL → 수정 후 PASS.
- `pnpm --filter v1_web exec vitest run 'src/app/team-matches/[id]/lineup/lineup.test.tsx' 'src/app/team-matches/[id]/lineup/lineup.view-model.test.ts' --maxWorkers=1 --minWorkers=1 --reporter=dot`: 2 files / 111 tests PASS (12.93s).
- `pnpm --filter v1_web run lint`: tsc 및 패턴 검사 PASS.
- aggregate: Android Play, v1 DB, production deploy security, compose parity, alpha seed runtime, immutable deploy 6/6 PASS.
- `git diff --check` PASS, touched-path TODO/FIXME/HACK/XXX 0. 새로운 외부 import/route dependency 없음.
- 원본 `friendly-empty-save-error-876.png`은 부모가 확인했다. 캡처 시각·CSS 폭·클릭 전 활성 상태와 API 오류 코드는 이미지 자체로 확인되지 않아 추정하지 않는다. QA 담당의 공개 링크 대기.
- 전체 test/build/integration 결과는 원격 CI 확인 예정. alpha 최신 재현·mobile 390/tablet 768/desktop 1440 회귀·reload/Back/Escape는 이번 수정 배포 후 별도 검증 대기이며 PASS로 주장하지 않는다.
