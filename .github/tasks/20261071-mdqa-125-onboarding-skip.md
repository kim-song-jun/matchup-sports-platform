# Task 20261071: MD-QA #125 소셜 가입 「나중에 입력할게요」 (정보 입력 건너뛰기)

Status: Planning
**Owner**: Planning team → backend-data-dev ⟂ frontend-ui-dev
**Created**: 2026-10-11

구현 상세 계약(파일·함수·상수 단위)은 작업 스크래치의 `onboarding-design/contract.md`(확정판)를 정본으로 한다. 이 문서는 요구사항·시나리오·검증 기준을 담는다.

## Context

소셜(카카오·애플) 가입은 약관 → 정보 입력(닉네임·이름·성별·휴대폰 인증·생년월일) → 종목 선택 순서라, 정보 입력 단계에서 이탈하는 사람이 많다는 MD-QA #125 제보가 있었다. 둘러보기만 하려는 사람도 휴대폰 인증까지 끝내야 홈에 들어간다. 반대로 정보를 받지 않고 들여보내면 팀·매치·대회처럼 다른 사람과 엮이는 쓰기에서 신원을 알 수 없다.

사용자 결정(2026-10-11, 되묻지 않음): D1=B, D2=a, D3=a, D4=a, D5=a (아래 Original Conditions).

## Goal

소셜 가입자가 정보 입력 화면에서 「나중에 입력할게요」로 건너뛰어 바로 홈에 들어가고, 팀 만들기·참가 신청처럼 다른 사람과 엮이는 쓰기를 처음 시도하는 순간 정보 입력으로 안내받아 마친 뒤 하던 화면으로 돌아오며, 이메일 가입자와 기존 가입자의 동작은 달라지지 않는다.

## Original Conditions (must all be satisfied)

- [ ] D1=B: 소셜 정보 입력 화면(가입 모드)에 제출 버튼 바로 아래 「나중에 입력할게요」 + 안내 "팀 만들기·참가 신청처럼 활동을 시작할 때 다시 물어볼게요."
- [ ] D2=a: 건너뛴 사용자는 조회(GET/HEAD/OPTIONS)는 전부 가능, 쓰기는 휴대폰 인증 게이트와 같은 허용 목록 밖이면 `403 ACTIVITY_PROFILE_REQUIRED`
- [ ] D3=a: 소셜 약관에 「만 14세 이상이에요」 필수 체크(전체 동의에 포함, 보기 링크 없음) → `ageConfirmed: true` 필수, 없거나 false 면 400
- [ ] D4=a: 건너뛰면 종목 선택 없이 바로 홈(또는 저장된 redirect)
- [ ] D5=a: 건너뛴 사람의 닉네임 = 카카오 닉네임, 겹치면 숫자 접미, 없으면 「팀밋사용자NNNN」 계열
- [ ] 새 상태 `social_profile_deferred`(enum + 멱등 migration), `POST /auth/social-profile/defer`
- [ ] 이어 입력 모드: 제목 「활동 정보 입력」, 부제 "입력을 마치면 하던 화면으로 돌아가요.", 버튼 「입력 완료하고 계속하기」, 건너뛰기 없음, 닉네임 미리 채움, 완료 시 상태 `deferred` + redirect 복귀
- [ ] 활동 게이트 시트(제목 "활동하려면 정보가 필요해요") + 만들기 화면 진입 전 시트(행동별 제목) + 홈 배너(deferred 에만, 휴대폰 배너와 겹치지 않음)
- [ ] 24시간 만료 정책은 deferred 에 적용하지 않음, 선호 온보딩 API 는 deferred 에서도 동작하되 상태를 바꾸지 않음
- [ ] 적용 대상은 소셜 가입(카카오·애플)만. 이메일 가입·기존 가입자 불변
- [ ] 목업 일치: `fT-terms-age`, `fB-signup-skip`, `fH-home-banner`, `fG-gate-sheet`, `fF-activity-form`

## User Scenarios

### Scenario 1: 건너뛰고 둘러보기
As a 카카오로 처음 온 사용자, I want to 정보 입력을 미루고 홈을 먼저 보고 싶다 so that 서비스가 맞는지 확인한 뒤 가입 정보를 낼 수 있다.

Steps:
1. 카카오 로그인 → 약관 화면에서 「만 14세 이상이에요」 포함 필수 항목 체크 → 계속
2. 정보 입력 화면에서 「나중에 입력할게요」 탭
3. 홈에 도착, "활동 정보를 입력해 주세요" 배너 확인, 매치·팀·대회 목록 조회

Expected result: 프로필(닉네임=카카오 닉네임)이 생기고 홈이 열린다. 휴대폰 인증 배너는 보이지 않는다.

### Scenario 2: 활동을 시도하면 정보 입력으로
As a 건너뛴 사용자, I want to 팀을 만들려 할 때 필요한 정보만 입력하고 이어가고 싶다 so that 긴 폼을 채운 뒤 막히지 않는다.

Steps:
1. 하단/홈에서 팀 만들기 진입 → 폼 대신 "팀을 만들려면 정보가 필요해요" 시트
2. 「정보 입력하기」 → `/signup/social?redirect=/teams/new` 의 「활동 정보 입력」 화면(닉네임 미리 채워짐)
3. 이름·성별·생년월일·휴대폰 인증 후 「입력 완료하고 계속하기」

Expected result: 팀 만들기 화면으로 돌아오고, 이후 같은 쓰기가 가드를 통과한다. 상태는 `deferred`.

### Scenario 3: 폼 없는 쓰기(참가 신청)
As a 건너뛴 사용자, I want to 참가 신청 버튼을 눌렀을 때 이유를 알고 싶다.

Steps: 매치 상세에서 신청 → 서버 403 `ACTIVITY_PROFILE_REQUIRED` → 전역 시트 → 「다음에 할게요」로 닫기 또는 「정보 입력하기」.

Expected result: 실패 토스트가 아니라 전역 시트가 뜬다.

### Scenario 4: 대조군 — 일반 가입자
이메일 가입자·이미 가입을 마친 소셜 사용자는 약관 화면의 나이 체크(소셜 모드에만)·건너뛰기·시트·배너 어느 것도 새로 보지 않는다. 휴대폰 미인증 일반 사용자는 기존 `PHONE_VERIFICATION_REQUIRED` 그대로.

## Test Scenarios

### Happy path
- [ ] defer: `social_profile_required` → 프로필 생성(카카오 닉네임), 상태 `social_profile_deferred`, 응답 next.route null
- [ ] 완료: deferred → `POST /auth/social-profile` → 상태 `deferred`, 자기 닉네임 그대로 허용
- [ ] 가드: deferred 사용자 GET 200, 허용 경로(`/auth/*`·`/verification/*`·`/me`·`/onboarding`) 쓰기 통과
- [ ] 약관: 나이 체크 + 필수 체크 시 `ageConfirmed: true` 전송, 건너뛰기 → 홈/redirect 이동 + GA `sign_up_complete`(profile=deferred)
- [ ] 이어 입력 모드 제목·버튼·redirect 복귀 + GA `activity_profile_complete`

### Edge cases
- [ ] 닉네임 중복 → 숫자 접미, 상한 후 「팀밋사용자NNNN」 대체, 20자 절단·공백 정리
- [ ] 카카오 닉네임 없음 / 애플(닉네임 없음) → 애플 이름 또는 대체 규칙
- [ ] deferred 계정 updatedAt 25시간 경과 → 만료·리셋되지 않음
- [ ] deferred 에서 선호 온보딩(`updatePreferences`/`defer`/`complete`) → 데이터 저장, `onboardingStatus` 유지
- [ ] 24h 지난 `social_profile_required` 의 defer → 401 `SOCIAL_SIGNUP_EXPIRED` + 상태 리셋
- [ ] 약관 재동의 필요한 deferred 사용자 → `TERMS_RECONSENT_REQUIRED` 가 먼저
- [ ] 관리자 면제(`isPhoneVerificationExemptActor`)는 activity 검사에도 동일 적용
- [ ] 소켓: deferred 사용자 연결·알림·채팅 허용, `game.event.append`/`retry`·`game.takeover.request`/`renew` 는 비어드민에게 `ACTIVITY_PROFILE_REQUIRED` 로 거절
- [ ] 대조군(전역 규칙 34): `completed`·휴대폰 미인증 일반·`social_profile_required` 사용자를 같은 가드 스펙에서 확인, 웹 게이트는 required 만 강제 이동

### Error paths
- [ ] `ageConfirmed` 누락·false → 400
- [ ] 상태가 required 가 아닌 사용자의 defer → 400 `VALIDATION_ERROR`, `social_terms_required` → 400 `TERMS_REQUIRED`
- [ ] 생년월일 만 14세 미만 완료 → `SIGNUP_AGE_RESTRICTED`
- [ ] 휴대폰 미인증 완료 → `PHONE_NOT_VERIFIED`, 번호 중복 → `PHONE_CONFLICT`
- [ ] defer 호출 실패 시 화면에 `extractErrorMessage` 메시지(빈 catch 금지)

### Mock data updates needed
- [ ] `apps/v1_api/src/**/*.spec.ts`·`test/fixtures/`: 사용자 fixture 의 `onboardingStatus` 유니온에 새 값, `SocialTermsDto` 호출부에 `ageConfirmed`
- [ ] `apps/v1_web/src/test/msw/handlers.ts`: `/auth/social-terms`(ageConfirmed 검증), `/auth/social-profile/defer`; deferred 용 `auth/me` 는 테스트 내 `server.use`
- [ ] `apps/v1_web` 의 `V1AuthMe`·`ONBOARDING_STATUS_LABEL` 관련 테스트 fixture

## Parallel Work Breakdown

### Backend (Frontend/Infra와 병렬 가능)
- [ ] B1 — schema enum + migration `ADD VALUE IF NOT EXISTS`(`prisma/migrations/20261011130000_...`), exhaustive switch 2곳
- [ ] B2 — 카카오 닉네임 draftJson 보관, `auth/social-nickname.ts` 생성기
- [ ] B3 — `SocialTermsDto.ageConfirmed` + 확인 시각 draftJson 병합
- [ ] B4 — `POST /auth/social-profile/defer` + 가드 허용 목록(`social-signup-access.ts`) + `completeSocialProfile` 두 상태 허용
- [ ] B5 — `V1AuthGuard` activity 검사(약관 재동의 뒤·휴대폰 게이트 앞), `getAuthNextRoute`, onboarding 서비스 상태 유지
- [ ] B6 — `docs/api` 갱신(auth.md·global-contract.md·auth-and-session.md), 스펙·통합 스펙

### Frontend (Backend와 병렬 가능)
- [ ] F1 — 약관 나이 체크(`terms-client.tsx`), 타입·훅(`use-v1-api.ts`), 라벨(`format-user.ts`)  ← 3안 제시 → 선택 완료(2026-10-11, B·a·a·a·a·a·a)
- [ ] F2 — `social-signup-client.tsx` 가입 모드 건너뛰기 / 이어 입력 모드
- [ ] F3 — `activity-profile-required` pub/sub + `api-client.ts` + 전역 시트 + `providers.tsx`
- [ ] F4 — `RequireActivityProfile`(팀·매치·팀매치 만들기, 대회 신청 4곳)
- [ ] F5 — 홈 배너(`PhoneVerifyBanner` 일반화, `home-client.tsx`)
- [ ] F6 — vitest 파일 단위 테스트, MSW 핸들러

### Infra (Backend/Frontend와 병렬 가능)
- [ ] I1 — `.changeset/mdqa-125-onboarding-skip.md`(`v1_api`·`v1_web` patch)

### Sequential (병렬 작업 이후에 실행)
- [ ] 통합: 웹이 쓰는 에러 코드·응답 모양(`next.route: string | null`) 계약 대조
- [ ] 머지 전 CI 확인(마이그레이션 replay·drift gate, 통합 스펙)
- [ ] 머지 후 alpha 실측: 카카오 가입 → 건너뛰기 → 홈 배너 → 만들기 시트 → 입력 완료 → redirect 복귀, 3폭(390/768/1440) 갤러리 PR 게시

## Acceptance Criteria

- [ ] 3안 제시 → 선택 완료(2026-10-11, B·a·a·a·a·a·a)
- [ ] Original conditions 전부 충족
- [ ] User scenarios 전부 통과 (alpha 실화면)
- [ ] Test scenarios 전부 green
- [ ] 범위 내 tech debt 해결됨 (새로운 부채 0)
- [ ] Security 리뷰 통과 (아래 노트 참조)
- [ ] Mock data 업데이트 완료, schema와 sync (migration 포함, replay + drift 0)
- [ ] 디자인 시스템 준수 (token, `components/v1-ui/` 재사용, 44px, 다크모드, 해요체)
- [ ] Code review: Critical=0, Warning=0

## Tech Debt Resolved

- `PhoneVerifyBanner`를 문구만 다른 차단성 배너에 재사용할 수 있게 일반화(복제 배너를 새로 만들지 않음)
- 휴대폰 인증 시트의 pub/sub 구조를 복제 대신 같은 모양의 leaf 모듈로 분리(순환 import 방지 원칙 유지)
- 허용 경로 목록은 `isPhoneVerificationRequestAllowed` 하나를 재사용해 규칙이 두 벌이 되지 않게 함

## Security Notes

- 고려한 위협: (1) 상태 우회 — 정보 없이 만든 계정이 팀·대회 등 쓰기를 직접 호출. (2) 선호 온보딩 API 로 상태를 덮어써 게이트 해제. (3) 미성년자 가입 — 건너뛰면 생년월일을 받지 않음. (4) open redirect — `redirect` 쿼리. (5) 닉네임으로 타인 사칭/중복.
- 완화책: (1) V1AuthGuard 가 서버에서 최종 차단(프런트 시트는 UX), 휴대폰 게이트와 같은 허용 목록·관리자 면제. 만들기 계열은 `CreatorProfileGuard`(realName·phone·gender)가 추가로 막음. (2) deferred 에서 `updatePreferences`/`defer`/`complete` 가 `onboardingStatus` 를 바꾸지 않음. (3) 약관의 `ageConfirmed` 필수 + 완료 시 `SIGNUP_AGE_RESTRICTED` 연령 검증 유지. 건너뛴 사용자는 쓰기 권한이 없어 미성년 노출 범위가 조회로 한정. (4) 웹은 `sanitizeRedirectPath` 통과. (5) 자동 닉네임은 카카오 닉네임을 시드로 하되 중복 검사를 거침(unique 제약이 없어 동시 경합 가능성은 기존 가입 경로와 동일 수준). 새 엔드포인트는 `V1AuthGuard` 필수, 본문 없음.

## Risks & Dependencies

- 외부 블로커: 없음. 선행 태스크: 없음(소셜 가입 흐름 Task 163 계열 기존 구현 위에 얹음).
- 리스크: (a) `ADD VALUE` 는 같은 트랜잭션에서 새 값을 쓰면 실패 — migration 에 값 추가만 둔다. (b) `social_profile_deferred` 를 `getPendingSocialSignupRoute` 에 넣으면 소켓·약관 게이트·prefill 이 가입 진행 중으로 오판 — 의도적으로 제외. (c) 닉네임에 unique 제약이 없어 동시 가입 경합 시 극히 드물게 중복 가능. (d) `ageConfirmedAt` 은 draftJson 에 남아 `updatePreferences` 가 덮어쓸 수 있음 — 가입 시점 확인 기록이며 법적 증빙 아님(지속 증거는 생년월일 검증). (e) 알림·채팅 등 휴대폰 게이트 허용 목록 밖 쓰기는 모두 막힘 — 의도(D2), alpha 에서 실제 막히는 경로 목록을 한 번 훑는다.
- 배포: 서버가 새 상태를 내려주기 전에 웹이 먼저 배포되면 새 코드는 값 없이 동작, 반대 순서면 구 웹이 새 상태를 모름 — 구 웹의 `PendingSocialSignupGate` 는 deferred 를 강제 이동하지 않으므로 안전.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-11 | user | 건너뛰기 위치/범위/약관/종목/닉네임 | D1=B, D2=a, D3=a, D4=a, D5=a (되묻지 않음) |
| 2026-10-11 | tech-planner | 초안은 라벨 소스를 `lib/admin-labels.ts` 로 가정 | 정정: 실제 단일 소스는 `lib/format-user.ts` `ONBOARDING_STATUS_LABEL` |
| 2026-10-11 | tech-planner | 초안은 defer 상태 오류를 409/403 으로 가정 | 정정: 이 파일 관례대로 400 `VALIDATION_ERROR`/`TERMS_REQUIRED` |
| 2026-10-11 | tech-planner | 초안은 소켓 쓰기 거부를 요구 | 최종 정정(Codex P2 반영): 연결·알림·채팅은 열어 두되, `game.event.append`/`retry`·`game.takeover.request`/`renew` 는 command 시점에 `social_profile_deferred` 비어드민을 `ACTIVITY_PROFILE_REQUIRED` 로 거절한다(게이트웨이 변경 있음) |
| 2026-10-11 | tech-planner | 선호 온보딩이 상태를 덮어써 게이트 해제 | deferred 에서는 상태 유지(계약 서버 9번에 추가) |
| 2026-10-11 | tech-planner | 활동 시트를 `ConfirmModal` 로 할지 바텀시트로 할지 | 목업 `fG-gate-sheet` 기준으로 구현 시 확정(빌더가 불확실하면 `BLOCKED` 보고) |
