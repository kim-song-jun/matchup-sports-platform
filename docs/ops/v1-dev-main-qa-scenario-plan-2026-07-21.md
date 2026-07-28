# Teameet v1 — main vs dev(alpha) QA 시나리오 마스터 플랜

**생성일**: 2026-07-21
**대상 브랜치**: `dev` (alpha 서버 배포 대상) vs `main` (프로덕션)
**대상 스택**: `apps/v1_api` + `apps/v1_web` (Teameet v1 신규 플랫폼)

---

## 왜 이 문서가 필요한가

### 1) main vs dev는 "기능 diff"가 아니라 "플랫폼 전체 교체"다

- `dev`는 `origin/main` 대비 **302 commit 선행**, **700개 파일**, **+70,753 / −7,632 라인** 차이가 난다. 이는 부분 기능 추가가 아니라 **`apps/v1_api` + `apps/v1_web`이라는 사실상 완전히 새로운 "v1" 플랫폼 전체**가 main에는 없다는 뜻이다.
- 따라서 이 QA 플랜의 스코프는 "최근 변경점만 찍어서 확인"이 아니라 **v1 플랫폼 20개 도메인 전체**(`admin, auth, chat, common, health, home, inquiries, master, matches, notices, notifications, onboarding, profile, reviews, search, sports, team-matches, teams, tournaments, uploads, verification`)를 대상으로 한다.
- 참고로 legacy `apps/api`에 있던 `marketplace / lessons / mercenary / payments / disputes / settlements`는 v1에 아직 이식되지 않았다 — **이번 QA 스코프 아님**.

### 2) ⚠️ main에만 있고 아직 dev로 역병합되지 않은 변경 — 반드시 사전 확인

- `main`은 `origin/dev` 대비 **4 commit 선행**(2026-07-20, PR #99/#100 계열 — **관리자 컨텐츠/멤버 삭제 안전성**, **마이페이지 세션 보존**).
- 레포 정책(`main → dev만 허용`, main 직접 push 금지)상 이 4개 커밋이 아직 dev로 역병합되지 않은 상태로 추정된다. **QA 착수 전 반드시 별도 확인 필요** — dev 기준으로 alpha 배포 시 이 안전성 수정이 빠진 채로 나갈 위험이 있다. (본 문서의 admin_platform / settings 섹션 시나리오 실행 전, 해당 4 commit의 dev 반영 여부를 먼저 확인할 것.)

### 3) 🔴 미해결 오픈 디시전 — 11종목 vs 4종목 표시 불일치

- 기존 마스터 페르소나 플랜 문서(`docs/ops/v1-persona-flows.md`)에 남아있던 오픈 이슈: **landing 페이지는 11종목을 광고하지만, v1_api master sports seed는 4종목(축구/풋살/러닝/수영)뿐**이다. 사용자가 랜딩에서 본 종목을 실제로 선택할 수 없는 과장/오해 소지가 있다.
- 이번 `signup_auth_onboarding` 도메인 리서치에서도 이 이슈가 별도로 재확인되지 않았다 — **여전히 미해결로 간주하고 본 QA 사이클에서 온보딩 종목 선택 화면 실측으로 재검증할 것**(해소 여부는 제품 결정 필요 사항이며, QA는 "현재 실제로 몇 개 종목이 선택 가능한지"만 사실 확인한다).

### 4) 최근 dev 반영 주요 신규 기능 (commit 로그 근거)

Web Push(VAPID) + 운영 실패 대시보드(#93) · realtime Socket.IO gateway(#92) · observability(GA4/구조화로깅)(#81) · 대회 리뷰 모더레이션/익명화/지연공개(#94) · 대회 대진표 일괄공개(#79)/득점자 등록(#76)/전용 공지·홍보팝업(#77) · 팀 self-leave(#75) · 관리자 수동 웹푸시 발송(#95) · 세션리뷰 보안/기능 확정 수정 18건(#96) + 9건(#98).

### 5) 이번 문서의 성격

기존 `docs/ops/v1-persona-flows.md`가 17개 페르소나와 플로우 경로를 정의한 **마스터 플랜**이라면, 이 문서는 그것을 10개 도메인 리서치 에이전트가 실제 코드(서비스/DTO/프론트 컴포넌트) 근거로 도출한 **happy / edge / error 레벨의 구체적 QA 시나리오**로 구체화한 실행 문서다. 총 **244개 시나리오**(happy 51 · edge 127 · error 66)를 담고 있다.

---

## 문서 구성 — 사용자 여정 순서

"회원가입부터"라는 요청에 따라 회원가입/온보딩을 최상단에 배치하고, 이후 자연스러운 사용자 여정 순서로 배열했다.

| # | 도메인 | 사용자 여정 단계 |
|---|--------|------|
| 1 | 회원가입·인증·온보딩 | 가입 |
| 2 | 개인 매치 | 첫 매칭 경험 |
| 3 | 팀 | 팀 결성/가입 |
| 4 | 팀매치·통합검색 | 팀 단위 매칭 |
| 5 | 대회 — 참가자 | 대회 참가 |
| 6 | 대회 — 운영자(admin) | 대회 운영 |
| 7 | 리뷰 | 경기 후 평가 |
| 8 | 채팅·알림·웹푸시 | 소통/재유입 |
| 9 | 설정·탈퇴·프로필 | 계정 관리/이탈 |
| 10 | 플랫폼 운영자(admin) | 전체 운영 |

---

## 1. 회원가입·인증·온보딩 — 관련 페르소나: P01, P02, P15

### Happy Path (3)

- [ ] **약관 전체 동의 → 이메일 가입 → 프로필 입력 → 온보딩 완료 골든패스** (P01)
  - 단계: `/landing`에서 '회원가입' → `/terms` 필수 약관 전체 동의 → `/signup`에서 닉네임/이메일 중복확인 → 비밀번호 입력 → profile 스텝(성별/이름/휴대폰/생년월일) → `/signup/complete` → 온보딩 위저드(종목 → 레벨 → 지역) → '홈으로 시작하기'.
  - 기대 결과: 각 단계 전환이 끊김 없이 이어지고, `POST /auth/register` 201의 `next.route`가 `/onboarding/sport`를 가리키며, `POST /onboarding/complete` 후 `onboardingStatus=completed`로 전이되어 `/home`으로 리다이렉트된다.

- [ ] **카카오 최초 로그인 — 약관 → 프로필 완성 2단계 플로우** (P02)
  - 단계: 카카오 로그인 클릭(CSRF state 저장) → `kauth.kakao.com` → `/callback/kakao` → `POST /auth/kakao` 응답 `next.route=/terms?mode=social` → 약관 동의(`POST /auth/social-terms`) → `/signup/social`에서 프로필 완성(`POST /auth/social-profile`) → `/onboarding/sport`.
  - 기대 결과: 서버가 강제하는 상태머신(`social_terms_required → social_profile_required → signup_done`)을 순서대로만 통과할 수 있고, 중간 단계 스킵 요청은 거부된다.

- [ ] **온보딩 이어하기(resume) — 도중 이탈 후 재로그인** (P15)
  - 단계: 온보딩 sport 단계에서 종목 선택만 하고 이탈(sessionStorage draft만 존재) → 재로그인 → `/onboarding/resume` → 저장된 진행 상태 요약 확인 → '저장된 선택 확인'.
  - 기대 결과: `GET /onboarding` 응답의 `currentStep`/`sportPreferences`가 정확히 반영되고, `sessionStorage` draft가 있으면 그 값이 우선 사용된다. '처음부터 다시 선택' 클릭 시 draft가 초기화된다.

### Edge Case (13)

- [ ] **프로필 필수값(성별/휴대폰/생년월일) 검증 우선순위** — 이름·휴대폰·생년월일·성별 중 하나라도 비면 `getSignupProfileIssue()`가 필드 우선순위(displayName→phone→birthDate→gender)대로 첫 미충족 필드 에러를 반환하고 CTA는 항상 disabled. 서버 `RequiredSignupProfileDto`도 동일 규칙(`phone: ^\d{11}$`, `IsCalendarBirthDate`, `gender: IsIn`)을 강제해 프론트 우회 시에도 400.
- [ ] **닉네임/이메일 중복확인 후 값 변경 시 재검증 요구** — 중복확인 통과 후 입력값을 재수정하면 검증 status가 idle로 리셋되어 CTA가 다시 disabled(`nicknameCheck.value`/`emailCheck.value`가 현재 입력값과 불일치 시 stale 처리).
- [ ] **동시성 — 이메일/닉네임 중복 가입 경쟁** — 중복확인 통과 직후 다른 세션이 동일 이메일로 먼저 가입을 완료하면, 늦게 제출한 쪽은 `POST /auth/register`가 409 `EMAIL_CONFLICT`로 거부되고 step이 `account`로 되돌아가며 `emailCheck=taken` 갱신. 세션 저장·온보딩 진행이 발생하면 안 됨.
- [ ] **약관 우회 진입 차단** — sessionStorage에 `signupTermsAccepted` 없이 `/signup` 직접 진입 시 `readSignupTermsAccepted()=false`로 즉시 `/terms`로 `router.replace`.
- [ ] **소셜 가입 미완료 상태 접근 제어(`SIGNUP_INCOMPLETE`)** — 약관만 동의, 프로필 미완성 상태로 `/onboarding`, `/matches` 등 다른 보호 API 호출 시 `isPendingSocialSignupRequestAllowed()`가 `/auth/me` 등 허용 목록 외 전부 403 `{code:'SIGNUP_INCOMPLETE', details:{next:{route:'/signup/social'}}}`로 차단.
- [ ] **만료된 소셜 가입 세션(24h TTL) 재시작** — `social_terms_required`/`social_profile_required` 상태로 24시간 이상 방치된 계정은 재로그인 시 `isExpiredSocialSignup()`이 감지해 기존 row를 delete하고 새로 가입 재시작. 반면 열려있던 `/terms` 화면에서 뒤늦게 제출하면 401 `SOCIAL_SIGNUP_EXPIRED`(자동 재시도 없음, 안내만).
- [ ] **온보딩 이어하기 — 다른 브라우저/기기 재시작** — sessionStorage draft가 없는 새 기기에서는 서버 `GET /onboarding` 응답(sports/regions)으로만 초기값이 채워져야 하며 두 기기 간 유실이 없어야 함.
- [ ] **온보딩 completion 게이트 — 종목 없이 완료 시도** — confirm 단계 CTA는 `emptySports`면 disabled. API 직접 호출 시 `OnboardingService.complete()`가 `blockingMissing(['sports'])`로 400 `VALIDATION_FAILED`.
- [ ] **온보딩 '나중에 설정하기'(defer) 후 재진입** — 레벨 미입력 상태로 defer 시 `onboardingStatus='deferred'`, `missing`에 `levels` 남고 `limited:true`. 종목 0개 상태에서도 defer가 성공하는지 별도 검증 필요(오픈 포인트).
- [ ] **위치 권한 거부 후 지역 직접 선택** — geolocation 거부 시 `locationStatus='denied'` 주황 안내, `draft.currentLocation` 미설정. 수동 선택 지역만으로 `POST /onboarding/preferences` 정상 저장.
- [ ] **체크-이메일/체크-닉네임 rate limit** — 중복확인 버튼 60초당 30회 초과 클릭 시 `@Throttle limit=30/60s`로 31번째부터 429. 버튼이 무한 로딩 상태로 멈추지 않아야 함.
- [ ] **약관 상세보기 다이얼로그 접근성** — `LegalDocumentDialog`가 ESC/backdrop 클릭으로 닫히고 내부 콘텐츠 클릭 시엔 유지(`stopPropagation`). `role='dialog' aria-modal='true'`.
- [ ] **회원가입 폼 이중 제출 방지** — '가입하고 계속' 더블클릭 시 `POST /auth/register`가 정확히 1회만 발생하는지, 2회 발생 시 두 번째가 409 `EMAIL_CONFLICT`로 안전 실패해 계정이 1개만 생성되는지 실측 필요.
- [ ] **🔴 11종목 vs 4종목 표시 불일치 재확인** — 온보딩 종목 선택 화면에서 실제로 선택 가능한 종목 수를 실측해 랜딩 페이지 광고 종목 수(11개)와 일치하는지 확인. 오픈 디시전이므로 불일치가 재확인되면 제품팀에 즉시 에스컬레이션.

### Error Case (6)

- [ ] **이메일 로그인 — 잘못된 비밀번호** — `POST /auth/login` 401 `UNAUTHENTICATED`, role=alert 캡션 노출, 입력값 유지. 올바른 비밀번호로 재시도 시 정상 로그인.
- [ ] **휴대폰 번호 중복** — 기존 계정 보유 번호로 가입 시 409 `PHONE_CONFLICT`, step은 `profile`에 유지(`account`로 되돌아가지 않는지 확인), 계정 미생성.
- [ ] **카카오 계정에 이메일이 없는 경우 — 죽은 코드 후보** — 실측: `kakaoLogin()`은 `email:null`이어도 정상 생성하며 `MISSING_EMAIL` throw 경로가 백엔드에 존재하지 않는다. 프론트 `kakao-callback-client.tsx`의 `MISSING_EMAIL` 분기와 `/auth/missing-email` 화면이 현재 트리거 불가능한 죽은 코드인지 재확인 — 제품 판단 필요(이메일 없는 가입 허용이 의도라면 프론트 분기 제거, 강제라면 백엔드에 throw 추가).
- [ ] **카카오 인증 실패/거부 — provider-denied 라우팅 미연결** — 사용자가 카카오 인증에서 거부 선택 시 일반 에러 문구만 노출되고 `auth.view-model.ts`에 정의된 `/auth/provider-denied` 전용 화면으로는 연결되지 않음 — 실제 호출 경로가 있는지 확인, UX 보강 여부 팀 판단.
- [ ] **카카오 OAuth CSRF state 검증** — state가 없거나 불일치하는 콜백 접근 시 코드 교환 시도 없이 '로그인 요청이 유효하지 않아요' 에러, GA `login_failed(reason:invalid_state)` 트래킹.
- [ ] **세션 만료 후 보호 페이지 재접근** — `GET /auth/me` 401/403 시 `clearStoredV1Session()` 후 `router.replace(getLoginPathForRedirect(...))`, 로그인 URL에 `?redirect=` 보존(단 `sanitizeRedirectPath` 통과분만), 로그인 성공 후 원래 페이지로 복귀.

---

## 2. 개인 매치 — 관련 페르소나: P03, P04

### Happy Path (7)

- [ ] **매치 목록 조회 및 필터 → 상세 진입** — 종목 필터 칩 선택 후 카드 클릭, `GET /matches?sportId=` 200, 상세 `GET /matches/:matchId` 200으로 title/place/startsAt/capacity/host 정확 렌더.
- [ ] **매치 참가 신청** — recruiting 매치에서 '참가 신청' → `POST /matches/:matchId/applications`, 성공 시 CTA '신청 취소'로 전환 + 상태 뱃지 '승인 대기'(주황). 재신청 시 기존 row update.
- [ ] **참가 신청 취소** — requested 신청을 본인이 취소, `POST /match-applications/:applicationId/withdraw`로 `requested→withdrawn` 전이, 재신청 가능 상태로 복귀.
- [ ] **본인 신청 목록 조회** — `/my/matches/joined`에서 참가/승인 매치가 실제 상태와 일치하는 라벨로 노출.
- [ ] **매치 생성 위저드 완주** — sport→place-time→confirm 3단계 후 `POST /matches`로 `v1Match(recruiting)` + host `v1MatchParticipant`가 트랜잭션 생성, `/matches/new/complete`로 이동, localStorage draft/selectionKey 정리.
- [ ] **매치 신청자 승인** — 호스트가 requested 신청자를 승인, `POST /match-applications/:applicationId/approve`로 `v1MatchParticipant` upsert(role=participant, status=active), 신청자에게 `match_application_approved` 알림.
- [ ] **매치 취소(호스트)** — recruiting 매치를 사유와 함께 취소, 대기 신청은 `cancelled_by_host`, 활성 참가자는 `cancelled`로 일괄 갱신 + `match_cancelled` 알림(호스트 제외 전원).

### Edge Case (9)

- [ ] **참가 신청 중복 제출 방지** — `Button` 컴포넌트 `disabled={loading||disabled}`로 연타 시 `POST .../applications`가 정확히 1회만 발생.
- [ ] **마감 임박 매치 신청 경계값** — `deadlineAt<now`, `startAt` 미래인 매치는 프론트 CTA가 '신청 불가' 비활성화, 서버는 `getEligibilityReason()`이 `DEADLINE_PASSED`로 409 `STATE_CONFLICT`.
- [ ] **게스트(비로그인) 매치 열람** — `OptionalV1AuthGuard`로 200 조회는 되지만 `getViewer()`가 `state='guest'`, `disabledReason='LOGIN_REQUIRED'`로 신청 API 호출 자체가 발생하지 않음.
- [ ] **매치 생성 위저드 — 종목 선택 영속** — `localStorage`(`teameet:v1:match-selection`)에 sportId/regionId가 저장되어 새로고침 후에도 유지(과거 회귀 93873e97 재발 방지 확인).
- [ ] **매치 생성 검증 — 날짜 경계값** — `deadlineAt >= startsAt` 시 422(`field=deadlineAt`).
- [ ] **매치 생성 검증 — 정원 경계값** — `capacity<2` 또는 `>100` 422(class-validator `@Min(2)@Max(100)`). UI 스테퍼는 2~30만 노출.
- [ ] **정원 초과 동시 승인 레이스** — 정원 1자리 남은 상태에서 신청 2건을 동시 승인 시 `SELECT...FOR UPDATE` 락으로 한쪽만 성공, 나머지는 409 `STATE_CONFLICT(FULL)`.
- [ ] **매치 신청자 승인/거절 버튼 잠금** — `actionPending` 전역 상태로 처리 중엔 다른 행 버튼도 함께 disabled.
- [ ] **매치 수정 — 낙관적 동시성(version)** — 두 탭 동시 수정 시 나중 저장 탭은 `updatedAt` 불일치로 409 `STATE_CONFLICT(VERSION_CONFLICT)`, 먼저 저장된 변경이 덮어써지지 않음.

### Error Case (8)

- [ ] **⚠️ 마감/취소/완료 매치 뱃지 정합성 회귀 후보** — `toDetailMode()`가 신청 이력 없는 사용자에게도 closed/cancelled/completed/expired/full 상태를 '승인 완료'(초록)로 잘못 매핑하는 것으로 보임(`matches-client.tsx` line ~401-406). 신청 이력 없는 사용자에겐 중립 상태여야 함 — 회귀 재검증 대상.
- [ ] **참가 신청 취소 권한 경계** — approved 상태 신청에 withdraw 호출 시 409 `STATE_CONFLICT('Only requested applications can be withdrawn')`.
- [ ] **존재하지 않는 매치 상세 접근** — 삭제/미존재 matchId는 404 `NOT_FOUND_OR_ARCHIVED`, 크래시 없이 에러 UI.
- [ ] **타인 매치의 신청자 관리 접근 차단** — 비호스트가 `/matches/[id]/applications` 접근 시 프론트는 상세로 즉시 리다이렉트, 백엔드는 403 `PERMISSION_DENIED`.
- [ ] **매치 수정 — 정원을 참가자 수 미만으로 축소** — `capacity < participantCount` 시 409 `STATE_CONFLICT`.
- [ ] **매치 취소 재시도(멱등성 경계)** — 이미 cancelled인 매치 재취소 시 409 `ConflictException(ALREADY_PROCESSED)`, 중복 알림/로그 없음.
- [ ] **네트워크 실패 시 사용자 피드백** — 오프라인 상태에서 승인 시도 시 `extractErrorMessage` 폴백 메시지가 `AlertBanner(error)`로 인라인 노출(window.alert 아님).
- [ ] **완료/취소된 매치 수정 잠금** — `completed`/`cancelled` 매치는 `edit()` 응답 `editable=false, lockedReason='terminal_status'`로 저장 버튼 disabled.

---

## 3. 팀 — 관련 페르소나: P05, P06, P07

### Happy Path (5)

- [ ] **팀 생성** — 종목/지역/이름/가입정책(승인 후 가입) 입력 후 `POST /teams` 201, 생성자 멤버십 `role='owner'`로 즉시 상세 진입.
- [ ] **가입 신청 승인** — owner가 대기 신청 승인, `POST /team-join-applications/:id/approve` 200, 멤버십 생성/복원(role=member, status=active), memberCount +1, `team_join_application_accepted` 알림.
- [ ] **팀장 위임(delegateOwner)** — owner가 manager에게 위임, 대상 role='owner'로, 기존 owner는 'manager'로 동시 전환, `V1Team.ownerUserId` 갱신, StatusChangeLog 3건 기록.
- [ ] **팀 가입 신청** — 비멤버가 approval_required 팀에 신청, `joinState='requested'`로 전환, owner/manager 전원에게 `team_join_application_received` 알림(fire-and-forget).
- [ ] **팀 초대 수락** — `/my/invitations`에서 수락 시 `POST /team-invitations/:id/accept`, 응답 `teamId`로 즉시 `/teams/:teamId` 리다이렉트, memberCount +1, 초대자에게 알림.

### Edge Case (14)

- [ ] **목표 인원 경계값(2/50)** — 1, 51은 400 `VALIDATION_FAILED`(`@Min(2)/@Max(50)`), 2와 50은 정상 생성.
- [ ] **마스터데이터 검증** — 비활성/미존재 sportId로 생성 시 400, `details.field='sportId'`.
- [ ] **가입 신청 승인 — 정원 초과** — memberGoalCount=memberCount 상태에서 승인 시 409 `TEAM_FULL`, 신청 상태 `requested` 유지.
- [ ] **권한 경계 — manager의 관리 범위** — manager가 다른 manager 강등/추방 시도 시 403 `PERMISSION_DENIED`("Managers can only change member roles"/"...remove members"), UI에서도 액션 버튼 자체 미노출.
- [ ] **manager 정원 상한(5명)** — 6번째 manager 승진 시도 시 409 `MANAGER_LIMIT_EXCEEDED`.
- [ ] **co-owner 동시 나가기(row lock)** — active owner 2명이 동시에 나가기 실행 시 `SELECT...FOR UPDATE`로 직렬화, 먼저 커밋된 쪽만 성공하고 나머지는 `otherActiveOwnerCount=0`으로 409 `LAST_OWNER_CANNOT_LEAVE` — 두 요청 모두 통과해 owner 0명이 되는 경우가 없어야 함.
- [ ] **단독 owner 나가기 차단** — 다른 active owner 없는 단독 owner는 '팀 나가기' 버튼 자체가 disabled + 툴팁, 우회 호출 시 409 `LAST_OWNER_CANNOT_LEAVE`.
- [ ] **팀 정보 수정 — 목표 인원 하향** — 현재 memberCount보다 낮은 memberGoalCount로 수정 시 400 `VALIDATION_FAILED`.
- [ ] **이메일 초대 — 중복 발송(멱등)** — 이미 pending인 사용자 재초대 시 200/201 `alreadyInvited=true`, 재발송 없음.
- [ ] **팀 가입 신청 — 중복 방지** — `joinState='requested'`인 상태에서 CTA는 `disabledReason='ALREADY_REQUESTED'`로 비활성, 강제 재호출 시 409 `ALREADY_REQUESTED`.
- [ ] **팀 가입 신청 — 마감 정책(closed)** — `joinPolicy='closed'` 팀은 CTA 자체가 비활성/미노출, API 직접 호출 시 409 `JOIN_CLOSED`.
- [ ] **팀 초대 — 멱등 재수락** — 이미 accepted인 초대 재수락 요청 시 200 `alreadyProcessed=true`, 상태/카운트/알림 추가 변화 없음.
- [ ] **멤버 목록 비공개(membersVisible=false)** — 비멤버 조회 시 403 `MEMBERS_VISIBILITY_DISABLED`, 반면 owner/manager/member 본인은 설정과 무관하게 항상 조회 가능.
- [ ] **로고 없는 팀 아바타(identicon)** — logoUrl 없으면 팀 id 해시 기반 identicon이 항상 동일하게 표시, 로고 업로드 후 "성공적으로 로드"된 시점에만 identicon 숨김(로딩/실패 시 폴백 유지).

### Error Case (5)

- [ ] **팀 생성 — 클라이언트 검증** — 팀 이름 미입력 시 API 호출 없이 즉시 차단, '팀 이름, 종목, 지역을 모두 입력해 주세요.'
- [ ] **팀 생성 — 계정 상태** — `accountStatus!=active`는 403 `PERMISSION_DENIED`("Account cannot mutate teams").
- [ ] **팀 정보 수정 — 낙관적 동시성** — 오래된 version으로 저장 시 409 `VERSION_CONFLICT`, 사용자 변경 저장 안 됨.
- [ ] **이메일 초대 — 대상 없음** — 미가입 이메일 초대 시 404 `USER_NOT_FOUND`, '가입된 이메일을 찾을 수 없어요.'
- [ ] **팀 상세 조회 — 존재하지 않는/보관된 팀** — 삭제/비활성 팀 접근 시 404 `NOT_FOUND_OR_ARCHIVED`, 공용 `ErrorState` 컴포넌트로 재시도/뒤로가기 도선 제공.

---

## 4. 팀매치·통합검색 — 관련 페르소나: P08, P09

### Happy Path (4)

- [ ] **팀매치 생성 8단계 위저드 완주** — team→sport→place-time→info→condition→confirm 순서로 `POST /team-matches` 201, localStorage draft/selection 키 삭제 후 상세로 이동.
- [ ] **상대팀 신청 승인** — `POST /team-match-applications/:appId/approve`로 팀매치 `matched` 전환, 다른 대기 신청은 트랜잭션 내 자동 `rejected`, 알림 발송.
- [ ] **통합검색** — 검색어 제출 시 `POST /search/recent` 기록 + `GET /matches·/team-matches·/teams` 병렬 조회 결과 통합 노출, '최근 검색' 칩에 즉시 반영.
- [ ] **빠른 조건 칩 선택** — '오늘 참여 가능' 등 클릭 시 즉시 해당 텍스트로 검색, `aria-pressed=true` + 선택 스타일.

### Edge Case (13)

- [ ] **위저드 step 간 상태 보존** — team/sport/region 선택이 `localStorage`(`team-match-selection`)에 저장되어 뒤로가기/재마운트에도 유지(ab925c8c 이전 리그레션 재발 방지).
- [ ] **과거 시각 방지 + 자동 보정** — 프론트는 `startsAt<=now`면 제출 차단, 재진입 시 `normalizeDraftDate`가 과거 날짜를 오늘+7일 18:00으로 자동 보정, 서버 우회 시 400.
- [ ] **⚠️ 종료시간이 시작시간보다 이른 경우 — 조용히 드롭** — `buildPayload`가 `endsAt`을 에러 없이 `null`로 치환(UX상 사용자에게 값이 버려졌다는 안내 없음 — 재검토 후보).
- [ ] **낙관적 잠금(version)** — 두 탭 동시 수정 시 나중 저장은 409 `VERSION_CONFLICT`.
- [ ] **상태 잠금(matched/expired)** — matched 또는 startAt 경과 팀매치는 `editable=false`(`lockedReason='terminal_or_matched_status'`/`'expired'`), 저장 시도해도 409.
- [ ] **취소/재개** — 재취소는 멱등하게 409 `ALREADY_PROCESSED`; startAt 경과한 closed 팀매치는 reopen 시 409("Expired team matches cannot be reopened").
- [ ] **마감(close) 시 대기 신청 → expired 처리** — `rejected`가 아닌 `expired`로 전환 + `reviewedByUserId` 기록, 신청팀 관리자 알림.
- [ ] **팀매치 신청 승인 — 경기 시작 임박/경과** — `startAt<now`인 팀매치의 대기 신청 승인 시도는 409("Team match is not recruiting").
- [ ] **통합검색 — 빈 검색어 제출** — X 클릭/공백 제출 시 `/search/new`로 replace, `/search/recent` 기록 안 됨.
- [ ] **통합검색 — 결과 없음(empty)** — 0건 검색어는 `viewState='empty'`로 로딩(stale)과 구분된 문구.
- [ ] **검색 기록 — 세션 식별자** — 비로그인+세션키 없는 첫 호출은 400 `SEARCH_SESSION_REQUIRED`, 세션키 있으면 정상 저장(80자 슬라이스).
- [ ] **검색 기록 — 동일 검색어 재검색/20건 초과** — 동일 query 재검색은 update만(row 증가 없음), 21번째 서로 다른 검색어는 가장 오래된 row 삭제로 최대 20건 유지.
- [ ] **팀매치 목록 필터 — 만료(expired) 상태** — `status=expired` 쿼리는 `status='recruiting'` 필터가 아닌 `startAt:{lt:now}`로 치환(closed+경과는 미포함).

### Error Case (5)

- [ ] **상대팀 신청 승인 — 권한 경계** — 호스트팀 일반 member는 403 `PERMISSION_DENIED`.
- [ ] **통합검색 — 세 도메인 중 일부만 실패(all-or-nothing)** — 매치/팀매치/팀 중 하나만 에러여도 전체 `viewState='error'`, 정상 응답도 함께 숨겨짐(부분 성공 미노출 UX 확인 대상).
- [ ] **상대팀 신청 — 중복/자기팀 신청 차단** — 호스트팀 자기 신청은 409("HOST_TEAM_CANNOT_APPLY"), 이미 approved인 재신청은 409("ALREADY_APPROVED").
- [ ] **팀매치 생성 — 필수 팀 없음** — 생성 가능(owner/manager) 팀이 없으면 team 단계 선택지가 없고, 우회 API 호출 시 403 `PERMISSION_DENIED`.
- [ ] **목록 조회 — 존재하지 않는 팀매치 상세** — 삭제/호스트팀 비활성 상태는 404 `NOT_FOUND_OR_ARCHIVED`.

---

## 5. 대회 — 참가자 — 관련 페르소나: P10, P11

### Happy Path (6)

- [ ] **대회 참가 신청 — 팀 선택부터 계좌이체 안내까지** — `POST /tournaments/:id/registrations`(draft) → `.../submit`(awaiting_payment) → `V1TournamentPayment(bank_transfer, ready)` 생성, 입금 안내 화면에 은행 정보 + 입금자명 + '2시간 이내 미입금 시 자동취소' 문구.
- [ ] **내 신청 현황 조회(`/my`)** — `status=confirmed` 표시, `confirmedAt`/`rosterLockedAt` 안내, '명단 등록' CTA가 정확한 로스터 라우트로 연결.
- [ ] **선수 명단 등록 — 정상 등록** — 실명/생년월일/휴대폰(성별 구분 대회는 성별까지) 등록된 팀원 추가, `V1TournamentPlayer` upsert(기본 `eligibilityStatus='needs_review'`), `minPlayers` 미만 시 `belowMinimum=true` 경고.
- [ ] **대진표 공개 직후 조회** — `bracketPublishedAt` 채워진 직후 조별 순위표 + 토너먼트 대진 모두 노출, 완료 경기는 스코어 + 득점자(playerId/playerName/minute).
- [ ] **참가 후기 작성** — completed 대회에서 confirmed 등록의 대표가 평점+코멘트+사진(최대 3장) 제출, `teamName`은 서버가 스냅샷 저장(자유 입력 아님).
- [ ] **게스트(비회원) 문의** — `OptionalV1AuthGuard`로 비로그인 상태에서도 `POST /inquiries` 201, `guestEmail/guestPhone`으로 저장 — 단 목록/상세 조회는 로그인 전용이라 게스트는 본인 문의를 앱에서 재조회 불가(안내 필요).

### Edge Case (15)

- [ ] **참가 신청 위저드 재진입 복원** — draft 상태는 `resolveRegistrationResumeAction()`이 2단계(동의)로 복원, confirmed/waitlisted/cancel_requested는 위저드 대신 `/my`로 리다이렉트.
- [ ] **정원 마감 동시성** — draft 보관 중 정원이 찬 경우 submit 재검증(`reservedCount>=teamCount`)으로 409 `TOURNAMENT_CAPACITY_FULL`.
- [ ] **접수마감 경과** — `registrationDeadlineAt` 경과 후 submit 시 409 `REGISTRATION_DEADLINE_PASSED`, draft 자체는 남아있음.
- [ ] **취소된 신청 재신청** — 과거 cancelled 신청이 있는 팀도 unique row를 `status:'draft'`로 재활성화(update 경로, P2002 없음).
- [ ] **신청 취소 요청 — draft 즉시 취소 vs 이후 단계 승인 대기** — draft는 self-service 즉시 `cancelled`, awaiting_payment 이후는 `cancel_requested`(어드민 승인 필요), 이미 cancelled에 재취소 시도는 409 `REGISTRATION_NOT_CANCELLABLE`.
- [ ] **취소 요청 철회** — `cancel_requested`에서 철회 시 `cancelPreviousStatus`로 정확 복원, 그 외 상태에서 철회 시도는 409.
- [ ] **선수 명단 등록 — 정원 초과 동시성** — 마지막 자리 동시 등록 시 트랜잭션 락으로 한쪽만 성공, 나머지 409 `ROSTER_FULL`.
- [ ] **선수 명단 등록 — 명단 마감 이후** — `rosterDeadlineAt` 경과 후 예외(`rosterDeadlineOverrideAt`) 없이는 409 `ROSTER_DEADLINE_PASSED`.
- [ ] **대진표 — 접수마감 전 일괄 비공개** — `bracketPublishedAt=null`이면 groups/fixtures가 빈 배열(다른 정보는 정상 노출 확인).
- [ ] **참가팀 명단 — 모집중(open) 비공개** — open 상태에선 참가팀 목록 비공개(팀명/로고 숨김), `confirmedCount`만 항상 노출.
- [ ] **참가비/상금 표시 — 콤마 구분 vs 자유값 파싱** — `splitPrizeSegments()`가 숫자-숫자 사이 콤마만 천단위 보존, `/`·비숫자 인접 콤마는 항목 구분자로 분리. `isPrizeAmountValue()`가 물품(자유값)은 합계에서 자동 제외.
- [ ] **최종결과 — 진행 상태별 노출** — in_progress는 챔피언 배너 없이 '진행 중' 안내만, open/closed는 결과 자체 비공개, `TournamentFlowNav`의 '시상·리뷰' 링크는 completed에서만 활성화.
- [ ] **참가 후기 — 중복 작성 및 미완료 대회 차단** — 기존 리뷰 있으면 400 `ALREADY_REVIEWED`, completed 아니면 400 `TOURNAMENT_NOT_COMPLETED`, 진입점 자체도 completed 이전 미노출.
- [ ] **어워드 — 로스터 외 인물 시상 차단** — `setAwards()`가 확정 등록 로스터 실명 집합 밖 `recipientName`은 400 `AWARD_RECIPIENT_NOT_IN_ROSTER`로 저장 차단(참가자 화면에는 항상 검증된 인물만 노출).
- [ ] **신청 취소 — 사유 미입력** — `reason`은 optional, 비워도 정상 취소(`cancelReason: dto.reason ?? null`).

### Error Case (5)

- [ ] **권한 없는 팀원(member)** — 팀 신청 대상 선택 시 카드가 disabled+'권한 필요' 배지, 우회 호출 시 403 `PERMISSION_DENIED`("팀장 또는 매니저만...").
- [ ] **roster 잠금/취소 상태에서 선수 추가 시도** — 잠긴 명단은 409 `ROSTER_LOCKED`, cancel_requested 등록은 409 `REGISTRATION_ROSTER_NOT_MUTABLE`.
- [ ] **팀 외부 인원 추가 시도** — active 멤버 아닌 userId는 400 `USER_NOT_TEAM_MEMBER`, 이미 등록된 인원 재추가는 409 `PLAYER_ALREADY_REGISTERED`.
- [ ] **참가 후기 — 비참가자 작성 차단** — confirmed 이력 없는 사용자는 403 `NOT_PARTICIPANT`, `participant-check`로 사전 확인해 버튼 자체 미노출.
- [ ] **대회 상세 — 존재하지 않는/비공개(draft/cancelled) 대회 접근** — `PUBLIC_STATUSES` 밖 상태는 404 `TOURNAMENT_NOT_FOUND`(민감한 draft 내용 비노출 확인 — 보안성 시나리오 겸함).

---

## 6. 대회 — 운영자(admin) — 관련 페르소나: P17

### Happy Path (4)

- [ ] **조 생성 및 팀 배정** — '조 만들기' → confirmed 팀 배정, 각 단계 토스트('조를 만들었어요.'/'팀을 배정했어요.') 확인.
- [ ] **경기 일정 자동 생성(라운드로빈)** — 확정 팀 3개↑ 조에서 '자동 생성' 시 nC2 조합 수만큼 경기 생성, round 라벨 순차 부여.
- [ ] **경기 결과 입력 + 순위 재계산** — 결과 저장 후 상태 `completed` 전환, '순위 재계산'으로 승점/골득실 반영.
- [ ] **공지 작성 및 발행** — 초안 저장 후 별도 '발행' 클릭, `publishedAt` 최초 채움.

### Edge Case (16)

- [ ] **결승/4강 승부차기 결과 필수** — phase='final' 동점인데 승부차기 미체크 시 저장 disabled(`knockoutNeedsWinner`), 우회 시 400 `KNOCKOUT_REQUIRES_WINNER`.
- [ ] **승부차기 점수 동점 방지** — 승부차기 점수 동일하면 저장 disabled(`isPenaltyDraw`), 우회 시 400 `PENALTY_SCORES_MUST_DIFFER`.
- [ ] **결과 삭제 후 재수정** — 결과 있는 경기 팀 변경 시도는 409 `FIXTURE_HAS_RESULT`, 결과 삭제(→scheduled 복귀) 후에는 팀 변경 가능.
- [ ] **조 삭제 방어(2단계)** — 팀 배정 상태면 409 `GROUP_HAS_TEAMS`, 배정 해제 후에도 경기 남아있으면 409 `GROUP_HAS_FIXTURES`, 모두 제거 후에만 삭제 성공.
- [ ] **대회 상태 전이 — closed→open 재오픈 후 open→in_progress 시도** — 재오픈은 허용되지만 `open→in_progress`는 허용 전이 아님(`TRANSITIONS.open=['closed','cancelled']`뿐) — 실제로는 `closed→in_progress` 직접 전이만 성공함을 확인.
- [ ] **대회 상태 전이 — 종착 상태(completed/cancelled)** — `allowedNextStatuses()`가 빈 배열, 상태 변경 버튼 자체 미렌더링, API 우회 시 409 `TOURNAMENT_STATUS_TRANSITION_INVALID`.
- [ ] **대회 상태 전이 — 동일 상태 재요청(멱등)** — 같은 status로 재호출해도 200 `alreadyInStatus:true`, 로그 중복 없음.
- [ ] **대회 상태 전이 — 취소 확인 게이트** — 확인 모달 취소 시 API 미호출, 확인 시에만 `cancelled`(비가역).
- [ ] **대회 기본정보 수정 — 선수 수 범위** — 최소>최대 입력 시 400 `TOURNAMENT_PLAYER_RANGE_INVALID`.
- [ ] **대회 기본정보 수정 — 일정 범위** — 종료가 시작보다 빠르면 프론트 즉시 차단 + 우회해도 400 `TOURNAMENT_SCHEDULE_RANGE_INVALID`.
- [ ] **대회 생성 — 참가 팀 수 경계값(2/64)** — 1, 65는 400, 2와 64는 정상 생성.
- [ ] **커버 이미지 업로드 교체/제거** — 교체 시 즉시 새 이미지 반영, 제거 시 placeholder 복귀 + 목록 카드 썸네일에도 반영.
- [ ] **상금 배분 — 합계 불일치 경고 + 원클릭 보정** — `poolMismatch=true`면 앰버 경고, '합계를 총상금으로' 클릭 시 총상금 값이 즉시 배분 합계로 갱신.
- [ ] **공지 — 중복 발행 멱등성** — 이미 발행된 공지 재발행 요청 시 200 `alreadyPublished:true`, `publishedAt` 최초 시각 유지.
- [ ] **홍보 팝업 — 5MB 초과 이미지 사전 차단** — API 호출 전에 '이미지는 5MB 이하로 첨부해 주세요.' 즉시 에러.
- [ ] **대진표 — 조 팀 배정 해제 시 순위 행도 함께 삭제** — 배정 해제 시 `groupTeams` + `standings` 양쪽에서 동시 제거(`deleteMany`).

### Error Case (9)

- [ ] **같은 팀끼리 경기 생성 방지** — 홈/어웨이 동일 팀 선택 시 프론트 즉시 차단(서버도 `FIXTURE_SAME_TEAM` 400으로 이중 방어).
- [ ] **미확정/미배정 신청 팀으로 경기 생성** — waitlist/pending registrationId 사용 시 400 `HOME_REGISTRATION_INVALID`.
- [ ] **양팀 미배정(TBD) 경기 결과 입력 방지** — 400 `FIXTURE_TEAMS_UNASSIGNED`.
- [ ] **존재하지 않는 대회/경기** — 임의 UUID로 대진 탭 접근 시 404 `TOURNAMENT_NOT_FOUND`, `AdminDataTable` 에러 상태(재시도 포함).
- [ ] **권한 경계 — status:write 없는 admin** — 상태 변경 UI 미노출(canWrite=false), mutation API를 support 등급 토큰으로 직접 호출 시 403 확인 필요.
- [ ] **대회 생성 — 참가 팀 수 필수** — 미입력 시 400 `TOURNAMENT_TEAM_COUNT_REQUIRED`.
- [ ] **커버 이미지 — 허용 포맷 외 파일** — gif/10MB 초과는 업로드 실패, 기존 이미지/placeholder 유지.
- [ ] **상금 배분 — 저장 시 변경사항 없음** — 모든 필드 공백 저장 시도는 프론트에서 조기 반환 + 에러 토스트.
- [ ] **공지 — 존재하지 않는 공지 수정/삭제** — 이미 삭제된 announcementId 재사용 시 404 `ANNOUNCEMENT_NOT_FOUND`.

---

## 7. 리뷰 — 관련 페르소나: P12

### Happy Path (3)

- [ ] **pending 리뷰 목록(`/my/reviews?tab=pending`)** — completed 매치 참가자에게 대기 리뷰 카드가 targetCount/remainingCount와 함께 노출, remainingCount=0 매치는 목록 제외.
- [ ] **리뷰 작성(별점+태그)** — `POST /reviews` 200, `alreadySubmitted=false`, 완료 화면 → `written` 탭에 즉시 반영, 명성 점수 재계산.
- [ ] **작성한 리뷰 목록 — 소스 삭제돼도 유지** — `written()`은 소스(match/team_match) `deletedAt`과 무관하게 조회, 소스 미존재 시 title이 `${targetName}에게 보낸 리뷰` fallback으로 화면 안 깨짐.

### Edge Case (11)

- [ ] **상호 제출 즉시 공개** — team↔team 양측 제출 시 72h 대기 없이 즉시 상대 집계에 반영 — 과거 회귀(a4635316, `reviewerTeamId` 비교 누락) 재발 여부 핵심 검증 포인트.
- [ ] **72시간 지연 공개 fallback** — 상대 미제출이어도 72h 경과 시 단독 제출 리뷰가 공개(71:59와 72:00 경계값 확인).
- [ ] **레거시(sportId 없음) 리뷰 — 종목별 집계 제외** — `receivedSummary`(bySport)는 미포함, `GET /reviews/received`(개별 목록)는 sportId=null만 별도 필터.
- [ ] **월별(period) 필터 형식 검증** — `2026-13`/`july` 등 형식 위반은 400(`@Matches ^\d{4}-(0[1-9]|1[0-2])$`), `2026-07`만 정상.
- [ ] **팀 리뷰 작성 권한 — manager+만 가능** — member는 403 `NOT_TEAM_REVIEW_MANAGER`로 화면 진입 차단.
- [ ] **양쪽 팀 모두 관리하는 경우 — 모호성 오류** — 겸직 시 409 `AMBIGUOUS_REVIEWER_TEAM`.
- [ ] **멱등성 — 중복 제출** — unique constraint(P2002)로 신규 row 없이 기존 리뷰를 `alreadySubmitted=true`로 반환, 내용 덮어쓰기 없음.
- [ ] **이미 제출한 대상 카드 잠금(locked)** — `alreadySubmitted=true, locked=true, lockReason='ALREADY_SUBMITTED'`인 대상은 `submitAll`이 재전송 대상에서 제외.
- [ ] **받은 리뷰 조회 rate limit** — `GET /reviews/received`/`.../summary` 60초 30회 초과 시 429(`@Throttle 30/60s`) — 개인+팀 집계 동시 호출이 한도에 함께 카운트되는지 정상 사용 패턴에서 확인 필요.
- [ ] **팀 관리 권한 없는 사용자의 받은 리뷰 화면** — `hasManagedTeam=false`면 팀 집계 쿼리 자체가 `enabled=false`로 미호출, 개인 집계만 표시.
- [ ] **받은 리뷰 커서 페이지네이션** — 20건 초과 시 `hasNext=true`+`nextCursor`, 중복 없이 이어서 조회, 마지막 페이지 `hasNext=false`.

### Error Case (7)

- [ ] **sourceType/targetType 불일치** — `match`+`targetType='team'` 등 불일치 조합은 400(`INVALID_MATCH_REVIEW_TARGET`/`INVALID_TEAM_MATCH_REVIEW_TARGET`).
- [ ] **rating/tagCodes 경계값** — rating 0/6은 400(@Min(1)/@Max(5)), 빈 tagCodes는 400(@ArrayMinSize(1)), 유효하지 않은 태그 코드는 400(@IsIn) — 9개 중복 포함 배열의 서버측 dedup 여부(`uniqueTagCodes()`) 확인 필요.
- [ ] **완료되지 않은 매치의 리뷰 소스 조회** — ongoing/미완료 매치는 409 `SOURCE_NOT_COMPLETED`, 리뷰 폼 미노출.
- [ ] **존재하지 않는 리소스(sourceId)** — 무작위 UUID는 404 `SOURCE_NOT_FOUND`, `EmptyState`/`ErrorState`로 처리.
- [ ] **비참가자 접근 차단** — 참가 이력 없는 사용자는 403 `NOT_SOURCE_PARTICIPANT`, 상대방 PII 비노출.
- [ ] **전체 제출 흐름 — 부분 실패** — 순차 제출 중 하나 실패 시 이후 진행 중단, '리뷰 전송에 실패했어요' 노출, 이미 성공한 첫 대상은 유지, 재시도 시 alreadySubmitted 스킵.
- [ ] **리뷰 제출 API rate limit** — 60초 110회 초과 시 429(`@Throttle 110/60s`), 100명 매치 전체 제출(최대 99건)은 한도 내 정상 완료돼야 함.

---

## 8. 채팅·알림·웹푸시 — 관련 페르소나: P13

> 🆕 **미병합 신규 기능**: "홈 상단 알림 재유도 배너(pushNudge)"는 아직 main과의 합의 지점이 명확하지 않은 신규 UX로 별도 표시. 아래 시나리오가 해당.

### Happy Path (6)

- [ ] **온보딩 알림 권한 요청** — '알림 받기' 클릭 → `Notification.requestPermission()` granted → VAPID publicKey 조회 → `sw-push.js` register/ready → `pushManager.subscribe()` → `POST /notifications/push-subscribe`, 버튼 라벨 '알림 받기 완료'로 전환.
- [ ] **🆕 홈 상단 재유도 배너로 구독** — 온보딩에서 미응답/거부한 기존 유저가 로그인 후 홈에서 `showPushNudge` 조건 충족 시 배너 노출, '알림 받기' 클릭으로 구독 완료 및 `dismissPushNudge()` 자동 호출.
- [ ] **알림 목록 조회 및 이동** — `GET /notifications?limit=50` 오늘/어제 그룹, unread 클릭 시 read 처리 후 `notification.href`(정규화 + `?from=notifications`)로 이동.
- [ ] **알림 전체 읽음** — `POST /notifications/read-all` 성공 시 unreadCount=0, 2.2초 자동 소멸 토스트.
- [ ] **채팅방 목록 — 카테고리 필터** — '개인매치' 탭 선택 시 `roomType='match'` 방만 노출, 핀 고정방 별도 그룹.
- [ ] **채팅방 상세 — 메시지 전송** — 전송 성공 시 draft 초기화, 소켓(`chat:message`, `notification:new`) 실시간 브로드캐스트 + `chatEnabled=true` 수신자에게 웹푸시(본문 120자) fire-and-forget.

### Edge Case (13)

- [ ] **구독 등록 — register/ready 순서 회귀 재검증** — 콜드 스타트(서비스워커 미등록) 상태에서 `register()` 직후 반환값이 아닌 `navigator.serviceWorker.ready`를 기다린 뒤 구독해야 함 — 과거 발견된 버그의 재발 여부 확인 대상.
- [ ] **🆕 재유도 배너 — 세션 내 재노출 억제** — X로 닫으면 `sessionStorage.pushNudgeDismissed=true`, 같은 탭 새로고침해도 재노출 안 됨.
- [ ] **🆕 재유도 배너 — 로그인마다 1회 재노출** — 로그인 성공 시마다 `V1_PUSH_NUDGE_DISMISSED_KEY`가 sessionStorage에서 명시적으로 제거되어, 로그아웃→재로그인 시 배너가 다시 뜨는 것이 의도된 동작인지 확인.
- [ ] **🆕 재유도 배너 — 노출 조건(denied 제외)** — 브라우저 알림 권한이 이미 `denied`인 유저에게는 배너 자체가 렌더링되지 않음(재요청 강요 없음).
- [ ] **채팅방 고정(pin) — 처리 중 재클릭** — `updateMe.isPending`이 해당 행에만 적용되어 다른 행과 독립적으로 pending 표시.
- [ ] **채팅방 상세 — 읽음 커서 자동 갱신** — `lastMessageId` 변경 시 자동 `PATCH .../me{lastReadMessageId}`, 처리 중 중복 호출 skip.
- [ ] **웹 푸시 구독 — 허용 도메인 우회 방지(suffix 매칭)** — `fcm.googleapis.com.attacker.example` 같은 접미어 포함 위장 도메인은 정확한 host suffix 매칭으로 거부.
- [ ] **웹 푸시 구독 — endpoint 소유권 충돌** — 다른 계정에 이미 등록된 endpoint 재구독 시 409 `PUSH_ENDPOINT_ALREADY_REGISTERED`, 같은 계정 재구독은 idempotent update.
- [ ] **알림 설정 — 채팅 알림 OFF + 웹 푸시 연동** — `chatEnabled=false` 유저는 웹 푸시 미발송이지만 소켓 실시간 알림은 선호도 무관하게 항상 수신.
- [ ] **실시간 소켓 — 정지/차단 계정 강제 종료** — 관리자가 정지 처리 시 `forceDisconnectUser()`로 모든 탭/기기 소켓 강제 종료, 재연결 시도해도 즉시 재차단.
- [ ] **웹 푸시 발송 — 포커스 탭 중복 방지** — 이미 열려 focused된 채팅방 탭에는 OS 푸시 알림 생략(`self.clients.matchAll` 검사).
- [ ] **웹 푸시 — VAPID 미설정 환경 graceful disable** — publicKey null이면 subscribe()가 조기 return, 에러 토스트 없이 조용히 무동작.
- [ ] **웹 푸시 발송 — 만료 구독 자동 정리** — 410/404 응답 시 해당 구독 row 자동 삭제, 그 외 상태코드는 `V1WebPushFailureLog` 기록(REST 응답은 fire-and-forget으로 200 유지).

### Error Case (8)

- [ ] **알림 href 안전성 — 오픈 리다이렉트 방지** — 외부 절대 URL/프로토콜-상대 경로는 `safeNotificationHref()`가 차단, 안전 기본 경로로 폴백.
- [ ] **알림 조회 실패** — API 5xx 시 에러 상태+재시도 버튼, 로딩/에러 중 EmptyState 오노출 없음.
- [ ] **채팅 메시지 전송 — 유효성(2000자 초과)** — 400 validation error, `send.isError=true`로 실패 표시, 메시지 미저장.
- [ ] **채팅 읽음 커서 — 잘못된 메시지 참조** — 다른 방의 메시지 ID로 커서 갱신 시도 시 400(`lastReadMessageId must reference a visible message...`).
- [ ] **채팅방 상세 조회 실패** — 참여 자격 없거나 미존재 roomId 접근 시 에러 상태 + 재시도(room+messages 동시 refetch).
- [ ] **웹 푸시 구독 등록 — SSRF 방지** — 내부망/클라우드 메타데이터 주소(`169.254.169.254`) endpoint는 allowlist 검증 실패로 400.
- [ ] **실시간 소켓 인증 — 미인증 연결** — 인증 정보 없는 handshake는 `resolveV1RequestIdentity()` null 반환 시 즉시 disconnect.
- [ ] **웹 푸시 알림 클릭 — 오픈 리다이렉트 방지** — `//evil.example` 등 프로토콜-상대 url은 `/`로 강제 폴백, 외부 origin으로 안 열림.

---

## 9. 설정·탈퇴·프로필 — 관련 페르소나: P14

### Happy Path (7)

- [ ] **설정 홈 — 로그인 방식별 정확한 표시** — 카카오 로그인 계정은 이메일/비밀번호 항목이 '카카오 계정 이메일 미제공'/'카카오 계정으로 로그인 중'으로 정확히 표시.
- [ ] **알림 설정 — 개별 토글 즉시 반영** — 특정 카테고리만 PATCH되어 새로고침 후에도 해당 항목만 변경 유지.
- [ ] **위치 — 현재 위치로 지역 찾기 → 저장** — geolocation 성공 시 `resolve-location`으로 자동 매칭, '활동 지역 저장' 후 프로필/설정/홈 쿼리 invalidate.
- [ ] **운동 정보 — 종목·난이도·활동지역1/2 저장** — `PATCH /me/preferences` 후 `/my` 리다이렉트, index 0이 각각 primary sport/region.
- [ ] **프로필 수정 — 전체 필드 변경** — 이름/닉네임/이메일/휴대폰/생년월일/사진 모두 변경 저장, `v1StatusChangeLog`에 변경 필드 감사 기록.
- [ ] **회원 탈퇴 정상 플로우** — 사유 입력(선택) → 확인 모달 → `POST /me/withdrawal-request` 성공, `accountStatus→withdrawal_pending`, `/login` 리다이렉트.
- [ ] **약관/정책 페이지** — API 호출 없이 정적 콘텐츠 즉시 렌더.

### Edge Case (13)

- [ ] **알림 설정 — 신규 사용자 기본값** — row 없는 신규 계정은 마케팅만 OFF, 나머지 5개 ON으로 최초 노출(upsert create 분기).
- [ ] **알림 설정 — 연속 클릭 시 최종 상태 정합성** — 300ms 이내 3연타(OFF→ON→OFF)도 `disabled={update.isPending}` 직렬화로 마지막 클릭 결과와 일치.
- [ ] **위치 — 권한 거부 후 수동 선택 경로** — `denied` 시 빨간 안내 카드, 지역 미선택 상태에선 저장 버튼 disabled 유지.
- [ ] **위치 — 지원 지역 밖 좌표(unmatched)** — region null 응답 시 안내 후 수동 select로 저장 가능.
- [ ] **운동 정보 — 난이도 미선택 시 저장 차단** — `missingLevels=true`면 submit 즉시 가로채기 + 안내.
- [ ] **운동 정보 — 활동지역 1/2 동일 상세지역 선택 차단** — 상호 배제 disabled option(`unavailableRegionId`).
- [ ] **운동 정보 — 종목 전부 해제 후 저장** — `sports:[]`도 400 아님, `deleteMany`만 수행해 정상 200.
- [ ] **프로필 수정 — 닉네임 변경 후 중복확인 미실행 시 저장 차단** — `nicknameVerified=false`면 `isBlocked=true`.
- [ ] **프로필 수정 — 카카오 전용 계정의 이메일 필드 잠금** — `canEditEmail=false`(hasPassword=false)면 이메일 input disabled+required 해제.
- [ ] **프로필 수정 — 2MB 초과 사진 즉시 차단** — 업로드 API 미호출, input value 리셋.
- [ ] **회원 탈퇴 — 확인 모달 취소** — `confirm()` false면 mutate 미호출, accountStatus 유지.
- [ ] **탈퇴 요청 상태(withdrawal_pending) — 조회는 되지만 변경은 일관되게 차단** — GET 계열(profile/settings)은 정상 200이나 update 계열(updateMe/updateSettings/updateMyRegions/updateMyPreferences)은 모두 403 `PERMISSION_DENIED`로 예외 없이 동일하게 실패해야 함(부분적으로만 막히는 화면이 없어야 함).
- [ ] **탈퇴 완료(deleted) 사용자의 공개 프로필 마스킹** — 비회원도 조회 가능하되 `displayName='탈퇴한 사용자'`, nickname/profileImageUrl null, reputation/activitySummary 빈 값.

### Error Case (6)

- [ ] **알림 설정 저장 실패** — 오프라인 시 즉시 '저장하지 못했어요' 카드(3초 자동 소멸), 토글 값은 낙관적 업데이트 없이 서버 상태로 원복.
- [ ] **위치 — level 2 아니거나 비활성인 regionId 직접 호출** — 400 `VALIDATION_FAILED(field=regionId)`.
- [ ] **프로필 수정 — 닉네임 충돌(409) 필드 에러 매핑** — 중복확인 통과 후 다른 사용자가 선점 시 저장 시점 409 `NICKNAME_CONFLICT`, nickname 필드 에러로 표시(라우팅 안 됨).
- [ ] **프로필 수정 — 휴대폰 10자리 입력** — 클라이언트 사전 검증으로 저장 차단(서버 `^\d{11}$`와 일치).
- [ ] **프로필 수정 — 존재하지 않는 날짜(2월 30일)** — 클라이언트 `isValidBirthDateDigits`에서 차단, 우회 시 서버 `isValidBirthDate()` 400.
- [ ] **회원 탈퇴 — 이미 withdrawal_pending 상태 재요청** — `assertMutableAccount` 403 `PERMISSION_DENIED`, `/login` 리다이렉트 없이 에러 카드만.

---

## 10. 플랫폼 운영자(admin) — 관련 페르소나: P16

> ⚠️ 이 섹션 실행 전 문서 상단 "main에만 있는 4 commit(PR #99/#100 — 관리자 컨텐츠/멤버 삭제 안전성)"의 dev 반영 여부를 재확인할 것.

### Happy Path (6)

- [ ] **운영자 추가** — owner가 회원 검색 → role 선택(support/ops) → 사유 입력 → `POST /admin/admins` 200, `V1AdminActionLog(admin.grant)` 기록.
- [ ] **문의 답변 작성 → 상태 자동 전환** — 답변 등록 시 `status→answered`, `closedAt=null`, 상태 뱃지 즉시 갱신.
- [ ] **사이드바 미확인 문의 뱃지** — received/reviewing 문의 수가 사이드바에 실시간(최대 30초 폴링) 반영, 0건이 되면 뱃지 자동 소멸.
- [ ] **신규 공지 작성 및 즉시 발행** — `status='published'`+`publishedAt=now` 저장, 목록 최상단 노출, 공개 API에도 동시 반영.
- [ ] **회원 상태 변경(정지) — 사유와 함께** — `POST /admin/users/:userId/status` 200, `V1AdminActionLog`+status-change-log 기록, `/admin/audit`에서 조회 가능.
- [ ] **감사 로그 필터 조회** — actorUserId/adminUserId/날짜 범위로 필터링된 결과만 커서 페이지네이션, 이전 액션들의 `beforeJson/afterJson` 스냅샷 확인.

### Edge Case (10)

- [ ] **마지막 owner 보호** — 활성 owner 1명뿐일 때 회수/강등 시도는 409 `LAST_OWNER`, '마지막 최고운영자는 변경할 수 없어요.' 토스트.
- [ ] **본인 권한 자가수정 차단(SELF_MODIFICATION)** — 자기 자신 행에는 액션 버튼 자체 미노출, API 우회해도 409 `SELF_MODIFICATION`.
- [ ] **회수된 운영자 재부여 — 레코드 재활용** — revoked 상태 대상 재부여 시 새 row가 아닌 기존 row update(status=active, revokedAt=null).
- [ ] **답변 수정 시 "(수정됨)" 표시 — Prisma 밀리초 오차 가드** — `wasReplyEdited()`가 1000ms 초과 시에만 true 판정(갓 작성된 답변엔 오표시 없어야 함).
- [ ] **공지 — 실시간 미리보기 iframe 동기화** — payload 변경마다 postMessage, iframe 로딩 중이면 ready 핸드셰이크 후 재전송해 레이스 컨디션 없이 최신 반영.
- [ ] **공지 — 초안(draft) 저장 시 공개 API 비노출** — 관리자 목록엔 보이지만 공개 서비스(`status:'published'` 하드코딩)에는 절대 미노출, detail 직접 조회 시 404.
- [ ] **공지 — 발행 상태 전환 시 publishedAt 보존** — 재발행해도 `existing.publishedAt ?? now`로 최초 발행 시각 유지, draft↔published 반복해도 목록 정렬 안 흔들림.
- [ ] **회원 관리 — 운영자 계정 상태는 owner만 변경 가능** — ops 권한이 다른 활성 admin 회원 상태 변경/삭제 시도 시 403 `PERMISSION_DENIED`.
- [ ] **문의 목록 — 검색+카테고리+상태 필터 조합** — 필터 변경 시 커서 초기화, '더 보기' 시 동일 필터 유지한 채 다음 페이지 조회.
- [ ] **게스트(비회원) 문의 상세 표시** — `isGuest=true`는 요청자 '비회원' 고정 표시, `guestEmail·guestPhone` 조합 표시(둘 다 없으면 '-').

### Error Case (7)

- [ ] **owner 전용 페이지 접근 거부** — support/ops 계정이 `/admin/admins` 접근 시 AdminEmpty('최고운영자 전용'), API 우회 시 403 `PERMISSION_DENIED`.
- [ ] **support 역할 쓰기 차단(getMutationAdmin)** — 문의 답변/상태변경 UI 전부 disabled, API 우회 시 403('Support admins cannot mutate status').
- [ ] **이미 활성인 admin에게 재부여 시도** — 409 `ConflictException(ALREADY_ADMIN)`.
- [ ] **답변 수정 — 다른 문의에 속한 replyId 사용** — 404 `NOT_FOUND('Reply was not found')`.
- [ ] **공지 — 제목/본문 미입력** — `isRichContentEmpty` 체크로 API 호출 전에 차단.
- [ ] **⚠️ 회원 상태 변경 — 사유 공백 검증 공백** — `ChangeUserStatusDto`에 `@IsNotEmpty()`가 없어 빈 문자열/공백만으로도 서버 검증 통과 — UI 트림 체크로만 막혀 있는 감사 추적성 공백, 서버측 방어 보강 검토 필요.
- [ ] **존재하지 않는 리소스 조회(matches/teams/inquiries 공통)** — 세 엔드포인트 모두 404 `NOT_FOUND`로 일관, 프론트 AdminEmpty/에러 상태 폴백.

---

## 커버리지 요약

| # | 도메인 | Happy | Edge | Error | 합계 |
|---|--------|------:|-----:|------:|-----:|
| 1 | 회원가입·인증·온보딩 | 3 | 13 | 6 | 22 |
| 2 | 개인 매치 | 7 | 9 | 8 | 24 |
| 3 | 팀 | 5 | 14 | 5 | 24 |
| 4 | 팀매치·통합검색 | 4 | 13 | 5 | 22 |
| 5 | 대회 — 참가자 | 6 | 15 | 5 | 26 |
| 6 | 대회 — 운영자 | 4 | 16 | 9 | 29 |
| 7 | 리뷰 | 3 | 11 | 7 | 21 |
| 8 | 채팅·알림·웹푸시 | 6 | 13 | 8 | 27 |
| 9 | 설정·탈퇴·프로필 | 7 | 13 | 6 | 26 |
| 10 | 플랫폼 운영자 | 6 | 10 | 7 | 23 |
| | **총합** | **51** | **127** | **66** | **244** |

### 아직 라이브 검증 안 된(코드 근거뿐, 실측 미완) 영역

이 문서의 모든 시나리오는 서비스 코드/DTO/프론트 컴포넌트를 근거로 도출됐지만, 아래는 특히 **실제 화면·API 응답으로 재현·확인이 필요**한 항목이다.

- **회귀/불일치 후보 4건** — 반드시 최우선 실측:
  1. 매치 상세 뱃지 정합성 — 신청 이력 없는 사용자에게 '승인 완료'가 잘못 표시되는지 (§2 error)
  2. 팀매치 생성 — 종료시간이 시작시간보다 이르면 조용히 드롭되는 UX 공백 (§4 edge)
  3. 회원 상태 변경 사유(reason) 서버측 `@IsNotEmpty()` 부재로 인한 감사 추적성 공백 (§10 error)
  4. 카카오 `MISSING_EMAIL`/`provider-denied` 죽은 코드 경로 — 실제 트리거 가능 여부 (§1 error)
- **11종목 vs 4종목 오픈 디시전** — 온보딩 종목 선택 화면 스크린샷/API 응답으로 현재 선택 가능 종목 수를 실측하고 제품 결정 재확인.
- **main→dev 미반영 추정 4 commit(PR #99/#100)** — 관리자 컨텐츠/멤버 삭제 안전성, 마이페이지 세션 보존 로직이 실제 dev HEAD에 포함되어 있는지 git 로그로 먼저 확인 후 §9·§10 관련 시나리오 실행.
- **🆕 미병합 신규 기능(재유도 배너)** — main 대비 완전 신규 UX라 회귀 기준선이 없음. 4개 시나리오 모두 신규 검증 필요(§8).
- **rate limit 계열(리뷰 30/60s·110/60s, 알림 push-subscribe 10/60s, 중복확인 30/60s)** — 실제 부하 재현 없이 코드 스캔으로만 확인됨. 정상 사용 패턴(예: 100명 매치 전체 리뷰 제출)이 한도 내에서 문제없이 완료되는지 별도 부하 시나리오로 실측 권장.
- **팀 co-owner 동시 나가기, 매치/팀매치 정원 초과 동시 승인 레이스, 대회 선수 명단 정원 초과 동시성** — 모두 `SELECT...FOR UPDATE` 락 근거의 동시성 시나리오로, 실제 동시 요청 재현(k6/병렬 스크립트) 없이는 "이론상 안전"만 확인된 상태.
- **Web Push 서비스워커 콜드 스타트 회귀** — 과거 버그(register 직후 값 vs `serviceWorker.ready`)의 실제 재발 여부는 시크릿 창 실측이 필요.

---

**파일 경로**: `/private/tmp/claude-501/-Users-sungjun-Documents-projects-matchup-sports-platform/3ab9f315-c25f-43e9-9d92-b20b0a153315/scratchpad/teameet-v1-qa-master-plan.md`