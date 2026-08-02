# 휴대폰 본인인증을 가입 시점에서 액션 시점으로 이동 — 설계

- 작성일: 2026-08-02
- 대상 스택: v1 (`apps/v1_api` + `apps/v1_web`) — alpha.teameet.co.kr
- 브랜치: `feat/v1-action-time-phone-verification` (base: `origin/dev`)
- 선행 문서: `docs/superpowers/specs/2026-07-23-octomo-phone-verification-design.md`

## 1. 배경

현재 v1은 휴대폰 본인인증을 **회원가입 완료 조건**으로 강제한다. 이메일 가입은 공개 인증 플로우의
proof token 없이는 `register`가 거절되고, 카카오 가입은 소셜 프로필 완성 단계에서 `phoneVerifiedAt`이
없으면 거절된다. 그 결과 서비스를 둘러보기도 전에 본인인증이라는 벽을 만나고, 가입 자체를 포기하는
이탈이 생긴다.

정작 코드에는 이미 반대 방향의 의도가 적혀 있다 —
`apps/v1_api/src/tournaments/tournament-registrations.service.ts:208`:

> 조회(목록·상세)와 draft 생성은 그대로 열어 두고 **제출 시점에만** 막는다 — 유입을 막지 않고
> 실명성이 실제로 필요해지는 지점에서만 거른다.

이 설계는 그 의도를 시스템 전체로 확장한다.

## 2. 목표

> 유입은 막지 않는다. **남에게 영향이 가는 순간**에만 실명성을 요구한다.

- 인증 없이 가입하고 로그인할 수 있다.
- 가입 직후 자기 계정 범위의 일(프로필 수정, 사진 업로드, 관심 설정, 알림, 문의)은 전부 할 수 있다.
- 팀·대회·채팅·매치처럼 다른 사용자에게 영향이 가는 액션을 시도하는 **그 순간** 인증을 요구한다.

### 비목표

- 운영 스택(`apps/api` / `apps/web`)은 범위 밖이다.
- 인증 수단(옥토모 MO / SMS) 자체는 바꾸지 않는다.
- 기존 인증 완료 계정의 데이터는 건드리지 않는다.

## 3. 결정 사항

| # | 결정 | 근거 |
|---|---|---|
| D1 | 가입 시점 hard-block 2곳을 제거한다 | 목표 그 자체 |
| D2 | `V1AuthGuard`의 전역 쓰기 게이트는 **허용 목록(fail-closed) 구조를 유지**하고 예외만 넓힌다 | 차단 목록으로 뒤집으면 새 엔드포인트가 기본 통과가 되어, 목록 추가를 잊는 순간 조용히 인증 우회가 생긴다 |
| D3 | `phone`의 전역 unique를 **partial unique index**(`WHERE phone_verified_at IS NOT NULL`)로 바꾼다 | 미인증 번호도 보관하면서 "인증된 번호만 유일"을 DB가 강제. 미인증 계정이 남의 번호로 unique 슬롯을 선점하는 것을 막는다 |
| D4 | 가입 폼에서 번호 입력과 인증을 **모두 선택**으로 둔다 | 지금 인증하고 싶은 사용자의 경로를 없애지 않으면서, 건너뛰는 경로를 연다 |
| D5 | 기존 계정 데이터 마이그레이션은 하지 않는다 | 인증 완료 계정은 동작이 동일하고, 미인증 계정은 새 게이트에서 같은 판정을 받는다 |

### D3 사전 검증 (실측 완료, 2026-08-02)

D3은 CI의 마이그레이션 드리프트 게이트(`deploy.yml:160` "V1 migration replay + drift gate")와
충돌할 위험이 있어 채택 전에 폐기용 Postgres 16으로 실측했다.

| 검증 항목 | 결과 |
|---|---|
| origin/dev 마이그레이션 82개를 빈 DB에 재생 | 성공 |
| partial unique index 적용 후 `prisma migrate diff --exit-code` | **exit 0, "No difference detected"** — Prisma가 partial index를 표현할 수 없어 무시하므로 드리프트로 잡히지 않는다 |
| 미인증 동일 번호 2건 저장 | 허용 |
| 인증된 동일 번호 2건 저장 | 거부 (`v1_users_phone_verified_key` 위반) |
| 미인증 중복 2건이 둘 다 인증 시도 | 먼저 인증한 쪽만 성공, 나머지 거부 |

마지막 항목이 새 에러 경로를 만든다 — 아래 W6 참조.

## 4. 아키텍처

### 4.1 게이트의 단일 판정점

인증 강제 여부의 판정은 `apps/v1_api/src/verification/phone-verification-access.ts`의
`isPhoneVerificationEnforced()` 하나로 유지한다. 이 파일의 기존 주석이 지적하듯,
판정이 갈리면 "가입은 막는데 번호 변경은 통과" 같은 반쪽 강제가 생기고 그게 실제 우회 경로였다.

바뀌는 것은 판정이 아니라 **어떤 요청을 예외로 둘 것인가** 뿐이다.

### 4.2 미인증 계정이 할 수 있는 일

```
GET / HEAD / OPTIONS         → 전부 허용 (기존과 동일)

쓰기 중 허용 (예외 목록):
  기존: /verification  /auth  /admin  /terms/consents  /me/withdrawal-request
  추가: /me  /onboarding  /notifications  /notification-preferences
        /uploads  /inquiries  /search  /logs  /master

그 외 모든 쓰기               → 403 PHONE_VERIFICATION_REQUIRED
                                details.next.route = /my/phone-verify
```

`/uploads`와 `/inquiries`는 검토 끝에 허용으로 결정했다 — 프로필 사진은 자기 계정 범위이고,
문의를 막으면 "인증이 안 되는데요"라는 문의 자체를 보낼 수 없는 교착이 생긴다.
`/chat/rooms/:id/me`(읽음 표시)와 `/reviews`는 인증 요구 쪽에 둔다.

결과적으로 인증이 필요한 액션은 다음과 같다:

| 도메인 | 경로 |
|---|---|
| 팀 | `POST /teams`, `PATCH /teams/:id`, `/teams/:id/join-applications`, `/teams/:id/invitations`, `/team-invitations/:id/accept·decline`, `/team-join-applications/:id/*`, `/team-memberships/*`, `/teams/:id/leave` |
| 대회 | `/tournaments/:id/registrations` (생성·submit·players·cancel-request), `/tournaments/:id/reviews`, `/tournaments/campaigns/*` |
| 채팅 | `/chat/rooms/resolve`, `/chat/rooms/:id/messages`, `/chat/rooms/:id/leave`, `/chat/rooms/:id/me` |
| 매치 | `POST /matches`, `PATCH /matches/:id`, `/matches/:id/applications`, `/matches/:id/cancel`, `/match-applications/*` |
| 팀 매치 | `/team-matches` 전체 |
| 리뷰 | `POST /reviews` |

### 4.3 번호와 unique

```
V1User.phone  (String?, 전역 unique 제거)
V1User.phoneVerifiedAt  (DateTime?)

UNIQUE INDEX v1_users_phone_verified_key ON v1_users(phone)
  WHERE phone_verified_at IS NOT NULL
```

불변식: **인증된 번호는 계정 하나에만 존재한다.** 미인증 번호는 중복될 수 있고, 그것은
"아직 아무 의미도 부여되지 않은 사용자 입력값"으로만 취급한다.

Prisma는 partial index를 스키마 문법으로 표현할 수 없다. 따라서 `schema.prisma`에서
`@unique`를 제거하고, 인덱스는 raw SQL 마이그레이션으로 만든 뒤 **스키마 주석으로 존재를 명시**한다.
이 주석이 없으면 스키마만 읽는 사람은 제약의 존재를 알 수 없다.

`@unique` 제거의 부수 효과로 Prisma Client의 `findUnique({ where: { phone } })`가 사라진다 —
`findFirst`로 바꿔야 한다. 이는 의미상으로도 옳다. `phone`은 더 이상 전역 유일이 아니다.

### 4.4 가입 플로우

| 단계 | 이메일 가입 | 카카오 가입 |
|---|---|---|
| 번호 입력 | 선택 | 선택 |
| 인증 | 선택 | 선택 |
| 인증함 | `phone` + `phoneVerifiedAt` 저장 | 동일 |
| 번호만 입력하고 인증 안 함 | `phone`만 저장, `phoneVerifiedAt`은 null | 동일 |
| 둘 다 건너뜀 | `phone`도 null | 동일 |
| 결과 | `onboardingStatus = signup_done` | `signup_done` |

### 4.5 인증으로 유도하는 흐름

프론트에는 이미 필요한 배관이 전부 있다. 새로 만들 것이 없다.

```
액션 시도
  → 서버 403 PHONE_VERIFICATION_REQUIRED
  → api-client 가 notifyPhoneVerificationRequired() 발신
     (apps/v1_web/src/lib/phone-verification-required.ts)
  → 전역 모달 표시
     (apps/v1_web/src/components/auth/phone-verification/phone-verification-required-modal.tsx)
  → buildPhoneVerifyHref(현재 경로) 로 /my/phone-verify 이동
     (apps/v1_web/src/components/auth/phone-verification/phone-verify-route.ts)
  → 인증 완료 후 원래 화면으로 복귀
```

`apps/v1_web/src/app/tournaments/[id]/apply/tournament-apply-client.tsx:1467`이 이미
`authMe.data?.verification?.phoneVerified`를 읽어 이 패턴대로 동작한다. 다른 화면은 이것을 따른다.

## 5. 작업 항목

가입 게이트 제거만으로는 끝나지 않는다. 아래는 `phone` 사용처 전수 감사(2026-08-02)에서
확정된 항목이다. 감사는 `apps/v1_api/src`와 `apps/v1_web/src` 전체(테스트·시드 제외)를 대상으로 했다.

### 백엔드

| ID | 심각도 | 위치 | 내용 |
|---|---|---|---|
| W1 | Critical | `auth/account-recovery.service.ts:174` | `findFirst({ where: { phone, accountStatus } })`에 `phoneVerifiedAt: { not: null }` 추가. 지금은 phone이 전역 unique라 항상 한 계정이지만, D3 이후에는 여러 계정이 같은 미인증 번호를 가질 수 있어 정렬 미정의 상태로 아무 계정이나 반환한다. 공격자가 피해자 번호를 미인증으로 등록해두면 피해자가 자기 번호를 정상 인증해 복구를 시도해도 공격자 계정이 잡혀 **본인 계정 복구가 봉쇄**된다 |
| W2 | High | `profile/creator-profile.guard.ts:21` | `if (!user?.phone?.trim())` → `phoneVerifiedAt` 검사로 교체. 이 가드는 **팀 생성(`teams.controller.ts:43`) · 매치 생성(`matches.controller.ts:26`) · 팀매치 생성(`team-matches.controller.ts:36`)** 에 걸려 있다. 고치지 않으면 미인증 번호를 적는 것만으로 이번에 세우는 게이트가 뚫린다 |
| W3 | High | `tournaments/tournament-players.service.ts:194` | `memberPhone` 존재 검사 → 인증 여부 검사. 해당 쿼리는 이미 `phoneVerifiedAt: true`를 select 하고도 쓰지 않고 있다(179행) |
| W4 | Medium | `auth/auth.service.ts:89` | 가입 시 번호 중복 검사에 `phoneVerifiedAt: { not: null }` 추가 + `findUnique` → `findFirst` |
| W5 | Medium | `auth/auth.service.ts:602` | 소셜 프로필 완성 시 번호 중복 검사에 동일 적용 |
| W6 | Medium | `profile/profile.service.ts:146` | 프로필 수정 시 번호 중복 검사에 동일 적용. 아울러 인증 시점에 그 번호가 이미 다른 계정에서 인증된 경우 `PHONE_CONFLICT`("이미 다른 계정에서 인증된 번호예요")로 잡는 경로를 추가한다 |
| W7 | Medium | `teams/teams.service.ts:468`, `tournaments/tournament-players.service.ts:352` | 미인증 번호는 `null`로 내려보내고, 응답에 `phoneVerified: boolean`을 함께 실어 소비자가 "번호 없음"과 "미인증"을 구분할 수 있게 한다 |
| W11 | Medium | `inquiries/inquiries.controller.ts:20` | `POST /inquiries`에 `@Throttle({ default: { limit: 5, ttl: 60_000 } })` 추가. 현재 전용 제한이 없어 전역 기본값 1000/분만 적용되며, 미인증 계정에 열어주기 전에 필요하다. `/uploads`는 이미 20/분(이미지)·3/분(영상)이 걸려 있어 추가 조치가 없다 |
| W8 | — | `auth/auth.service.ts:101`, `auth/auth.service.ts:616` | 가입 hard-block 제거 (D1) |
| W9 | — | `verification/phone-verification-access.ts` | 허용 목록 확장 (D2) |
| W10 | — | `prisma/schema.prisma` + 새 마이그레이션 | partial unique index 전환 (D3) |

### 프론트엔드

| ID | 심각도 | 위치 | 내용 |
|---|---|---|---|
| F1 | High | `app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client.tsx:247·256·259·263` | `isRegisterableMember` / `memberMissingReason`가 번호 존재만 보고 "선수 등록 가능"이라 안내한다. W3과 같은 결함이며, UI가 먼저 가능이라 해놓고 서버가 거절하면 사용자는 이유를 알 수 없다. `V1TournamentPlayer` 모델에는 phone 컬럼이 없어(realName·birthDate·gender만 스냅샷) 항상 `V1User.phone`을 실시간으로 읽는다 |
| F2 | Medium | `app/admin/tournaments/[id]/tournament-detail-client.tsx:584` | 운영자 화면의 선수 번호 표시에 인증 여부 표기 추가 |
| F3 | Medium | `lib/creator-profile.ts:5` | W2에 맞춰 누락 필드 라벨을 "휴대폰 본인인증"으로 |
| F4 | — | `components/auth/signup-client.tsx:396` | `step === verify` 단계에 건너뛰기 경로 추가 (D4) |
| F5 | — | `components/auth/signup-profile-validation.ts:23` | 번호 필수 검증을 선택으로 완화 (D4) |
| F6 | — | `components/auth/social-signup-client.tsx:121` | 인증 미완료 시 제출 차단 해제 (D4) |

### 변경하지 않는 것

- `admin/admin.service.ts:316` (탈퇴 시 번호 파기), `common/logging/mask-sensitive.ts:23` (로그 마스킹),
  `auth/kakao-profile.ts` (프리필 정규화), `verification/phone-proof-token.ts` (토큰 페이로드)
  — 인증 상태를 전제하지 않아 영향이 없다.
- `guestPhone` 계열(비회원 문의) — `V1User.phone`과 별개 필드다.
- `components/auth/account-recovery-client.tsx` — proof token 기반이라 W1 수정만으로 충분하다.

## 6. 테스트

| 대상 | 내용 |
|---|---|
| 게이트 | `test/integration/phone-verification-write-gate.e2e-spec.ts` 확장 — 허용 경로 9개가 미인증으로 통과하고, 차단 도메인 6개가 403 `PHONE_VERIFICATION_REQUIRED`를 반환하는지 |
| unique 계약 | 미인증 중복 허용 / 인증 중복 거부 / 미인증 중복이 둘 다 인증 시도할 때 후발이 `PHONE_CONFLICT` |
| 가입 | 인증 없이 가입 성공 → 프로필 수정 성공 → 팀 생성 403 (전체 흐름 1건) |
| W1 | 같은 번호를 가진 미인증 계정이 있을 때 계정 복구가 **인증된 계정만** 반환하는지 |
| W2 | 미인증 번호만 가진 사용자가 팀·매치·팀매치 생성에서 거절되는지 |
| W3 | 미인증 번호를 가진 팀원이 대회 선수로 등록되지 않는지 |

테스트는 위 계약을 증명하는 가장 좁은 범위로 쓴다. 구현을 되읊는 테스트는 쓰지 않는다.

## 7. 배포와 검증

1. base는 `origin/dev` (로컬 커밋 미반영). 브랜치 `feat/v1-action-time-phone-verification`.
2. `.changeset/*.md` 동반 — 없으면 dev push CI가 실패하고 alpha 배포가 막힌다.
3. PR base는 `dev`, 제목·본문 한국어.
4. UI 변경이 있으므로 **스크린샷 갤러리(mobile 390 / tablet 768 / desktop 1440) 필수**.
5. Copilot 리뷰를 clean까지 반복.
6. dev 머지 = alpha 자동 실배포. 머지 전 검증을 실배포 게이트로 취급한다.
7. alpha에서 실검증: 인증 없이 가입 → 프로필 수정 → 팀 생성 시도(모달) → 인증 → 복귀 후 성공.

`dev → main` 승격은 사용자만 한다.

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| 미인증 계정 급증 → 스팸 유입 | 게이트가 남에게 도달하는 모든 액션을 막으므로 스팸 도달 경로가 없다. 허용한 두 경로 중 `/uploads`는 이미 `@Throttle` 20/분(이미지)·3/분(영상)이 걸려 있고, `/inquiries`는 W11에서 5/분을 추가한다 |
| partial index가 스키마에 보이지 않음 | 스키마 주석 + 마이그레이션 주석 + 이 문서에 명시 |
| 미인증 번호가 검증된 연락처처럼 보임 | W7·F1·F2에서 처리 |
| 감사 누락 | 감사는 `apps/v1_api/src`·`apps/v1_web/src`를 대상으로 했다. 구현 중 새로 발견되면 이 문서에 추가한다 |

## 9. 감사 범위와 한계

이 설계의 작업 항목은 `apps/v1_api/src`와 `apps/v1_web/src` 전체(테스트·시드 제외)를 대상으로 한
`phone` 사용처 전수 감사에서 도출했다. 운영 스택(`apps/api` / `apps/web`)과 `guestPhone` 계열
(비회원 문의)은 의도적으로 범위 밖에 두었다.

D3(partial unique index)은 폐기용 Postgres 16에 origin/dev 마이그레이션 82개를 재생해
실측 검증했다(§3 참조). 나머지 항목은 코드 정독에 근거하며, 구현 시 테스트로 확정한다.
