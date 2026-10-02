# Task 185: 확정된 친선 결과의 공동 기록 안내 (#1518)

Status: Review
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
guest가 완료된 합성 친선의 공식 A0:B1 결과와 득점을 조회해도 결과 카드 아래에는 경기 시작 뒤 참여할 수 있다는 문구가 남는다. #1518의 실제 alpha 390/768/1440 원본이 근거다. 현재 `TeamMatchRecordEntry`는 비참가자 안내를 phase와 무관하게 렌더한다.

## Goal
공식 결과의 비참가자 안내를 확정 상태에 맞게 교정하고, 기존 참가자 링크·redirect·쓰기 권한을 유지해 Ready/dev PR로 전달한다.

## Original Conditions (must all be satisfied)
- [x] 최신 origin/dev의 독립 worktree/이슈 브랜치, 중복 PR 확인, 다른 미병합 PR 변경 배제
- [ ] 확정 친선의 참여 가능 문구를 교정하고 진행 중·종료 확인 대기 상태의 동작을 유지
- [ ] 초점 RED/GREEN·frontend lint·aggregate·pathspec 커밋·원격 head CI·Sonnet 결과 기록
- [ ] 실제 alpha before 3장 공개 게시, after는 별도 승인된 배포 뒤 대기
- [x] QA179/완료 결과·서버 상태·명단·권한·다른 세션·운영 데이터를 수정하지 않음
- [x] 병합·자동병합·배포·제한된 유료 리뷰 재요청 금지

## User Scenarios
guest는 공식 결과를 읽을 때 경기 결과가 확정됐다는 안내를 본다. live 단계의 비참가자는 기존 공동 기록 참여 안내를 본다. 참가자는 live/official에서 기존 공동 기록 링크/출처와 상세 보기 예외를 유지한다.

## Test Scenarios
### Happy path
- [x] 비참가자 official 안내와 득점 조회를 실제 컴포넌트로 검증
### Edge cases
- [x] official의 운영자(canEdit=true)도 권한 변경 없이 상태 안내만 교정
- [x] live·한 팀 확인 대기, 참가자 live/official의 링크·redirect·detailOnly 유지
- [x] scheduled/cancelled/legacy/managed는 기존대로 entry 미노출
### Error paths
- [x] 기존 오류·재시도·서버 실패 및 공식 결과의 쓰기 제한/관리자 정정 테스트 회귀
### Mock data updates needed
schema/API 변경 없음. 기존 SharedRecord fixture의 phase/participant/operator/canEdit/confirmations만 테스트별로 지정한다. 실제 alpha 데이터는 조회 증거 외 변경하지 않는다.

## Parallel Work Breakdown
### Frontend
- [x] 기존 비참가자 문구에 official phase 조건만 추가하고 초점 테스트
- 문구의 기계적 상태 교정이며 화면/레이아웃/컨트롤 설계 변경은 없다. 사용자 최소 수정 지시를 적용한다.
### Sequential
- [ ] 직렬 최소 worker 검증 → 4파일 pathspec 커밋/푸시 → Ready/dev PR → 정확한 head CI/Sonnet
- [ ] 승인된 alpha 배포 뒤 같은 데이터·폭의 after·guest/participant 회귀
### Owned / Forbidden files
- Owned: `team-match-shared-record.tsx`, 같은 폴더 `team-match-shared-record.test.tsx`, 이 문서, 이슈 changeset.
- Forbidden: backend/API/schema/권한/상태 gate, 다른 PR/worktree/세션, protected QA 데이터, admin 정정 정책.

## Acceptance Criteria
- [x] official 비참가자 안내는 참여 가능이라고 하지 않음
- [x] live 및 한 팀 확인 대기 안내·참가자 link/redirect·관리자 canEdit 동작 보존
- [ ] 초점 테스트/검증과 전체 alpha QA 완료를 구분하고 잔여 배포·리뷰 범위 기록

## Tech Debt Resolved
비참가자 안내의 상태와 무관한 참여 가능 고정 문구를 실제 official phase에 맞춘다.

## Security Notes
문구만 교정한다. 서버의 `canEdit` 및 mutation/participant/administrator gate를 수정하지 않는다. 비밀번호·토큰·환경 파일을 읽거나 게시하지 않는다.

## Risks & Dependencies
- `phase()`는 양 팀 확인과 현재 공식 리비전으로 official을 결정한다. 한 팀 확인은 live, 실제 ENDED/옛 결과는 legacy이다. 별도 endedAt 필드를 만들어 추정하지 않는다.
- official 운영자는 서버 canEdit=true로 정정할 수 있으므로 누구나 수정 불가라고 안내하지 않는다.
- 실제 after·guest/participant alpha flow는 승인된 배포 대기. Sonnet 미도착은 검토 대기이며 Copilot 오류는 리뷰 결과가 아니다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | 확정 안내의 권한 의미 | '경기 결과가 확정됐어요.'만 사용해 관리자 정정 불가/득점 공개 범위를 추정하지 않음 |

## Progress Snapshot
- base bf47852a2; worktree `/tmp/teameet-issue-1518-20261002`; branch `fix/issue-1518-completed-record-notice`.
- 공개 원본 SHA 04fadf4253c59d2f9facd138b7deee84107db258의 390×844/768×1024/1440×900 before 다운로드·픽셀 검토 완료. UTC 2026-10-02 02:38:58.662/02:39:46.946/02:39:48.059, guest이며 물리 기기 검증 아님. 캡처 당시 앱 serving SHA 미기록.
- 서버 phase/actor/canEdit, 기존 클라이언트 참가자 링크와 redirect를 교차 확인했다. 실제 결과·명단·권한 mutation 없음.
- RED: 기존 코드의 official 비참가자 안내 2 FAIL / 대조군 59 PASS(61 tests). 실제 새 문구 위치에서 실패했다.
- GREEN: 실제 shared-record 컴포넌트 전체 61 tests PASS(4.31s), 단일 worker. 참가자 live/official link·redirect/detailOnly, live 한 팀 확인, admin 정정과 서버 실패 회귀 포함.
- frontend lint/typecheck PASS, 필수 aggregate 6/6 PASS, 이 이슈 v1_web patch changeset accepted. diff check PASS, touched TODO/FIXME/HACK/XXX 0, 새 의존성/미추적 import 없음.
- 명시 4파일 커밋·원격 head CI·Sonnet은 게시 후 확인하고 최종 결과는 PR 본문·부모 보고에 기록한다. after는 승인된 배포 대기.
