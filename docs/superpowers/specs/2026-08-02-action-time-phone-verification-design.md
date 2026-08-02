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

## 3. 핵심 결정 — 불변식으로 범위를 접는다

이 설계의 중심 결정은 하나다.

> **불변식 I**: 활성 계정에서 `phone`이 채워져 있으면 그 번호는 반드시 인증된 번호다.
> (`accountStatus != deleted` 이면 `phone != null` ⟹ `phoneVerifiedAt != null`)

미인증 사용자의 번호는 **아예 저장하지 않는다**. 인증을 마치는 순간에만 `phone`과
`phoneVerifiedAt`을 함께 쓴다.

이 불변식이 있으면 `phone`의 전역 `@unique` 제약을 그대로 둘 수 있고 — Postgres에서 NULL은 서로
충돌하지 않으므로 `@unique`가 사실상 "인증된 번호만 유일"을 뜻하게 된다 — 스키마도 마이그레이션도
바뀌지 않는다. 더 중요한 건, 코드베이스 곳곳에서 "번호가 있는가"로 실명성을 판정하는 기존 코드가
**전부 저절로 옳아진다**는 점이다.

### 검토했으나 채택하지 않은 대안

미인증 번호도 저장하고 partial unique index(`WHERE phone_verified_at IS NOT NULL`)로 제약을 거는
방식을 검토했다. 폐기용 Postgres 16으로 실측한 결과 **기술적으로는 성립한다** — origin/dev
마이그레이션 82개 재생 후 `prisma migrate diff --exit-code`가 exit 0("No difference detected")을
반환해 CI 드리프트 게이트를 통과했고, 미인증 중복 허용·인증 중복 거부도 확인했다.

채택하지 않은 이유는 비용이다. 이 방식은 `phone`이 전역 유일하다는 전제를 깨뜨리므로,
전제에 기대고 있던 코드를 전부 손봐야 한다 — 계정 복구 로직(잘못된 계정을 반환해 본인 복구가
봉쇄될 수 있음), 팀·매치·팀매치 생성 가드, 대회 선수 등록 자격 검사, 중복 검사 3곳, 번호 노출
2곳, 그리고 프론트 2곳. 얻는 것은 "미인증 사용자가 적어둔 번호를 나중에 프리필해주는" 편의
하나뿐이다. 그 편의는 인증 화면에서 번호를 한 번 더 입력하는 것으로 대체된다.

## 4. 결정 사항

| # | 결정 | 근거 |
|---|---|---|
| D1 | 가입 시점 hard-block 2곳을 제거한다 | 목표 그 자체 |
| D2 | `phone`은 **증명이 검증됐을 때만** 쓴다 (불변식 I) | §3 |
| D3 | `phone String? @unique`와 스키마·마이그레이션은 그대로 둔다 | 불변식 I 아래에서는 이미 "인증된 번호만 유일"을 뜻한다 |
| D4 | `V1AuthGuard`의 전역 쓰기 게이트는 **허용 목록(fail-closed) 구조를 유지**하고 예외만 넓힌다 | 차단 목록으로 뒤집으면 새 엔드포인트가 기본 통과가 되어, 목록 추가를 잊는 순간 조용히 인증 우회가 생긴다 |
| D5 | 가입 폼에서 번호 입력과 인증을 **모두 선택**으로 둔다 | 지금 인증하고 싶은 사용자의 경로를 없애지 않으면서, 건너뛰는 경로를 연다 |
| D6 | 기존 계정 데이터 마이그레이션은 하지 않는다 | 인증 완료 계정은 동작이 동일하고, 미인증 계정은 새 게이트에서 같은 판정을 받는다 |

## 5. 아키텍처

### 5.1 게이트의 단일 판정점

인증 강제 여부의 판정은 `apps/v1_api/src/verification/phone-verification-access.ts`의
`isPhoneVerificationEnforced()` 하나로 유지한다. 이 파일의 기존 주석이 지적하듯,
판정이 갈리면 "가입은 막는데 번호 변경은 통과" 같은 반쪽 강제가 생기고 그게 실제 우회 경로였다.

바뀌는 것은 판정이 아니라 **어떤 요청을 예외로 둘 것인가** 뿐이다.

### 5.2 미인증 계정이 할 수 있는 일

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

### 5.3 가입 플로우

| 단계 | 이메일 가입 | 카카오 가입 |
|---|---|---|
| 번호 입력 | 선택 | 선택 |
| 인증 | 선택 | 선택 |
| 인증함 | `phone` + `phoneVerifiedAt` 저장 | 동일 |
| 번호만 입력하고 인증 안 함 | **아무것도 저장하지 않음** (불변식 I) | 동일 |
| 둘 다 건너뜀 | `phone`은 null | 동일 |
| 결과 | `onboardingStatus = signup_done` | `signup_done` |

### 5.4 인증으로 유도하는 흐름

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

## 6. 작업 항목

### 백엔드

| ID | 위치 | 내용 |
|---|---|---|
| A1 | `auth/auth.service.ts:101`, `auth/auth.service.ts:119` | 가입 hard-block 제거(D1). 동시에 `phone`은 **proof token이 검증됐을 때만** 쓴다 — 현재는 `V1_PHONE_VERIFICATION_DISABLED=true` 비상 opt-out 시 증명 없이 `phone`이 저장되어 불변식 I를 깬다 |
| A2 | `auth/auth.service.ts:616`, `auth/auth.service.ts:632` | 소셜 프로필 완성의 hard-block 제거 + A1과 같은 규칙 적용 |
| A3 | `profile/profile.service.ts:196` | 번호 변경 시에도 증명이 없으면 `phone`을 쓰지 않는다. A1과 같은 이유(비상 opt-out 경로에서 불변식이 깨짐) |
| A4 | `verification/phone-verification-access.ts` | 허용 목록 확장(D4, §5.2) |
| A5 | `inquiries/inquiries.controller.ts:20` | `POST /inquiries`에 `@Throttle({ default: { limit: 5, ttl: 60_000 } })` 추가. 현재 전용 제한이 없어 전역 기본값 1000/분만 적용되며, 미인증 계정에 열어주기 전에 필요하다. `/uploads`는 이미 20/분(이미지)·3/분(영상)이 걸려 있어 추가 조치가 없다 |

### 프론트엔드

| ID | 위치 | 내용 |
|---|---|---|
| A6 | `components/auth/signup-client.tsx:396` | `step === verify` 단계에 건너뛰기 경로 추가(D5) |
| A7 | `components/auth/signup-profile-validation.ts:23` | 번호 필수 검증을 선택으로 완화(D5) |
| A8 | `components/auth/social-signup-client.tsx:121` | 인증 미완료 시 제출 차단 해제(D5) |

### 손대지 않는 것 — 불변식 I 덕분에 저절로 옳은 코드

아래는 모두 "번호가 있는가"로 실명성을 판정한다. 불변식 I 아래에서 그 판정은 "인증됐는가"와
같은 뜻이므로 **변경하지 않는다.** 대신 A9 테스트로 이 의존을 명시적으로 박제한다.

- `auth/account-recovery.service.ts:174` — 번호로 복구 대상 계정 조회
- `profile/creator-profile.guard.ts:21` — 팀·매치·팀매치 생성 자격
- `tournaments/tournament-players.service.ts:194` — 대회 선수 등록 자격
- `auth/auth.service.ts:89`, `auth/auth.service.ts:602`, `profile/profile.service.ts:146` — 번호 중복 검사
- `teams/teams.service.ts:468`, `tournaments/tournament-players.service.ts:352` — 번호 노출
- `app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client.tsx:247` — 선수 등록 가능 안내
- `app/admin/tournaments/[id]/tournament-detail-client.tsx:584` — 운영자 화면 번호 표시

### 알려진 예외

`admin/admin.service.ts:316` — 탈퇴 처리는 `phone`에 tombstone 값(`buildDeletedPhone`)을 넣고
`phoneVerifiedAt`을 null로 만든다. 계정이 `deleted`이므로 불변식 I의 범위 밖이며, A9 테스트도
활성 계정만 대상으로 한다.

## 7. 테스트

| ID | 대상 | 내용 |
|---|---|---|
| A9 | 불변식 I | 활성 계정에서 `phone != null` ⟹ `phoneVerifiedAt != null`. 증명 없는 가입·소셜 완성·번호 변경 각각에서 `phone`이 저장되지 않는지 확인한다. **§6 "손대지 않는 것" 전체가 이 테스트에 의존하므로, 이 테스트가 이번 변경에서 가장 중요하다** |
| A10 | 게이트 | `test/integration/phone-verification-write-gate.e2e-spec.ts` 확장 — 허용 경로가 미인증으로 통과하고, 차단 도메인 6개가 403 `PHONE_VERIFICATION_REQUIRED`를 반환하는지 |
| A11 | 가입 흐름 | 인증 없이 가입 성공 → 프로필 수정 성공 → 팀 생성 403 (1건) |

테스트는 위 계약을 증명하는 가장 좁은 범위로 쓴다. 구현을 되읊는 테스트는 쓰지 않는다.

## 8. 배포와 검증

1. base는 `origin/dev` (로컬 커밋 미반영). 브랜치 `feat/v1-action-time-phone-verification`.
2. `.changeset/*.md` 동반 — 없으면 dev push CI가 실패하고 alpha 배포가 막힌다.
3. PR base는 `dev`, 제목·본문 한국어.
4. UI 변경이 있으므로 **스크린샷 갤러리(mobile 390 / tablet 768 / desktop 1440) 필수**.
5. Copilot 리뷰를 clean까지 반복.
6. dev 머지 = alpha 자동 실배포. 머지 전 검증을 실배포 게이트로 취급한다.
7. alpha에서 실검증: 인증 없이 가입 → 프로필 수정 → 팀 생성 시도(모달) → 인증 → 복귀 후 성공.

`dev → main` 승격은 사용자만 한다. `main`과 `dev`는 같은 코드베이스이므로 이 변경을 양쪽에
따로 적용하지 않는다 — dev에 머지한 뒤 사용자가 승격하면 프로덕션에 반영된다.

## 9. 리스크

| 리스크 | 대응 |
|---|---|
| 불변식 I가 나중에 깨져 §6 "손대지 않는 것"이 조용히 취약해짐 | A9 테스트로 박제. 향후 `phone`을 쓰는 코드를 추가할 때 이 테스트가 깨진다 |
| 미인증 계정 급증 → 스팸 유입 | 게이트가 남에게 도달하는 모든 액션을 막으므로 스팸 도달 경로가 없다. 허용한 두 경로 중 `/uploads`는 이미 제한이 있고, `/inquiries`는 A5에서 5/분을 추가한다 |
| 미인증 사용자의 번호 프리필 부재 | 인증 화면에서 번호를 한 번 더 입력한다. §3에서 의도적으로 감수한 비용이다 |

## 10. 감사 범위와 한계

§6의 작업 항목과 "손대지 않는 것" 목록은 `apps/v1_api/src`와 `apps/v1_web/src`
전체(테스트·시드 제외)를 대상으로 한 `phone` 사용처 전수 감사(2026-08-02)에서 도출했다.
운영 스택(`apps/api` / `apps/web`)과 `guestPhone` 계열(비회원 문의)은 의도적으로 범위 밖에 두었다.

§3의 대안(partial unique index)은 폐기용 Postgres 16에 origin/dev 마이그레이션 82개를 재생해
실측 검증했다. 나머지 항목은 코드 정독에 근거하며, 구현 시 테스트로 확정한다.
