# 레거시 미인증 계정에 자기 계정 범위를 돌려준다 — 설계

- 작성일: 2026-08-02
- 대상 스택: v1 (`apps/v1_api` + `apps/v1_web`) — alpha.teameet.co.kr
- 브랜치: `feat/v1-action-time-phone-verification` (base: `origin/dev`)
- 선행 문서: `docs/superpowers/specs/2026-07-23-octomo-phone-verification-design.md`

## 1. 배경

v1은 휴대폰 본인인증을 회원가입 완료 조건으로 강제한다. **이 요건은 그대로 유지한다** —
신규 가입은 앞으로도 인증을 마쳐야 끝난다.

문제는 그 요건이 도입되기 **이전에 가입한 계정**들이다. 이들은 `phoneVerifiedAt`이 비어 있는
채로 남아 있고, `V1AuthGuard`의 전역 쓰기 게이트(`v1-auth.guard.ts:126`)가 미인증 계정의
GET 외 모든 쓰기를 403으로 막는다. 그 결과:

- 로그인은 된다. 화면도 다 보인다.
- 그런데 프로필 사진 한 장 못 바꾸고, 닉네임도 못 고치고, 알림 읽음 처리도 안 되고,
  "인증이 안 되는데요"라는 문의조차 보낼 수 없다.
- 인증하라는 안내만 반복해서 본다. 인증이 잘 안 풀리면 계정이 사실상 잠긴 상태가 된다.

인증을 유도하는 것 자체는 맞다. 다만 **유도의 대상이 아무것도 할 수 없는 상태로 갇혀 있는 것**이
문제다.

## 2. 목표

> 인증이 실제로 필요한 지점은 그대로 막는다. **자기 계정을 건사하는 일은 돌려준다.**

- 레거시 미인증 계정이 프로필·설정·사진·알림·문의를 정상적으로 쓸 수 있다.
- 팀·대회·채팅·매치·리뷰처럼 다른 사용자에게 도달하는 액션은 그 시점에 인증을 요구한다.
- 신규 가입의 인증 필수 요건은 **건드리지 않는다**.

### 비목표

- 신규 회원가입 인증 완화 — 범위 밖이다. 별도 판단 사항.
- 운영 스택(`apps/api` / `apps/web`) — 범위 밖.
- 인증 수단(옥토모 MO / SMS) 자체 — 바꾸지 않는다.
- 스키마·마이그레이션 — 변경 없음.

## 3. 이미 있는 것 / 비어 있는 것

이 변경이 작은 이유는 필요한 배관이 대부분 이미 있기 때문이다.

| | 상태 |
|---|---|
| 액션 시점 차단 | **이미 작동 중** — 전역 쓰기 게이트가 미인증 계정의 쓰기를 403 `PHONE_VERIFICATION_REQUIRED` 로 막는다 |
| 인증 유도 모달 + 원래 화면 복귀 | **이미 구현됨** — `phone-verification-required.ts` → `phone-verification-required-modal.tsx` → `buildPhoneVerifyHref(현재 경로)` |
| 레거시 미인증 뱃지 | **이미 있음** — `home-client.tsx:71` |
| 대회 신청 화면의 인증 안내 | **이미 있음** — `tournament-apply-client.tsx:1701` 이 `phoneVerified === false` 를 보고 안내한다 |
| **자기 계정 범위 쓰기** | **비어 있음** — 이게 이번에 채우는 것 |

## 4. 설계

### 4.1 허용 목록을 넓힌다 (구조는 그대로)

`phone-verification-access.ts`의 허용 목록(fail-closed)을 유지하고 예외만 추가한다.
차단 목록으로 뒤집으면 새 엔드포인트가 기본 통과가 되어, 목록에 넣는 걸 잊는 순간 조용히
인증 우회가 생긴다.

```
GET / HEAD / OPTIONS         → 전부 허용 (기존과 동일)

쓰기 중 허용:
  (1) 계정이 잠기지 않게 하는 최소 경로 — 기존
      /verification  /auth  /admin  /terms/consents
  (2) 자기 계정 범위 — 이번에 추가
      /me  /onboarding  /notifications  /notification-preferences
      /uploads  /inquiries  /search  /logs  /master

그 외 모든 쓰기               → 403 PHONE_VERIFICATION_REQUIRED
                                details.next.route = /my/phone-verify
```

`/me/withdrawal-request`는 `/me` 접두사에 포함되므로 개별 항목에서 제거했다(동작 동일).
`/notification-preferences`는 `/notifications`의 하위 경로가 **아니므로** 정확 일치 목록에 둔다.

접두사 매칭은 경계(`/`)까지 확인하므로 `/me`가 `/mercenary`를, `/admin`이 `/admins`를
삼키지 않는다.

### 4.2 계속 막히는 것

| 도메인 | 경로 |
|---|---|
| 팀 | `POST /teams`, `PATCH /teams/:id`, `/teams/:id/join-applications`, `/teams/:id/invitations`, `/team-invitations/:id/accept·decline`, `/team-join-applications/:id/*`, `/team-memberships/*`, `/teams/:id/leave` |
| 대회 | `/tournaments/:id/registrations` (생성·submit·players·cancel-request), `/tournaments/:id/reviews`, `/tournaments/campaigns/*` |
| 채팅 | `/chat/rooms/resolve`, `/chat/rooms/:id/messages`, `/chat/rooms/:id/leave`, `/chat/rooms/:id/me` |
| 매치 | `POST /matches`, `PATCH /matches/:id`, `/matches/:id/applications`, `/matches/:id/cancel`, `/match-applications/*` |
| 팀 매치 | `/team-matches` 전체 |
| 리뷰 | `POST /reviews` |

### 4.3 프론트도 같은 전제를 걷어낸다

**백엔드만 고치면 목표가 달성되지 않는다.** 프로필 편집 화면이 "어차피 서버가 403을 준다"는
전제로 **저장 요청 자체를 보내지 않고** 있었다(`my-api-clients.tsx`). 서버가 200을 주기 시작해도
클라이언트가 요청을 안 보내면 사용자는 그대로 갇힌다.

그래서 그 차단 분기를 제거하고, 안내 문구도 사실에 맞게 고친다.

- 제거: "미인증이면 저장을 막는다" 분기
- 유지: **번호를 바꾸는 경우의 증명 요구** — 이건 서버가 여전히 400 `PHONE_NOT_VERIFIED`로
  강제한다. 증명 없이 번호를 붙일 수 있으면 "프로필에서 번호만 교체"로 인증 자체가 우회된다.
- 문구: "저장하려면 인증을 먼저 끝내라" → "프로필 저장은 그대로 되지만, 팀·대회·채팅을
  이용하려면 인증이 필요해요"
- 인증 카드는 그대로 둔다 — 저장을 막는 장치가 아니라 여기서 인증을 끝낼 수 있게 하는 안내다.

### 4.4 `/inquiries` rate limit

`/inquiries`는 미인증 계정에도 열리는 경로 중 **유일하게 운영자에게 도달**한다
(나머지는 전부 자기 계정 안에서 끝난다). 전용 제한이 없어 전역 기본값 1000/분만 적용되고
있었으므로 5/분으로 좁힌다. `/uploads`는 이미 20/분(이미지)·3/분(영상)이 걸려 있어 추가 조치가
없다.

## 5. 작업 항목

### 백엔드

| ID | 위치 | 내용 |
|---|---|---|
| B1 | `verification/phone-verification-access.ts` | 허용 목록에 자기 계정 범위 9개 추가 (§4.1) |
| B2 | `inquiries/inquiries.controller.ts` | `POST /inquiries` 에 `@Throttle 5/60s` (§4.4) |

### 프론트엔드

| ID | 위치 | 내용 |
|---|---|---|
| F1 | `components/my/my-api-clients.tsx` | 미인증이라는 이유만으로 저장을 막던 분기 제거 + 안내 문구·주석 정정 (§4.3) |

### 손대지 않는 것

- `auth/auth.service.ts` 가입 hard-block 2곳 — **신규 가입 인증 필수는 유지**
- `components/auth/signup-client.tsx`, `social-signup-client.tsx` — 가입 폼 인증 필수 유지
- `profile/profile.service.ts` 번호 변경 증명 요구 — 유지 (fail-closed)
- `profile/creator-profile.guard.ts` — 팀·매치·팀매치 생성 자격. 계속 인증을 요구해야 하는 쪽
- 스키마 · 마이그레이션 — 변경 없음

## 6. 검증

| ID | 대상 | 방식 |
|---|---|---|
| V1 | 허용·차단 경로 계약 | `phone-verification-access.spec.ts` — 자기 계정 9개 허용, 팀·대회·채팅·매치·리뷰 차단, 접두사 경계(`/mercenary`·`/admins`·`/notification-preferences/bulk`) |
| V2 | 실 DB + 실 HTTP | `phone-verification-write-gate.e2e-spec.ts` — 미인증 `POST /teams` 403, 미인증 `PATCH /me/profile` 200, 번호 첨부 시 400, 인증 계정 200 |
| V3 | 프론트 저장 동작 | `my-api-clients.profile.test.tsx` — 미인증도 저장 요청이 나가는지, 번호 변경 시엔 여전히 막히는지 |
| V4 | 회귀 (가입 hard-block) | `signup-client.test.tsx`, `auth.service.spec.ts` 무수정 통과 |

## 7. 배포

1. base는 `origin/dev`. 브랜치 `feat/v1-action-time-phone-verification`.
2. `.changeset/*.md` 동반 — 없으면 dev push CI가 실패하고 alpha 배포가 막힌다.
3. PR base는 `dev`, 제목·본문 한국어.
4. UI 문구·동작이 바뀌므로 스크린샷 갤러리(mobile 390 / tablet 768 / desktop 1440) 첨부.
5. Copilot 리뷰를 clean까지 반복.
6. dev 머지 = alpha 자동 실배포. 머지 전 검증을 실배포 게이트로 취급한다.
7. alpha 실검증: 레거시 미인증 계정으로 로그인 → 프로필 수정 성공 → 팀 생성 시도(모달) →
   인증 → 복귀 후 성공.

`dev → main` 승격은 사용자만 한다.

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| 열어 준 경로 중 실제로는 남에게 도달하는 게 섞임 | 9개 경로의 컨트롤러를 개별 확인했다. `/inquiries` 하나만 운영자에게 도달하며 rate limit 을 걸었다 |
| 미인증 계정이 번호를 임의로 붙임 | `profile.service.ts:184` 가 fail-closed 로 증명을 요구한다. V2 통합 테스트가 400 을 확인한다 |
| 앞으로 추가되는 엔드포인트가 조용히 열림 | 허용 목록은 fail-closed 다. 새 경로는 기본이 차단이며, 여는 것은 언제나 명시적 추가다 |
| 프론트 어딘가가 여전히 미인증을 이유로 자기 계정 동작을 막음 | `phoneVerified` 참조 지점을 전수 확인했다. 남은 차단은 대회 신청(의도됨)·소셜 가입(의도됨)뿐이다 |

## 9. 이 문서의 이력

초안은 **신규 가입의 인증 요건을 없애고** 인증을 액션 시점으로 옮기는 설계였다. 그 과정에서
미인증 번호를 저장하기 위한 partial unique index 방안을 폐기용 Postgres 16으로 실측
검증했고(마이그레이션 82개 재생 후 `prisma migrate diff --exit-code` = 0), `phone` 사용처
전수 감사로 계정 복구·생성 가드·대회 선수 자격 등 13곳의 영향 범위를 확인했다.

이후 **신규 가입은 인증 필수를 유지한다**는 결정에 따라 범위를 지금의 형태로 좁혔다.
가입 요건을 건드리지 않으므로 `phone`은 계속 "인증된 번호만 저장"되고, 따라서 위 감사에서
나온 13곳은 모두 손댈 필요가 없어졌다. 스키마 변경도 사라졌다.

가입 문턱을 낮추는 판단이 나중에 다시 필요해지면, partial index 검증 결과와 감사 목록은
그때 재사용할 수 있다.
