# 예선 편성 수정·팀 배정과 독립 대진 초기화

Status: In Progress

## Context
league_knockouts 예선은 저장 이후 읽기 전용이며 팀 배정 입력이 없다.

## Goal
독립 대진 초기화, 대진이 없는 상태의 예선 수정, 확정 참가팀 수동·자동 배정을 제공한다.

## Original Conditions
- 초기화와 예선 수정은 독립 액션이다.
- 예선은 조별리그이며 기존 대회처럼 팀 선택과 자동 배정이 가능하다.

## User Scenarios
어드민이 초기화를 확인하면 예선·결선 대진과 일정·자리·진출팀 선택을 지운다. 참가 신청과 예선 편성·팀 선택·결선 규칙은 유지한다. 이후 별도로 예선 편성을 수정하고 저장해 조별리그 대진을 만든다.

## Test Scenarios
시작/기록/결과/종료 대회 초기화 거절, stale revision 거절, 대진 존재 시 편성 수정 거절, 수동/자동/부분 배정 저장·재조회, 중복/다른 대회/미확정 팀 거절, 결선 규칙 조 ID 재연결.

## Parallel Work Breakdown
단일 에이전트. Owned: multi-finals API/service/DTO/plan/tests, use-multi-finals, multi-finals-wizard/tests, API 문서, changeset. Forbidden: 원본 작업트리 WIP.

## Acceptance Criteria
- [x] 독립 초기화 확인과 서버 권한·상태·revision 검증
- [x] 대진 없는 저장된 예선의 편성 수정
- [x] 팀 수동/자동 배정 및 저장 경로 연결
- [x] 좁은 회귀 검증과 API 문서 동기화
- [ ] Alpha 390/768/1440 화면·console/network 검증

## Tech Debt Resolved
예선 저장 후 수정 경로 부재와 배정 API가 UI에서 노출되지 않는 문제.

## Security Notes
mutation admin, 대회 advisory lock, optimistic revision, 감사 로그 사용. 실제 대회 초기화는 이 작업 중 실행하지 않는다.

## Risks & Dependencies
진행·결과가 있는 대회는 초기화 불가. DB 스키마 변경 없음. Alpha 검증은 배포 필요.

## Ambiguity Log
사용자와 독립 초기화 버튼 + 대진 없을 때 예선 수정 + 기존 패턴 수동/자동 배정안을 구체적으로 합의하고 진행 승인받았다. 기존 UI 재사용으로 추가 디자인 선택을 요청하지 않는다.

## Progress Snapshot

### 2026-11-27 후속 — 대진 상단 초기화 버튼

- 사용자 요청: “대진 초기화 관련해서 버튼 만들고 pr 추가해줘”. UI A/B/C 중 A(대진 상단 독립 버튼)를 명시 선택했다. 기존 Button/ConfirmModal과 API 오류 패턴을 재사용한다.
- Scope: backend + frontend + docs. 최신 origin/dev 03aeccb6f 기준 `feat/bracket-reset-button`, `_worktrees/bracket-reset-button`. 기존 #2546 변경은 포함하지 않고 별도 dev 대상 PR로 제공한다. 사용자 데이터 초기화를 실제로 실행하지 않는다.
- Owned: 새 bracket-reset controller/DTO/service/tests, 기존 multi-finals reset의 InTx 재사용 추출, tournaments.module, reset hook/button/tests, admin bracket page의 상단 연결과 회귀, API 문서·scenario·Changeset. Forbidden: schema/migration/seed/reset 실행, main, 다른 세션 WIP와 #2546 worktree.
- Phase 1 계약/디자인 선택 [x] → Phase 2 API/보호/테스트 [x] → Phase 3 버튼/저장 회귀 [x] → Phase 4 타입/리뷰/PR [ ]. 단일 에이전트, 병렬 에이전트 없음.
- Acceptance: [x] A안 선택 [x] 대회 네 형식·단계형 대진 초기화 [x] 참가 신청·구성/규칙·등록 시간/구장 보존 [x] 진행/이벤트/결과/시작된 피리어드 차단 [x] preview snapshot CAS [x] 담당 총괄/운영자 쓰기·support 거절 [x] 취소 쓰기0·실패 실제 오류·저장 후 재조회 [x] 실제 dev PR. 실DB·Alpha 통과는 아래 별도 gate이며 이 체크박스는 구현/단위 회귀 판정이다.
- 정책: 활성 경기는 정본 soft-delete 경로로 보관하고 일정 취소·감사·진출 연결을 같은 tx에서 정리한다. 복수 결선은 기존 초기화 InTx 재사용, 일반 대진은 예선 조/팀 선택을 보존하고 결선 그룹과 대진 자리를 정리, 단계형은 단계 정의·규칙을 보존하고 생성된 그룹/자리/배정/복구 상태를 비워 재생성 가능하게 한다. 공개 상태는 해제한다. 별도 정규 리그(`/admin/league-matches`)는 이 버튼의 대상이 아니다.
- DB impact: Tournament/MatchDetails/TeamMatch/Game/Group/Slot/Standing/GroupTeam/ByeSlot/진출 연결·팀 일정·감사. 기존 모델만 사용, migration 없음. 필수 시나리오는 실제 PostgreSQL integration으로 추가하고 로컬 DB 없을 경우 실행 여부를 분리한다.
- Ambiguity: UI 위치는 사용자 선택으로 확정. 초기화 대상은 대회 대진 화면의 전체 대진이며 경기 결과 삭제 기능은 추가하지 않는다. 기존 진행 경기 보호를 약화하지 않는다.
- Progress Snapshot: 관련 기존 작업 20261111 및 stages/template teardown과 실제 canonical 삭제 계약 확인. 구현 전 단계. Alpha 로그인 자료는 앞선 작업에서 발견한 이전 값이 거절된 상태이므로 before/after·실제 Alpha QA는 아직 없다. 로컬 next 서버는 띄우지 않는다.
- 구현 cursor: API/Web 구현 완료, Node22.23.5/단일 worker에서 API36·Web31 고유 회귀 PASS. API/Web tsc·surface/pattern PASS. 실제 TournamentsModule import와 Games/MultiFinals 포함33 constructor metadata undefined0 확인(DB 부트스트랩 테스트는 아님). 모듈·DTO·실제 PostgreSQL 통합 spec11건을 추가했으나 Docker daemon 미가동으로 실DB는 미실행/CI 대상이다. snapshot은 진출 edge의 side/outcome까지 검증하며 문자열 confirmed를 bool로 묵시 변환하지 않는다.
- 최종 검토: 단독 토너먼트와 설정 전 복수 결선은 빈 그룹까지 정리해 재설정이 막히지 않도록 했다. 리그/조별리그 및 설정된 복수 결선은 예선 편성·팀 선택을 보존한다. #2546과의 불필요한 충돌을 줄이도록 기존 페이지 return/배정 workspace를 보존하고 공통 본문 상단에 버튼만 연결했다. 신규 schema/migration·의존성 변경·사용자 데이터 초기화 없음. 공유 MSW는 실제 reset을 가짜 성공으로 만들지 않고503을 반환한다.
- PR 준비: API 문서 README/global/domain 및 [시나리오](../../docs/scenarios/bracket-reset-button.md)/index 동기화. touched 경로 debt marker0, diff check PASS. 기존 #2546 worktree 의존성을 같은 lockfile 확인 후 read-only 소스로 junction 재사용했고 원본 소스/Client를 변경하지 않았다. 미병합 작업과 junction 대상의 소유권을 확인하기 전 삭제하지 않는다. 실제 dev PR 생성 후 CI·리뷰는 그 PR에서 추적한다. Alpha 신규5유형×3폭0/15와 before/after·console/network는 미검증임을 PR에 표시한다.
- PR cursor: [#2553](https://github.com/kim-song-jun/matchup-sports-platform/pull/2553), base `dev`, head `feat/bracket-reset-button`. 구현 커밋 f10c204db, 변경22파일·700추가/24삭제, 커밋 트리 clean/diff check PASS. 요청된 PR 생성까지 완료했으며 dev 머지·CI/PostgreSQL·최신 Copilot clean·Alpha 검증은 미완료다. 진행 중 #2546과 다른 세션 worktree를 보존한다. 미병합 작업의 후속 검증을 위해 이번 worktree/브랜치와 세션 소유 의존성 junction도 유지하며 정리 완료로 표시하지 않는다.
- 2026-11-27 PR 완료 요청 후속: 사용자 “수정해서 pr 완료해줘”에 따라 기존 소유 worktree에서 최신 origin/dev 7ee1be637을 정상 merge했다. CI 45935098816은 Gates/Web PASS, API 통합의 group_knockout 준비만 실패했다(조당2팀은 기존 최소3팀 계약 위반). 실제 planner에서 동일 오류 RED 재현 → 총6팀/2개 조×3팀으로 수정 후 경기7개/자리8개 GREEN 확인. 보존 인원 기대값은 실제 registrationIds 길이를 따르고 형식별4/6팀과 비어 있지 않은 경기 목록을 별도로 단언한다. API 타입 PASS, 실DB는 새 CI로 확인한다. 사용자 데이터 초기화·생산 규칙 변경 없음. Alpha space3에서 여전히 로그인 화면으로 확인돼 실제 QA 인증 gate는 남아 있다.

### PR #2553 배포 검증
- PR #2553 완료 후속: 수정 커밋 `bac4701c8`의 CI45939872223 Gates/API/Web PASS. 실제 PostgreSQL 226 suites/1714 tests PASS(3 skip), API unit 576 suites/9635 tests PASS. 새 reset integration도 PASS다. Copilot 요청은 실제 리뷰를 생성하지 않았으며 사용자가 이번 PR에 한해 리뷰 요건 예외를 명시 승인했다. clean 리뷰로 표시하지 않았다. `75df1a3c5`로 dev merge 완료. 후속 #2555가 포함된 최신 dev `50f3d767d`의 CI/Alpha 배포를 추적한다. 이 문서의 기존 인증 미확인 상태는 해소됐으며 정상 Alpha UI 로그인으로 검증한다. 자격증명·쿠키는 저장하지 않는다.
- QA 준비: 단일 관리자 persona, 전용 초안/비공개 대회 5종(4형식+단계형)만 새로 생성했다. 기존 사용자 대회 변경0. 변경 전 실제 대진 생성 3/6/7/6/3경기와 390/768/1440 캡처15개 확보. 전용 구장5개와 지원 형식의 등록 시간2개를 만들어 보존 기준을 저장했다. 변경 후 초기화/취소/빈 대진 오류/보존/3폭 검증은 배포 후 수행한다. QA 완료 후 해당 대회만 cancelled+private로 보관한다.

- 최종 Alpha PASS: 배포 `ba97444e8`에 #2553 포함 확인, health200/db=true. 플랫폼 관리자 persona로5종×3폭15/15 버튼·확인·취소 PASS(POST0·기존 경기3/6/7/6/3 보존). 실제 초기화5/5 POST각1·대진0·구장5개/시간2개·복수 결선/단계 정의 보존, 빈 대진 차단5/5·단계형 UI재생성3경기 PASS. 해당 흐름 Runtime exception0/HTTP error0, 모달 focus 내부·가로 overflow0·버튼44px. 전용5개 대회 cancelled+private로 보관, 사용자 대회 변경0. Alpha 신청0인 한계는 실DB4/6팀 신청 보존 검증과 구분한다. 증거/갤러리와 최종 cursor는 `qa/pr2553-alpha-evidence` 및 같은 PR에 보관한다. #2553 Phase4와 배포 QA 완료(기존 #2151 작업 전체 완료 의미 아님).

### 기존 구현 이력
- 최신 origin/dev 4a22824a5 기준 feat/preliminary-edit-reset 격리 worktree.
- Phase 1 API, Phase 2 UI 구현. API 28 tests / Web·공용 MSW 고유 22 tests PASS. API/Web tsc --noEmit --incremental false PASS. surface/pattern 및 diff whitespace·debt marker 검사 PASS.
- PR #2151 (dev), 초기 HEAD 5da742413. 실제 자리와 GroupTeam 생성 순서가 다를 때 hydrate/초기화 뒤 순서를 보존하는 회귀도 검증했다.
- API 첫 실행은 공유 Prisma Client가 구버전이라 컴파일 실패. 공유 생성물은 보존하고 격리 Client를 현행 스키마로 생성해 재실행 PASS.
- 실제 DB 통합 시나리오 2개 추가 및 support 권한 시나리오 확장. 로컬 PostgreSQL/Docker 없음으로 실행은 CI에 위임.
- Phase 3 진행 중: PR/CI/Copilot 및 Alpha 변경 후 QA. ffb004a59의 CI Gates/Web PASS, API 실제 PostgreSQL 검증은 진행 중이다. 후속 전체 경기 수 잠금 보완은 로컬 회귀 PASS 후 별도 커밋한다.
- Copilot 요청은 CLI와 공식 REST 모두 성공 응답이나 requested_reviewers=[], review_requested 이벤트/실제 리뷰 0이다. 보안 AI 스캔 성공을 Copilot clean으로 대체하지 않았고 dev 머지는 보류했다. 권한·요금제·머지 규칙을 변경하지 않았다.
- Alpha 관리자 UI 로그인 및 before 390/768/1440 screenshot PASS. uncaught/console 오류 0, 실패 HTTP 응답 0, 가로 overflow 없음. after 기능 0/5·viewport 0/3: 미머지·미배포.
- QA 전용 비공개 대회와 본인 소유 임시 팀 2개만 생성했다. 기준선 캡처 후 대회 cancelled + isPublic=false, 두 QA 팀 해체 완료. 기존 대회·팀 수정 0. 자격증명·쿠키·팀/대회 UUID는 커밋하지 않았다.
- Headed Chrome PID/Node PPID: 35420/18588, 17548/13228, 11472/28932, 26004/32164, 14528/30448, 15180/10424, 33376/12200, 33436/14488, 33224/1832. 각 시도는 finally에서 browser/context/server 종료 확인. 로그인 1차 load 대기와 후속 hydration/networkidle 대기는 harness 실패로 기록하며 API 실패로 오인하지 않는다. 최종 harness는 React 폼 hydration 이후 로그인했다.
- 스키마·migration 변경 없음. 관련 모델: Tournament/Group/GroupTeam/Standing/Slot/MatchDetails/TeamMatch/Game/AdvancementEdge 및 일정·감사 기록.
