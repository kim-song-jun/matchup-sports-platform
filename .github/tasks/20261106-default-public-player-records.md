# Task 20261106: 경기 기록 기본 공개 및 기존 미설정 회원 전환

Status: Review
**Created**: 2026-10-23
**Scope**: backend + frontend + data migration + docs
**Base**: origin/dev `b3cbb4b63`, isolated worktree `/tmp/teameet-default-public-records-20261023`

## Context
사용자가 신규 가입 경기 기록을 기본 공개로 바꾸고, 이메일·카카오·Apple 공통 가입 약관 화면의 버튼 위에 짧은 안내만 표시하도록 결정했다. 추가 질문에서 기존 회원은 “아직 선택하지 않은 회원만 공개로 전환”을 선택했다.

최신 dev에는 가입 마지막 단계에 기본 ON 공개 토글과 선택 저장 helper가 이미 있었다. 다만 생략된 선택은 행을 만들지 않아 비공개였고 소셜 프로필 미루기는 초기화 경로가 없었다. 최초 기획 시 주 작업트리의 구버전 코드와 최신 dev를 교차 확인해 이 차이를 수정했다.

## Goal
모든 신규 가입 완료 경로에서 기본 공개를 저장하고, 활성 기존 회원의 미설정 상태만 전환하며 명시적 비공개 선택과 개별 기록 숨김을 보존한다.

## Original Conditions
- [x] 가입 약관 하단 버튼 바로 위에 기본 공개 안내.
- [x] 이메일·카카오·Apple 공통 적용. 기존 회원 재동의/공개 약관 문서는 제외.
- [x] 가입 별도 토글 제거. 이후 설정에서 변경.
- [x] 신규 가입 및 소셜 프로필 입력 미루기 모두 서버 기본 공개 초기화.
- [x] 기존 회원은 설정 행 없는 활성·가입 완료 계정만 전환.
- [x] 기존 GRANTED/REVOKED와 실명 설정·개별 참가자 REVOKED 보존.

## User Scenarios
1. 신규 가입: `/terms?mode=signup` 또는 `mode=social`에서 “경기 기록은 닉네임으로 기본 공개돼요. 공개 여부는 가입 후 설정에서 변경할 수 있어요.”를 보고 가입한다.
2. 이메일/카카오/Apple 가입 완료 또는 소셜 프로필 미루기: 가입 트랜잭션에서 누락된 공개 설정만 GRANTED로 초기화한다.
3. 기존 활성 가입 완료 회원: 마이그레이션 시 설정이 없으면 GRANTED. 이미 설정했으면 상태·시간·정책 출처를 변경하지 않는다.
4. 설정에서 비공개 선택: 공개 이력/순위의 기존 게이트에 따라 숨겨지고, 지연된 프로필 완성이나 migration 재실행으로 재공개되지 않는다.
5. 실명 공개는 별도 설정. 신원 연결·공식 결과·경기 가시성·개별 기록 숨김 조건을 유지한다.

## Test Scenarios
- [x] RED: 기본값 생략 시 공개 저장 테스트 1건 및 가입 안내 2건이 기존 구현에서 실패.
- [x] API unit 114/114: 가입·공개 기본값·설정 GRANTED/REVOKED 왕복.
- [x] Web unit 106/106: 약관 안내 범위/위치, 가입 payload, 기존 가입 흐름.
- [x] 임시 PostgreSQL 전체 migration 재생(218개) 및 migration 통합 1/1.
- [x] backend/web typecheck 각 1회 PASS.
- [x] 실제 공개 기록 서비스 통합: 기본 공개→비공개→재공개→개별 숨김 PASS. 최종 DB 통합 2/2.
- [x] migration exact-statement 허용 및 범위 확대/덮어쓰기 거부 self-test, API surface/Web pattern PASS.
- [x] alpha 수동 QA: 실제 신규 이메일 가입·선수 로그인·공개 ON/OFF 익명 조회·기존 비공개 보존·390/768/1440px before/after 및 console/network. 외부 OAuth 공급자 인증 자체는 재실행하지 않음.

Mock/fixture: 가입/설정 API 응답 shape는 유지한다. 변경된 payload는 inline signup fixture와 서비스 테스트에 반영했다. 기존 MSW 가입 응답에는 공개 상태가 없으며 해당 응답 구조는 변경하지 않는다.

## Parallel Work Breakdown
단일 에이전트 순차 작업. 서브에이전트 사용 없음.
- [x] Backend: 누락된 공개 설정을 가입 완료 트랜잭션에서 GRANTED로 초기화, update는 빈 객체로 기존 값 유지.
- [x] DB: 데이터 migration 추가. 스키마 구조 변경 없음.
- [x] Frontend: 가입 토글 제거, 기존 고정 CTA 높이 관측 레이아웃에 안내 추가.
- [x] Docs: auth/users/public-records, API README/global-contract, scenario 및 changeset 동기화.
- [x] Alpha 배포 후 변경된 사용자 흐름 검증.

Owned files: auth signup helper/service/DTO/tests, profile·public-consent 주석, 신규 migration/통합 테스트, auth signup/terms UI/tests, 공개 설정 hook 주석, API·scenario·task 문서, 기능 changeset 및 migration 검사기의 해당 SQL 한정 허용/negative controls.
Forbidden files: 타 작업트리의 기존 변경, v0, 환경 파일, main 직접 push·실제 서비스 DB 수동 변경. 사용자 후속 요청에 따른 정상 main 승격 PR과 배포 pipeline migration은 별도 실행 범위다.

## Acceptance Criteria
- [x] Original conditions 충족하는 코드/데이터 migration 작성.
- [x] 명시적 거부 및 기본 초기화 후 OFF를 덮어쓰지 않음.
- [x] 기본값 출처 `v1-public-record-default-2`를 명시적 동의와 구분.
- [x] 테스트·typecheck 및 migration 재생.
- [x] Alpha 실제 화면·브라우저 검증. [증거](../../docs/screenshots/default-public-player-records/README.md).
- [x] 기능 PR #2049 dev 반영/alpha 배포.
- [ ] 버전 PR dev 반영·alpha 재검증 및 main 승격·production 확인.

## Tech Debt Resolved
가입 경로별 기본값 누락과 소셜 미루기 경로의 공개 설정 누락을 해소했다. 사용하지 않는 가입 공개 토글 컴포넌트를 제거했다. `hasResponded`는 기존 필드명을 유지하되 실제 의미인 설정 행 존재 여부(정책 기본값 포함)를 문서화했다.

## Security Notes
직접 비공개 선택은 유지한다. migration은 inactive·탈퇴·삭제 계정과 가입 진행 계정을 제외하며, 조회 시 누락 행을 공개로 간주하지 않는다. 공개 기본값은 본인이 명시적으로 동의했다는 증거로 기록하지 않는다. 실명·연락처 공개 범위를 확대하지 않는다.

## Risks & Dependencies
- 실제 기존 회원 전환은 배포 시 migration 실행 이후 적용된다. 이 세션에서는 서비스 DB에 적용하지 않았다.
- 기본 공개는 계정에 연결된 과거 기록에도 기존 규칙대로 적용된다.
- 초기에는 브라우저 도구가 없었으나 Windows Chrome/Playwright-core headed로 실제 alpha QA를 완료했다. 로컬 Next 서버는 띄우지 않았다.
- Web 기존 가입 테스트에서 React act 경고가 출력됐으나 106건 모두 통과했다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-23 | 가입에서 별도 공개 선택 UI가 필요한가 | 사용자: 약관 CTA 위 안내만 수용. 신규 기본 공개, 설정에서 변경 |
| 2026-10-23 | 기존 회원 범위 | 사용자 선택: “아직 선택하지 않은 회원만 공개로 전환 (권고)” |
| 2026-10-23 | inactive/가입 미완료 계정 | 신규 가입 완료 시 초기화. 기존 전환은 활성·미삭제·가입 완료 계정으로 제한 |

## Progress Snapshot
구현·단위220건·전체 migration218개 재생·DB통합2건·양쪽 typecheck/surface/pattern·migration gate self-test 완료. 초기 DB 흐름 확장 실행은 seed 의존 fixture 누락으로 실패했고 테스트 내 canonical config 초기화로 독립화한 후 2/2 PASS. 사용자 요청으로 dev 대상 PR 준비 중. merge/alpha 배포 및 실제 서비스 DB 변경 없음.

## Validation Commands / Evidence
- Host preflight: load 0.38/0.47/0.40, free available memory 약 10GB, swap 사용 0. Docker 미설치로 격리 embedded PostgreSQL 사용.
- API: `node node_modules/jest/bin/jest.js --selectProjects unit --runInBand --runTestsByPath src/auth/signup-record-consent.spec.ts src/auth/auth.service.spec.ts src/profile/profile.record-consent.spec.ts` → 114/114.
- Web: `node node_modules/vitest/vitest.mjs run src/components/auth/terms-client.test.tsx src/components/auth/signup-client.test.tsx src/components/auth/social-signup-client.test.tsx --maxWorkers=1 --minWorkers=1` → 106/106.
- 각 앱: `node node_modules/typescript/bin/tsc --noEmit --incremental false` → PASS. API surface/Web pattern도 PASS.
- Migration gate: `node scripts/qa/check-expand-contract-migrations.mjs --self-test` → PASS. 대상 SQL의 계정 범위·NOT EXISTS·DO NOTHING 또는 파일 변경은 거부.
- 임시 PostgreSQL QA runner `/tmp/teameet-default-records-db-qa.mjs`: migration deploy → 격리 clone DB에서 `test/auth/default-public-records-migration.integration-spec.ts`, `test/games/public-user-records-lineup-consent-e2e.integration-spec.ts` 직렬 실행 → 2/2 PASS. `/tmp/teameet-record-default-{migration-replay,integration}.log`에 결과 보관.
- Cleanup: 임시 DB 서버 종료 및 생성 디렉터리 삭제. 공유 기존 서버·서비스 DB 조작 없음. 임시 의존성 연결 중 untracked symlink는 제거.
- Git: `git diff --check` PASS, 신규 파일/삭제 컴포넌트 참조 확인, touched-path debt marker 신규0. 미커밋 상태 검증이며 PR-ready/alpha 완료를 의미하지 않음.

## Production Impact Snapshot — 2026-10-23 15:56:25 KST

사용자의 추가 요청에 따라 production 대상 identity를 검증한 뒤 SSM을 통해 **READ ONLY / REPEATABLE READ, statement timeout 20초**로 집계했다. 실제 회원·설정은 변경하지 않았다. 아래 숫자는 개인이 아닌 DB 계정 기준이며 승격 시점에는 달라질 수 있다. 승격 직전 `scripts/qa/default-public-records-impact.sql`로 재집계한다. 운영 식별자·자격증명·개인정보는 저장하지 않는다.

| 항목 | 계정 수 |
|---|---:|
| 전체 | 896 |
| 활성·미삭제·가입 완료 | 834 |
| 기존 공개 유지 | 90 |
| 기존 명시적 비공개 유지 | 10 |
| 이번에 공개로 초기화 | 734 |
| 가입 미완료/비활성 등 제외된 미설정 | 62 |
| 적용 후 활성 가입 완료 공개 계정 | 824 |

전환 대상 734명 중 551명은 신원 연결이 있고, 228명은 공개 조건을 만족하는 현재 확정 경기 기록 827건(서로 다른 경기 59개, 득점167·도움0)이 있다. 대회·리그 득점/도움이 있는 순위 노출 후보는 91명이다. 수상은 10명·11건이며 기록/수상을 합쳐 현재 노출 변화가 있는 계정은 중복 제거 229명이다. 나머지 505명은 설정만 바뀌며 현재 노출할 기록/수상이 없다. 과거/향후 기록이 나중에 연결되면 기존 공개 조건에 따라 표시된다.

전환 대상의 기존 실명 표시 ON은 41명이며, 그중 현재 공개 기록이 있는 사람은 5명(수상 보유1명도 이 5명에 포함)이다. 실명 설정을 바꾸지 않으므로 이 5명은 해당 실명 표시 화면에서 지금 표시가 달라질 수 있고 나머지 36명도 추후 연결 기록에 기존 실명 설정이 적용될 수 있다. “신규 기본 닉네임”은 기존 회원의 실명 ON을 끈다는 뜻이 아니다.

전환 대상 가입 단계: completed466 / deferred145 / signup_done115 / social_profile_deferred5 / sport_done2 / level_done1.

적용 시점: dev PR 생성/원격 기능 브랜치 push만으로 배포되지 않는다. dev 머지 시 alpha 배포의 DB에 먼저 적용되고, 사용자가 dev→main 승격 및 production 배포 승인을 완료한 뒤 prod `migrate deploy`가 앱 교체 전에 수행될 때 실제 회원에 적용된다. 재로그인은 필요하지 않으며 다음 조회부터 서버 상태를 따른다. 이미 열린 화면은 해당 데이터의 새 조회/캐시 갱신 시 반영된다. 개별 이메일·푸시 발송은 추가하지 않았다.

실패 시점: migration 실행 전이면 기존 회원 변화가 없지만, migration 성공 후 앱 배포가 실패해 이전 앱으로 돌아가더라도 새 공개 설정 행은 DB에 남는다. 이 데이터 변경은 앱 코드 복구만으로 자동 취소되지 않는다. migration 재실행은 DO NOTHING이며 이후 사용자가 OFF로 바꾼 행도 보존한다. 기존 비공개10명과 개별 기록 숨김·경기 공개 조건·실명 별도 설정은 계속 유지한다.

## Deployment Continuation — 2026-10-23

사용자 요청: dev 배포 및 main 승격 준비·승격. PR #2049의 최초 CI는 Gates/API PASS, Web 4건 실패였다. 실패 원인은 가입 공개 토글 제거 후 인증 continuation·약관 복구 테스트와 공유 MSW fixture가 옛 recordConsent payload를 기대한 것이었다. 해당 세 파일을 새 서버 기본값 계약에 맞췄다. 런타임 변경은 없다.

Copilot 요청 run 39915170384는 `Model "claude-opus-5" is not available`로 세션 생성에 실패해 최신 코드 리뷰를 수행하지 못했다. 이를 clean 리뷰로 간주하지 않는다. 수정 후 재요청 및 CI 확인을 진행한다. dev merge/alpha 검증·version release·main 승격·production은 각각 실제 결과를 확인한 뒤 갱신한다.

로컬 관련 회귀: 인증 continuation/약관 복구/계정 연결 redirect 28/28 PASS. 최초 CI 실패가 잡은 payload 검증을 유지하며 기대 계약만 갱신했다.

## Alpha Deployment / Release Preparation — 2026-10-23

- 사용자에게 Copilot 모델 장애와 clean 대체 금지 규칙을 알리고 예외 여부를 물은 뒤, 사용자가 배포·승격을 다시 명시 지시했다. 이를 이번 배포의 외부 리뷰 장애 예외로 반영한다고 사용자에게 알렸다. Copilot clean으로 표시하지 않는다. 이후 제공된 선수 QA 계정은 환경으로만 사용하고 저장소에 저장하지 않았다.
- PR #2049 head `fa1676239`, CI39921784226 API/Web/Gates PASS → dev merge `df42407a1`.
- Dev CI39924007213 PASS, alpha39924007216 SUCCESS, 실제 응답 header SHA 일치. 로컬 dev도 즉시 FF 동기화.
- Alpha DB: 미설정629명 → 기본 공개, 잔여0, 기존 비공개6명의 상태·정책·시간 지문 일치. 실패 migration0.
- 실제 신규 가입 기본 공개, 실제 선수 설정 ON/OFF와 익명 공개 기록(출전40/수상1 → 0/0 → 40/1), 원상 복구, 신규 테스트 계정 탈퇴 정리 PASS. 3폭 screenshots 및 console/network 오류0. [증거](../../docs/screenshots/default-public-player-records/README.md).
- Production 사전 READ ONLY 실측 2026-10-23 17:24 KST: 전환 대상734명 유지, 기존 비공개는 현재11명(초기 집계10명과 시점 차이), M11 적용 완료·실패 migration0. 이번 배포는 일반 steady 경로이며 Task168 Stage A/B 재실행은 필요 없다.
- 최신 dev 기반 release worktree에서 main에만 있던 이전 승격 이력 `dd7e6e171`을 흡수했다(파일 내용 변화0).
- 정식 `promote-main.sh --prepare-only`로 alpha SHA·버전을 확인하고 Changeset1개 소비, API/Web package1.11.5→1.11.6 및 CHANGELOG2개 갱신. 승격 게이트 PASS. 이 단계는 자동 stage/commit/push/dispatch 없이 diff만 준비했다.
- 남음: 릴리스 PR의 CI/dev 반영/alpha 재검증 → 사용자 명시 요청에 따른 main 승격 PR → 정상 production 승인/배포와 전환 결과 확인.
