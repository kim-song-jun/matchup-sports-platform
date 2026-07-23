# 옥토모(Octomo) MO 휴대폰 본인인증 — 설계 문서

- **작성일**: 2026-07-23
- **대상 스택**: v1 (`apps/v1_api` + `apps/v1_web`) — alpha.teameet.co.kr 전용
- **상태**: 설계 확정 대기 (브레인스토밍 산출물). 구현 계획은 후속 writing-plans 산출물에서.

---

## 1. Context

회원가입에 **휴대폰 번호 본인인증**을 추가한다. 외부 서비스 **옥토모(Octomo)**를 사용하며, 이는 **MO(Mobile Originated) 방식** — 우리가 사용자에게 SMS를 보내는 게 아니라, **사용자가 자기 폰에서 옥토모 대표번호로 인증코드를 문자 발송**하고, 우리 서버가 "그 번호에서 그 코드가 방금 도착했는지"를 조회해 번호 소유를 증명한다.

### 왜 v1 스택인가 (결정적 사실)
- `deploy-alpha.yml`은 `apps/v1_api`/`apps/v1_web`만 담아 alpha.teameet.co.kr에 배포한다. 운영(teameet.co.kr)은 `apps/api`/`apps/web`로 별개 스택이다.
- 사용자 요구 "alpha에서만 먼저" ⇒ **작업 대상은 v1 스택이 맞다.** 운영 스택은 범위 밖.

### 이미 존재하는 자산 (v1)
- `V1User.phoneVerifiedAt DateTime?`, `V1User.phone String? @unique` — 컬럼 이미 있음.
- `V1VerificationToken` 모델(channel `phone|email`, `codeHash`, `attemptCount`, `expiresAt`, `consumedAt`).
- `apps/v1_api/src/verification/` 모듈: `POST /verification/phone/request`·`/confirm` (둘 다 `V1AuthGuard` = 로그인 필수), 상태머신·시도제한(5)·TTL(5분).
- `verification-dispatcher.service.ts`의 `send()` = **동작 안 하는 스텁**(로그만). 실 SMS 발송 로직 없음 → 옥토모로 대체해도 잃을 프로덕션 동작이 없다.

### 기존 모듈과 옥토모의 방향 차이 (핵심 제약)
- 기존 모듈 = **MT/OTP**: 서버가 코드를 **사용자에게 발송** → 사용자가 받은 코드를 **입력** → 해시 대조.
- 옥토모 = **MO**: 서버가 코드 발급 → 사용자가 **자기 폰 → 옥토모로 발송** → 서버가 도착 조회. **사용자가 입력하는 코드가 없다.**
- ⇒ 옥토모는 `send()` 어댑터에 그대로 못 끼운다. confirm 경로가 "입력 대조"에서 "도착 폴링"으로 바뀌므로, verification 모듈 내부를 **MO 코어로 전환**한다. (엔드포인트 셸·상태머신·TTL·시도제한·`phoneVerifiedAt` 세팅은 재활용)

---

## 2. Goal

- 회원가입(이메일 + 카카오) 완료 조건으로 **휴대폰 본인인증을 필수 강제**한다(hard-block).
- 모바일은 번호 입력 + 문자앱 딥링크, 데스크탑은 QR 스캔으로 옥토모 MO 인증을 수행한다.
- **alpha에서만** 실제 옥토모 연동이 동작한다(키가 있는 환경에서만). 로컬/CI는 dev fallback으로 안 깨진다.
- **기존(레거시) 미인증 계정**은 로그인/홈 진입 시 상시 **미인증 뱃지**를 노출하고 인증을 유도한다(soft nudge — 레거시는 강제 차단하지 않되 지속 유도).
- 회원가입 화면의 **UI/UX를 함께 개선**하고 라이브 스크린샷으로 시각검증한다.

---

## 3. Original Conditions (체크박스)

- [ ] 대상은 v1 스택(`apps/v1_api`/`apps/v1_web`)이며 alpha에서만 동작한다.
- [ ] 옥토모 MO 방식(사용자 발송 → 서버 도착 조회)으로 구현한다.
- [ ] 모바일: 번호 입력 후 문자 딥링크(`sms:`)로 발송, 데스크탑: 옥토모 QR 스캔.
- [ ] API Key는 **서버 전용**(브라우저 노출 금지), SSM → 컨테이너 env로 주입.
- [ ] 이메일·카카오 **둘 다** 적용, **인증 완료 전 계정 생성/완성 차단(hard-block)**.
- [ ] 레거시 미인증 계정은 로그인/홈에서 상시 미인증 뱃지 노출 + authed 인증 유도(soft nudge, 강제 차단 아님). 번호 변경도 authed 인증으로 재인증.
- [ ] 회원가입 UI/UX 개선 + 라이브 시각검증.
- [ ] DB 스키마 변경 시 migration 파일 동반(마이그레이션 규율).

---

## 4. 옥토모 API 레퍼런스 (구현 근거 — 실측)

- **Base**: `https://api.octoverse.kr/octomo/v1/public`
- **인증 헤더**: `Authorization: Octomo ${OCTOMO_API_KEY}` (서버에서만)
- **수신번호(옥토모 대표번호)**: `1666-3538` (딥링크/조회 대상)
- **엔드포인트 (server-to-server)**:
  1. `POST /message/exists` — body `{ mobileNum, text, withinMinutes }` → `{ exists: boolean }` (201). "이 번호에서 이 코드가 최근 N분(기본 5분) 내 도착했나".
  2. `POST /message/qr-code` — body `{ text, errorCorrectionLevel?('L'|'M'|'Q'|'H'), margin?(0~20), width?(100~1000) }` → `{ qrCode: "data:image/png;base64,..." }` (201). 서버가 `SMSTO:1666-3538:{text}` 딥링크를 QR PNG로 만들어 반환. `<img src>`에 그대로 사용.
- **공식 권고**: 인증코드는 추측 불가한 랜덤 문자열 + 짧은 TTL, API Key는 반드시 서버 프록시.
- 샘플 코드: `github.com/Octoverse-corp-official/octomo-sample-code` (front=Next.js, server=Node). `code-store`는 in-memory 평문 + 5분 TTL, `/api/auth/{issue-code,verify}` + `/api/qr` 3엔드포인트.

---

## 5. 아키텍처 — MO 코어 1개 + 진입점 2개

```
  ┌───────────────────────────────────────────────────────────┐
  │ OctomoClient (전역 fetch, 서버 전용 OCTOMO_API_KEY)          │
  │   messageExists(mobileNum, text, withinMinutes) -> boolean  │
  │   createQrCode(text, opts) -> dataUrl                        │
  └───────────────────────────────────────────────────────────┘
                              ▲
  ┌───────────────────────────┴───────────────────────────────┐
  │ PhoneVerificationService (MO 코어)                          │
  │   issue(phone, channel) -> { code, destNumber, qrCode?, exp}│ 코드 발급·저장(TTL5분)·시도제한
  │   checkArrived(phone) -> boolean                            │ 저장코드로 messageExists 폴링
  │   issueProofToken(phone) / verifyProofToken(token) -> phone │ pre-account 전달용 서명토큰
  └───────────────────────────┬───────────────────────────────┘
        ┌─────────────────────┴──────────────────────┐
   (a) 공개 진입 (비로그인)                    (b) authed 진입 (로그인 세션)
   이메일 회원가입 인라인용                     카카오 완성 + 온보딩/프로필용
   POST /auth/phone/issue   { phone, channel }  POST /verification/phone/request { phone, channel }
   POST /auth/phone/verify  { phone }           POST /verification/phone/confirm { phone }
     └ exists=true → proofToken 반환              └ exists=true → 현재 user.phoneVerifiedAt 세팅
   register()가 proofToken 소비 → phoneVerifiedAt
```

- **OctomoClient**: v1 관례대로 전역 `fetch` 사용(axios/HttpService 아님). `OctomoDisabledError`를 구분해 dev fallback 분기.
- **PhoneVerificationService**: verification 모듈 안에 두고, 기존 MT/OTP 내부를 이 MO 코어로 교체. 공개/authed 컨트롤러가 공유.
- 대표번호는 `OCTOMO_DEST_NUMBER=16663538`(env, 기본값 하드코드 fallback).

### 5.1 pre-account → register 연결 (이메일)
1. 공개 `/auth/phone/issue`가 코드 발급·저장(phone 키), 데스크탑이면 `qrCode` 포함 반환.
2. 사용자가 발송(모바일 딥링크/데스크탑 QR) 후 `/auth/phone/verify` 호출.
3. `checkArrived` true → **단명 서명 proof token** 발급: `HMAC(secret, phone|verifiedAt|exp≤10분)` (예: `V1_SESSION_SECRET` 파생 키). 무상태·변조 불가·1회성(register 소비 시 스토어에서 phone 코드 폐기).
4. `register()`가 body의 `phoneProofToken` 검증(서명·만료·phone 일치) → 통과해야만 `v1User.create({ ..., phone, phoneVerifiedAt: now })`. **토큰 없거나 무효면 400** → hard-block.

### 5.2 카카오 hard-block (authed)
- 카카오 콜백(`POST /auth/kakao`) 이후 세션이 생기고 프로필 완성(`POST /auth/social-profile`)에서 phone을 받는다.
- **social-profile 완성 시 `phoneVerifiedAt`가 없으면 거부(400)** → 인증 전엔 프로필 미완성 = 앱 진입 차단(hard-block).
- 인증은 authed 진입 `/verification/phone/{request,confirm}`으로 수행(세션 있으므로). 성공 시 현재 user에 `phoneVerifiedAt` 세팅 → 이후 social-profile 완성 통과.
- ※ 카카오가 사용자 레코드를 콜백 시점에 만드는지 social-profile 시점에 만드는지는 구현 계획 단계에서 코드로 확정하고, hard-block 지점(레코드 완성/활성화 조건)을 그에 맞춰 배치한다.

### 5.3 레거시 미인증 계정 상시 유도 (1급 요구) + 번호 변경
- **레거시(이 기능 이전 가입) 계정은 전부 `phoneVerifiedAt=null`** = 미인증. 이들은 **강제 차단(hard-block) 하지 않되**, **로그인/홈 진입 시 상시 "미인증 뱃지"를 노출**하고 authed 인증으로 유도한다(soft nudge).
  - 노출 위치: 로그인 직후 + 홈 상단 배너/뱃지. `me.phoneVerifiedAt == null`일 때 항상 표시(dismiss는 세션 한정, 재로그인/재진입 시 재노출).
  - CTA → authed `/verification/phone/*` 플로우(프로필 또는 인라인 모달). 인증 완료 시 뱃지/배너 즉시 사라짐(`['me']` invalidate).
- 온보딩·프로필의 authed 인증(`/verification/phone/*`)은 (a) 레거시 미인증 유도, (b) 번호 변경 시 재인증 용도로 유지.
- ※ 신규 가입(이메일·카카오)은 §5.1/§5.2대로 hard-block이라 정상 경로에선 미인증 계정이 생기지 않음 → 뱃지는 사실상 레거시 전용.

---

## 6. 백엔드 상세

### 6.1 신규 공개 엔드포인트 (비로그인, 이메일 pre-account)
- `POST /auth/phone/issue` — body `{ phone: /^\d{11}$/, channel: 'mobile'|'desktop' }` → `{ code, destNumber, qrCode?, expiresAt }`. `@Throttle`(IP+phone). desktop일 때만 옥토모 `qr-code` 호출(비용 절약).
- `POST /auth/phone/verify` — body `{ phone }` → `{ verified, proofToken?, expiresAt? }`. `@Throttle`(옥토모 exists 비용 방어). 저장코드 없음/만료 → `verified:false`.
- `register()` DTO에 `phoneProofToken?: string` 추가 → 필수 검증.

### 6.2 기존 authed 엔드포인트 (MO로 전환)
- `POST /verification/phone/request` (V1AuthGuard) — body `{ phone, channel }` → `{ code, destNumber, qrCode?, expiresAt }`. (기존 "OTP 발송"에서 "코드 발급·표시"로 의미 전환)
- `POST /verification/phone/confirm` (V1AuthGuard) — body `{ phone }` → `checkArrived` → true면 현재 user `phoneVerifiedAt` 세팅 → `{ verified }`. (기존 "입력코드 대조"에서 "도착 폴링"으로 전환. body에서 `code` 제거)
- email 채널은 현행 유지(범위 밖) 또는 그대로 둠.

### 6.3 코드 저장 (MO 특성)
- MO는 옥토모 `exists`에 **사용자가 보낸 원문 코드**를 넘겨야 하므로, `codeHash`(단방향)만으론 부족 → **코드 원문 보관** 필요.
- 방안: `V1VerificationToken`에 `codePlain`(또는 애플리케이션 레벨 대칭암호화) 컬럼 추가, TTL 5분·시도제한 유지. 마이그레이션 파일 동반.
- 코드 자체는 사용자가 공개적으로 SMS로 전송하는 값이라 기밀성 요구가 낮음(짧은 TTL로 재사용 방지). 선택적 at-rest 암호화는 하드닝으로 명시.

### 6.4 alpha 전용 게이트 & dev fallback
- 활성 조건: `OCTOMO_API_KEY` 존재(= alpha에만 주입). 부재 시 `OctomoClient`는 **dev fallback**:
  - `messageExists` → `V1_VERIFICATION_DEV_ECHO==='true'`면 코드 표시 + 자동 통과(로컬/CI). 그 외엔 명시적 실패.
  - `createQrCode` → 로컬에서도 클라가 `SMSTO:` 문자열로 자체 QR 생성 가능(라이브러리) 하거나, dev용 placeholder.
- 프로덕션(`apps/api`)엔 이 코드가 배포되지 않으므로 자연 차단. v1이라도 키 없으면 실동작 안 함 = "alpha에서만".

### 6.5 설정 주입 (SSM → 컨테이너, 4단계)
1. `deploy-alpha.yml` job env: `OCTOMO_API_KEY: ${{ secrets.OCTOMO_API_KEY }}`, `OCTOMO_DEST_NUMBER`(옵션).
2. SSM Run Command 인라인 env로 전달(`deploy` 스텝).
3. `deploy-alpha.sh` → 서버 `deploy/.env`(상주) 반영.
4. `deploy/docker-compose.prod.yml`의 `v1_api environment`에 `OCTOMO_API_KEY: ${OCTOMO_API_KEY:-}` 매핑. `deploy/.env.prod.example`에 문서화.
- **운영자 수동**: GitHub Actions secret `OCTOMO_API_KEY` 실제 등록(마이페이지 발급 키).

---

## 7. 프론트엔드 상세 (UI/UX)

### 7.1 기기 분기 플로우
- **모바일**: 폰번호 입력 → "인증문자 보내기"(딥링크) → 문자앱 프리필(수신 `16663538`, 본문=코드) → 전송 → "인증 확인"(verify 폴링) → 완료.
- **데스크탑**: 폰번호 입력 → 옥토모 QR 표시 → 폰카 스캔 → 문자앱 프리필 → 전송 → "인증 확인" → 완료.
- 공통 상태: 코드 표시/복사, 남은 시간(5분 카운트다운), 재발급, 실패/재시도, 성공 배지. `prefers-reduced-motion`·다크모드·44px 터치·`aria-*` 준수.

### 7.2 배치
- 이메일: `signup-client.tsx` 폼에 인증 스텝 인라인(제출 게이트). 성공 시 proofToken을 register에 포함.
- 카카오: `social-signup-client.tsx`(social-profile 완성)에 authed 인증 스텝.
- 온보딩/프로필: authed 인증(레거시 유도·번호 변경).
- **미인증 뱃지/배너**: 로그인 직후 + 홈 상단에 `me.phoneVerifiedAt==null` 조건 상시 노출(컬러+아이콘+텍스트 병행, 44px, `aria-*`). 공유 컴포넌트 `components/auth/phone-verification/unverified-badge.tsx` + 홈 배너. CTA → authed 인증 모달/프로필.
- 공유 컴포넌트: `components/auth/phone-verification/`(모바일·데스크탑 뷰 + 상태머신 훅) 신설. 훅: `usePhoneIssue`, `usePhoneVerify`(공개/authed 변형).

### 7.3 회원가입 UI/UX 개선 + 시각검증
- 프로덕션 fidelity 목업(A·B·C안 + 추천, 실제 디자인시스템 토큰·컴포넌트) — 브레인스토밍 후속에서 lazyweb 레퍼런스 조회 + 목업 리포트.
- 구현 후 **v1 스택 라이브 Playwright 스크린샷**(mobile 390/tablet 768/desktop 1440)으로 before/after 시각검증(프로젝트 런북 `docs/ops/pr-review-visual-workflow.md`).

### 7.4 sms: 딥링크 크로스플랫폼 (구현 위험)
- iOS/Android가 `sms:` 본문 파라미터 문법이 다름(iOS `sms:번호&body=`, Android `sms:번호?body=`). 플랫폼 감지 분기 + "코드 복사 후 수동 전송" fallback 제공. 데스크탑 QR(`SMSTO:`)은 광범위 지원.

---

## 8. 데이터 플로우 (이메일 데스크탑 예)

```
User → Web: 폰번호 입력, "QR 발급"
Web  → API: POST /auth/phone/issue { phone, channel:'desktop' }
API  → Octomo: POST /message/qr-code { text:code }   (+ 코드 저장 phone→code, TTL5분)
API  → Web: { code, destNumber, qrCode(dataUrl), expiresAt }
Web  → User: QR 표시
User → 폰: QR 스캔 → 문자앱(16663538, 본문=code) → 전송(MO)
User → Web: "인증 확인"
Web  → API: POST /auth/phone/verify { phone }
API  → Octomo: POST /message/exists { mobileNum:phone, text:code, withinMinutes:5 }
Octomo→ API: { exists:true }
API  → Web: { verified:true, proofToken }
Web  → API: POST /auth/register { ...fields, phoneProofToken }
API  → API: proofToken 검증 → v1User.create({ phone, phoneVerifiedAt:now })
```

---

## 9. Error Handling

- 옥토모 5xx/타임아웃 → 502 매핑, 사용자에게 "잠시 후 다시" 해요체 토스트, 코드/타이머 유지(재시도 가능).
- exists=false(아직 미도착) → "아직 문자가 확인되지 않았어요" + 재확인 유도(자동 폴링 소프트).
- 코드 만료 → 재발급 CTA.
- 시도 초과(5회) → 쿨다운 안내.
- proofToken 무효/만료 → register 400 → 인증 스텝으로 복귀.
- `extractErrorMessage(err, fallback)` 사용, fallback 해요체.

---

## 10. Security Notes (production/secret/auth 플래그 대응)

- **API Key 서버 전용**: 클라 노출 절대 금지, 프록시. `NEXT_PUBLIC_*`에 넣지 않음.
- **공개 엔드포인트 하드닝**: `/auth/phone/*`은 비로그인 → IP+phone `@Throttle`, 옥토모 호출(비용) 폴링 상한, phone 형식 검증.
- **proof token**: 서명(HMAC)·단명(≤10분)·phone 바인딩·register 시 1회성 폐기.
- **번호 중복**: `phone @unique` 유지 → 한 번호 = 한 계정. issue 시 타계정 인증완료 번호면 안내.
- **코드 저장**: 짧은 TTL, 선택적 at-rest 암호화, 사용 후 폐기.
- **CSRF/세션**: authed 진입은 기존 v1 세션 쿠키 체계 그대로.
- **로그**: 코드/키/토큰 원문 로그 금지.

---

## 11. Test Scenarios (변경 규모 비례 — 진짜 테스트만)

**백엔드 (Jest, fetch mock)**
- OctomoClient: exists T/F, 5xx→에러, 키 없음→`OctomoDisabledError`, qr-code 정상.
- PhoneVerificationService: 코드 발급·저장·TTL 만료, 시도제한, checkArrived(도착/미도착), proof 발급/검증/변조 거부/만료 거부.
- 공개 컨트롤러: issue/verify 성공·실패, `@Throttle` 초과 429.
- register: 유효 proofToken→`phoneVerifiedAt` 세팅, 무효/누락→400(hard-block), phone 불일치 거부.
- authed confirm: 성공 시 현재 user 세팅.
- dev fallback: `V1_VERIFICATION_DEV_ECHO` 자동 통과 경로.

**프론트 (Vitest + MSW)**
- 인라인 스텝: 모바일 딥링크 구성/데스크탑 QR 렌더, verify 성공→register 진행, 실패 상태, 만료 재발급, 카운트다운.
- register 게이트: proofToken 없으면 제출 불가.
- 미인증 뱃지: `me.phoneVerifiedAt==null`이면 로그인/홈에서 노출, 인증 완료(`!=null`) 시 미노출. dismiss 후에도 재진입 시 재노출.

**시각검증 (라이브)**
- v1 스택 기동 후 Playwright로 회원가입(이메일/카카오) mobile/tablet/desktop 캡처, before/after 인라인 보고.

**Mock/Fixture 업데이트**
- register DTO 변경에 따른 inline mock·MSW 핸들러 동기화(Mock Data Discipline).

---

## 12. Parallel Work Breakdown

- **Infra ⟂**: `deploy-alpha.yml`/`deploy-alpha.sh`/`docker-compose.prod.yml`/`.env.prod.example` 4단계 OCTOMO env + `docs/ops/octomo-setup.md`.
- **Backend-data ⟂**: `V1VerificationToken` 마이그레이션(code 원문 컬럼), PhoneVerificationService MO 전환, OctomoClient.
- **Backend-api (순차, data 이후)**: 공개 `/auth/phone/*`, register DTO/게이트, authed confirm 전환, social-profile 게이트.
- **Frontend-data ⟂**: `usePhoneIssue`/`usePhoneVerify` 훅, register 훅 proofToken.
- **Frontend-ui (순차, data 이후)**: 공유 인증 컴포넌트(모바일/데스크탑), 이메일·카카오·온보딩·프로필 배치, 회원가입 UI/UX 개선.
- **QA/시각검증 (최후)**: 라이브 스크린샷 + 페르소나 플로우.

---

## 13. Acceptance Criteria

- alpha에서 이메일·카카오 가입 모두 **인증 없이는 계정 완성 불가**(hard-block).
- 레거시 미인증 계정은 로그인/홈에서 미인증 뱃지가 상시 노출되고, 인증 완료 시 사라진다.
- 모바일 딥링크·데스크탑 QR 양 경로로 실제 옥토모 MO 인증 성공.
- API Key 클라 미노출(네트워크·번들 확인).
- 로컬/CI는 dev fallback으로 그린(옥토모 키 없이 테스트 통과).
- 회원가입 UI/UX 개선 before/after 라이브 스크린샷 첨부.
- migration replay + drift gate 통과, tsc 0, 타깃 테스트 통과.

---

## 14. Tech Debt Resolved

- 동작 안 하던 `verification-dispatcher` 스텁을 실제 provider(옥토모) 연동으로 대체(범위 내 부채 해소).
- 지금까지 "평문 수집만 하고 인증 안 하던" `phone` 필드를 실제 검증 상태(`phoneVerifiedAt`)로 승격.

---

## 15. Risks & Dependencies

- **옥토모 외부 의존**: 다운/쿼터/요율 → 폴링 상한·타임아웃·재시도 UX로 완화. 키·쿼터 확인 필요.
- **MO UX 생소함**: "사용자가 문자를 보낸다"는 흐름을 안내 카피로 명확히(대표번호·본문 그대로 전송).
- **sms: 딥링크 크로스플랫폼 차이**(7.4) — 플랫폼 분기 + 수동 fallback.
- **카카오 hard-block 지점**: 레코드 생성 타이밍을 구현 계획에서 코드로 확정(§5.2 주).
- **DB 마이그레이션 규율**: 코드 원문 컬럼 추가 시 migration 파일 필수(Critical).
- **공개 엔드포인트 남용/비용**: rate limit 필수.

---

## 16. Ambiguity Log

- (해소) 대상 스택 = v1/alpha. — 사용자 확인.
- (해소) 필수/집행 지점 = 이메일·카카오 **둘 다 hard-block**. — 사용자 확인.
- (해소) 인증 시점 = 인라인(가입 중, 신규) + 레거시 미인증 계정 상시 유도(로그인/홈 뱃지, soft nudge). — 사용자 확인.
- (미해소, 구현 계획서 확정) 카카오 사용자 레코드 생성/완성 타이밍과 정확한 hard-block 후크 위치.
- (미해소, 구현 계획서 확정) 코드 저장 방식(평문 vs at-rest 암호화)의 최종 선택.
- (미해소, 후속) 회원가입 UI/UX 개선 목업 A·B·C안(lazyweb 레퍼런스 기반).
