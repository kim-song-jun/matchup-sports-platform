# Task 20261090: 신규 리그 모집 마감·명시적 시작과 기존 데이터 호환성

Status: In Progress (four-state display implementation; validation in progress)
**Created**: 2026-10-18
**Canonical branch**: `audit/league-state-consistency` (base `origin/dev` b7563a59c; prior implementation: PR #1977 and #1988)
**Canonical worktree**: `_worktrees/league-state-audit`

## Context
리그를 만든 뒤 대진 준비만으로 진행 중으로 보이는 문제. 사용자는 생성 → 모집 마감 → 리그 시작하기를 승인했고, 후속으로 PR 생성과 기존 데이터 무회귀를 요청했다.

## Goal
신규 리그만 명시적으로 시작하고, 기존 리그의 데이터와 동작은 유지한 dev 대상 PR을 만든다. 머지·배포는 요청 범위가 아니다.

## Original Conditions
- [x] 신규 독립 리그·시리즈 신규 시즌은 모집 마감으로 생성한다.
- [x] 신규 모드의 대진 생성/재생성·슬롯 배정·경기 활동은 자동 시작하지 않는다.
- [x] 리그 시작하기는 기존 mutation-admin 권한·상태 API·감사·에러 처리를 재사용한다.
- [x] 기존 draft/open/closed의 자동 진행·경기 시작을 포함해 기존 동작을 보존한다.
- [x] 기존 상태·신청·경기·공개·삭제 데이터의 UPDATE/삭제 없이 additive migration을 적용한다.

## User Scenarios
1. 관리자 생성 → 모집 마감 확인 → 팀/대진 준비 → 리그 시작하기 확인 → 진행 중 → 경기 시작.
2. 신규 리그의 시작 전 게임 start는 LEAGUE_NOT_STARTED로 거절한다. 조회 전용 계정은 시작할 수 없다.
3. 기존 closed 리그는 새 조건으로 막지 않고 예전처럼 대진/경기 활동으로 진행된다.
4. 모집을 다시 열면 모집 중으로 표시하되 신규 리그의 실제 시작은 별도다.

## Test Scenarios
- 공통 생성 경로에서 closed + requiresExplicitStart=true 저장.
- 기존/신규 모드 × closed/draft × 대진 생성/재생성 행 상태 검증.
- 기존 draft/open/closed 슬롯 채움과 경기 시작 유지, 신규 모드만 차단.
- 관리자 시작 payload·실패 표시·readonly 권한·모집 재오픈 표시.
- 실제 dev migration 체인 → 기존 7개 상태 삽입 → 신규 migration → 추가 컬럼 제외 전체 행 snapshot 동등성.
- 실제 스키마를 복제한 temp table에서 migration과 구버전 INSERT 기본값 false를 검증하는 DB integration 회귀.
- 생성/결과/몰수/자동 종료/NOWAIT/시리즈 승강 통합 시나리오에서 신규 리그를 명시적으로 시작한다.

## Parallel Work Breakdown
단일 에이전트가 API/DB → UI → 검증 → PR을 순차 처리한다.
Owned: v1 리그 생성·상태·경기 시작 소스, schema/additive migration, 관련 테스트/MSW/API 문서/QA/changeset.
Forbidden: 기존 운영 DB 변경, 공유 작업 폴더의 타 작업, main 대상 PR, dev 머지·실배포.
UI는 사용자가 승인한 기존 대회 방식이며 기존 헤더 Button·상태 모달을 재사용한다.

## Acceptance Criteria
- [x] 기존 7개 상태의 실제 migration 전후 데이터 보존 및 Prisma drift 0.
- [x] API 기존/신규 모드 unit 186개 통과.
- [x] 관련 DB assertion·시리즈 unit·양쪽 타입·표면/패턴 검사 검증(전체 DB runner 종료 대기는 아래에 별도 기록).
- [x] API 계약·정본 결정 이력·MSW·changeset 동기화.
- [ ] 정확한 파일 범위의 dev PR 검토·CI 정상 종료 확인.
- [ ] Alpha 로그인·390/768/1440·console/network·before/after 검증(머지 후).

## Tech Debt Resolved
대진 준비와 실제 시작의 결합을 해제한다. closed 상태만으로 구분하던 첫 로컬 구현은 기존 closed 행도 바꿀 수 있어 PR 전에 전용 모드로 보완했다.

## Security Notes
새 DTO 권한 우회 없이 getMutationAdmin·기존 감사 로그를 재사용한다. 게임 게이트는 커맨드 트랜잭션 안에서 상태 변경 전에 검사한다. 테스트는 운영 데이터와 분리된 전용 PostgreSQL과 승인된 integration DB 이름만 사용한다.

## Risks & Dependencies
- V1Tournament.requiresExplicitStart는 NOT NULL DEFAULT false다. 기존 행과 구버전의 신규 INSERT는 false이며 새 생성 공통 함수만 true다. migration 먼저 → 새 API 배포 순서를 따른다. 롤백은 컬럼을 남기며 데이터 재작성 없이 구버전으로 돌아갈 수 있다.
- 최초 공유 폴더의 무관한 WIP를 보존하고 최신 origin/dev 격리 worktree로 이번 변경만 이전했다. 공유 generated Prisma client를 덮어쓰지 않고 별도 client를 생성했다.
- Docker CLI는 WSL 오류라 Unix socket API를 사용했다. 시작 전 실행 컨테이너는 없었고 작업 소유 codex-league-start-compat만 생성·사용한다. 종료 때 이 컨테이너만 제거한다.
- Alpha 검증은 미배포이므로 0/3이다. PR 본문에 머지 후 갤러리 사유를 명시한다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-18 | 기존 closed도 수동 시작으로 바꾸나? | 아니오. 기본값 false의 별도 모드로 모든 기존 상태의 동작을 보존한다. |
| 2026-10-18 | 모집 재오픈을 막나? | 기존 마감 시각 계약을 유지하고 실제 모집 여부를 별도 표시한다. |
| 2026-10-18 | PR 이후 자동 머지하나? | PR 생성만 요청됐으므로 머지·배포하지 않는다. |

## Progress Snapshot

### 2026-10-19: 리그 상태 전체 감사·준비 중 진입 경로 (audit/league-state-consistency)
- 사용자 요청: 리그 상태 전체를 정리하고 준비 중이 언제·어떻게 접근되는지 확인한다.
- Scope: backend + frontend + docs. Phase 1(진행 중): 상태 저장·생성·전이·투영·필터·권한·화면 소비처 전수 목록화. Phase 2(대기): 의미·표시 불일치와 기존 호환성 영향 정리. Phase 3(대기): 사용자에게 상태표·전환도·노출 경로와 정리안을 제시한다. 새 상태 체계/화면 정보구조 변경은 A/B/C 선택 전에 구현하지 않는다.
- Owned: v1 리그 상태 관련 소스·테스트와 본 task. Forbidden: 기존 운영 데이터 백필/상태 변경, 무관한 공유 WIP, main. 병렬 에이전트 없음.
- Acceptance Criteria: [x] 상태 writer/reader 전체 경계 확인; [x] 준비 중 신규/기존/보류 복원/화면 진입 경로 명시; [x] 신청 마감·공개·경기 상태 분리; [x] 관리자/사용자 표시 차이와 종료 조건 대조; [ ] 코드 근거와 잔여 검증 범위 보고.
- Security: 코드·정본 중심 감사. 이전 Alpha QA 접근은 자동 승인 검토가 대상 리그 미지정을 사유로 차단했으므로 임의의 관리자 리그 열람·변경을 재시도하지 않는다. 계정·비밀번호·토큰은 파일에 기록하지 않는다.
- 기존 PR #1988은 dev에 b7563a59c로 머지됐고 Alpha run 39183981501 SUCCESS, 서빙 SHA 일치·HTTP 200·DB true를 확인했다. 이전 항목의 PR/배포 대기는 이 기록으로 supersede한다. 관리자 스크린샷 0/3과 Copilot 모델 세션 오류는 미해결 검증 제한으로 남는다.

#### 상태 모델: 저장·호환 API·표시는 서로 다르다

정본 소스: `apps/v1_api/src/tournaments/league-competition-mirror.ts`, `apps/v1_api/src/league-matches/league-state.ts`, `apps/v1_web/src/lib/v1-status-labels.ts`, `apps/v1_web/src/components/admin/admin-status-pill.tsx`.

| 저장 status | 리그 응답 state | 현재 의미·유입 | Alpha 공개 건수 |
|---|---|---|---:|
| draft | draft | 이전 v1 리그, QA seed, 복원 이력 누락 시 보류 해제의 기본값. 신규 정상 생성은 사용하지 않음 | 18 |
| open | draft | 예전 저장값 호환. 현재 모집 열기는 이 값으로 바꾸지 않고 마감 시각만 갱신 | 0 |
| closed | draft | 신규 리그 생성 및 진행 중에서 시작 취소 후 복귀 | 2 |
| in_progress | active | 운영자가 시작함. 기존 모드는 대진·슬롯·경기 활동으로도 자동 시작 | 26 |
| completed | completed | 유효 경기 공식 확정 조건을 충족해 자동/수동 종료 | 15 |
| on_hold | on_hold | 보류 전 상태·공개 여부 보존 후 비공개. 보류 해제로 원상태 복귀 | 비공개로 공개 목록에 없음 |
| cancelled | completed | 호환 매핑의 방어값. 리그 취소 정상 액션은 없고 보류를 사용 | 공개 목록 대상 아님 |

`draft` 응답이 곧 DB `draft`라는 뜻은 아니다. `draft/open/closed` 셋을 접은 **시작 전 그룹**이다. 현재 사용자 칩은 이 차이를 잃고 전부 준비 중으로 표시한다. 관리자 목록/상세는 lifecycleStatus=closed만 특별 처리해 모집 중/모집 마감으로 표시한다.

#### 실제 전이 경계: 14/14 확인

| # | 경계 | 저장 결과·조건 |
|---|---|---|
| 1 | 관리자 독립 리그 생성 | closed + requiresExplicitStart=true |
| 2 | 체계 첫 시즌 생성 | 공통 생성 함수 경유, closed + requiresExplicitStart=true |
| 3 | 승강 확정 후 다음 시즌 생성 | 같은 공통 생성 함수 경유, closed + requiresExplicitStart=true |
| 4 | 리그 시작하기 / state=active | draft/open/closed → in_progress. mutation-admin 필요 |
| 5 | 시작 취소 / state=draft | in_progress → closed. LIVE/PAUSED/ENDED 경기 있으면 409 |
| 6 | 보류 | 사유 필수. on_hold + isPublic=false, 이전 status/isPublic 기억 |
| 7 | 보류 해제 | 기억한 원시 status·공개 여부 복원. active 복귀면 종료 조건 재판정 |
| 8 | 관리자 수동 종료 | active만 가능. 취소·VOID 제외 유효 경기 1개 이상, 전부 OFFICIAL. plannedFixtureCount는 수동 종료에 적용하지 않음 |
| 9 | 종료 되돌리기 | completed → in_progress. 이 액션 자체에서 즉시 자동 종료 재판정하지 않음 |
| 10 | 대진 생성 | requiresExplicitStart=false 기존 모드만 자동 in_progress |
| 11 | 대진 재생성 | 위와 동일. 신규 명시적 시작 리그는 closed 유지 |
| 12 | 슬롯 팀 배정 완료 | 기존 모드만 빈 자리 없는 슬롯 대진 존재 시 자동 in_progress |
| 13 | 경기 시작/공식 결과 활동 | 기존 모드만 자동 in_progress. 신규 시작 전 게임 start는 LEAGUE_NOT_STARTED |
| 14 | 자동 종료 투영 | active이며 유효 경기 전부 OFFICIAL, plannedFixtureCount가 있으면 그 수도 충족 |

소스: `league-match-admin.service.ts`, `league-series-admin.service.ts`, `jobs/league-roster/league-roster-autoconfirm.service.ts`, `league-slot-status.ts`, `league-completion-projection.service.ts`, `league-lifecycle-rules.ts`, `games/games.service.ts`.

- 일정 시작일·종료일이 지났다는 이유만으로 리그 상태가 자동 전환되지는 않는다. 명단 자동 확정 job은 명단을 채우며 리그 시작 명령을 대신하지 않는다.
- 대진이 없거나 취소/무효 경기만 남은 리그는 자동/수동 종료의 유효 경기 조건을 충족하지 못한다.
- 새로 만들기와 시작 취소에서는 실제 draft를 만들지 않는다. 공통 대회 관리자 상태 변경은 TOURNAMENT_KINDS로 제한되어 리그를 draft로 바꾸는 우회 입구가 아니다.
- QA 전용 `prisma/seed-alpha-league-qa.ts`에는 시즌 티어를 raw draft로 직접 만드는 코드가 남아 있다. 일반 관리자 생성 경로와 분리해서 보아야 한다. seed 실행·데이터 변경은 하지 않았다.

#### 준비 중의 생성·복원·화면 접근

1. **기존 raw draft 리그**: 공개 여부가 true이면 `/tournaments?kind=league&status=draft`의 준비 중 필터에서 접근할 수 있다. 현재 18건이 실제 공개 조회된다.
2. **새 closed 리그**: 공통 상세는 closed지만 전용 리그 API에서는 state=draft다. 내 리그·리그 전용 상세·경기 상세·형제 티어 칩은 이 응답을 준비 중으로 그린다. 새 리그도 준비 중으로 보이는 경로가 존재한다.
3. **보류 해제**: 원래 draft였다면 실제 draft로 복귀한다. 원래 closed였다면 DB는 closed로 복귀하지만 모달의 heldFromState는 draft라 준비 중이라고 안내할 수 있다. heldFromStatus가 없으면 서버는 실제 draft로 복원하는 fallback을 쓴다.
4. **종료 리그의 상태 변경 모달**: 준비 중 선택지가 보이지만 비활성화되어 직접 진입할 수 없다. 진행 중으로 먼저 복귀해야 하며, 실제 시작한 경기가 있으면 모집 마감 복귀도 차단된다.
5. **진행 중 리그의 상태 변경 모달**: PR #1988 이후에는 준비 중이 아니라 모집 마감으로 표시하고 실제 closed로 저장한다. 이 경로로 DB draft를 만들 수 없다.
6. `/league-matches?state=draft`는 `/tournaments?kind=league&status=draft`로 redirect한다. 전용 API의 draft 그룹은 20건인데 도착하는 통합 필터는 raw draft 18건만 조회한다. 같은 이름의 필터가 다른 범위를 가리킨다.

#### 표시·진입 표면: 15/15 정적 확인

| # | 표면 | 현재 표시·관찰 |
|---|---|---|
| 1 | `/tournaments?kind=league` 및 상태 필터/옛 목록 redirect | draft=준비 중, closed 카드는 모집 마감. 준비 중 필터는 raw draft만 포함 |
| 2 | `/tournaments/:id` 공통 상세 | raw closed를 공통 helper로 마감이라고 표시. 카드·관리자와 용어 불일치 |
| 3 | `/league-matches/:id` 상세·형제 티어 | state=draft를 준비 중으로 표시. 현재 page.tsx는 실제 전용 client를 렌더함(redirect라는 인접 주석은 낡음) |
| 4 | `/league-matches/:id/fixtures/:fixtureId` | 리그 · 준비 중 칩. 경기 자체의 예정/진행/종료와 별도 축 |
| 5 | `/league-matches/:id/awards` | 같은 draft 칩. 종료 전 접근은 해당 화면의 비종료 안내로 처리 |
| 6 | `/my/leagues` | 내 리그 카드에 준비 중, 링크는 공통 `/tournaments/:id`로 이동 |
| 7 | `/admin/league-matches` 개별 리그 목록 | closed만 lifecycleStatus + registrationOpen으로 모집 중/모집 마감 |
| 8 | `/admin/league-matches/:id/*` 공통 헤더 | 목록과 같은 pill, state=draft면 시작하기 노출 |
| 9 | 관리자 상태 변경 모달 | active → draft만 모집 마감 특례. 보류 복원·종료 선택·toast에는 준비 중이 남음 |
| 10 | `/admin/league-series/:id` 시즌 티어 카드 | generic AdminStatusPill(tier.state) 사용. draft는 초안, active는 활성으로 표시되어 리그 전용 용어와 다름 |
| 11 | `/admin/ops/tournaments` 현장 운영 선택 | state만 전달하며 lifecycleStatus/registrationOpen을 버림. 새 closed도 준비 중으로 표시 |
| 12 | 마이의 대회·리그 운영 스태프 카드 | raw status 공통 helper 사용. closed는 마감 |
| 13 | 팀 상세의 대회·리그 참가 섹션 | 주 배지는 참가 신청 상태. 리그 수명주기와 구분해야 하며 종료 사유 일부만 공통 helper로 표시 |
| 14 | 홈 대회·리그 추천 | 실제 신청 가능 여부로 추천을 거름. 준비 중 수명주기 칩을 직접 표시하는 표면은 아님 |
| 15 | `/llms-full.txt` 리그 요약 | state만 leagueStateLabel에 넣어 시작 전 그룹을 준비 중으로 표현 |

핵심 source: `competition-status.ts`, `v1-status-labels.ts`, `v1-tournament-status.ts`, `competition-filter-model.ts`, `tournament-list-query.ts`, `league-match-public.service.ts`, `admin-status-pill.tsx`, 각 표면의 client 파일.

#### 세 축을 섞으면 안 되는 이유

- **수명주기**: 시작 전 / 진행 / 종료 / 보류. 현재 호환 API는 draft / active / completed / on_hold다.
- **모집**: 명시적 registrationDeadlineAt 기준. null 또는 지남은 안 받음, 같은 시각까지는 받음. 진행 중에도 열 수 있고, 시작 취소를 해도 마감 시각은 바뀌지 않는다. 정원·참가비 설정·팀 권한 등의 신청 자격 게이트는 별도다.
- **공개**: isPublic. 비공개와 준비 중은 동의어가 아니다. 공개 draft 리그는 정상적으로 목록/상세에 노출된다. 보류는 isPublic=false를 동반한다.
- **경기**: SCHEDULED/LIVE/PAUSED/ENDED/CANCELLED 및 결과 확정 단계는 리그 단계와 별도다. 진행 중 리그에 아직 시작하지 않은 경기가 있을 수 있다.
- 추가 정책 경계: `isLeagueRegistrationOpen`과 등록 서비스의 리그 신청 판정은 on_hold를 직접 차단하지 않고 completed/cancelled만 차단한다. 보류를 모집 중단까지 의미하게 바꿀지는 별도 결정이 필요하며, 이번 감사에서는 API 쓰기로 재현하거나 정책을 임의로 바꾸지 않았다.

#### Alpha 공개 실측과 한계

- 배포 SHA: b7563a59ca7f9ff1d556b1e7b66a480af9519686. 인증 없는 공개 GET만 수행했다.
- `GET /api/v1/tournaments?kind=league&status={...}&limit=1&page=1`: draft 18 / open 0 / closed 2 / in_progress 26 / completed 15, 공개 합계 61. 비공개·보류·삭제 데이터의 전체 DB 분포를 뜻하지 않는다.
- `GET /api/v1/league-matches?state=draft&limit=50`: 20건, hasNext=false. 통합 준비 중 필터 18건과 2건 차이.
- 공개 목록에 이미 노출된 리그 `8a91fb89-f5b6-4222-a6ff-2f8629fe3c3f`는 전용 API state=draft, 공통 상세 API status=closed, registrationDeadlineAt=null임을 대조했다. 실제 데이터에서도 두 어휘가 갈린다.
- 관리자 UI의 실제 클릭·저장·3폭 캡처는 미실행. 앞선 자동 승인 검토의 대상 미지정 제한을 우회하지 않았으며 비공개 데이터·계정·토큰을 기록하지 않았다.
- 감사 시점에는 runtime 소스·schema·데이터 변경 없이 문서만 수정했다. 아래 후속 구현은 4상태 결정을 반영한다. 런타임 테스트/전체 build를 반복 실행하지 않고 근거 검색·공개 CLI 조회·diff check로 감사 결과를 확인한다.

#### 최초 제안 (아래 4상태 최종 결정으로 대체됨)

| 안 | 원칙 | 장점 | 단점 |
|---|---|---|---|
| A | 준비 중 유지, lifecycleStatus/모집 정보를 소비처까지 전달해 화면 간 표시 일치 | 기존 의미·호환성 보존 | 준비 중과 모집 마감의 차이를 계속 설명해야 함 |
| B (추천) | 내부 draft는 호환용으로 두고 화면을 모집 중·모집 마감·진행 중·보류·종료로 통일 | 현행 운영 흐름에 맞는 단순한 어휘 | 실제 모집/진행 조합은 별도 계약으로 보존해야 함 |
| C | 시작 전·진행 중·종료·보류와 모집 열림/닫힘을 별도 표시 | 실제로 독립인 두 축을 가장 정확하게 표현 | 배지·필터·모달의 정보구조가 더 복잡해짐 |

`CLAUDE.md` UI 착수 규칙에 따라 화면 정보구조/어휘의 변경은 사용자의 A/B/C 선택 후 구현한다. 최초 B 선택 뒤 사용자가 4상태로 정정했다. 기존 데이터 백필·모집 중단 정책·경기 게이트 변경까지 자동 승인된 것으로 해석하지 않는다.

### 2026-10-19: 시작 취소 후 모집 마감 복귀 (fix/league-status-rollback)
- Context / Goal: 진행 중을 모집 마감으로 되돌리고 dev 대상 PR을 생성한다. 머지·배포는 범위 밖이다.
- Owned: 리그 상태 서비스·모달·관련 회귀 테스트·API 계약·changeset·본 작업 문서. Forbidden: 운영 DB 변경, 다른 작업트리, main.
- Original Conditions / User Scenario: 관리자가 상태 변경에서 모집 마감을 선택하면 아직 시작한 경기가 없는 리그가 closed로 복귀하고 다시 시작할 수 있어야 한다.
- Test Scenarios: active → closed → active, 시작한 경기 차단, 멱등성, 모달 선택·성공·API 실패 표시. 기존 보류·종료 권한과 오류를 보존한다.
- Parallel Work Breakdown: 단일 에이전트가 순차 구현·검증·PR 생성한다.
- Acceptance Criteria: [x] 상태·화면 회귀 통과; [x] 양쪽 타입·surface/pattern 검사; [x] dev PR 생성; [ ] CI·Copilot 결과 확인.
- Tech Debt Resolved: 호환용 draft API 값과 실제 closed 수명주기를 구분한다.
- Security Notes: 기존 mutation-admin 확인·시작 경기 차단·조건부 UPDATE·감사 로그를 유지한다. 신규 권한·스키마 변경 없음.
- Risks & Dependencies: API의 draft 요청/응답과 감사 action은 호환성을 유지하고 저장 status만 closed로 바꾼다. 신청 마감 시각·공개 여부·대진은 보존한다. UI는 기존 상태 모달의 목표 라벨과 설명만 맞춘다.
- Ambiguity Log: 사용자 요청의 '반대'는 진행 중 → 모집 마감 복귀이며, 이미 경기가 시작된 리그는 기존 차단을 유지한다.
- QA: alpha 화면 검증은 미배포이므로 0/3. PR 생성 범위에서 머지하지 않으며 갤러리는 머지·alpha 배포 이후 보완한다.
- 검증 증거: API 상태 unit 4/4, Web 모달 9/9 PASS. API 타입·surface PASS. 공유 Prisma client가 최신 스키마와 달라 최초 unit은 실행 전 타입 오류로 실패했으며, /tmp의 전용 client와 타입 매핑으로 검증했다(공유 client 변경 없음). Web 최초 2건 실패는 beforeEach가 mock 함수를 cleanup으로 반환하던 테스트 결함으로, 반환 제거 후 9/9 PASS.
- DB integration은 Docker daemon 미기동으로 로컬 미실행. 기존 실제 HTTP integration에 closed 저장·detail 투영·멱등·재시작 단언을 추가했고 CI에서 확인한다. 개발 서버·브라우저·운영 DB는 실행/변경하지 않았다. 임시 보조 소스는 삭제했다.
- Web 첫 타입 검사는 누락된 persist/validator 패키지와 기존 leave-team 테스트의 mutate 인수 누락 2건으로 실패했다. /tmp에 manifest 버전의 누락 의존성을 설치하고 작업트리 전용 링크로 보완했다(공유 설치 변경 없음). 후자는 `apps/v1_web/src/hooks/use-v1-api.leave-team.test.tsx`의 두 호출만 `mutate(undefined)`로 명시해 타입 오류를 바로잡고 해당 2개 테스트도 검증한다. 이 파일을 Owned에 포함한다.
- 최종 Web 검증: 타입·pattern PASS, 모달 9/9 + leave-team 2/2 PASS(최소 worker 1, 정상 exit 0). 임시 npm 설치의 Query peer 버전 중복은 관련 패키지 5.102.8 고정으로 해소했다. API 타입·surface PASS와 합쳐 양쪽 정적 검증 완료. Alpha는 미실행이며 DB integration은 CI에 남는다.
- [PR #1988](https://github.com/kim-song-jun/matchup-sports-platform/pull/1988), base=dev, MERGEABLE 확인. API 최종 unit 4/4 정상 exit 0으로 고유 테스트 총 15/15 PASS. CI 실행 중이며 Copilot 리뷰 요청 완료. 미머지·미배포이고 Alpha 갤러리 0/3은 후속이다. 작업트리에는 추적 소스 미커밋 변경이나 미추적 runtime 의존성이 없다.
- 실제 전체 기존 migration 체인 재생 성공. 신규 migration 뒤 기존 7개 상태 전체 컬럼 snapshot 동일, 새 필드 전부 false. fixture 정리 완료.
- Prisma migrate diff: No difference detected.
- 모드 분리 후 API 4개 unit suite 186개 + 시리즈 2개 suite 6개, 고유 unit 총 192개 통과.
- 초기 DB suite 시작은 설치된 jest-environment-node 연결 누락으로 0 tests 실패했다. 격리 dependency 링크를 보완했다.
- 첫 Nest 전체 import가 Windows 마운트에서 15초 hook 제한을 넘어 후속 템플릿 복제도 실패했다. 해당 테스트 프로세스 종료와 base DB 연결 0을 확인하고, 로컬 실행에만 --testTimeout=120000을 적용해 재검증한다. 저장소 제한/검증 assertion은 바꾸지 않는다.
- 이전 로컬 UI 검증은 API176/Web38·양쪽 타입 PASS였다. 신규 marker 도입 후 backend 및 최신 dev에서의 최종 검증을 진행 중이다.
- 코드에 신규 runtime 파일/미추적 import 없음(신규 소스 파일은 spec뿐), dependency 링크·개인 설정·환경 파일은 PR 범위에서 제외한다.

### PR final validation progress
- DB integration 7개 suite 68개 assertion PASS. 해당 로컬 Jest가 종료 대기에 남아 명령을 확인한 소유 PID만 SIGTERM으로 정리했다. command exit를 PASS로 바꾸거나 forceExit로 숨기지 않는다. 신규 migration 단독 DB 회귀는 1/1 PASS, 정상 exit 0이며 기존 데이터 snapshot과 구버전 INSERT를 검증했다.
- API 타입 검사 PASS. 표면 검사가 불필요하게 추가된 raw 잠금 1곳을 검출해 제거했다. 상태 UPDATE의 기존 CAS를 유지하며, API surface는 baseline 32/32로 PASS다. 관련 상태 unit을 다시 확인한다.
- 최종 Web38·양쪽 타입·API surface·Web patterns 모두 PASS. 신규 marker 0, git diff --check PASS, exact pathspec 34개 파일 확인. 작업 소유 PostgreSQL 컨테이너·볼륨은 제거했고 테스트 프로세스도 종료됐다. 커밋 SHA 기준 migration/changeset 게이트와 PR/CI가 후속이다.

### PR #1977 CI follow-up (2026-10-18)
- Head 613a3dded의 CI run 39129731346: Web PASS, Gates/API FAIL. 실패 원인은 스키마 체크섬 미동기화와 신규 리그를 자동 시작으로 가정한 기존 통합 스펙 4곳이다.
- 실제 신규 스키마 SHA-256 23d87a502b12225fce2a6c5926cc272c14212da9da957cf4f5c26fb26b076644로 현재 binder·Docker client attestation·game snapshot을 갱신하고, manifest 생성·검증에는 기존 허용 체크섬을 보존하며 추가한다. M11·StageB 고정 계약은 바꾸지 않는다.
- 공개 상태 필터는 대진 생성 후 draft 유지, 실제 시작 API 후 active를 모두 단언한다. 시즌 승계·경합 fixture는 실제 시작 API를 거쳐 원래 검증 목적을 유지한다. 생성 dual-write 스펙은 closed+명시적 시작 모드를 확인한다.
- final-schema-binding 7/7 PASS. 첫 로컬 실행의 manifest 실패는 jq 미설치 때문이며, 공식 jq 임시 도구 설치 후 동일 계약·부정 테스트까지 통과했다.
- GitHub Advanced Security run 39129735820은 `session.create failed: Model "claude-opus-5" is not available`로 분석 시작에 실패했다. 코드 finding/clean 리뷰가 아니며 모델·계정 설정을 바꾸거나 반복 요청하지 않는다. Copilot 제출 리뷰·inline comment는 현재 0건이다.
- CI에서 실패한 5개 DB suite + 기존 데이터 migration 회귀 1개를 전용 DB에서 직렬 재검증: 6 suites/30 tests PASS, 정상 exit 0. 전체 migration deploy도 PASS. bash syntax·git diff --check PASS. 전용 DB/볼륨 정리 후 보완 커밋을 push하고 새 CI를 확인한다.
- 보완 API 타입 검사 exit 0. 이미지 빌더 client attestation과 release manifest 생성 허용 목록까지 canonical SHA와 5곳 일치 확인.


### 2026-10-19: 최종 4상태 정리 (사용자 정정 반영)
- 최종 승인: 모집완료·진행 중·보류·종료. 앞선 B의 5상태 제안을 supersede한다. 모집 가능 여부는 별도 정보이며 이번 변경에서 모집 창·정원 정책을 바꾸지 않는다.
- Phase 1 [x]: writer 14개 경계·화면 15개 감사. 추가 확인한 참가 명단 상태 카드 1개까지 표시 경계 16/16을 처리한다. 결산 화면은 종료 전 안내를 먼저 반환하므로 준비 중 칩이 렌더되는 곳은 아니었다.
- Phase 2 [x]: 공통 라벨·관리자 pill/보류 복원/모달/toast·시즌 티어·공통 목록/상세·선수 명단·담당 대회 연결. 리그 API draft 호환 값과 raw draft/open/closed 매핑은 유지한다. 현장 운영 선택·내 리그·전용 상세/경기·형제 티어·llms는 기존 공통 라벨을 통해 일치한다.
- Phase 2 [x]: 공개 목록 status=draft를 raw draft/open/closed 전체로 보완해 옛 목록 redirect와 전용 API 그룹을 일치시킨다. 일반 대회 draft 노출 차단은 유지한다. 담당 대회 API에 tournamentKind만 추가한다.
- Phase 3 [ ]: 좁은 회귀·양쪽 타입/surface·diff·문서 검증. DB integration은 Docker daemon 미기동으로 CI 검증 대상으로 남는다.
- Phase 4 [ ]: 검토 가능한 커밋/PR와 잔여 Alpha QA 보고. Alpha 관리자 화면 0/3이며 특정 비공개 리그 대상이 미지정된 기존 자동 승인 제한을 우회하지 않는다.
- 저장소 schema·migration·실제 DB 변경 없음. 이전 5상태 구현 중 추가한 모집 집계/응답/필터는 제거했다. 일괄 파일 복원 시도는 auto-review가 미커밋 작업 덮어쓰기 위험으로 거절했으며, 이후 파일 전체 복원 없이 이번 작업의 명시적 변경 부분만 수정했다.
