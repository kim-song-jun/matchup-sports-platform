# MD-QA #146: 자격 기준을 지키는 미제출 기본 명단

Status: In Progress
**Owner**: QA root -> Phase A dedicated backend investigation
**Created**: 2026-10-15

## Context
기존 리포트 https://teameet.jmandu.kr/issues/146/ . 원 리포트의 NEEDS_DECISION은 최신 직접 사용자 선택으로 대체됐다. 현재 김성준 담당·확인 중이며 중복 task/worktree/branch/PR이 없음을 SSOT와 실제 Git ref에서 대조했다.

## Goal
사용자 선택 1: domain-qualified current roster를 사용하고 수동 라인업을 제출하지 않았으면 자격을 만족하는 전체 선수를 기본 참가자로 사용한다. 대회 참가 등록 명단을 무조건 전체 팀원으로 덮지 않는다.

## Original Conditions
- [x] 최신 승인된 선택 적용; 재질문하지 않는다.
- [x] fetch origin/dev 직후 managed create_worktree ref=origin/dev, base d77f8e3176ffa03ad39a32f0f6a04c19e7a75bcb, 전용 feature branch.
- [ ] 실제 결함/계약을 v1에서 확정하고 최소 수정·실제 RED→GREEN·독립 리뷰·dev PR·기존 리포트 댓글을 완료한다.

## User Scenarios
일반 팀매치·리그·대회/조별/토너먼트의 실제 로더와 fallback 엔진을 재사용한다. 비활성·삭제·출전 정지·미승인 등 기존 자격 조건과 제출/잠금/검수 권한·수정 이력을 보존한다. 검수를 신원 부정행위 판정으로 확대하지 않는다.

## Test Scenarios
- 실제 소비자/서비스·권한·동시성·실패 경계의 좁은 회귀. 고정 성공 mock이나 반환값만 일치하는 검증 금지.
- 기존 제출·경기 이력·참가 등록 및 다른 종목 회귀를 보존한다.
- API 계약 변경 시 docs/api·frontend hooks/types/MSW를 같은 변경에서 맞춘다.

## Parallel Work Breakdown
Phase A dedicated read-only v1 discovery: 실제 관련 소스·테스트·기존 fallback/정원 엔진, 기존 구현/머지 중복, 가장 작은 Owned files와 RED 계획을 반환한다. 이 단계 source/Git/tests/browser/SSOT 변경 금지. Phase B 단일 공유 계약 owner가 테스트를 준비하고 root가 실제 RED를 실행한 뒤 최소 수정. Phase C 필요한 UI는 승인된 의미와 DESIGN 토큰을 따른다. root가 task/Changeset/Git/PR/직렬 검증/alpha/댓글을 소유한다. 별도 reviewer가 구현 후 적대적 검증한다. 다른 에이전트의 변경을 되돌리지 않는다.

## Acceptance Criteria
- [ ] 사용자 선택 1: domain-qualified current roster를 사용하고 수동 라인업을 제출하지 않았으면 자격을 만족하는 전체 선수를 기본 참가자로 사용한다. 대회 참가 등록 명단을 무조건 전체 팀원으로 덮지 않는다.
- [ ] 일반 팀매치·리그·대회/조별/토너먼트의 실제 로더와 fallback 엔진을 재사용한다. 비활성·삭제·출전 정지·미승인 등 기존 자격 조건과 제출/잠금/검수 권한·수정 이력을 보존한다. 검수를 신원 부정행위 판정으로 확대하지 않는다.
- [ ] 최소 실제 회귀와 committed tree 검증, 최신 immutable head 독립 C0/W0.
- [ ] base dev PR·실제 CI/필수 규칙·스레드를 대조하고 alpha 배포 SHA에서 실제 검증한다.
- [ ] 실제 alpha를 수행하기 전 테스트/코드 검토를 alpha PASS로 대신하지 않는다.

## Tech Debt Resolved
Phase A 조사 후 범위 내 drift만 기록한다.

## Security Notes
권한·참가 자격·개인정보 경계를 넓히지 않고 실제 선수 개인정보/비밀을 읽거나 출력하지 않는다. main/production 승격과 destructive Git은 금지한다.

## Risks & Dependencies
기존 공유 파일은 단일 owner. root141의 작업트리와 별개이며 브라우저/검증 슬롯은 root만 사용한다. Managed 생성은 성공했으나 chat attachment100 제한으로 등록이 실패하여 동일 checkout만 보존·재등록한다. 중복 checkout을 만들지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-15 | root | 이전 요구사항 미확정 문구 | 최신 사용자 결정이 우선. 미정으로 재분류하지 않음 |

## Progress Snapshot
- 2026-10-15 root: 실제 loader 좁은 회귀는 2 FAIL / 1 PASS / 17 skipped(23.955s)로 전원 제거한 등록 선수의 잘못된 팀원 복구를 확인했다. 단일 owner가 전체 등록 행 수 query와 baseSource 선택 두 생산 파일만 수정했고 GREEN은 대기 중이다.
- 2026-10-15 root: 친선 actual record service 단위 5건과 활성 PostgreSQL integration 8건을 준비했다. DB는 Docker daemon OFF로 NOTRUN이다. 친선 생산 수정 전 actual service RED를 root 직렬 슬롯에서 확인한다.
- 2026-10-15 root: 독립 설계는 수동 제출 이력 없는 명단의 현재 자격 preview, 기존 Game 잠금 내 첫 실제 mutation에서 append-only DRAFT snapshot 및 SYSTEM audit 고정을 사용한다. 이전 제출 후 다시 연 DRAFT는 계속 409이며 GET 쓰기·가짜 SUBMITTED·기존 identity/consent 삭제는 금지한다. preview UUID와 저장 ID를 일치시키고 기록 후에는 membership 변화로 다시 계산하지 않는다. 친선 exact source scope는 실제 RED 후 고정한다.
- 2026-10-15 root: canonical task와 동일 전용 checkout/feature branch를 확정했다. Phase A 조사 중. 구현/RED/GREEN/PR/alpha NOTRUN. 전역 SSOT는 원 checkout tmp/qa/mdqa-assigned-monitor/state.json.


- 2026-10-15 root: actual generic GET→record PARTICIPANT_INVALID RED1; minimal getter fix later passed. Actual arrival individual404/bulk stale1vs2 RED2; current-default audit overlay implemented. Actual ownGET→submit stale UUID plus saved/submitted arrival loss RED3, human subset control PASS1; candidate fixes frozen. Prior record12 and saved draft3 passed; final committed28 plus loader3, types, independent review, PR and alpha pending. Real DB13 NOTRUN (Docker OFF). No schema changes, no early freeze or fake human submission.

- 2026-10-15 root follow-up: immutable c3c652877 independent API15/15 found missing historical _count fixture; actual existing generation/manual RED2 confirmed and fixture synced without weakening production. Frontend6/6 C4: saved notice2, submit CAS1 and result stored-ID1 actual component RED4/controls2; minimal consumers fixed. Registered MSW actual RED3 (pristine revision/saved version/MANUAL no-op) then producer fixed. Frozen late-add is allowed by verified SYSTEM marker and existing lateAdditionAllowed gate; contrary draft documentation was corrected. Candidate/source tests/docs now frozen; final committed GREEN and fresh-head independent re-review pending. DB13 NOTRUN Docker OFF, actual alpha NOTRUN.

- 2026-10-15 root committed checkpoint c04e8db56: API8-spec run retained as336PASS/3privacy-fixtureFAIL339, corrected actual requestChange-to-resave fixture then full owned lineup67/67PASS13.775s; seven unchanged spec/production blobs reuse prior PASS evidence. Frontend actual consumer3files166/166PASS and registered MSW4/4PASS after actual display-name RED1. Latest immutable independent API16/16 and frontend9/9 C0/W0. API tsc PASS. Web tsc exposed2 actual request.json generic type errors at handlers1773/1831; same data owner correcting those without weakening payload validation. DB13 DockerOFF NOTRUN; alpha/browser click blocked, tracker comment/images pending. No PR-ready or alpha PASS claim until remaining gates.
- 2026-10-15 root successor a37dff3f7: both MSW request routes now declare the actual typed body generic without casts or payload weakening. Registered MSW4/4PASS4.43s; Web tsc PASS after the two actual type errors, API tsc PASS on unchanged API source. Consumer3files166/166 and API67/67 corrected fixture results are reused only for unchanged blobs. Frontend9/9 latest a37d C0/W0; API16/16 latest c04e C0/W0 remains applicable because a37d changes only MSW type declarations/task. Final fetch dev1b961999 unchanged, working source all tracked, no untracked app imports, diff check PASS. Source/committed validations support PR publication; DB13 and actual alpha remain NOTRUN, existing tracker comment/screenshots blocked by IAB input timeout. These are separate from code/type PASS.