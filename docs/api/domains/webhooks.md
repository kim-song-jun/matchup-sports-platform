# Domain Contract — Webhooks (카카오 연결 해제 알림)

## 범위와 Source of Truth

외부 서비스가 우리 서버를 직접 호출하는 경로를 다룬다. 지금은 카카오의 "연결 해제 알림" 하나뿐이다. 회원이 카카오 쪽에서 팀밋과의 연결(카카오 계정의 "연결된 서비스" 항목)을 끊으면 카카오가 이 경로를 호출한다.

1. `apps/v1_api/src/auth/kakao-webhook.controller.ts`
2. `apps/v1_api/src/auth/kakao-webhook.service.ts`
3. `apps/v1_api/src/auth/kakao-profile.ts` (`withoutKakaoPrefill`)
4. `apps/v1_api/src/auth/kakao-webhook.*.spec.ts`, `apps/v1_api/test/kakao-unlink-webhook.integration-spec.ts`

## Endpoint

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `POST` | `/api/v1/webhooks/kakao/unlink` | `Authorization: KakaoAK <KAKAO_ADMIN_KEY>` | `application/x-www-form-urlencoded`: `app_id`, `user_id`, `referrer_type` | `200` |

- **POST만 받는다.** GET은 만들지 않는다(`404`). 카카오의 GET 형태는 회원번호를 주소에 싣고, 앞단(nginx)의 기본 접근 로그가 요청줄 전체를 남긴다. 카카오 콘솔에는 POST로만 등록한다.
- **`/auth` 아래가 아니다.** nginx가 `/api/v1/auth/`를 IP당 분당 30건으로 묶어, 카카오 서버가 한꺼번에 보내는 알림이 막힌다. `/api/v1/` 일반 규칙(분당 300건)을 쓰면 nginx 설정을 바꿀 필요가 없다.
- 응답 코드는 `201`이 아니라 `200`이다.
- 전역 `ValidationPipe`는 모르는 필드를 `400`으로 거절한다(`forbidNonWhitelisted`). 그래서 DTO 없이 요청 본문을 직접 읽는다.

## 인증

`Authorization` 헤더가 `KakaoAK ` 뒤에 `KAKAO_ADMIN_KEY`(카카오 콘솔의 대표 어드민 키)를 붙인 값과 같아야 한다. 길이가 다르면 바로 불일치이고, 같은 길이는 `timingSafeEqual`로 비교한다. 세션 쿠키나 `Origin` 검사는 쓰지 않는다. 카카오 서버는 둘 다 보내지 않는다.

## 받는 값

| 필드 | 규칙 |
|---|---|
| `app_id` | 숫자 문자열. `KAKAO_APP_ID`와 같아야 처리한다 |
| `user_id` | 숫자 문자열(카카오 회원번호). 카카오 로그인 행의 `providerUserKey`와 맞춘다 |
| `referrer_type` | `ACCOUNT_DELETE`·`FORCED_ACCOUNT_DELETE`·`UNLINK_FROM_ADMIN`·`UNLINK_FROM_APPS`·`INCOMPLETE_SIGN_UP` 다섯 값이면 그 값, 그 밖의 값·없음·여러 번 보낸 값은 `other`. 받은 글자는 기록·로그 어디에도 쓰지 않는다 |
| 그 밖 (`group_user_token` 등) | 무시한다 |

## 응답

확인 순서는 위에서 아래다.

| 상태 | 코드 | 언제 |
|---|---|---|
| `503` | `KAKAO_WEBHOOK_NOT_CONFIGURED` | `KAKAO_ADMIN_KEY` 또는 `KAKAO_APP_ID`가 비어 있다. 프로세스당 처음 한 번 경고 로그를 남긴다 |
| `401` | `UNAUTHENTICATED` | 헤더가 없거나 키가 다르다. 아무것도 쓰지 않는다 |
| `400` | `KAKAO_WEBHOOK_INVALID_BODY` | 인증은 맞지만 `app_id`·`user_id`가 숫자 문자열이 아니다(카카오가 보내는 모양이 아니다) |
| `200` | - | 처리했다. `app_id`가 다른 앱의 것이거나, 모르는 회원번호이거나, 처리 중 예외가 나도 `200`이다 |

`KAKAO_APP_ID`가 비었는데 키만 있는 상태를 통과시키면 모든 알림이 "다른 앱의 알림"으로 조용히 버려진다. 그래서 둘 중 하나라도 비면 `503`이다(네이티브 카카오 로그인이 같은 경우를 `OAUTH_NOT_CONFIGURED`로 닫는 것과 같은 취급).

인증과 형식 확인을 지난 요청은 항상 `200`으로 답한다. 카카오 문서상 연결 해제 알림은 다시 보내지 않고, 실패 응답은 카카오 쪽에서 우리 실패로만 센다. 처리 중 예외는 `error` 로그에 남긴다.

## 처리

회원번호로 카카오 로그인 행(`provider = kakao`, `providerUserKey = user_id`)을 찾는다. 없으면 아무것도 쓰지 않고 `200`이다. 있으면 한 트랜잭션에서 다음 둘을 쓴다.

1. `v1_status_change_logs` 한 줄: `targetType = auth_identity`, `targetId` = 그 행의 id, `fromStatus` = 그 행의 현재 상태, `toStatus = provider_unlinked`, `actorType = system`, `reason = kakao_unlink_webhook:<referrer_type 또는 other>`.
2. 그 회원의 가입 임시 저장 칸(`v1_user_onboarding_progress.draft_json`)에서 카카오가 준 값의 키(`kakaoName`·`kakaoPhone`·`kakaoGender`·`kakaoBirthDate`)만 지운다. 다른 키는 그대로 둔다. Apple이 처음 한 번만 주는 `appleName`도 남긴다. 지울 키가 없으면 쓰지 않는다.

바꾸지 않는 것: 로그인 행의 `status`(`active` 그대로), 계정 상태, 세션, 프로필, 회원의 번호·이메일. 로그인 행을 `unlinked`로 바꾸면 다음 카카오 로그인이 `LOGIN_METHOD_UNLINKED`로 거절되어 카카오만 가진 회원이 들어올 수 없다. 이 경로는 "카카오 쪽 연결이 끊겼다"는 사실만 남기고, 같은 회원이 다시 카카오로 로그인하면 전처럼 로그인된다(카카오가 동의 화면을 다시 보여준다).

같은 알림이 두 번 와도 결과가 같다. 기록이 한 줄 더 생기고 임시 저장 칸은 그대로다.

팀밋이 직접 연결 해제를 부른 경우(탈퇴 신청·운영자 삭제·로그인 방법 해제, [users](./users.md)·[auth](./auth.md))에는 카카오가 이 알림을 보내지 않는다.

## 로그에 회원번호를 남기지 않는다

- 앱 로그에는 내부 사용자 id, `referrer_type` 분류, 결과(`recorded`·`unknown_user`·`app_mismatch`·`failed`)만 쓴다. 회원번호와 키는 쓰지 않는다. 처리 중 예외는 클래스 이름과 코드만 남긴다(Prisma 오류 메시지는 조회 값을 그대로 담는다).
- 전역 예외 필터는 모든 4xx·5xx의 요청 본문을 보존 기한 없는 에러 로그 표(`v1_error_logs`)에 싣고, 가리는 키 목록에 `user_id`가 없다. 그래서 이 경로에 `OmitErrorLogBodyMiddleware`를 걸어(`AuthModule.configure`) `401`·`503`·`400` 뒤에도 본문을 싣지 않는다. 응답 자체는 에러 로그에 한 줄을 만들고, `authorization` 헤더는 가려진다.

## 꺼진 상태와 운영 한계

- `KAKAO_ADMIN_KEY`는 연결 해제 호출([auth](./auth.md#removing-a-login-method-and-signing-out-other-devices))과 이 경로의 인증이 함께 쓴다. 카카오 문서상 이 알림은 대표 어드민 키로 온다.
- 콘솔 등록은 이 코드와 별개의 운영 절차다. 인증 없는 요청이 `503`이 아니라 `401`로 답하는 것을 확인한 뒤에 등록하고, 등록 직후 콘솔의 테스트 도구로 `200`이 오는지 본다(앞단이 `Authorization` 헤더를 넘기는지는 이 응답으로만 갈린다).
- 비교 값은 하나다. 콘솔에서 대표 키를 바꾸면 서버 값을 맞출 때까지 알림이 `401`로 거절되고, 그 사이의 알림은 다시 오지 않는다.
- 연결 해제 알림은 다시 보내지 않으므로 배포 중 `502`가 나는 구간에 온 알림은 잃는다.

## 만들지 않은 것: 계정 상태 변경 알림

카카오의 또 다른 알림인 "계정 상태 변경"(서명된 JWT RS256, `iss https://kauth.kakao.com`, `aud` 대표 REST API 키, 공개키 서명 검증, 3초 안에 `202` 또는 `400`)은 받지 않는다. 코드에 `secevent`·`jwks` 처리가 없다. 카카오 계정 탈퇴를 팀밋 탈퇴로 잇는 정책은 아직 정해지지 않았고, 연결 해제 알림만으로 "카카오 로그인 방법이 끊겼다"는 기록과 임시 저장 값 정리는 충분하다.
