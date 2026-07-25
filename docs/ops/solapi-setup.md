# 솔라피(SOLAPI) API 키 설정 — 휴대폰 SMS 인증(MT OTP)

## 목적

이 문서는 alpha `PhoneVerificationService`(authed)와 `phone-verification-public.controller`(public, pre-account)가 사용하는 **솔라피(SOLAPI) MT(Mobile Terminated) SMS OTP** 연동의 계정 준비, 값 배선(value flow), 로컬/CI dev 모드, 갱신·롤백 절차를 다룬다.

기존에는 옥토모(Octomo) 무료 MO(polling) 방식을 썼으나, `messageExists` 반영이 간헐적으로 수 분 지연되어 5분 TTL을 넘기는 구조적 문제가 있었다(`docs/superpowers/specs/2026-07-25-mt-sms-otp-solapi-design.md` 참조). 솔라피 MT는 서버가 인증번호를 직접 발송하므로 이 지연이 구조적으로 없다.

- 백엔드: `apps/v1_api/src/verification/sms/sms-sender.ts`(`SmsSender` 인터페이스 + `SMS_SENDER` DI 토큰), `apps/v1_api/src/verification/sms/solapi-sms-sender.ts`(`SolapiSmsSender` 어댑터), `apps/v1_api/src/verification/verification-dispatcher.service.ts`(채널별 라우팅)
- 솔라피 API: `POST https://api.solapi.com/messages/v4/send`, 인증 헤더 `Authorization: HMAC-SHA256 apiKey=…, date=…, salt=…, signature=…`(HMAC-SHA256(secret, date+salt))
- 설계 근거: `docs/superpowers/specs/2026-07-25-mt-sms-otp-solapi-design.md`, 구현 계획: `docs/superpowers/plans/2026-07-25-mt-sms-otp-solapi.md`

`SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_SENDER_NUMBER` **3개 값이 모두** 설정돼야 `SolapiSmsSender.enabled`가 `true`가 되어 실제 SMS 가 발송된다. 하나라도 비면 발송이 비활성화되고, `V1_VERIFICATION_DEV_ECHO=true`인 경우에만 dev-echo(응답 `devCode`)로 인증 흐름을 검증할 수 있다.

**휴대폰 인증은 fail-closed 다.** 가입(register/social)의 휴대폰 인증 강제 여부(`PhoneVerificationService.enabled`)는 provider 설정과 무관하게 **기본적으로 항상 필수**이며, 명시적 opt-out(`V1_PHONE_VERIFICATION_DISABLED=true`)로만 해제된다. 따라서 3개 시크릿을 빠뜨리면 `/auth/phone/issue` 가 503 `SMS_NOT_CONFIGURED` 로 실패하고, register 는 `phoneProofToken` 을 계속 요구하므로 **가입이 진행되지 못하고 막힌다**(설정 실수가 인증 통제를 조용히 끄지 못하게 하는 의도된 동작). 운영에서는 3개 값을 반드시 채워야 하며, 불가피하게 인증을 일시 비활성화해야 하면 `V1_PHONE_VERIFICATION_DISABLED=true` 를 명시적으로 설정한다.

---

## 1. 솔라피 계정 생성 · API 키/시크릿 발급

1. [솔라피 콘솔](https://solapi.com)에서 회원가입 후 로그인한다.
2. 콘솔 좌측 메뉴 **API Key 관리**(또는 개발자 센터 → API Key)로 이동한다.
3. **API Key 생성**을 눌러 새 키 쌍을 발급받는다. 발급 시 **API Key**와 **API Secret**이 함께 표시되며, Secret은 이 시점 이후 다시 조회할 수 없다(분실 시 재발급 필요) — 반드시 비밀번호 관리자 또는 아래 GitHub 저장소 시크릿에 즉시 저장한다.
4. 발급된 두 값을 각각 `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`으로 사용한다.

---

## 2. 발신번호 사전등록 (필수, 법규 사항)

한국 「전기통신사업법」 제84조의2(문자메시지 발송 사업자 등의 준수사항)에 따라, 문자메시지 발신에 사용하는 전화번호는 **사전등록된 번호만** 사용할 수 있다. 등록되지 않은 번호로는 발송 요청 자체가 API 단에서 거부된다.

1. 솔라피 콘솔 → **발신번호 관리**로 이동한다.
2. **발신번호 등록**을 눌러 등록할 번호(개인 또는 사업자 명의)를 입력한다.
3. 명의자 인증(휴대폰 본인인증 또는 사업자 서류 제출 — 계정 유형에 따라 다름)을 완료한다.
4. 등록·심사가 승인되면 해당 번호를 발신번호로 사용할 수 있다. 승인까지 영업일 기준 수 시간~1일 소요될 수 있으므로 배포 일정보다 미리 진행한다.
5. 승인된 번호(숫자만, 하이픈 없이)를 `SOLAPI_SENDER_NUMBER`로 사용한다.

번호 명의자가 바뀌거나 회선을 해지하는 경우 솔라피 콘솔에서 발신번호를 갱신하고, 아래 GitHub 시크릿 값도 함께 갱신해야 한다.

---

## 3. 값 배선(Value Flow) — GitHub Secrets → 배포 → 컨테이너

```
솔라피 콘솔 (API Key/Secret 발급, 발신번호 사전등록)
        │
        ▼
GitHub 저장소 시크릿: SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER_NUMBER
        │  (Settings → Secrets and variables → Actions)
        ▼
.github/workflows/deploy-alpha.yml
   ├─ job env:        SOLAPI_API_KEY: ${{ secrets.SOLAPI_API_KEY }}
   │                  SOLAPI_API_SECRET: ${{ secrets.SOLAPI_API_SECRET }}
   │                  SOLAPI_SENDER_NUMBER: ${{ secrets.SOLAPI_SENDER_NUMBER }}
   └─ SSM 인라인 env:  SOLAPI_API_KEY='${SOLAPI_API_KEY}' SOLAPI_API_SECRET='${SOLAPI_API_SECRET}' SOLAPI_SENDER_NUMBER='${SOLAPI_SENDER_NUMBER}'
                       (EC2 호스트에서 `env ... bash deploy-alpha.sh`로 전달)
        │
        ▼
deploy/docker-compose.prod.yml — v1_api.environment
   SOLAPI_API_KEY: ${SOLAPI_API_KEY:-}
   SOLAPI_API_SECRET: ${SOLAPI_API_SECRET:-}
   SOLAPI_SENDER_NUMBER: ${SOLAPI_SENDER_NUMBER:-}
        │
        ▼
v1_api 컨테이너 process.env → SolapiSmsSender
```

`KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET`/`KAKAO_REDIRECT_URI`와 동일한 패턴이다 — 위 3개 위치(워크플로 job env, SSM 인라인 env, compose environment)에 나란히 배선돼 있으며 별도 메커니즘은 없다. 값 3개 중 하나라도 빠지면(예: 오탈자, 시크릿 미등록) 배포 자체는 성공하지만 `SolapiSmsSender.enabled`가 `false`가 되어 SMS가 발송되지 않는다.

### GitHub 저장소 시크릿 등록

1. 저장소 → **Settings → Secrets and variables → Actions**로 이동한다.
2. **New repository secret**을 클릭한다.
3. 아래 3개를 각각 등록한다:
   - `SOLAPI_API_KEY` — 솔라피 콘솔에서 발급받은 API Key
   - `SOLAPI_API_SECRET` — 같은 화면에서 함께 발급된 API Secret
   - `SOLAPI_SENDER_NUMBER` — 사전등록 완료된 발신번호(숫자만)
4. 저장한다. GitHub Actions 로그에서는 자동으로 마스킹되므로 워크플로 스텝에서 직접 `echo`하지 않는다.

EC2 호스트의 `deploy/.env`에 직접 써넣을 필요는 없다 — `dev` push 배포마다 SSM Run Command 환경변수로 매번 전달된다(Kakao 리다이렉트 URI와 동일한 경로). `deploy/.env.prod.example`은 로컬/수동 참조용으로 변수명만 문서화한다.

---

## 4. 시크릿 미설정 시 — Dev Echo로 개발/검증

솔라피 계정·발신번호 등록이 완료되기 전(또는 로컬 개발·CI 환경)에는 실제 SMS를 보내지 않고도 인증 플로우 전체를 검증할 수 있다.

```bash
V1_VERIFICATION_DEV_ECHO=true
```

`SOLAPI_API_KEY`/`SOLAPI_API_SECRET`/`SOLAPI_SENDER_NUMBER` 중 하나라도 비어 있어 `SolapiSmsSender.enabled === false`인 상태에서 `V1_VERIFICATION_DEV_ECHO=true`이면, `VerificationDispatcherService`는 실제 발송을 시도하지 않고 발급한 인증코드를 **API 응답의 `devCode` 필드로 그대로 반환**한다. 프론트(`PhoneVerificationCard`)는 이 값이 있으면 입력 필드를 프리필해 개발자가 실제 문자 수신 없이 confirm까지 끝까지 검증할 수 있다.

3개 값이 모두 채워져 `enabled === true`가 되면 dev-echo 여부와 무관하게 항상 실제 솔라피 발송이 우선한다 — 즉 운영 환경에서는 `V1_VERIFICATION_DEV_ECHO`를 켜 두더라도 실제 SMS가 나간다(코드 노출용이 아니라 발송 성공 이후의 로그 보조용으로만 동작). 프로덕션에서는 `V1_VERIFICATION_DEV_ECHO`를 설정하지 않는다.

로컬/CI에서 3개 시크릿을 모두 비워 두고 `V1_VERIFICATION_DEV_ECHO=true`만 설정하면, 옥토모 시절과 동일하게 벤더 자격 증명 없이 휴대폰 인증 플로우 전체(발급 → 코드 확인 → phoneVerifiedAt/proofToken)를 테스트할 수 있다.

---

## 5. 키 갱신·롤백 주의사항

### 갱신
- API Key/Secret을 재발급하면 **기존 Secret은 즉시 무효화**될 수 있다. 재발급 직후 GitHub 저장소 시크릿을 함께 갱신하고, 다음 `dev` push(또는 `deploy-alpha.yml`의 `workflow_dispatch`)로 재배포해 반영한다 — 반영 전까지는 이전 키로 발송이 계속 실패한다(발송 실패는 사용자에게 명확한 에러로 노출되므로 조기에 알아챌 수 있다).
- 발신번호를 바꾸는 경우 솔라피 콘솔의 발신번호 등록·승인이 먼저 완료돼야 하며, 승인 전에 `SOLAPI_SENDER_NUMBER`만 먼저 바꾸면 발송이 거부된다. 반드시 "콘솔 승인 완료 → 시크릿 갱신 → 재배포" 순서를 지킨다.

### 롤백 / 인증 일시 비활성화

**주의(fail-closed):** 시크릿을 지우는 것만으로는 인증이 "꺼지지" 않는다 — `/auth/phone/issue` 가 503 `SMS_NOT_CONFIGURED` 로 실패하고 register 가 계속 `phoneProofToken` 을 요구해 **신규 가입이 전면 막힌다**. 상황별로 다음을 사용한다.

- **발송 채널만 교정(키/발신번호 교체):** GitHub 시크릿 3개를 새 값으로 갱신 → 재배포(다음 `dev` push 또는 `deploy-alpha.yml` `workflow_dispatch`). 3개가 모두 유효하면 정상 발송이 재개된다.
- **인증을 의도적으로 일시 비활성화(가입은 계속 받되 phone 인증 스킵):** 환경변수 `V1_PHONE_VERIFICATION_DISABLED=true` 를 주입 → 재배포. `PhoneVerificationService.enabled` 가 `false` 가 되어 register/social 이 `phoneProofToken` 을 요구하지 않는다(**비상용 opt-out — 상시 사용 금지**, 프론트 카드는 별개로 노출될 수 있음).
- 이미 인증 완료된 계정(`phoneVerifiedAt`)은 어떤 경우에도 영향받지 않는다.
- 코드 레벨 롤백(이전 커밋 복원)이 필요하면 별도로 검토한다.

스키마·데이터 마이그레이션은 이 시크릿 롤백만으로는 필요하지 않다.

---

## 보안 체크리스트

- `SOLAPI_API_KEY`/`SOLAPI_API_SECRET`은 서버 전용 시크릿이다. 절대 `NEXT_PUBLIC_*`로 노출하거나 `apps/v1_web` 클라이언트 코드에서 참조하지 않는다 — 솔라피 호출은 전부 `apps/v1_api`의 `SolapiSmsSender`에서 서버 사이드로만 이뤄진다.
- `deploy/.env.prod.example`에는 변수명과 빈 값만 문서화한다 — 실제 키를 커밋하지 않는다.
- GitHub Actions는 등록된 시크릿을 로그에서 자동 마스킹한다. 워크플로 스텝에서 `echo $SOLAPI_API_SECRET` 등으로 직접 출력하지 않는다.
- `SOLAPI_SENDER_NUMBER`는 발신 전화번호로, 인증 시크릿만큼 민감하지는 않지만 임의로 변경 시 위 "사전등록" 승인 없이는 발송이 거부되므로 실수로 바꾸지 않도록 주의한다.
- HMAC 서명(`salt` + `date` + `signature`)은 매 요청마다 새로 생성되며 재사용하지 않는다(`solapi-sms-sender.ts` 구현 참조).
