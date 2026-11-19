# Task 20261130: 단계·편성·진출 규칙으로 구성하는 대회

## 2026-11-19 전체 정식 흐름 재검증 — 진행 중

Alpha 관리자 실제 로그인과 정식 생성·접수 시작 완료. 소유 대회 `f5f3d600-a663-4e9d-a8d9-61ae3c1817c7`, `(테스트) 정석 20팀 순위별리그 1119`.
20팀·등록7명·동시출전6명·롤링 교체·예선5조→순위별본선4리그 구성이다. 신규 가상 신원140명/팀20개만 Alpha 가드·충돌 검사 후 fixture로 준비했고 신청/선수/경기/결과는 주입하지 않았다. 회원가입·본인인증 PASS를 주장하지 않는다.
첫3팀 신청·21명 선수 등록은 ego-lite UI로 완료, 나머지19팀 배치는 팀별 체크포인트를 기록하며 진행 중이다. 예선·결선 공식 결과는0/70이다.
실제 생성 폼에서 템플릿 버튼의 기본 submit 때문에 확인 대화상자가 사라지고 다음 단계로 넘어가는 결함을 확인했다. StagePlanEditor의6개 편집 버튼을 type=button으로 고쳤다(공용 Button 기본값은 유지).
생성 form 안에서 실제 템플릿 클릭→submit 발생 RED1, 수정 후 기존4+신규1=5/5 GREEN. Web tsc 통과, 패턴 검사는 cmd의 GNU 도구 부재로 실패 후 Git Bash에서 통과. 로컬 Node24 엔진 경고를 숨기지 않으며 Node22 CI 결과를 추가 확인한다.
이 버그 수정 Owned를 stage-plan-editor.tsx/test.tsx와 해당 changeset으로 확장한다. QA 운영·증거는 같은 작업의 후속이며 이번 수정의 Alpha 재검증은 배포 후 진행한다.

사용자가 20팀·팀당7명·풋살 동시출전6명으로 신청부터 결과 입력까지 다시 테스트하도록 요청했다.
[실행 계획](../../docs/scenarios/ranked-leagues-full-flow-20261119.md)에 전체 수와 출전/교체 경계·권한·증거 기준을 고정했다.
Phase1 컨텍스트·범위 확정 완료. Phase2 Alpha 신청/접수0/20, Phase3 예선0/30·결선0/40, Phase4 최종 검증0/1·viewport0/3은 대기다.
ego-lite 0.6.3.17 설치·최초 설정 완료, 실제 TaskSpace1/p1 Alpha 이메일 로그인 화면을 확인했다. 관리자 자격증명 미제공으로 handOff 완료, 사용자 관리자 로그인 확인 뒤 같은 공간에서 재개한다.
Owned: 이 task, 새 시나리오, docs/scenarios/index.md. Forbidden: 기존 완료70경기·20팀140계정 변경, 운영 데이터 쓰기, main 승격, 다른 worktree.
Progress Snapshot: qa/ranked-leagues-20261119, base d80cf9d58. 새 대회/팀/계정 생성0, 신청0/20, 결과0/70. 이전 실행 PASS는 합산하지 않는다.
Acceptance: 새 대회의 정식 UI 신청20/20 → 예선30/30 → 순위별 결선40/40 → 종료, 등록7/동시출전6/교체 보존·권한·공개 결과 증거.
Ambiguity: 결선 회전수는 단일 회전으로 가정하며 추가 확인 시 갱신한다. 미커밋 계획은 브라우저 연결 후 이어가기 위해 소유 worktree에 보존한다.

Status: 추가 리뷰 완료 — P2 2건 dev PR #2427 반영, Alpha 구성3+기존39=42/42 및 실제 재개 회귀 통과
Status: Review — dev PR #2442의 입력 동등성4건에 생성·접수5건 추가 수정. 서버360·Web181개 관련 회귀 PASS, API/Web 타입·규칙 통과, 기존 PR 갱신. CI·리뷰/Alpha는 별도 gate. 이전 #2427 Alpha 42/42는 아래 과거 기록.
Created: 2026-11-09
Owner: Codex
Scope: v1 backend + frontend + schema/API/scenarios + Alpha runtime 호환성.

## 2026-11-18 입력 동등성 리뷰 후속

### 생성·신청 추가 리뷰 5건 — 후속 수정
- 사용자 요청: 동시 제출 상태 덮어쓰기, 취소/종료 대회 참가 확정, 시간 일부 저장 실패 후 복원, 지난 마감 접수 시작, 초안 조회 실패의 새 생성 전환을 수정한다.
- 기준: 기존 PR #2442 브랜치에 최신 origin/dev `886fd0b29` 병합. 기존 PR의 Gates/API/Web PASS. 별도 main 변경·머지·배포 없음.
- Owned: 신청/관리자 접수/대회 상태 서비스와 회귀·통합 스펙, 생성 위저드·모델·신청 관리 UI와 회귀, API 문서·changeset·이 task/scenario/index.
- Forbidden: 다른 WIP와 stash, 실제 사용자/결제/대회 데이터, Prisma schema·seed/reset, main 승격. 앞선 4건의 API 무변경 범위와 구분하며 이번에는 오류·상태 gate API 계약을 동기화한다.
- [x] Wave A: 실패 회귀, 서버 신청 상태 재검증/CAS·종결 대회 확정 차단·지난 마감 open 차단.
- [x] Wave B: 초안 로딩/오류 차단, 복원 뒤 저장된 경기 시간 재검토·명시 저장 전 접수 차단, 종결 대회 확정 UI 차단.
- [x] Wave C: 관련 단위·API/Web 타입/규칙·문서 완료, 기존 dev PR #2442 갱신. DB 통합·새 head CI·Alpha는 아래 별도 gate.
- Acceptance: 동시·취소 경쟁이 신청/결제/알림을 중복 변경하지 않음; cancelled/completed의 새 확정·대기 금지; 새로고침 복원이 곧바로 접수를 열지 않음; 실패한 초안 조회가 새 POST를 만들지 않음; 과거 마감으로 open 성공을 표시하지 않음.
- 로컬 회귀: 수정 전 서버9건 RED → 서버3 suites360 tests PASS. Web 생성104·신청관리41·생성모델32·리그신청4 = 4 suites181 tests PASS(파일별 최종 실행 결과 합계). 복원 진입 계약 변경에 맞춰 기존 직접 확인 진입 테스트를 명시 저장 흐름으로 변경하고, 이전 테스트의 미소비 mockOnce가 다음 테스트로 새는 fixture도 reset했다.
- 검증 상세: Web tsc·패턴, API 최신 schema 생성물 기준 tsc·표면 gate, patch changeset·공백 diff PASS. API 첫 타입 검사는 공유 의존성의 오래된 Prisma 생성물 때문에 실패했다. /tmp에만 최신 schema client를 생성하고 임시 tsconfig paths로 다시 검사해 PASS; 원본 의존성/DB/환경 파일은 건드리지 않았다. 마지막 시간 조회 실패 중 단계 이동 차단 회귀1/1 PASS. 새 TODO/FIXME/HACK/XXX 없음.
- 미실행: Docker/DB 런타임 미제공으로 DB 동시 요청 실측 미실행. 사용자 요청대로 PR까지만 갱신하며 Alpha6 routes×3 viewport=0/18, 새 CI는 push 후 PR에서 확인한다. Copilot ACTOR_INELIGIBLE blocker는 유지한다.
- 결정: DB 필드는 추가하지 않는다. 복원된 초안은 서버에 저장된 경기 설정을 다시 표시하고 명시적으로 저장한 뒤 공개 확인을 허용한다. 실패한 미저장 값을 저장 성공으로 복구했다고 표시하지 않는다.

Status: Review — 사용자 요청: 확인된 입력/표시 결함 수정 후 dev 대상 PR 생성.
- Base: `origin/dev` `4efec6c39`; branch `fix/stage-input-review-20261118`.
- Owned: 단계·편성 시간 편집기, 공통 시간 검증·안내, 대회 생성/정보 화면과 관련 회귀, changeset, 이 task 및 단계형 시나리오.
- Forbidden: 다른 WIP·stash, 실제 대회/경기 데이터, DB schema/API 규칙 변경, main 승격·PR 자동 머지.
- [x] Phase 1: 네 결함(시간 CAS, 형식/정원 제어·라벨, 시간 상속 안내, 입력 범위)의 회귀 RED 확인.
- [x] Phase 2: 기존 컴포넌트와 서버의 1분 이상 정수 계약에 맞춰 수정.
- [x] Phase 3a: 관련 회귀·Web 타입/패턴·diff 범위 확인.
- [x] Phase 3b: 커밋·dev PR·리뷰 요청.
- PR: [#2442](https://github.com/kim-song-jun/matchup-sports-platform/pull/2442), base `dev`, 구현 `62a3369b6`, 15 files. 로컬217 tests·Web 타입/패턴·changeset 정책·커밋 diff PASS. 최신 원격CI 진행 중, Copilot CLI/REST 요청 수행(대기 목록은 빈 배열·리뷰 아직0건이므로 clean으로 판정하지 않음). 사용자 요청대로 머지·배포는 실행하지 않았다.
- 외부 리뷰 blocker: 공식 `POST /pulls/2442/copilot-code-review`가 HTTP422 `ACTOR_INELIGIBLE`(actor 코드리뷰 라이선스/조직 정책 자격 불충족)로 거절했다. 추가 반복 요청·계정/요금제/정책 변경은 하지 않는다. Copilot clean 또는 PR-ready로 표시하지 않으며 CI 진행 및 Alpha0/12와 함께 PR 본문에 명시했다.
- Acceptance: 조회 갱신·충돌 뒤 옛 입력으로 최신 시간 덮어쓰기 금지; 명시 확인 재조회; 단계형 형식/정원은 구성 경로로 안내; 별도 시간 설정의 실제 이름·값 표시; 생성/수정/편성 시간 입력 계약 일치.
- Ambiguity: 최소 보장 경기 수·회전 수·240경기 등 대회 운영 규칙 차이는 이번 버그 수정으로 확대하지 않는다. 시간 상한은 서버 DTO의 기존 양의 정수 계약을 따른다.
- QA: 사용자 요청은 PR 생성까지다. 변경 후 Alpha `/admin/tournaments/new`, `/admin/tournaments/new-staged`, `/admin/tournaments/:id/info`, `/admin/tournaments/:id/bracket` 4 routes × 390/768/1440 = 0/12. console/network도 dev 머지·배포 이후에 가능하며 미실행 상태를 PR에 명시한다.
- Progress Snapshot: 네 결함을 검증하는 회귀 RED를 확인한 뒤 수정. 최종 관련6 suites217 tests PASS(정보43·공통시간18·생성모델32·단계관리13·단계시간13·생성화면98), Web `tsc --noEmit` 및 패턴 검사 PASS. 생성화면의 기존 서로 다른 테스트에서 로컬 5초 timeout을 관찰해 단언 변경 없이 해당 파일을 `--testTimeout=15000`으로 재실행해98/98 PASS. 시간 규칙을 가리키던 테스트 문구·상한 단언만 새 계약으로 수정했다. 타입검사는1회, 패턴 검사의 하위 셸 EPERM은 권한 있는 동일 검사 재실행으로 해소했다. DB·API 변경 및 migration 없음.


## Context
최신 resume cursor(2026-11-17): `fix/stage-structure-draft-resume-20261117`, base dev `9f157aa57`.
Owned: stage-plan-manager/structure-editor와 해당 테스트, stage-design QA 도구/검사, structure Alpha 증거, changeset 및 이 task/scenario/index. Forbidden: 다른 worktree/WIP, 기존20팀70경기 결과 변경, main 승격.
- [x] 구성 editor의 revision key 제거, 초안 baseline/CAS 및 충돌 저장 차단·확인 재조회.
- [x] 재개 format3 + full/filter/admin-bottom scope 분리, route/viewport별 필수 조작 검사.
- [x] UI 회귀13/13·재개9/9, Web 타입/패턴·커밋 diff 검토 및 dev PR #2427 전체CI/머지.
- [x] 별도 비공개20팀 초안 대회로 390/768/1440 실제 UI 재현3/3→수정3/3·PNG9개, 원래70경기 보존 확인.
- [x] Alpha dbea6a5f585ec2eff60d212e9fbf5036ab00ab61에서 기존39/39, 필수 조작 기록 제거 후 실제 --resume의 관리자3개 재검사 확인.
최신 Progress Snapshot: #2427은2f5c166ff로 dev 머지됐다. 다른 PR #2424 후속 머지로2f5c CI가 취소돼 해당 Alpha job은 matching-CI gate에서 중단됐고, 수정을 포함한 최신 dbea6a5f5의 전체CI·Alpha 배포 성공 후 검증했다. 구조 before/after·필수 재개 조작·기존39 화면·원래70경기 모두 PASS. 증거는 시나리오 최신 절과 JSON을 따른다. 아래 최초 계획 체크리스트는 이번 P2 후속에서 새로 전 항목을 수행했다고 표시하지 않는다.
Ambiguity: 완료 대회는 구성 탭이 없어 기존39개 화면만으로 해당 결함을 증명할 수 없다. 실 API로 별도 초안 fixture를 준비하고 실제 UI로 조작한다. 대회 DELETE API가 없어 비공개 재사용 초안으로 보존하며 선수/경기는 만들지 않는다.

사용자는 정규리그 + N개 토너먼트와 기존 조별리그 + 토너먼트의 통합을 검토하며,
20팀 → 4팀씩 5개 예선 풀리그 → 각 조 동일 순위끼리 5팀씩 4개 본선 풀리그를 요청했다.
이 사례만 위한 진행 방식을 추가하지 않고 여러 단계·복수 리그·복수 토너먼트를 조합해야 한다.

기존 연관 작업: 20261057-admin-bracket-canvas.md, 20261111-preliminary-edit-reset.md,
20261113-bracket-group-name-filters.md. 이 문서는 다단계 구성 확장의 canonical task이며
기존 작업의 별도 수정·배포 상태를 완료로 재분류하지 않는다.
시나리오 상태는 docs/scenarios/index.md와 교차 확인했다. 과거 문서의 미배포 표기는 현행 기능 부재의 증거로 쓰지 않는다.

## Goal
하나의 대회에서 순서가 있는 단계를 만들고, 단계마다 복수의 리그/토너먼트 편성을 두며,
이전 단계의 공식 순위·성적을 다음 단계 참가 자리로 연결한다. 기존 경기·결과·권한을 보존한다.

## Original Conditions
- [x] 예선 풀리그 → 순위별 본선 풀리그, 20팀 70경기 사례 지원.
- [x] 리그 → 토너먼트, 리그 → 복수 리그/토너먼트, 3단계 이상 지원.
- [x] 고정된 대회 조합 enum을 계속 늘리지 않고 공통 구성 모델을 사용.
- [x] 기존 대회 ID·경기 ID·일정·공식 결과·영상·스태프 연결 보존.
- [x] 운영자·관리자 편집과 공개 조회 모두 같은 단계·편성 계약 사용.

## Baseline Implementation Evidence (구현 전 조사)
- apps/v1_api/prisma/schema.prisma: V1Tournament에는 format 및 multiFinals JSON이 있지만 독립 stage 모델은 없다.
- V1TournamentGroup.phase는 group/round16/quarter/final 등 경기 라운드다. 사용자가 만드는 예선/본선 단계 식별자로 재사용하지 않는다.
- V1TournamentSlot의 unique(tournamentId, kind, registrationId)는 같은 종류 슬롯에 같은 팀이 여러 단계에서 등장하는 것을 막는다. 단계별 entry scope가 필요하다.
- V1TournamentStanding은 groupId+registrationId로 구분되지만, 전체 순위는 tournamentId+registrationId다.
- tournament-standings-source.ts는 phase=group을 가져오고 tournament-overall-standings.ts는 여러 조의 경기를 합친다. 예선과 본선을 그대로 추가하면 성적 혼합 위험이 있다.
- league-fixture-generator.service.ts의 풀리그 생성, templates의 토너먼트 생성, canonical TeamMatch/Details/Game, 공식 결과/경기 운영은 재사용 후보.
- multi-finals는 임의 이름 결선·독립 확정, finalist-assignment는 기존 결선 배정이다. 검증·권한·감사 패턴을 재사용하되 기존의 서로 다른 확정 계약은 호환 처리한다.
- bracketTrack은 일부 경로에서 이름이므로 새 편성의 ID로 사용하지 않는다. 이름 변경이 연결·시상 범위를 바꾸면 안 된다.

## Product Model
대회 → 단계 → 편성 → 경기. 토너먼트 편성에는 추가로 16강/8강/결승 등 라운드가 있다.

| 개념 | 역할 | 예시 |
|---|---|---|
| 단계 | 진행 순서·진출 경계 | 예선, 본선, 최종전 |
| 편성 | 참가팀과 경기 방식·순위의 단위 | 예선 A조, 본선 1위 리그, 챔피언 토너먼트 |
| 경기 방식 | 편성마다 선택 | 풀리그 1회전/2회전, 단판 토너먼트 |
| 참가 자리 | 미정 출처 또는 확정 참가팀 | 예선 A조 1위, 직접 참가팀 |
| 진출 규칙 | 출처 → 다음 단계 자리 | 예선 A~E조 1위 → 본선 1위 리그 |

한 단계 안의 서로 다른 편성에 리그·토너먼트를 혼합할 수 있다.
단계를 반드시 두 개로 제한하지 않는다. 무한 규모를 보장하는 표현도 쓰지 않는다.
팀/편성/단계/경기 수 상한은 실제 생성량·트랜잭션·브라우저 성능에 근거해 Phase 0에서 수치화한다.

일반 생성 화면은 단순 템플릿을 우선 제공하고, 고급 구성에서 단계를 편집한다.
템플릿은 동일한 구성 모델을 만드는 프리셋이며 별도 진행 엔진이 아니다.
프리셋: 단일 리그 / 단일 토너먼트 / 조별리그 후 토너먼트 / 순위별 리그 / 상하위 결선 / 직접 구성.

## User Scenarios
### S1. 20팀 순위별 리그
1. 예선 단계에 4팀×5개 풀리그(1회전)를 만든다.
2. 본선 단계에 5팀×4개 풀리그(1회전)를 만든다.
3. 각 예선조 1위→본선1, 2위→본선2, 3위→본선3, 4위→본선4 규칙을 일괄 설정한다.
4. 예상 경기: 예선30 + 본선40 = 70, 팀당7경기. 5팀 리그는 5라운드·라운드마다 1팀 휴식.
5. 예선 공식 결과 확정 후 추천 배정 → 동률 해결 → 변경 내역 확인 → 본선 참가팀 확정.
6. 본선 승점은 0부터 계산한다. 대회 누적 개인 기록과 본선 리그 순위를 구분한다.
7. 1위 리그가 전체1~5위, 다음 리그가6~10위라는 전체 순위 규칙은 선택 설정이며 자동 가정하지 않는다.

### S2. 일반화 검증
- 예선 리그 → 상위 토너먼트 + 하위 리그를 같은 본선 단계에 편성.
- 예선 리그 → 본선 리그 → 최종 토너먼트, 3단계 구성.
- 한 단계의 여러 편성에서 필요한 순위를 모아 다음 한 편성에 진출.
- 본선의 한 편성이 시작돼도 독립적인 다른 편성의 확정은 가능. 시작한 편성의 재배정은 금지.
- 기존 단일 리그/조별 결선/상하위/N개 결선 대회는 기존 경로와 결과를 유지.

## Operating Rules (제안 기본값)
- 구조 초안 저장 → 유효성 검사/경기 수 미리보기 → 경기 생성 → 출처 확정 → 배정 확인/확정 → 경기 진행.
- 경기 생성과 참가팀 배정을 분리한다. 미정 자리로 일정 계획은 가능하나 운영 시작은 양 팀 확정 후만 가능.
- 첫 단계는 대회의 확정 참가팀을 배정. 다음 단계는 이전 단계의 출처가 있는 자리로 배정.
- 출처 유형은 리그 편성의 순위, 토너먼트의 공식 최종 순위(실제 판정 가능한 순위만), 운영자 직접 선택.
- 같은 단계의 서로 다른 편성에 같은 팀 중복 배정 금지. 다른 단계에 다시 등장하는 것은 정상.
- 정식 운영 중 외부 팀을 새로 합류시키는 기능은 이번 기본 범위에 포함하지 않는다.
- 규칙은 이전 단계→이후 단계만 연결한다. 순환·역방향·자기 연결·동일 자리 복수 출처·정원 초과를 거부한다.
- 자동 추천은 규칙을 따른다. 예외 변경은 별도 권한/사유/감사를 남기는 명시적 override로 구분한다.
- 의존하는 출처 편성의 모든 필요한 공식 결과·순위가 확정돼야 배정한다. 무관한 다른 편성의 종료까지 강제하지 않는다.
- 동률을 임의 registration ID 정렬로 해결하지 않는다. 종목별 현행 규칙과 명시적 추첨/운영자 결정 기록을 사용한다.
- 공식 결과 변경 시 기존 참가팀을 자동 교체하지 않는다. 영향받는 배정을 stale로 표시하고 경기 시작을 차단한다.
- 영향 대상 편성이 시작 전이면 버전 재검증 후 재확정. 시작/기록이 있으면 자동 변경·초기화 금지, 운영자가 영향/사유를 확인할 정정 절차를 제공한다.
- 시작한 후속 편성 때문에 원천 경기의 공식 결과 정정 자체를 무조건 금지하지 않는다. 정정 사실과 기존 진출 결정은 별도로 감사·관리한다.
- 진행한 경기/공식 결과/영상/스태프 연결을 지우는 전체 재생성은 허용하지 않는다. 변경하지 않은 경기 ID·일정 보존.
- 모든 단계의 일반 승점은 새로 시작. 승점 이월은 설계상 확장 가능하게 하되 첫 출시에서는 지원하지 않고 선택지도 노출하지 않는다.
- 경기별 공식 기록은 대회 누적으로 한 번만 집계. 단계/편성별 순위·개인 기록 필터와 전체 누적 집계를 구분한다.
- 최종 전체 순위는 명시한 최종 편성별 순위 구간으로만 산출. 서로 다른 리그의 승점을 단순 비교하지 않는다.

## Technical Design (설계안, 실제 migration 아님)
### 데이터 경계
- 기존 V1Tournament는 대회·신청·권한의 루트로 유지한다. kind=regular_league인 독립 정규리그 시즌을 새 구조로 강제 전환하지 않는다.
- Stage: 안정 ID, tournamentId, 표시명, 순서, 구성 버전. 완료/시작 가능 여부는 공식 경기/진출 상태를 검증해 계산한다.
- Pool: 안정 ID, stageId, 리그/토너먼트, 정원, 회전 수, 경기 규칙 버전·순위 규칙. 이름은 식별자와 분리한다.
- StageEntry: stage/pool 참가 자리 및 확정 registration. 슬롯의 정본과 중복 저장하지 않도록 기존 slot 확장 여부를 Phase 0에서 결정한다.
- AdvancementRule: 출처 pool/순위 또는 실제 최종순위/대상 entry. 범위 규칙은 저장 전에 구체적인 자리 매핑으로 정규화한다.
- Assignment snapshot: 출처 공식 결과/순위 버전, 추천·확정 결과, 동률 결정·override 사유, 처리자, 시각, 멱등 키.
- V1TournamentGroup에는 새 pool 소속을 연결하고 기존 phase는 라운드로 유지한다. 이름 unique 범위도 단계/편성 중복명 허용 여부와 함께 명시한다.
- 슬롯 unique와 서비스 중복 검사는 stage scope로 확장한다. stage가 null인 기존 행과 혼재 시 PostgreSQL NULL unique 동작을 고려해 partial index/명시 scope를 설계한다.
- 조별 순위는 pool/group 범위로 재사용하고 stage 누적 집계가 필요하면 별도 명시적 projection을 둔다. 기존 전체 순위 테이블을 새 구조의 최종 순위로 오용하지 않는다.
- 시상은 안정적인 편성 ID를 범위로 사용하며 종전 overall/upper/lower/이름 범위와 호환한다.

### 서비스·API
- 순수 plan/validate 엔진과 실제 경기 materialize/배정 서비스를 분리한다. 프리뷰는 DB를 변경하지 않는다.
- 제안 API 책임: 구성 조회/초안 저장, 구조 검증·생성 미리보기/확정, 편성별 진출 미리보기/확정, 단계·편성별 순위 조회.
- URL/DTO는 구현 착수 전에 docs/api의 대회 계약에 확정한다. 현재 존재하는 API인 것처럼 문서화하지 않는다.
- expectedRevision + 출처 fingerprint, 멱등 키, 기존 competition→game 잠금 순서를 적용한다. 동시 결과 정정/이중 클릭에 409 또는 안전한 재응답.
- 권한: 기존 admin context 및 대회 디렉터 mutation scope를 재사용. 스태프 조회 권한을 구조 편집 권한으로 확대하지 않는다.
- 경기별 운영 콘솔·명단·공식 결과·WebSocket 계약은 재사용하며 새 stage 엔진 때문에 별도 경기 정본을 만들지 않는다.
- 공개 단계/편성 순위·일정·대진·결과·진행 스테퍼·종료 판단까지 동일 stage/pool ID를 사용한다.

### 기존 대회 호환
- additive migration과 구성 엔진 버전 구분을 사용한다. 기존 format 값을 일괄 치환하지 않는다.
- 기존 대회는 기존 엔진으로 안전하게 읽고 편집한다. 신형 생성은 rollout 완료 후 공통 프리셋을 사용한다.
- 기존 대회를 새 구성으로 옮기는 것은 별도 명시적 전환: 시작 전/자료 보존 조건을 검증하고 미리보기 제공. 진행 중·완료 대회의 자동 변환 제외.
- 새 데이터가 만들어진 후 구버전 API로 단순 rollback하면 해당 데이터 편집이 불가능할 수 있다. 호환 배포/쓰기 gate/전진 수정 절차를 릴리스 전에 마련한다.
- feature gate는 신규 생성·편집 노출을 제어하며, 이미 생성된 대회의 읽기·운영을 숨기는 방식으로 쓰지 않는다.

## UX Options (화면 구현 전 선택 필요)
| 안 | 방식 | 장점 | 단점 | 상대 규모 |
|---|---|---|---|---|
| A 추천 | 단계 목록 → 편성 설정 → 진출 규칙 표 → 전체 검토의 순차 편집 | 모바일 이해·검증 오류 위치·기존 폼 재사용에 유리 | 전체 연결을 한 번에 조작하는 속도는 낮음 | 중 |
| B | 단계/편성 연결을 그래프로 편집 | 복잡한 연결을 한눈에 파악 | 모바일 조작·접근성·연결선 관리 비용 큼 | 큼 |
| C | 템플릿과 순위별 목적지 표를 한 화면에서 편집 | 흔한 대회의 설정이 빠름 | 3단계 이상·혼합 방식에서는 긴 표와 인지 부담 | 중 |
A는 기존 SectionTitle/폼/Button/ConfirmModal/BottomSheet/ErrorState를 재사용하고,
B도 같은 제어 컴포넌트와 연결용 별도 UI, C도 기존 표/폼/확인 모달을 사용한다.
먼저 A/B/C 비교와 선택을 받고 DESIGN.md 기준 실제 토큰·390/768/1440 목업을 만든 뒤 UI 구현한다.
이번 문서는 UX 방향 제안이며 사용자 선택 또는 화면 구현 완료로 취급하지 않는다.

## Parallel Work Breakdown / Delivery Phases
기본은 단일 에이전트 순차 수행. 사용자 별도 병렬 승인 시에만 독립 범위를 분리한다.

| 단계 | 작업/PR 경계 | 종료 조건 |
|---|---|---|
| 0 | 도메인 계약·호환 표·UX 선택/목업·성능 상한 고정 | 모든 모호한 규칙을 확정하고 UI 안을 선택 |
| 1 | additive schema/engine version/단계 참가·조회 계약 | migration replay+기존 API 회귀, 신규 데이터 정합성 |
| 2 | 편성별 리그·토너먼트 생성 및 단계별 순위 | 20팀70경기/독립 순위/홀수팀 휴식/기존 경기 ID 보존 |
| 3 | 단계 간 진출 추천·확정·정정 영향·권한/감사 | 3단계/혼합/동률/동시성/독립 편성 확정 검증 |
| 4 | 운영 편집·프리셋·공개 일정/순위/대진/결과 | 선택한 UI 및 모바일 흐름과 모든 공개 계약 일치 |
| 5 | 기존 기능 동등성·Alpha 종단 QA·문서·rollout | 신규 생성 전환 gate, 전체 회귀·정리 완료 |

Phase 1 공유 DTO/타입/hooks/MSW 확정 후 UI를 연결한다. 단계별로 배포 가능한 호환성을 유지한다.
Phase 1~3은 설계·검증 기반이며, 사용자가 이용 가능한 첫 출시는 Phase 4~5 이후다.
기반이 범용 단계 모델인 상태로 S1을 첫 수직 구현 시나리오로 사용하고, S2를 함께 통과시켜 사례 전용 구현을 방지한다.
날짜·소요 일수는 확정하지 않는다. Phase 0의 실제 의존성/화면 선택 후 산정한다.

## Owned / Forbidden
- Owned: apps/v1_api의 tournaments 단계/순위/진출 관련 모듈, 필요한 Prisma 추가 migration,
  apps/v1_web 대회 관리/공개 단계 뷰 및 hooks/types/MSW, 관련 fixtures/통합/E2E, docs/api·scenarios·task·changeset.
- 공유 훅·타입·MSW·schema는 한 작업 단위에서 소유해 계약 드리프트를 막는다. PR마다 exact file scope를 명시한다.
- Forbidden: 실제 사용자 대회 변환/시드·reset, 독립 리그 시즌 정책 변경, 무관한 WIP, 운영 main 승격.

## Test Scenarios (최초 계획 체크리스트)
- [ ] S1: 20팀, 예선5×6=30경기/본선4×10=40경기, 팀당7경기, 각 단계에 팀 정확히 한 번 등장.
- [ ] S2: 3단계와 리그/토너먼트 혼합, 단일 단계 리그/토너먼트, 다른 조 수·홀수 팀·1/2회전.
- [ ] 예선 승점이 본선에 섞이지 않음, 단계별 순위와 개인 대회 누적 기록의 중복 집계 없음.
- [ ] 같은 단계 중복 참가/외부 대회 팀/역방향/순환/잘못된 순위/자리 수 오류 거부.
- [ ] 동률·미확정·취소/무효 경기·부전승·시작 전 미정 참가팀 등 상태별 판정.
- [ ] 미정 대진 선생성→실제 팀 배정 시 경기 ID/일정/장소/연결 보존.
- [ ] 원천 결과 정정의 stale 검출과 재확정, 시작한 후속 편성 보호, 무관한 편성 편집 유지.
- [ ] 동시 확정·이중 클릭·정정 경쟁·스태프 범위 만료·403·409·API 오류 표시.
- [ ] 기존 league/knockout/group_knockout/league_knockouts 및 6강/조간 비교12강/상하위 결선/시상 회귀.
- [ ] migration expand/replay/혼재 unique/구버전 reader/엔진별 rollback 계약.
- [ ] fixture·MSW·공개 mock·API 문서를 같은 변경에서 동기화. 성공 흉내 fallback 없음.
- [ ] Alpha 실제 운영자·담당 디렉터·조회 스태프·참가팀·비로그인 각 권한 흐름.
- [ ] 390/768/1440에서 초안 저장→예선 진행→진출 확정→본선 진행→공개 결과, console/network와 before/after 갤러리.
- [ ] 생성량 상한과 초과 거절·성능, 불필요한 전체 suite 반복 없이 단계별 좁은 검증.
최초 계획 시점에는 미실행이었다. 현재 실행 범위·성공·한계는 `docs/scenarios/competition-stage-composition.md`의 최신 절과 원본 증거를 기준으로 판정한다.

## Acceptance Criteria (최초 계획 체크리스트)
- [ ] Original Conditions와 S1/S2 모두 충족. 특정 조 수/단계 이름 하드코딩 없음.
- [ ] 사용자 UI 선택 후 구현, schema/API/hook/fixture 계약 동기화.
- [ ] 참가·순위·진출·공개·시상 범위가 단계/편성 ID로 일치.
- [ ] 기존 대회 데이터 무손실, 동등 기능 회귀와 권한·동시성 검증 통과.
- [ ] 결과 정정·부분 진행·rollback 가드가 실제 상태에서 증명됨.
- [ ] dev PR/CI/필요 리뷰 후 Alpha 종단·3폭 QA, 증거·시나리오 상태 문서화.
- [ ] 소유 작업 자원 정리, 다른 세션 WIP 보존.

## Tech Debt Resolved (개발 목표)
대회 전체 참가 슬롯 제약, 예선/결선 고정 분기, 전체 승점 혼합, 이름 기반 편성 식별,
두 진출 배정 경로의 검증 중복을 신규 단계 경계에 맞춰 정리한다. 현행 완료로 표시하지 않는다.

## Security Notes
대회별 mutation scope·서비스 권한·확정 참가자 검증, 서버의 진출 규칙 검증, CAS/멱등성·잠금 순서,
감사 기록을 필수로 한다. 공개 응답은 내부 권한/개인정보를 노출하지 않는다. 시크릿·env 조회 없음.

## Risks & Dependencies
가장 큰 위험은 기존 group/phase/slot/overall standing 의미의 혼동과 경기 삭제를 동반한 변환이다.
경기 규칙·징계의 단계별 적용 및 시상 범위, 기존 특별 대진 기능 동등성을 Phase 0에서 추적한다.
기존 전체 순위의 임의 합산을 신규 최종 순위로 채택하지 않는다.
첫 출시 제외: 승점 이월, 독립 리그 시즌 간 통합, 자동 승강, 더블 엘리미네이션/스위스/홈앤어웨이 합산 결선.
다른 핵심 조합을 막는 이유로 제외 기능을 사용하지 않는다. 지원하지 않는 선택지는 노출하지 않는다.

## Ambiguity Log
| 항목 | 제안 | 상태 |
|---|---|---|
| UX 구성 | A 순차 편집 + 템플릿 | 사용자 승인, 구현 완료 |
| 단계별 승점 | 새로 시작, 이월은 후속 | 사용자 정책 확정 전 |
| 전체1~20위 | 편성별 순위 구간을 명시한 경우만 | 사용자 정책 확정 전 |
| 예외 진출 변경 | 명시적 override 사유/권한/감사 | Phase 0 계약 확정 |
| 징계/누적 카드 | 기존 대회 규정을 기본으로, 단계 전환 초기화 여부를 명시 | Phase 0 종목별 정책 확정 |
| 상한·구현 일정 | 생성 경기 수·기존 상한 검증 후 수치/일정 고정 | Phase 0 실측 필요 |
| 기존 대회 전환 | 자동 전환 없음, 시작 전 명시적 전환만 검토 | 호환 설계 확정 전 |

## Progress Snapshot
- 2026-11-16 사용자 `싹 다 수정해서 PR` 승인. 구현 브랜치 `fix/stage-competition-parity-20261116` (origin/dev 1acdeb40a), 기존 QA worktree 재사용. 40개 감사 계약을 전체 수정·회귀 범위로 고정하고 토너먼트 전용 격차도 임의 제외하지 않는다. Wave1 공개/표시정보/편집 연결 진행중; Wave2 진출/알림/시간/정정 pending; Wave3 특수대진/전체순위·기록/권한·예외검증/문서·devPR pending. 기존 순차 편집 A안과 공유 컴포넌트 재사용, 기존70경기 Alpha 대회 보존. 이번 요청은 PR 생성까지이며 운영main 승격은 하지 않는다.
- 2026-11-16 사용자 요청 후속 동등성 감사: 운영 계약40개 정적 비교40/40. 유지16/기능 격차19/추가 확장1/예외·권한·시각 미검증4로 구분. Alpha 무변경 PATCH로 경기 제목·사이드 라벨·조 이름의 STAGE_MANAGEMENT_REQUIRED409 3/3 재현. 공개 UI 누락·진출 알림·시간 단계 의미·결과 첫 선택·징계 순서 등 상세는 scenario의 동일 날짜 동등성 감사 표 참조. 앱 소스 수정·새 배포 없음, 완료 대회70경기 결과 보존.
- 2026-11-16 사용자 지정 S2 Alpha 실측: 새 sm20팀×7명(140계정), 팀장 실제 신청·접수20/20, 예선30+본선40 Game 공식결과70/70, 대회completed, 팀당7경기·본선0점 시작·경기ID보존·공개 누적70골 확인. 대회 `ee1675e5-264e-43ec-9a36-bd2f0a3099d9`. 완전자동 진출은 assigned=false로 미지원(정확한 순위 후보 추천 후4편성 확정). 결과/시상HTTP200와 시상1~3위 서버HTML 확인; 브라우저host불가/앱승인timeout으로3폭·클릭·console/network 미검증. 전체 QA 완료로 재분류하지 않는다. 상세·fixture 방식·cleanup은 [시나리오](../../docs/scenarios/competition-stage-composition.md)와 비밀값 없는 evidence JSON 참조.
- Phase A/B 구현 완료: 별도 생성 경로, versioned stagePlan, 단계/편성별 경기·슬롯, 공식 순위 기반 배정, 운영·공개·시상 연결.
- 기존 stagePlan=null 대회는 기존 경로와 응답 모양을 유지하며 자동 전환하지 않는다.
- 검증: 실제 PostgreSQL 전체 migration replay 및 schema diff 0; 실제 DB 통합 5건 PASS(20팀70경기, 3단계 혼합, 단일 리그/KO, 생성·수정·종료 제약); API typecheck PASS.
- 단위/화면 회귀: backend 관련 271+154+7 PASS; frontend 관련 264 PASS 후 신규 경로 단일 실패를 수정해 해당 1건 PASS. 초기 editor/생성 모델 131 PASS, 배정 화면 3 PASS.
- 최종 API/Web typecheck 및 Web patterns/API surface PASS. 단계형 일정 순서 회귀3건 포함13건 PASS. PR #2285 생성 및 최신 head Copilot 리뷰 요청 완료.
- DB 배포 gate의 scoped unique 예외는 기존 unique와 legacy default로 기존 데이터 보존을 증명한다. runtime epoch 3으로 이전 epoch 2 rollback/실패 복구를 차단하며 실제 git/manifest 9건·manifest 자체 테스트 PASS.
- CI에서 발견한 신규 schema hash 고정값 누락 수정: current/historical binding 9건 PASS, Docker/manifest/prepare 입력에 정확한 신규 hash 추가(과거 hash 보존).
- 시작 후 source 정정의 dead-end를 보완했다: 기존 참가팀·자리 고정 + 사유 필수 acknowledgeStartedCorrection 확인, 감사 기록, CAS 유지. 실제 DB5건과 manager UI4건 PASS. 이전 head Web CI PASS; API CI 201/202 suites PASS 후 source snapshot hash1건 수정·재검증 PASS.
- 진행 중: PR CI·Copilot 리뷰, Alpha 실제 로그인/3폭 시각 QA. Alpha 미검증을 완료로 간주하지 않는다.
- 정책: 승점 이월 없음; 이전 단계 공식 결과와 동률 후보에 한해 배정 가능(동률 사유 필수); 기존 대회 전환 없음; KO는 1·2위만 진출 원천, 단판, 별도 3위전 없음. 일반 구성 상한 8단계/단계당16편성/편성64팀/전체240경기.

## Approved implementation cursor — 2026-11-09
사용자는 A안 별도 '단계형 대회 만들기' 버튼, 순차 구성 화면, 예선 없는 단일 단계, 기존 풀리그/토너먼트 유지, 기존 데이터 자동 전환 없음에 동의하고 '진행해줘'로 구현을 승인했다. 이번 변경의 실제 범위는 새 생성 진입·구조 저장, 단계별 경기 생성·배정·조회 및 운영/공개 노출이다. 이전 체험 PR의 리뷰 생략 승인은 이 작업에 적용하지 않는다.
- Phase A completed: typed stagePlan + 추가 DB 컬럼/슬롯 범위 + 생성/대진/진출 서비스.
- Phase B completed: 새 생성 진입/편집·운영·공개 조회 연결, 공유 계약 동기화.
- Phase C in_progress: 실제 DB·단위/UI/기존 회귀·typecheck, PR/CI/리뷰·Alpha QA·문서/정리.
- 구조 저장은 기존 multiFinals와 독립인 versioned stagePlan으로 한다. 기존 그룹에는 stageKey/poolKey를 추가하고, 경기 정본은 그대로 재사용한다. 기존 행의 stagePlan=null/entryScope=legacy는 동작을 유지한다.

## 2026-11-16 동등성 수정 Progress Snapshot
- Copilot 실제 차단 원인: 최신 공식 `POST /pulls/2419/copilot-code-review`가 HTTP422 `ACTOR_INELIGIBLE`(현재 actor의 코드리뷰 라이선스/조직 정책 자격 불충족)를 반환했다. 기존 requested_reviewers 요청의 성공 응답·리뷰0건을 clean으로 판정하지 않는다. 계정·요금제·정책 변경 없이 사용자에게 이번 작업 한정 수동 적대 검토+전체CI 대체를 설명한 뒤 2026-11-17 “스크린샷 찍어서 pr 까지 다 해줘” 후속 진행 지시를 해당 대체 승인으로 적용했다. Copilot clean으로 표시하지 않는다. 커밋5a77bd034의 Gates/API/Web 전체 CI 통과 및 MERGEABLE/CLEAN 확인 후 PR #2419를 dev에 merge(b4c9726cf)했다. Alpha after 검증을 진행한다.
- 최신 사용자 지시: 기존 대회 디자인에 맞춘 수정과 모바일 포함 Alpha 화면 검증까지 완료한 뒤 반영. 기존 'PR까지만' 제한을 이 후속에 적용하지 않고 저장소의 dev PR→머지→Alpha 검증 순서를 따른다(main 승격 제외). 기존 컴포넌트 재사용 A안 유지. 검증 대상7 routes×390/768/1440=21 route/viewport. 관리자 생성·대진·시상, 공개 상세·대진·결과·시상. native CUA 브라우저 host unavailable/승인 timeout 재현 뒤 사용자가 Playwright 전용 headed 창을 명시 승인. 코드 회귀104건·Web 타입/패턴 PASS, before21/21 캡처 완료. 새 head CI/Alpha after21폭 검증은 남아 있어 완료로 선언하지 않는다.
- 사용자 재리뷰 후 P1 수정: GamesService → stage-view → multi-finals-seeding → multi-finals-plan → LeagueFixtureGeneratorService → GamesService 순환으로 기존 API CI의 실제 앱 초기화가 실패했다. 읽기용 크기·오류 정의를 multi-finals-definition.ts로 분리해 planner의 기존 export 호환성을 유지했다. 냉시작 Nest 주입 RED1→GREEN1 및 대진 계산 포함34건, 실제 HTTP/DB76건(운영 보드58·health2·단계15·worker1) PASS. 운영 보드 첫 로컬 실행의 프리셋 누락58건은 CI와 같은 competition-config-backfill CLI를 소유 DB에 적용한 뒤 재검증해 PASS. 최종 API 타입·surface PASS. 새 head CI·Copilot은 후속 확인한다.
- dev PR [#2419](https://github.com/kim-song-jun/matchup-sports-platform/pull/2419), 구현 커밋2e3e6e793. CI Gates/API/Web 및 최신 head Copilot 확인 중. 사용자 요청 범위는 PR 생성까지이며 머지·main 승격 없음. 소유 PostgreSQL 컨테이너2개 실행분과 전용 볼륨, 공유 의존성 링크를 정리했다. 미병합 브랜치/worktree·재현용 ignored 의존성·Alpha 테스트 데이터는 보존한다.
- 최종 로컬 검증: 실제DB15건+실제worker1건 PASS, 6강 종료 후 정정 완료 판정 RED1→GREEN1, API/Web 타입·surface/pattern PASS, Web 최종4 suites65건 PASS. 상세와 이전 회귀 실행은 시나리오 최종 검증 기록 참조. 구현 커밋과 dev PR 생성 단계이며 Alpha 시각0/3 차단은 유지한다.
- 범위: 감사40/40. 기존16 유지, 수정/확장22, 권한·경쟁1, 시각 차단1을 동일 시나리오에 추적한다.
- 브랜치: fix/stage-competition-parity-20261116, 최신 origin/dev 1acdeb40a 기준. 원격 main은 dev보다156커밋 뒤이며 main 전용 커밋0. 승격·main 쓰기 없음.
- 구현: 기존 작업공간/공개/표시 편집, 초안·무작위·예외 배정·진출 알림·durable 자동 진출, 단계별 시간·의존 일정·징계 순서, 미시작 편성 교체·경기 복구,3위전·12강·와일드카드·6강, 전체 순위·우승/시상·개인 기록 범위 반영.
- 검증: 격리 PostgreSQL16/LF241 migration 재생, 원래 Alpha20팀70경기 증거 보존, 새 실제DB/단위/UI/타입/surface 검증. 최신 세부 결과는 시나리오의 동등성 전체 수정 cursor 및 최종 검증 기록 참조.
- 남은 gate: dev PR/최신 head CI·Copilot, 머지 후 Alpha 배포·390/768/1440 갤러리·console/network/focus. 브라우저 host unavailable 재확인,0/3폭을 통과로 표시하지 않는다.
- 소유 자원: 작업 전용 DB 컨테이너·clone·임시 의존성/스크립트만 정리한다. 미병합 worktree와 사용자가 요청한 Alpha 테스트 팀/계정/대회는 보존한다.

## 2026-11-17 Alpha 화면 보완
- PR #2419 dev 머지 및 Alpha b4c9726cf 실측. 모바일·태블릿 일정 상단에 전체 순위20행이 반복돼 경기가 밀리는 시각 결함 발견. 최종 순위를 결과 하단으로 옮기고 모바일 팀/라운드 필터를2열로 정리. 관련 공개 단계3 tests PASS. 기존 두 형식 비교까지39개 화면 및 실제 조작을 검증하며 최종 갤러리는 보완 배포 후 촬영한다.

## 2026-11-17 UI 후속 완료 cursor
- PR #2419/#2420 dev 반영, 최종 Alpha 2f77a3c9a789fccf9822d6633d0f48280c2f38ef. Gates/API/Web 및 Alpha 배포 PASS. 최종39/39(대상21+기존 두 형식 비교18), 세 폭 직접 시각 검토 PASS, console/network/문서 넘침0. 실제 필터/모달/상세 복귀/20팀 템플릿 조작 및70경기 ID·점수 보존. 원본75PNG+before42+모바일 관찰 결함1, 최종 및 첫 실행 JSON을 함께 기록. Copilot 자격 차단은 사용자 후속 지시로 수동 검토·전체 CI 대체했고 clean으로 표기하지 않음. 상세와 잔여 원래 범위는 현행 시나리오의 최종 완료 section 참조.

## 2026-11-17 리뷰3건 보완 진행
- 편성별 입력 캐시와 표시 저장 뒤 참가팀 유지, 서버 배정 변경 시 덮어쓰기 차단: UI 회귀10건 PASS. 입력을 버리는 최신 구성 재조회는 명시 확인 후 수행한다.
- 재개 결과는 배포 SHA/대회/측정형식2가 일치하는 성공 route만 재사용하며 실패·중단 route는 재실행한다. 순수 검사5건 PASS.
- 모바일·태블릿 관리자 하단6쌍이 상단과 동일했던 이전 증거의 하단 완료 판정은 보완 전까지 보류한다. 보이는 본문 scroll surface만 끝으로 이동하고 실제 좌표를 검증·기록한 뒤 재촬영한다. UI 변경의 새 dev/Alpha 검증은 후속이다.

## 2026-11-17 리뷰 보완 완료 cursor
- PR #2421 dev 반영 및 Alpha a839b6939179ba2091cd6a86dc7fe896250ebb14에서39/39, 관리자 하단9/9·상하단 해시중복0/9. 편성 왕복 미저장 입력3폭 보존 및 표시 저장 후 타 편성 입력 유지/원상 복구 실측. UI 회귀10·재개6·실제 CLI 타 SHA 거절·Web 타입/패턴·전체 CI PASS. 보고된3개 문제 해소. 최종78PNG와 측정형식2 JSON, 현재 시나리오 및 허브를 갱신했다.

2026-11-17 로컬 보완 검증: 관리자 UI 회귀13/13, 증거 재개 검사9/9, Web TypeScript 및 v1 패턴 검사 PASS. 임시 의존성의 React/타입 연결 누락을 해결한 뒤 검사했다. Alpha 모바일 수정 전 초안 소실 재현을 확보했고 나머지 폭/배포 후 검증은 진행 중이다.

수정 전 Alpha 실측 완료: 배포9f157aa571514fe4bc62c2104fd4f22a670d23a2, 390/768/1440 모두3/3에서 구성 회전2→1·사유 소실을 실제 이름 저장 후 재현. PNG3개와 stage-structure-before-20261117.json에 기록. 원래70경기·초안 서버 구성 복원 확인, console/network/가로 넘침0, 전용 브라우저15315 종료. 준비 중 잘못된 종목ID/선택자·저장 후 버튼 기대값을 교정했고, 중단된503·network-idle 대기는 성공 증거로 쓰지 않았다.

PR #2427 최신 head832e3b33d의 Gates/API/Web 전체 CI PASS·MERGEABLE/CLEAN을 확인하고 dev2f5c166ffbab45f2dcfe8ffd7a5f50c39d3349bf로 머지했다. Copilot 공식 API는 다시422 ACTOR_INELIGIBLE로 거절해 기존 사용자 승인 수동 검토+CI 대체를 유지한다. Alpha matching-SHA 배포 후 구조3+기존39 화면을 검증하고 증거 PR로 마무리한다.

구조 QA 보존 검사를 조작 종료 후 실제 GET으로 강화해 수정 전3/3을 재측정했다(브라우저15838 종료). 테스트 초안에 등록0·경기0도 확인했다. 초기 사전 조회 스냅샷 대신 실행 후 completed/70 fixture ID·공식 점수를 확인한 최신 before JSON으로 교체한다.


## 2026-11-19 정식 신청·결과 전체 실행 cursor
- Alpha 새 대회 f5f3d600-a663-4e9d-a8d9-61ae3c1817c7. 팀장20명 실제 로그인·신청20/20·명단140/140 UI 등록·접수20/20·공식결과70/70·대회 종료 완료. 결선 동률 사유 결정 포함4리그배정, 9개편성 승점·승무패·득실 독립대조 및 팀당7경기 PASS. 공개 결과3폭 시각 검토.
- 핵심 FAIL: 최대출전6명 설정이어도 양팀7명 전원 started=true로 LIVE 시작 허용. 선발6+벤치1/교체 계약은 미충족이며 전체 PASS 아님. 신규가입/OTP·팀생성은fixture 준비로 구분. 개인 이벤트·20팀교체는 통과 주장하지 않음.
- 구성 버튼 폼 submit 버그 수정 PR #2453, 초기head CI Gates/API/Web PASS·회귀5PASS. 공식 Copilot review는 응답 없고 dev 이동 후 충돌 확인, 동기화 중. Alpha 배포 완료 아님.
- 증거/상세/정확한 미검증 범위: docs/scenarios/ranked-leagues-full-flow-20261119.md. 기존 테스트/실회원 보존.


## 2026-11-19 재실행 캡처 + 목업 카테고리 후속
- 사용자 추가 요청: 실제 신청/수락 재실행 중요 장면을 PR에 게시하고 최종검증. 상단 기존 목업 패널의 팀 수·상태 선택을 유지하고 순위별 리그 카테고리만 확장.
- 새 소유 대회21da8cb0-2138-431b-bc17-b5e3b6e8d326, 기존합성20팀 재사용. 실제신청20/20·명단140/140 완료, 관리자수락/스크린샷 진행 중. 상세 docs/scenarios/ranked-replay-screenshots-20261119.md.
- 구현: ranked_leagues 목업전용format, 기존 DB format=league+stagePlan. 4팀예선→동순위결선,7명등록·6명config,8~32팀4배수·결과포함20팀상한. existingenv/admin guard유지, schema/migration없음. 공식70경기 생성통합회귀 추가.
- 로컬 API53·Web6 tests 및 API/Web TypeScript PASS. 실제DB통합은CI대기. 기존동시6명강제실패는이변경이해결하지 않으며실제재검증으로분리.
