# Teameet 1.19.0 승격 준비 — #2353 포함

Status: Alpha 핵심 기능 QA 확인; 사용자 승격 판단 대기. **main 승격과 운영 배포는 이번 요청 범위 밖이다.**

작성 관측 시각: 2026-11-13T03:06:40+00:00. 이후 CI 결과는 준비 PR의 최신 head 상태를 우선한다.

## 후속 Alpha QA — 2026-11-13

현재 판정: **고정 후보의 핵심 기능 3/3 흐름, 3폭 9/9 조합 확인. CI/Alpha 배포/공식 승격 정책 PASS. main 승격은 사용자 실행 대기.**
이 절은 아래 준비 시작 당시의 상태를 갱신한다. 전체 권한 조합이나 모든 4~64팀 수를 Alpha에서 재실행했다는 뜻은 아니다.

### 고정 후보와 검증
- 후보/current dev/Alpha: `974ac541b7a2e5e82f2e9687840ce5bca26e462e`.
- PR #2356은 2026-11-13T04:21:32Z dev merge 완료. 사용자 승인 Copilot 예외는 #2356 한정이다.
- [머지 후 CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43364998525)와 [Alpha 배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43364998649) 모두 success, 동일 후보 SHA.
- 최종 Alpha HTTP 200, release `1.19.1-alpha.20261113.g974ac541b7a2`; `/api/v1/health` DB true.
- source snapshot 이후 허용 경로 10/10, 범위 이탈 0. package version 외 변경 0. main 핫픽스 TS/TSX 12/12 동일. main 대비 82/82 경로, 미소비 Changeset 0.
- 공식 `check-changeset-policy.mjs --release-promotion true` PASS. main 이후 Changeset 삭제 이력 포함. resolver stableVersion `1.19.1`과 실제 Alpha prerelease 일치.
- 이번 QA 기록/PNG는 별도 evidence 브랜치에 보존한다. 해당 브랜치를 승격 대상으로 삼거나 고정 후보에 섞지 않는다. dev/main과 런타임 소스는 변경하지 않았다.

### 실제 사용자 흐름
보이는 Edge(headless:false), 별도 브라우저 프로필에서 실제 이메일 로그인 후 owner UI로 검증했다. API 검증은 화면 판정의 보조 근거다. 초기 도구 장애 때문에 저장소가 허용한 headed Playwright 1.58.2를 임시 경로에서 사용했다.

| 기능 | 관측 결과 | 390 / 768 / 1440 |
|---|---|---|
| #2347 홀수 참가팀 | 승인된 9팀 비공개 초안에서 A조 5/B조 4 생성. 실제 예선 10+6=16경기, 5자리 결선 4경기, 부전승 3자리. 휴식용 가짜 경기 없음. 서버 재조회 후 20경기와 5·4 슬롯 유지 | PASS / PASS / PASS |
| #2350 회원 대진표 | 회원 상세 하단에서 사유 입력 후 기존 공개 테스트 대회의 대진 조회. admin shell·조회 전용·만료 시각·돌아가기 유지. 대회 정보 링크 클릭 시 이동 차단과 안내. 실제 10분 경과 뒤 서버 403과 화면 만료 안내. 다시 회원 상세에서 재발급 가능, 원 계정 auth/me 200 유지 | PASS / PASS / PASS |
| #2348 시간·구장 | KST 10:00/10:30 등록·중복 안내. 시간 변경/해제 시 구장 보존, 구장 변경/해제 시 시간 보존. 새로고침 복원. 수동 경기 편집의 등록 시간 선택·저장. 같은 시간+같은 구장 경고, 다른 구장 경고 없음. 패널 전환 후 접힘 유지. 별도 context의 쿠키만 지운 실제 저장 요청은 401, UI 오류와 원 서버 값 보존 | PASS / PASS / PASS |

3폭 모두 document 가로 넘침 없음. 패널은 desktop aside / tablet·mobile bottom sheet를 직접 확인했다. PNG 12개를 육안 검토했다. 이전 before 캡처는 없으며, 이번에는 이미 배포된 기능에 대한 after 및 실제 오류 상태를 수집했다.

### 권한·console/network 범위
- 실제 owner 로그인, admin/me·admin 대회·정규 리그 조회 200. 비인증 시간/회원 열람·개발용 신원 헤더는 401. 별도 context의 실제 fixture PATCH도 401 `UNAUTHENTICATED`, 실패를 성공으로 표시하지 않음.
- owner 이외 support/철회/타 대회 총괄 및 비활성 구장 시나리오는 이번 세션에서 실계정으로 재실행하지 않았다. 기존 service/controller 단위·통합 CI 증거와 구분한다. 따라서 assignment 시나리오 1~7은 실제 흐름으로 확인, 8은 비인증 차단만 실제 확인한 PARTIAL이다. 이 제한은 숨기거나 전체 권한 QA PASS로 집계하지 않는다.
- pageerror 0. 정상 저장에서 예기치 않은 API 실패 없음. 예상 오류: 10분 만료 열람 403, 쿠키 제거 context 저장 401, 비공개/취소 대회 공개 조회 404. Next 공개 링크 prefetch도 비공개 대회 페이지에서 404를 기록했으므로 console/network 완전 무오류로 표현하지 않는다.

### 승인과 cleanup
- 사용자가 이번 세션의 기존 QA 계정 사용과 프로젝트 루트/.git의 현재 사용자 ACL 보정, 아래 테스트 대회 생성·QA·취소·숨김을 명시 승인했다. 자격증명/쿠키는 파일이나 PR에 기록하지 않았다.
- Windows ACL: 두 디렉터리에만 `LEESEUNGMIN\seungmin`의 ReadPermissions/ChangePermissions ACE 추가. 소유자 및 하위 폴더 권한은 별도로 변경하지 않음. UAC 실행 성공 확인. CUA kernel 초기화와 native 앱 inventory는 복구됐으나 browser provider는 `The browser access host is unavailable`을 별도로 반환했다. headed QA 결과와 구분한다.
- 소유 테스트 대회: `cf4c362e-5a0f-44b1-b4a9-4c1e622d63fe`, `[QA2356 1113] 홀수팀 시간구장 검증`. 최종 `status=cancelled`, `isPublic=false`, 참가 신청 0, 공개 API 404. 다른 대회/팀/회원 데이터는 변경하지 않음.
- 잔여 승인된 QA 기록: 취소된 대회의 20경기·슬롯·두 시간 선택지·대회 전용 A/B 구장 및 열람/변경 감사 로그. 영구 기록 가능성을 승인받았으며 삭제/초기화하지 않음.
- 프로세스: node 17336(parent 44516), 별도 Edge 11980(parent 17336) 기록 후 browser/server 정상 종료, 두 PID 부재 확인. 실패 검증 context도 닫음. 기존 사용자 브라우저는 유지.

### 사용자 승격 인계
검토 diff는 main baseline `0a4a1b268f5c6612da6fd51fdeffc2e6d5179a1c`에서 후보 `974ac541b7a2e5e82f2e9687840ce5bca26e462e`까지다. 사용자가 main 대상 PR을 열기 직전 dev와 Alpha SHA가 이 후보인지 확인해야 한다. 후속 dev 변경을 섞지 않는다. main PR 개설/머지와 production environment 승인은 사용자 전용이며 에이전트가 실행하지 않았다. 위 세부 권한 실계정 재검증 제한을 릴리스 판단에 포함한다.

## 범위와 고정 근거

기존 [준비 PR #2352](https://github.com/kim-song-jun/matchup-sports-platform/pull/2352)는 dev 머지/Alpha 배포까지 완료됐다. 사용자가 정규 리그 시간 기능 #2353을 추가하도록 명시 승인했다. 이전 1.18.0 문서·잠금 파일·브랜치는 이력으로 보존한다. 이번 후보는 새 브랜치 `release/prepare-1.19.0-2353`에 고정하며 [scope lock](release-1.19.0-scope-lock.json) 외 추가 변경을 허용하지 않는다.

- 기능 source snapshot: `a5496263242ab72a51e1ca420b85bf6a8b351ed6` (현재 dev/Alpha).
- main 기준: `0a4a1b268f5c6612da6fd51fdeffc2e6d5179a1c` (성별 핫픽스 #2355 포함).
- 기존 승인 4개 + 추가 #2353 = **5/5 기능**. 별도 main 핫픽스 #2355는 그대로 보존한다.
- 향후 dev 커밋·후속 Changeset은 섞지 않는다. 고정 후보 전체 SHA 링크로 최종 비교한다.
- 이번 준비 PR의 dev 대비 차이는 metadata/docs뿐이다. 기능/API/Prisma/migration/dependency/deploy/workflow를 새로 수정하지 않는다.

## 포함 기능 및 QA

| PR | 포함 내용 | 확인된 증거 / 남은 조건 |
|---|---|---|
| #2347 | 홀수 참가팀 대진 생성 | CI·당시 배포 근거 있음. 로그인 후 홀수팀 생성·3폭 QA 미완료 기록 유지 |
| #2350 | 관리자 회원 상세의 조회 전용 대진표 | 단위·타입 근거 있음. 실제 권한·만료·에러·3폭 QA 미완료 기록 유지 |
| #2348 | 리그+N 토너먼트 시간·구장 독립 배정 | CI·배포 근거 있음. 기존 기능 시나리오와 after 3폭 QA 미완료 기록 유지 |
| #2351 | 순위표 반복 동점 규정 안내 제거 | 기존 공개 390/768/1440 before/after PASS 근거 유지 |
| [#2353](https://github.com/kim-song-jun/matchup-sports-platform/pull/2353) | 정규 리그 시간 등록·경기 시간 배정·수정 시 등록 시간 선택 | 최신 PR 본문: 전체 Web 986 files/12,502 tests·build, API/Gates/security PASS; Alpha SHA 0f1f93621788 확인; headed 1440/768/390 overflow/console/network 이상 없음; 저장·배정·수정·중복·400/401/404 계약 확인. 테스트 경기 시간 원복, 사용하지 않는 시간 선택지 1개가 기존 테스트 리그에 남았다는 기록 유지 |

#2353에는 실제 구장이 아닌 “장소 미정”을 구장 충돌로 경고하던 수정도 포함한다. 새 migration은 추가하지 않으며 #2348의 시간 테이블을 재사용한다. 위 근거는 원 PR의 기록을 교차 확인한 것으로, 이번 준비 세션에서 로그인 QA를 다시 수행했다고 표시하지 않는다.

성별 신청 제한 #2354는 main 핫픽스 [#2355](https://github.com/kim-song-jun/matchup-sports-platform/pull/2355)와 런타임 코드가 같다. main→준비 브랜치 이력 흡수와 1.17.1 CHANGELOG 보존으로 유지한다. 운영 신규 기능 5개에는 중복 집계하지 않는다. 미머지 #2340/#2349 및 다른 후속 변경은 포함하지 않는다.

## 버전 / Changesets

- main manifest 1.17.1, source dev manifest 1.18.0 → 후보 API/Web 모두 **1.19.0**.
- 소비 Changeset 2개: `league-schedule-time-picker.md` (minor), `clean-tournament-team-gender.md` (patch, main 선반영/동등 코드).
- 양쪽 CHANGELOG의 1.18.0과 main 1.17.1 절을 보존하고 1.19.0 절을 생성했다.
- 현재 resolver는 미소비 Changeset이 없으면 patch를 더하므로, 준비 PR 반영 후 예상 표시 버전은 **1.19.1-alpha.… / 운영 1.19.1**이다. manifest와 표시 버전을 구분하며 실제 승격 직전에 다시 계산한다.

## DB / 배포 영향

- main 대비 신규 additive migration은 기존 #2348의 `20261112000100_v1_tournament_schedule_times` **1개**다.
- 시간 선택지 테이블 생성·대회+시간 unique·대회 FK cascade. 기존 데이터 삭제/컬럼 제거/재시드 없음.
- #2353 자체의 신규 migration은 **0개**. schema/client pin·manifest 등은 승인된 기존 기능 diff 그대로 보존.
- Task168 Stage A/B 전환을 다시 실행할 근거가 아니다. 실제 배포 모드는 기존 운영 런북을 따른다. 이번 준비는 운영 DB·SSM·비밀값을 직접 수정하지 않는다.

## 관측한 배포 상태

- Alpha `/landing`: HTTP 200, SHA `a5496263242ab72a51e1ca420b85bf6a8b351ed6`, release `1.19.0-alpha.20261113.ga5496263242a`.
- 준비 시작 시 운영 `/api/v1/health`: HTTP 200, SHA `6d12d118ebf3fee7f7c970b7a7f18c72c9fe5edf`, 표시 `1.17.1`.
- main 저장소는 `0a4a1b268f5c6612da6fd51fdeffc2e6d5179a1c`이나 공개 운영 응답은 당시 이전 SHA였다. 핫픽스 workflow 43348370278은 API/Web/Gates/Build images 성공, Deploy 진행 중이었다. 코드 머지와 운영 반영 완료를 구분한다.

## 준비 검증과 다음 단계

완료: 공식 `--prepare-only`(Alpha SHA/version 대조 포함), 고정 API/Web 버전·Changeset 소비·main promotion gate, versioning 계약 **24/24 PASS**, source snapshot 대비 런타임 diff 0, package version 외 변경 0, diff/debt 검사.

남은 단계:
1. dev 대상 준비 PR 최신 CI·리뷰 확인. 이전 #2352 리뷰 예외와 #2355 1회 main 머지 예외를 새 승격에 자동 적용하지 않는다.
2. 준비 PR 반영 후 새 dev/Alpha SHA·버전·고정 범위 재검증.
3. #2347/#2350/#2348의 미완료 로그인 QA 근거 보완. #2353 QA 완료가 나머지 기능의 QA 완료를 뜻하지 않는다.
4. 사용자 최종 승격 판단 및 별도 main PR/production 승인. 이번에는 main PR을 만들거나 머지하지 않는다.

## main 대비 최종 후보 인벤토리

현재 working-tree 기준 **82/82 경로**. 분류: Docs/task 18, API 20, Web 40, Deploy/release 4. 최종 committed SHA에서 같은 목록과 scope lock을 다시 확인한다.

<details><summary>전체 경로</summary>

- `.github/tasks/20261110-flexible-tournament-bracket-planning.md`
- `.github/tasks/20261132-admin-member-bracket-preview.md`
- `.github/tasks/20261132-fixture-time-court-assignment.md`
- `.github/tasks/20261133-league-schedule-time-picker.md`
- `.github/tasks/20261133-production-release-1.18.0.md`
- `apps/v1_api/CHANGELOG.md`
- `apps/v1_api/package.json`
- `apps/v1_api/prisma/migrations/20261112000100_v1_tournament_schedule_times/migration.sql`
- `apps/v1_api/prisma/schema.prisma`
- `apps/v1_api/src/admin/admin.module.ts`
- `apps/v1_api/src/admin/dto/member-bracket-preview.dto.ts`
- `apps/v1_api/src/admin/member-bracket-preview.controller.spec.ts`
- `apps/v1_api/src/admin/member-bracket-preview.controller.ts`
- `apps/v1_api/src/admin/member-bracket-preview.service.spec.ts`
- `apps/v1_api/src/admin/member-bracket-preview.service.ts`
- `apps/v1_api/src/teams/teams.module.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.controller.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.dto.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.service.spec.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.service.ts`
- `apps/v1_api/src/tournaments/templates/flexible-bracket-plan.spec.ts`
- `apps/v1_api/src/tournaments/templates/flexible-bracket-plan.ts`
- `apps/v1_api/src/tournaments/tournaments.module.ts`
- `apps/v1_api/test/fixtures/game-schema.fixture.ts`
- `apps/v1_api/test/tournaments/schedule-times.integration-spec.ts`
- `apps/v1_web/CHANGELOG.md`
- `apps/v1_web/package.json`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-fixture-schedule-modal.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-mobile-editor.fixtures.ts`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-time-assignment.test.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-time-assignment.tsx`
- `apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.tsx`
- `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx`
- `apps/v1_web/src/app/admin/users/[id]/bracket-preview/[previewId]/page.test.tsx`
- `apps/v1_web/src/app/admin/users/[id]/bracket-preview/[previewId]/page.tsx`
- `apps/v1_web/src/app/admin/users/[id]/page.tsx`
- `apps/v1_web/src/app/tournaments/[id]/bracket/bracket-page-client.tsx`
- `apps/v1_web/src/app/tournaments/[id]/bracket/bracket-schedule-permissions.test.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-assignment-context.ts`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-assignment-workspace.test.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-assignment-workspace.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-metadata-editor.test.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-metadata-editor.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-time-picker.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/flexible-bracket-wizard.test.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/flexible-bracket-wizard.tsx`
- `apps/v1_web/src/components/admin/competition-field-picker.test.tsx`
- `apps/v1_web/src/components/admin/member-bracket-preview-button.test.tsx`
- `apps/v1_web/src/components/admin/member-bracket-preview-button.tsx`
- `apps/v1_web/src/components/tournaments/member-bracket-identity.tsx`
- `apps/v1_web/src/components/tournaments/stages/stage-public-view.test.tsx`
- `apps/v1_web/src/components/tournaments/stages/stage-public-view.tsx`
- `apps/v1_web/src/components/tournaments/tournament-standings-table.test.tsx`
- `apps/v1_web/src/components/tournaments/tournament-standings-table.tsx`
- `apps/v1_web/src/hooks/use-fixture-schedule-times.ts`
- `apps/v1_web/src/lib/admin-labels.ts`
- `apps/v1_web/src/lib/fixture-assignment.test.ts`
- `apps/v1_web/src/lib/fixture-assignment.ts`
- `apps/v1_web/src/lib/member-bracket-public-source.test.ts`
- `apps/v1_web/src/lib/member-bracket-public-source.ts`
- `apps/v1_web/src/test/msw/handlers.ts`
- `apps/v1_web/src/test/msw/member-bracket-preview-handlers.ts`
- `apps/v1_web/src/test/msw/schedule-time-handlers.ts`
- `deploy/Dockerfile.v1-api`
- `deploy/alpha-manifest-common.sh`
- `docs/api/README.md`
- `docs/api/domains/admin-and-ops.md`
- `docs/api/domains/league-matches.md`
- `docs/api/domains/tournaments.md`
- `docs/api/global-contract.md`
- `docs/design/competition-canonical-flow.md`
- `docs/ops/release-1.18.0-scope-lock.json`
- `docs/ops/release-1.19.0-scope-lock.json`
- `docs/ops/release-readiness-1.18.0-2026-11-13.md`
- `docs/ops/release-readiness-1.19.0-2026-11-13.md`
- `docs/scenarios/fixture-time-court-assignment.md`
- `docs/scenarios/index.md`
- `docs/scenarios/league-schedule-time-picker.md`
- `scripts/release/create-alpha-release-manifest.sh`
- `scripts/release/prepare-task168-final-steady-inputs.sh`

</details>
