# 결선 조 이름 및 대진 하위 필터

Status: In Progress
Owner: Codex

## 경기 일정 후속 수정 (2026-10-28)

- 요청: 순위·대진표에만 적용했던 하위 필터를 경기 일정에도 적용하고 dev 대상 PR 제출.
- Owned: bracket-page-client.tsx, 공용 schedule-content.tsx/schedule-grouping.ts 및 관련 테스트, 이 문서, changeset.
- Forbidden: API/DB, 기존 공유 작업트리의 WIP, 배포 및 main 승격.
- [x] 조별리그 선택 시 전체/각 조 선택, 결선 선택 시 전체/각 단계 선택.
- [x] 대진표와 같은 resolver로 결선 조 이름 및 단계 분류 적용.
- [x] 진행 중·일정 확정·시간 미정 경기 및 내 팀만 조건에 함께 적용.
- [x] 선택한 하위 필터를 경기 상세 복귀 URL에 보존하고 잘못된 선택은 전체 처리.
- [x] 관련 회귀 테스트와 타입/패턴 검사.
- [ ] dev 대상 PR 제출, CI 및 Copilot 리뷰 요청.
- [ ] 배포 후 alpha 390/768/1440 실제 화면 검증 (이번 요청은 PR 제출까지).

Progress Snapshot: origin/dev ec33d1609 기준 fix/schedule-stage-filters 격리 작업트리에서 구현. 일정 렌더 59개, 일정 탭 통합 3개, 기존 상세 복귀 14개, 그룹 정렬 10개로 총 86개 테스트 통과. 타입/패턴 검사 통과. 사용자 지정 결선 이름이 `조`로 끝나는 경우도 실제 라운드를 우선하도록 수정. 조별리그의 기존 라운드 번호는 유지한다. `git diff --check` 통과, touched path의 TODO/FIXME/HACK/XXX 없음. 로컬 web 서버 및 배포 실행 없음.

## Context
대상 대회 93a11ead-52ca-4262-bede-66802587c3d8에서 진행 단계는 경기 round를, 대진표는 phase의 고정 이름을 사용해 이름이 달랐다.
## Goal
결선 조 이름을 진행 단계·대진 제목·이동 버튼·선택 필터에 일관되게 표시한다.
## Original Conditions
- [x] 사용자가 결선 조 이름 사용을 확정했다.
- [x] 조별리그 하단에 전체 및 개별 조 선택을 제공한다.
- [x] 결선 하단에 전체 및 모든 결선 단계(3·4위전 포함) 선택을 제공한다.
## User Scenarios
조별리그에서 B조 선택 시 B조만 보고 전체로 복원한다. 결선에서 준결승·결승·순위전을 개별 선택한다.
## Test Scenarios
관련 그룹핑·진행 단계·페이지 렌더 테스트를 단일 worker로 실행한다. 조 재사용 시 결승을 준결승으로 잘못 표시하지 않는다.
## Parallel Work Breakdown
단일 에이전트. Owned: v1_web 대진 페이지·대진 컴포넌트·관련 테스트·이 문서·changeset. Forbidden: API/DB 및 공유 작업트리 WIP.
## Acceptance Criteria
- [x] 관련 테스트 통과: 그룹핑 17 + 페이지 렌더 48 + 진행 단계 19 = 84
- [ ] alpha 배포 후 화면·console/network·390/768/1440 확인
## Tech Debt Resolved
진행 단계와 대진표가 서로 다른 라운드 명칭을 계산하던 중복을 제거한다.
## Security Notes
읽기 전용 UI 선택. 권한·API·저장 데이터 변경 없음.
## Risks & Dependencies
별도 worktree: _worktrees/bracket-group-labels, branch fix/bracket-group-labels. alpha 시각 검증은 배포 전 미검증이다.
## Ambiguity Log
조별리그 상단 명칭은 유지한다. 같은 phase의 여러 조 이름은 ·로 연결하고 조가 없으면 기존 라운드명을 사용한다. 식별자는 이름과 분리해 유지한다.
## Progress Snapshot
origin/dev 745eb4e35에서 시작. 구현 및 관련 84개 테스트 통과. dev 대상 PR 제출 준비, 배포 없음.

검증: WSL Ubuntu에서 `node node_modules/vitest/vitest.mjs run src/components/tournaments/tournament-bracket.test.ts src/components/tournaments/tournament-progress-stepper.test.ts src/app/tournaments/\[id\]/bracket/bracket-page-client.test.tsx --maxWorkers=1 --no-file-parallelism --no-isolate` 실행, 3 files / 84 tests PASS.
공유 설치에 누락된 validator는 작업트리 전용 ignored node_modules 링크로 기존 pnpm store를 참조했다. 공유 설치·tracked 설정은 변경하지 않았다.
`git diff --check` 통과, touched source/test에서 새 TODO/FIXME/HACK/XXX 없음. 테스트 프로세스 정상 종료.
PR 제출 전 `tsc --noEmit --incremental false`와 `node scripts/v1-pattern-check.mjs` 통과. 타입 검사에서 새 테스트 fixture의 필수 id/status 누락을 보완하고, 작업트리 전용 @types/validator 링크를 추가했다. 결선 전체 보기의 기존 단계 이동 버튼과 새 필터는 모두 유지한다(각각 스크롤 이동/표시 필터링). 통합·삭제는 이번 PR에 포함하지 않는다.
alpha 390/768/1440 스크린샷·console/network는 변경이 배포되지 않아 미검증이다. 브라우저나 로컬 web 서버는 실행하지 않았다.


## 사용자 요청 후속: 필터 안내 제거 및 팀별 경기 색상 (2026-11-06)

- 기준: main/dev fetch 완료. 로컬 main은 origin/main과 같고, 로컬 dev를 origin/dev `53e2bb3171`로 동기화했다. 공유 작업트리의 기존 WIP는 보존하고 `/tmp/teameet-bracket-label-result-20261106`에서 작업한다.
- 사용자 확정: 결선 일정의 `일정 토너먼트 선택`·`일정 결선 단계 선택` 표시 문구 제거. 순위·대진표 팀 행을 펼치면 승리 파랑·무승부 회색·패배 빨강으로 표시한다. 기존 UI의 문구/색상만 치환하므로 별도 디자인안은 만들지 않는다.
- Owned: `schedule-content.tsx`, `bracket-page-client.tsx`, changeset, 이 문서. API/DB/기존 공유 트리 WIP는 범위 밖이다. 단일 에이전트로 처리한다.
- [x] 표시용 필터 라벨만 숨기고 navigation의 접근성 이름과 필터 버튼을 유지한다.
- [x] 팀별 경기 행 배경/결과 텍스트에 기존 blue50/700, red50/700, surface-soft/text-body 토큰을 사용한다. 결과가 없는 경기는 중립 배경으로 표시한다.
- [x] 기존 일정 75개 및 대진 페이지 61개 회귀 테스트 통과(단일 worker). 대진 페이지 PASS는 재시작 전 출력으로 확인했으며, 결과 수신이 끊긴 일정 파일만 재실행해 JSON 보고서를 남겼다.
- [ ] alpha 390/768/1440 before/after 및 console/network 검증. headed 브라우저 변경 전 6/6 캡처 완료. 변경 후는 미배포로 확인하지 못했다.

Progress Snapshot: 소스 2개 파일의 4줄 치환 및 changeset 추가. `git diff --check` 통과, touched source의 TODO/FIXME/HACK/XXX 없음. 로컬 서버를 실행하지 않았다. main 승격·원격 push·PR 머지·배포는 수행하지 않았다.

후속 검증: v1 패턴 검사 통과. 일정 테스트 JSON 증거는 `/tmp/teameet-bracket-schedule-test-20261106.json`. 테스트 프로세스 종료 확인 후 검증용 node_modules 심볼릭 링크 2개를 제거했다. 신규 import/route 의존성 없음. 소스 2개·기존 task 1개·changeset 1개만 변경했으며, 미커밋 상태라 PR-ready/배포 완료로 판정하지 않는다.


## 전체 단계 명칭 및 조 이름 수정 복원 (2026-11-06 추가 요청)

Status: In Progress

### Context / Goal
사용자는 특정 대회 한 곳의 16강 표시를 고치는 대신 전체 생성·운영·공개 흐름에 실제 결선 규모와 운영자가 저장한 조 이름을 반영하도록 요청했다. league_knockouts의 구조 편집 잠금이 이름 수정도 숨기며, updateGroup은 예선 config 이름과 multiFinalsRevision을 동기화하지 않는다.

### Original Conditions / Ambiguity Log
- 사용자 확정: 기존 조 이름 수정 기능 복원, 수정한 이름을 사용자에게도 표시한다. 기존 모달/버튼 재사용이며 새로운 화면 디자인은 추가하지 않는다.
- 내부 phase/edge/slot은 대진 구조를 위한 값이며 표시 이름과 분리한다. 내부 phase는 보존하고 비정규 규모의 첫 단계 표시에는 실제 팀 수의 N강을 사용한다.
- 이미 존재하는 대진의 자동 생성 이름만 data migration으로 보정한다. 운영자 지정 이름과 경기 ID/결과/연결/팀 배정은 보존한다.

### Parallel Work Breakdown / Owned / Forbidden
단일 에이전트 순차 처리. Owned: v1 API 생성/조 수정/회귀/보정 migration, v1 Web 기존 조 수정/명칭 렌더/회귀, docs/api, changeset, 이 task. Forbidden: 원본 공유 트리 WIP, 실환경 DB 직접 수정, main 승격.

### Phases / Acceptance Criteria
- [ ] A: 강수 생성·단계 분류·재생성 보존은 선행 PR #2181의 머지 대기. 이번 후속 변경은 기존 저장 대진 보정만 포함한다.
- [x] B: league_knockouts 조 이름 수정 복원, 예선 config/revision 동기화, 구조 변경 권한 유지.
- [x] C: 사용자 일정·필터·대진·경기 표시에서 저장한 조 이름 사용.
- [x] D: 변경 계약 회귀, 양쪽 타입/패턴 검증, API 문서 및 결과 기록.
- [ ] alpha 실제 화면 390/768/1440 검증(브라우저 도구/배포 상태에 따라 미검증 범위를 기록).

### User Scenarios / Test Scenarios
6/10/12/14팀 생성의 첫 단계 명칭과 부전승 수/후속 연결 보존. 관리자 권한으로 예선·결선 이름을 수정하고 재조회·일정·대진표에서 확인. 구조 잠금/진출팀 확정 revision/수정 이름의 재생성 보존을 검증한다.

### Tech Debt Resolved / Security Notes / Risks & Dependencies
기본 phase 명칭을 사용자 지정 이름보다 우선하던 중복 표시를 정리한다. 기존 관리자 mutation 가드/잠금/감사는 유지하며 새 endpoint는 추가하지 않는다. 관련 모델은 V1TournamentGroup, V1TournamentMatchDetails, V1Tournament.multiFinals이며 스키마 변경 없이 기존 자동 생성 표시를 보정하는 migration이 필요하다. alpha 실측은 미배포 및 브라우저 도구 부재로 대기다.


### 추가: N개 토너먼트 종료 화면 복원
사용자는 results 화면의 축약된 텍스트 결과 대신 기존 단일 대회 최종결과 구성을 두 개씩 보여주도록 요청했다. 기존 DesktopChampionHero/MobileChampionBanner/FinalStandingsTable/KnockoutResultsTable을 재사용하며 데스크톱 2열·모바일/태블릿 1열로 배치한다. 토너먼트별 우승/1~4위/결선 경기를 분리하고 공유 예선·대회 요약/영상 탭/경기 상세 복귀 링크는 유지한다. Owned에 results-page-client.tsx와 관련 테스트를 추가한다. 사용자 지정 재사용 방향을 구현하며 별도의 신규 스타일안을 만들지 않는다.
- [x] 종료 페이지: 기존 우승 연출·기록·순위표·경기 카드를 토너먼트별 재사용.
- [x] 결과 누락/진행 중/영상 탭/토너먼트별 순위·경기 링크 회귀.


### 최종 Progress Snapshot / 검증 증거 (2026-11-06)
- 브랜치 `fix/bracket-label-result-20261106`, 기준 dev `53e2bb3171`, 격리 작업트리 `/tmp/teameet-bracket-label-result-20261106`. 기존 공유 트리 WIP는 수정하지 않았다.
- API 관련 334개 PASS(5 suites). 새 조 이름 저장/예선 config 동기화/결선 identity 보존/빈 이름·진출 수 거절과 기존 잠금·권한 회귀를 포함한다. 마지막 service helper 보정 후 서비스 235개 재검증 PASS.
- Web 관련 297개 PASS(8 files). 최종 추가한 12강 구조/수정 이름 회귀와 종료 화면의 실제 기록·순위·토너먼트별 경기 상세 링크를 포함한다. `/tmp/teameet-bracket-followup-web-20261106.json`(296) 및 `/tmp/teameet-bracket-followup-web-final-20261106.json`(최종 변경 2 files/35; 기존 34를 대체)로 중복 없이 계산했다.
- Web `tsc --noEmit --incremental false`, API `tsc --noEmit -p tsconfig.spec.json --incremental false`, UI pattern / API surface 검사 PASS. 원래 공유 설치의 Prisma Client는 multiFinals/bracketTrack 등 최신 필드가 없었으므로 격리 schema/output으로 최신 Client를 생성해 확인했고 공유 설치는 변경하지 않았다. UI 폰트 baseline은 하드코딩 33→32 감소에 맞춰 낮췄다.
- 데이터 migration: PGlite의 실제 PostgreSQL 엔진에서 자동 이름/사용자 지정 이름/사용자 지정 round/기존 16강/수동 대진 등 6 시나리오를 실행했다. ID·phase·경기/자리 수 보존 및 두 번 재실행 시 멱등성 PASS. 전체 Prisma migration chain replay 및 원격 CI는 미실행. 실환경 데이터 쓰기는 없다.
- alpha 변경 전 공개 results/bracket 각 390/768/1440, 총 6/6 캡처. 서빙 SHA는 기준 dev와 동일, console error 0 / 실패 응답 0 / overflow 0. [evidence](../../docs/screenshots/bracket-results-followup-20261106/before-evidence.json). 처음 Chromium의 libnspr4/libnss3/libasound 누락은 /tmp 패키지 추출로 보완했고 시스템 설치는 하지 않았다. headed 브라우저 PID 5242(부모 5224)를 기록했고 종료했다.
- alpha 변경 후 공개 화면 0/6, 관리자 이름 저장 실측 0/3 viewport. 미배포이고 관리자 자격증명은 제공받지 않았으므로 이 부분을 PASS로 간주하지 않는다. 실제 alpha 화면에는 아직 기존 코드와 16강 데이터가 보인다.
- 최종 `git diff --check` PASS, touched code debt marker 0, 신규 import는 기존 tracked helper만 사용한다. 검증 프로세스는 종료했고 작업트리 검증용 node_modules 링크/격리 생성물을 정리했다. 미커밋이며 push·PR·merge·배포를 수행하지 않았으므로 PR-ready/제품 완료로 판정하지 않는다.


## #2181 중복 제거 및 후속 PR 확정 (2026-11-06)

사용자는 비교 결과를 확인한 뒤 중복 구현 제거·추가 기능 유지·dev 대상 PR 작성을 승인했다. #2181은 현재 OPEN, head `b15c94df564855c998f6a80cbcf59cb979ab8df9`이며 origin/dev `53e2bb3171`에 포함되지 않았다.

- 기존 작업 38개 파일과 binary diff를 `/tmp/teameet-bracket-backup-before-pr2181-dedup/`에 백업했다.
- `multi-finals-plan.ts/.spec.ts`, `flexible-bracket-plan.ts/.spec.ts`, `tournament-bracket.tsx/.test.ts`의 로컬 중복 수정을 diff에서 제외했다. 강수 생성·구조 분류·재생성 시 경기/일정 보존·관리자 그림/모바일/경기 방식 선택의 호환 처리는 #2181을 사용한다.
- 후속에 남기는 항목: 필터 안내 문구 제거, 승무패 색상, 조 이름 수정 및 설정/revision 동기화·공개 명칭, 기존 컴포넌트를 재사용한 토너먼트별 최종결과, 기존 자동 생성 이름의 데이터 보정.
- migration도 #2181과 동일하게 짝수 6팀 이상·비정규 규모·명명된 토너먼트에 한정한다. 홀수/일반 유연 대진/운영자 지정 이름과 round/phase/ID/결과/연결/시드는 보존한다.
- dev 대상 Draft PR로 제출한다. #2181의 재생성 보호가 먼저 반영되어야 조 이름 수정 뒤 대진 재생성도 안전하다. #2181 머지 전 이 후속 PR은 머지하지 않는다.
- 위의 API334/Web297 검증은 중복 제거 전 snapshot의 기록이며 최종 PR 검증 수치로 재사용하지 않는다. 최신 #2181 + dev + 후속 diff를 격리 통합해 관련 검증을 다시 기록한다.


### 후속 PR 최종 통합 검증 (중복 제거 후)
- 실제 PR은 dev `53e2bb3171` 기준이며 #2181 생성기/공개 대진 분류/관리자 그림/단계 방식/재생성 보호 코드와 테스트를 포함하지 않는다. Draft + 선행 #2181 의존성을 명시한다.
- 검증 조합은 별도 `/tmp/teameet-bracket-pr2181-check`: 최신 dev + #2181 `b15c94df5` + 후속 변경이다. 결과 카드 라벨 한 줄의 충돌은 저장한 단계 이름 우선·#2181 강수 fallback 유지로 해결했다. #2181 머지 후 해당 기준으로 후속 브랜치를 다시 맞춘다.
- 첫 통합 Web 397개 중 1개가 토너먼트 접두어 중복으로 RED. 섹션 이름과 단계 이름을 분리해 보정하고 해당 파일의 18개(사용자 지정 단계 이름/경기 상세 링크 신규 회귀 포함) GREEN. 나머지 380개 PASS와 합쳐 총 398개/11 files PASS다.
- API 관련 9 suites/335 tests PASS. 진출팀 배정/규칙·초기화·이름 변경·권한/버전·부전승/강수 회귀를 포함한다.
- migration 검증은 `scripts/qa/verify-knockout-display-migration.mjs`로 재현한다. 짝수 6/10/12팀 보정, 홀수/2의 제곱/일반 flexible/사용자 지정 이름·round/설정 정원 불일치 보호 등 10개 PostgreSQL 시나리오와 두 번 실행 멱등성 PASS. 설정 정원과 실제 시드 자리 수가 일치하는 대상만 보정한다. 실환경 DB 쓰기는 없다.
- `node scripts/release/check-changeset-policy.mjs --repo . --changed-files-file /tmp/teameet-bracket-pr-changed-files.txt` PASS(behavior 12 paths / Changeset patch).
- PR 작성은 코드/committed diff와 재생성 의존성을 검증한 뒤 수행한다. after alpha/관리자 로그인 QA/전체 migration chain replay는 후속 게이트로 남는다.
