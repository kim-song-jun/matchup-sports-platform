# Task 20261014: 종료 개인 매치와 모집 마감 안내 분리 (#1587)

Status: Review
**Owner**: Codex bugfix session
**Created**: 2026-10-03

## Context

실제 alpha 합성 상세는 종료 배지·1/2명과 모집 완료 안내를 함께 표시했다. 공개 증거의 안전한 API normalized status/displayState/viewer 원문은 미확보다. 현재 v1 소스는 completed 비참가자의 closed mode에서 일반 모집 완료 카드로 들어가는 경로를 확인할 수 있다. 이 경로가 공개 fixture의 확정 원인이라고 주장하지 않는다.

2026-10-03 13:33 UTC의 추가 공개 alpha GET은 동일 ID의 `status=completed`, `displayState=completed`, `participantCount=1`, `capacity=2`, `hostParticipates=false`를 확인했다. persona는 비로그인 `guest`, `canApply=false`, `disabledReason=LOGIN_REQUIRED`다. 과거 브라우저 로그인 viewer와 같은 조건의 재현이 아니며 guest 차단 사유를 완료 사유로 해석하지 않는다. 실제 화면·serving SHA·과거 API 원문은 이 조회로 증명하지 않는다. 비밀/신원/명단은 저장하지 않고 허용한 필드만 로컬 JSON에 남겼다.

## Goal

completed 비참가자 안내를 실제 완료 생애주기에 맞추되 정원 계산·API·권한·CTA·다른 상태의 기존 계약을 유지한다. 실제 alpha after는 별도 승인 배포와 동일 조건 재검증 뒤에만 판정한다.

## Original Conditions (must all be satisfied)

- [ ] 종료 생애주기와 모집 정원 충족/시간 마감/신청 불가를 구분한다.
- [ ] 미충족 정원을 정원참/모집완료로 오해하게 안내하지 않는다.
- [ ] full/시간 closed 및 host/participant/비참가자의 허용 동작을 유지한다.
- [ ] 실제 동일 fixture 3폭 after와 안전한 normalized status/displayState/viewer/current/capacity를 별도 배포 뒤 기록한다.

## User Scenarios

비참가자가 completed 개인 매치를 조회하면 인원 1/2 또는 2/2에 관계없이 종료를 알 수 있고 신청 불가 CTA를 확인한다. 주최자·확정 참가자·불참자는 기존 관리·참여·불참·후기 계약을 유지한다. API normalized displayState는 raw status보다 우선한다.

## Test Scenarios

### Happy path

- [ ] 실제 toMatchCard → 실제 MatchDetailPageView: completed 비참가자 1/2·2/2의 desktop/mobile 본문 종료 안내.
- [ ] 종료 배지·비활성 신청 불가, 모집완료·잔여 자리 오해 안내 없음.

### Edge cases

- [ ] raw status와 displayState의 우선순위 대조.
- [ ] full/closed/in_progress/completion_pending/on_hold의 기존 카드 유지.
- [ ] host/participant/no_show/requested의 관리·참여·후기·취소 계약 유지.

### Error paths

읽기 전용 상태 안내 변경이며 새 mutation·저장·재시도 경로를 만들지 않는다. 실제 client/API 실패 처리와 lifecycle gate는 변경하지 않는다.

### Mock data updates needed

typed 합성 V1Match를 테스트 내부에서만 사용한다. 공개 alpha fixture·실제 팀/신청/완료 결과·QA179 명단·DB fixture는 수정하지 않는다.

## Parallel Work Breakdown

- Root: 선택안 HTML, 명시 소유 경로의 구현·테스트·커밋·전용 브랜치 push·Ready base-dev PR·정확한 head CI.
- Independent agent: pinned source의 상태/역할 계약과 테스트 경계 읽기 전용 검토. 제품 편집·테스트 실행·외부 쓰기 없음.
- Sequential: A·B·C 제시 → 사용자 선택 → 최소 표시 수정 → RED/GREEN → lint/gates → PR/CI → 독립 정적 리뷰. 실제 alpha after는 별도 배포 뒤 수행.

### Owned files

- `apps/v1_web/src/components/matches/matches-page.tsx`
- `apps/v1_web/src/components/matches/matches-page.test.tsx`
- `.github/tasks/20261014-completed-match-notice.md`
- `.changeset/completed-match-notice.md`

### Forbidden files and actions

API/DTO/schema/permission/mode/mapper/count/실제 fixture 변경, #1588·#1586 표시 코드 혼합, 다른 세션 작업, QA179·완료 QA 결과·실제 신청/상태/명단 변경, merge/automerge/deploy/유료 자동리뷰 재요청.

## Acceptance Criteria

- [x] 실제 before 3장의 공개 Git blob·manifest·원본 PNG bytes/픽셀 범위 확인. 같은 detail의 종료 배지는 별도 mobile/title 증거로 구분.
- [x] 독립 fresh `origin/dev` worktree: `/tmp/teameet-issue-1587-20261003`, branch `fix/issue-1587-completed-match-notice`, base `8167aaa86ed3cc787bd82568515ad1f9d21d0ef2`.
- [x] A·B·C 및 추천 A를 실제 v1 토큰/자산과 기존 StateCard 원칙의 private HTML에 제시.
- [x] 사용자 표시 문구 선택: A, “종료된 매치예요” + 기존 신청 마감 본문. 부모가 전달한 사용자 `ㄱㄱ`, `Sentinel_00213ead9bc48191a51d515de871b9b6` 승인. #1588/#1586도 A이나 각 전용 브랜치로 분리한다.
- [x] 초점 RED: 실제 mapper→view 완료 1/2·2/2 두 실패, 나머지 대조 10 통과. 첫 실행의 no_show fixture statusLabel 누락은 실제 client의 “불참 기록”에 맞춰 정리했다.
- [x] GREEN: page/mode/client/card-model 4파일 115 통과(1 worker). 새 12개는 실제 mapper→view 계약이며 client 기존 mock-view 테스트를 새 문구 검증으로 세지 않는다.
- [x] lint/typecheck·v1 pattern, 필수 aggregate gates 6개·changeset 정책 통과. 전체 suite/build/integration은 CI 담당.
- [ ] 명시 pathspec 커밋·committed diff 검증·Ready base-dev PR·정확한 head CI·독립 리뷰.
- [ ] 실제 alpha 동일 fixture 모바일→태블릿→desktop after·console/network·CTA/Back/공유·시각 회귀. 전체 QA 완료로 표현하지 않는다.

## Tech Debt Resolved

completed 상태를 일반 모집 마감 문구로 안내하는 분기만 대상이다. UI용 `status='full'`을 정원 충족 근거로 쓰지 않는다. 기존 unrelated marker나 다른 닫힘 사유의 정책을 확장하지 않는다.

## Security Notes

읽기 전용 공개 합성 증거와 로컬 합성 테스트만 사용한다. 비밀번호·토큰·개인 연락처·실제 사용자 데이터·`.env*`를 읽거나 게시하지 않는다. 권한·저장·서버 상태 gate는 유지한다.

## Risks & Dependencies

- CLAUDE.md:330의 A·B·C 선택 규칙은 private HTML과 사용자 A 승인으로 충족했다.
- 수정 after는 별도 승인 alpha 배포까지 대기한다. source/CI SHA를 페이지 serving SHA로 간주하지 않는다.
- jsdom 두 DOM 분기 검증은 실제 3폭 가시성·브라우저·API normalized fixture 상태를 증명하지 않는다.
- expired/cancelled/수동 closed의 안내 확대는 별도 정책 범위이며 이번 completed 최소 수정에 포함하지 않는다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-03 | QA evidence | 실제 fixture normalized 상태/역할·종료 사유 원문 | 미확보. 현재 source의 completed 경로 원인 후보만 고정. 정원/저장 오류 추정 없음. |
| 2026-10-03 | Codex public GET | 현재 동일 ID의 안전한 normalized 상태 | 13:33 UTC guest 조회에서 completed/completed/1/2 확인. 과거 로그인 viewer·서버 완료 사유·같은 조건 화면 재현과 구분. |
| 2026-10-03 | Codex | 완료 안내 문구 | private HTML A/B/C 제시 뒤 사용자 A 승인(부모 전달 `ㄱㄱ`). |

## Progress Snapshot

2026-10-03: A 승인 뒤 lifecycleStatus completed에만 종료 제목을 적용했다. desktop/mobile 기존 closed gate·본문·톤은 유지한다. RED/GREEN115, lint와 필수 gates를 확인했다. 명시 owned scope 커밋·Ready dev PR·정확한 head CI/독립 리뷰는 PR 기록에서 이어간다. 실제 alpha after·동일 로그인 viewer/3폭 전체 회귀는 별도 배포 대기이며 이슈는 Refs/Open 유지한다. #1589의 완료 리뷰/CI는 재게시하지 않는다.
