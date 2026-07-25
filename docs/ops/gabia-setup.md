# 가비아(Gabia) SMS 설정 — 휴대폰 SMS 인증(MT OTP) 대안 발송처

## 목적

이 문서는 alpha `PhoneVerificationService`(authed)와 `phone-verification-public.controller`(public, pre-account)가 사용하는 휴대폰 SMS OTP 발송처를 **솔라피(SOLAPI) 대신 가비아(Gabia) SMS**로 전환하는 방법을 다룬다. 기본 발송처는 여전히 솔라피이며(`docs/ops/solapi-setup.md` 참조), 가비아는 `SMS_PROVIDER=gabia` 로 명시적으로 전환했을 때만 사용되는 선택지다.

- 백엔드: `apps/v1_api/src/verification/sms/sms-sender.ts`(`SmsSender` 인터페이스 + `SMS_SENDER` DI 토큰), `apps/v1_api/src/verification/sms/solapi-sms-sender.ts`(`SolapiSmsSender`, 기본), `apps/v1_api/src/verification/sms/gabia-sms-sender.ts`(`GabiaSmsSender`, `SMS_PROVIDER=gabia`일 때 선택), `apps/v1_api/src/verification/verification-dispatcher.service.ts`(채널별 라우팅)
- 가비아 SMS API: `POST https://sms.gabia.com/oauth/token`(OAuth2 client_credentials 토큰 발급) / `POST https://sms.gabia.com/api/send/sms`(문자 발송)

`SOLAPI_API_KEY`/`SOLAPI_API_SECRET`/`SOLAPI_SENDER_NUMBER` 3개가 솔라피 기본 경로임은 변하지 않는다. `SMS_PROVIDER=gabia`로 전환하면 대신 `GABIA_SMS_ID`/`GABIA_API_KEY`/`GABIA_SENDER_NUMBER` 3개가 모두 채워져야 `GabiaSmsSender.enabled`가 `true`가 되어 실제 SMS가 발송된다. 하나라도 비면 발송이 비활성화되고, `V1_VERIFICATION_DEV_ECHO=true`인 경우에만 dev-echo(응답 `devCode`)로 인증 흐름을 검증할 수 있다.

**휴대폰 인증은 fail-closed 다.** 가입(register/social)의 휴대폰 인증 강제 여부(`PhoneVerificationService.enabled`)는 provider 설정과 무관하게 **기본적으로 항상 필수**이며, 명시적 opt-out(`V1_PHONE_VERIFICATION_DISABLED=true`)로만 해제된다. 따라서 가비아로 전환한 뒤 3개 시크릿을 빠뜨리면 `/auth/phone/issue` 가 503 `SMS_NOT_CONFIGURED` 로 실패하고, register 는 `phoneProofToken` 을 계속 요구하므로 **가입이 진행되지 못하고 막힌다**.

---

## 1. 가비아 계정 준비 · SMS 서비스 신청 · 발신번호 사전등록

1. [가비아](https://www.gabia.com)에서 계정을 생성하고 로그인한다.
2. 가비아 SMS(문자메시지) 서비스를 신청한다(별도 유료 서비스).
3. SMS 서비스 관리 화면에서 **API 연동 정보**(SMS 서비스 아이디, API Key)를 발급받는다.
4. 한국 「전기통신사업법」 제84조의2에 따라 문자메시지 발신에 사용하는 전화번호는 **사전등록된 번호만** 사용할 수 있다. 가비아 SMS 관리 화면에서 발신번호(콜백번호)를 등록하고 명의자 인증을 완료한다. 등록되지 않은 번호로는 발송 요청 자체가 API 단에서 거부된다.
5. **API 발송 허용 IP를 등록한다.** 가비아 SMS 관리툴은 API 호출을 **사전 등록된 발신 서버 IP에서만** 허용한다. 등록 전에는 발송 단계까지 가지도 못하고 **토큰 발급(`POST /oauth/token`)부터 HTTP 400 으로 거부**되며, 시크릿 3개가 모두 정확해도 발송이 전혀 되지 않는다(→ [7. 트러블슈팅](#7-트러블슈팅)).
   - 등록할 값은 **서버의 아웃바운드 공인 IP**다. alpha 환경은 EC2 인스턴스(`i-06efc23f226edccd7`)에 연결된 Elastic IP **`54.116.11.231`**(`teameet-alpha-eip`)이며, EIP 이므로 인스턴스를 재시작해도 바뀌지 않는다.
   - 확인 명령: `aws ec2 describe-instances --region ap-northeast-2 --instance-ids i-06efc23f226edccd7 --query 'Reservations[].Instances[].PublicIpAddress' --output text`
   - 가비아는 400 응답 본문에 요청이 실제로 도달한 IP(`현재 IP : x.x.x.x`)를 그대로 돌려주므로, 값이 헷갈리면 그 메시지의 IP 를 등록하면 된다.
   - 서버를 다른 인스턴스/리전으로 옮기거나 NAT 게이트웨이를 경유하도록 바꾸면 아웃바운드 IP 가 달라진다 — 이전 IP 는 지우고 새 IP 를 다시 등록해야 한다.

---

## 2. 발급값 → 환경변수 매핑

| 가비아에서 발급받은 값 | 환경변수 |
|---|---|
| SMS 서비스 아이디 | `GABIA_SMS_ID` |
| API Key | `GABIA_API_KEY` |
| 등록된 발신번호(콜백번호, 숫자만) | `GABIA_SENDER_NUMBER` |

> ⚠️ **노트북/예제 코드의 이름 매핑 주의**: 가비아가 배포하는 일부 예제·노트북 코드에는 `GAVIA_SMS_ID` / `GAVIA_KEY` / `GAVIA_CALL_BACK` 같은 변수명이 등장한다. `GAVIA`는 오탈자이며 정식 표기는 `GABIA`다. 이 저장소의 환경변수는 항상 정식 표기를 사용하므로, 예제를 참고할 때 아래처럼 치환해서 읽는다.
>
> | 예제(오탈자) | 이 저장소(정식) |
> |---|---|
> | `GAVIA_SMS_ID` | `GABIA_SMS_ID` |
> | `GAVIA_KEY` | `GABIA_API_KEY` |
> | `GAVIA_CALL_BACK` | `GABIA_SENDER_NUMBER` |

---

## 3. GitHub Secrets 등록 · 전환

1. 저장소 → **Settings → Secrets and variables → Actions**로 이동한다.
2. **New repository secret**을 클릭해 아래를 등록한다:
   - `SMS_PROVIDER` — `gabia` (솔라피로 되돌리려면 `solapi`로 바꾸거나 시크릿 자체를 미설정 상태로 둔다)
   - `GABIA_SMS_ID` — 가비아에서 발급받은 SMS 서비스 아이디
   - `GABIA_API_KEY` — 가비아에서 발급받은 API Key
   - `GABIA_SENDER_NUMBER` — 사전등록 완료된 발신번호(숫자만)
3. 저장한다. GitHub Actions 로그에서는 자동으로 마스킹되므로 워크플로 스텝에서 직접 `echo`하지 않는다.
4. 다음 `dev` push(또는 `deploy-alpha.yml`의 `workflow_dispatch`)로 재배포하면 `SMS_PROVIDER=gabia` 환경이 반영되어 이후 발송은 가비아를 경유한다.

`SOLAPI_API_KEY`/`SOLAPI_API_SECRET`/`SOLAPI_SENDER_NUMBER`와 마찬가지로 EC2 호스트의 `deploy/.env`에 직접 써넣을 필요는 없다 — `dev` push 배포마다 SSM Run Command 환경변수로 매번 전달된다.

---

## 4. 동작 방식

서버는 사용자가 요청한 전화번호로 6자리 OTP를 MT(Mobile Terminated) SMS로 직접 발송한다(솔라피와 동일하게 서버 발신 — 옥토모 시절의 MO/polling 방식이 아니다). 가비아는 인증 방식이 솔라피(HMAC 서명)와 달리 **OAuth2 client_credentials** 흐름을 사용한다:

1. `POST https://sms.gabia.com/oauth/token` 으로 `GABIA_SMS_ID`/`GABIA_API_KEY` 기반 client_credentials 토큰을 발급받는다. 토큰 유효기간은 1시간이다.
2. 어댑터(`GabiaSmsSender`)가 발급받은 토큰을 캐시해 두고, 만료 전까지 재사용한다. 만료되면 자동으로 재발급한다.
3. `POST https://sms.gabia.com/api/send/sms` 로 발신번호(`GABIA_SENDER_NUMBER`)·수신번호·인증코드 메시지를 실어 발송을 요청한다.

발송 실패(가비아 API 오류 응답, 네트워크 오류 등)는 503 `SMS_SEND_FAILED`로 응답한다. 시크릿 3개 중 하나라도 미설정이면 503 `SMS_NOT_CONFIGURED`로 응답한다.

---

## 5. 시크릿 미설정 시 — Dev Echo로 개발/검증

솔라피와 동일한 dev-echo 메커니즘을 그대로 공유한다.

```bash
V1_VERIFICATION_DEV_ECHO=true
```

`SMS_PROVIDER=gabia`로 설정했지만 `GABIA_SMS_ID`/`GABIA_API_KEY`/`GABIA_SENDER_NUMBER` 중 하나라도 비어 있어 `GabiaSmsSender.enabled === false`인 상태에서 `V1_VERIFICATION_DEV_ECHO=true`이면, `VerificationDispatcherService`는 실제 발송을 시도하지 않고 발급한 인증코드를 **API 응답의 `devCode` 필드로 그대로 반환**한다. 3개 값이 모두 채워져 `enabled === true`가 되면 dev-echo 여부와 무관하게 항상 실제 가비아 발송이 우선한다. 프로덕션에서는 `V1_VERIFICATION_DEV_ECHO`를 설정하지 않는다.

---

## 6. 롤백 — 솔라피로 되돌리기

가비아 전환은 라우팅 플래그 하나로 결정되므로 롤백이 간단하다.

- **솔라피로 즉시 되돌리기:** GitHub 시크릿 `SMS_PROVIDER`를 `solapi`로 바꾸거나 아예 삭제(미설정 시 기본값이 솔라피)한 뒤 재배포(다음 `dev` push 또는 `deploy-alpha.yml` `workflow_dispatch`)한다. 기존 `SOLAPI_API_KEY`/`SOLAPI_API_SECRET`/`SOLAPI_SENDER_NUMBER`가 유효한 상태로 유지되고 있어야 한다.
- **인증 자체를 일시 비활성화(가입은 계속 받되 phone 인증 스킵):** 환경변수 `V1_PHONE_VERIFICATION_DISABLED=true` 를 주입 → 재배포. `PhoneVerificationService.enabled` 가 `false` 가 되어 register/social 이 `phoneProofToken` 을 요구하지 않는다(**비상용 opt-out — 상시 사용 금지**).
- 이미 인증 완료된 계정(`phoneVerifiedAt`)은 어떤 경우에도 영향받지 않는다.

스키마·데이터 마이그레이션은 이 발송처 전환/롤백만으로는 필요하지 않다.

---

## 7. 트러블슈팅

### `503 SMS_SEND_FAILED` + 로그에 `gabia token issue failed: 400`

토큰 발급 자체가 거부된 상태다. **원인은 응답 본문에만 들어 있고**(한글이 유니코드 이스케이프로 인코딩돼 있다) HTTP status 만 보면 구분되지 않으므로, 반드시 본문을 확인한다.

```bash
# alpha EC2 에서
docker logs --since 10m teameet_v1_api 2>&1 | grep -a 'token issue failed' | tail -3
```

| 응답 본문 | 원인 | 조치 |
|---|---|---|
| `관리툴에서 API 발송 IP 설정을 해주세요. (현재 IP : x.x.x.x)` | 발신 서버 IP 미등록 | 가비아 SMS 관리툴에 그 IP 등록([1장 5번](#1-가비아-계정-준비--sms-서비스-신청--발신번호-사전등록)). **시크릿 값 문제가 아니므로 `GABIA_SMS_ID`/`GABIA_API_KEY` 를 건드려도 해결되지 않는다** |
| 아이디·키 인증 실패 계열 | `GABIA_SMS_ID`/`GABIA_API_KEY` 불일치 | 관리툴 발급값과 GitHub 시크릿을 재대조한 뒤 재배포 |

### 시크릿을 고쳤는데 그대로일 때

시크릿은 **배포 시점에만** 컨테이너 환경변수로 주입된다. 시크릿 갱신 시각보다 **나중에 시작된** 배포인지부터 확인하고 판정한다.

```bash
docker inspect -f '{{.State.StartedAt}}' teameet_v1_api
docker exec teameet_v1_api sh -c 'echo "$SMS_PROVIDER / $GABIA_SMS_ID / $GABIA_SENDER_NUMBER / len=${#GABIA_API_KEY}"'
```

`GABIA_API_KEY` 는 길이만 찍는다 — 값 자체를 출력하거나 공유 로그에 붙여넣지 않는다.

---

## 보안 체크리스트

- `GABIA_API_KEY`는 서버 전용 시크릿이다. 절대 `NEXT_PUBLIC_*`로 노출하거나 `apps/v1_web` 클라이언트 코드에서 참조하지 않는다 — 가비아 호출은 전부 `apps/v1_api`의 `GabiaSmsSender`에서 서버 사이드로만 이뤄진다.
- `deploy/.env.prod.example`에는 변수명과 빈 값만 문서화한다 — 실제 키를 커밋하지 않는다.
- GitHub Actions는 등록된 시크릿을 로그에서 자동 마스킹한다. 워크플로 스텝에서 `echo $GABIA_API_KEY` 등으로 직접 출력하지 않는다.
- `GABIA_SENDER_NUMBER`는 발신 전화번호로, 사전등록 승인 없이는 발송이 거부되므로 실수로 바꾸지 않도록 주의한다.
- OAuth 토큰은 캐시되지만 클라이언트 코드나 로그에 평문으로 남기지 않는다.
