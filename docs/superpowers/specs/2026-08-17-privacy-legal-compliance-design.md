모든 인용 사실 검증이 끝났다. 수정본 전문을 반환한다.

---

# 개인정보 보호 정합 (Privacy & Legal Compliance)

- 상태: 설계 초안 v2 (2026-08-17, 적대적 리뷰 13건 반영) — 리그전 스펙과 **병행 진행** (사용자 확정)
- 근거 기획 문서: `Teameet_app_v1_팀관리_대회운영_상세기획서_2026-07-28` §13.2(보안/개인정보)·§13.4(예외 흐름), `팀밋 상대평가 기능정의서 2026-08-12` §11(익명성)
- 기준 커밋: `36cbf281` (origin/dev)
- 관련 스펙: `2026-08-17-tournament-league-format-design.md` (병행 트랙 — 스키마 마이그레이션 시점 조율 필요, §8.1)
- **법적 성격 고지**: 이 문서는 확정 법률 자문이 아니다. 법령 언급은 전부 "법무 검토가 필요한 항목"의 식별이며, 조문 번호는 적지 않는다(§10.1).

## 1. 배경

약관·동의서는 사용자에게 파기·보관기간·노출 경계를 약속하고 있는데, 코드는 그 약속의 상당 부분을 이행하지 않는다. 이 갭은 기능 결함이 아니라 **실사용 데이터 위에 누적되는 법적 노출**이다 — 하루가 지날수록 "약속과 다르게 처리한 기간"이 길어진다. 이 스펙은 ① 현행 실태를 코드 증거로 박제하고 ② 파기 자동화·노출 축소·동의 정합의 설계를 확정하며 ③ 법무 검토가 필요한 항목을 개발 착수 전 질문 목록으로 분리한다.

동시에 이 스펙이 다루는 파기는 **비가역**이다. 약속 이행(파기)과 약속 이행(분쟁 대응 보관)이 서로 충돌하는 지점이 있으므로, "지운다"만큼 "지우면 안 되는 조건(hold)"을 대상 선정에 1급 개념으로 넣는다(§5.1.3, §5.1.2-③).

### 1.1 현행 실태 — PII 저장 인벤토리 (2026-08-17 실측)

| 테이블 | PII 컬럼 | 비고 | 증거 |
|---|---|---|---|
| `V1User` | `email`(unique), `phone`(unique) | 계정 원본 식별자 | `schema.prisma:507-511` |
| `V1UserProfile` | `nickname`, `gender`, `birthDate`, `realName`, `displayName`, `bio`, `profileImageUrl` | 가입 시 **필수 수집은 `phone`(11자리)·`birthDate`(YYYYMMDD)·`gender` + "이름 1개"** — `realName`은 `@IsOptional`이고, 검증기 `IsValidSignupName`은 `realName` **또는** `displayName` 중 하나만 있으면 통과한다. 즉 **실명 없이 표시명만으로 가입 가능**하다 | `schema.prisma:663-684`, `auth/dto/required-signup-profile.dto.ts:3-15`(이름 택1 검증기), `:26-29`(`realName` optional), `:34-43`(phone/birthDate/gender 필수) |
| `V1TournamentPlayer` | `realName`(필수 not-null), `birthDateSnapshot`, `genderSnapshot`, `eligibilityNote`(운영 심사메모) | 대회 로스터 — 3년 보관 약속의 주 대상. **가입과 달리 로스터에서는 실명이 필수** — 가입 실명 선택과 혼동 금지 | `schema.prisma:2218-2226` |
| `V1TournamentRegistration` | `depositorName`(입금자명), 동의 4종 boolean | 초상권 동의가 **팀 단위 boolean 1개** | `schema.prisma:2178-2217` (`agreedMediaConsent:2188`) |
| `V1GameSide` / `V1GameParticipant` / `V1ScheduleGuestApplication` | `displayNameSnapshot` | 경기 기록용 **불변 표시명 스냅샷** — 라이브 조인 없음 | `schema.prisma:2564, 2639, 3015` |
| `V1Inquiry` | `guestEmail`, `guestPhone`, `contact` | **원본 그대로** 저장 (마스킹 없음). `relatedType`/`relatedId`로 대회·registration·결제에 연결 가능, `status`/`closedAt`으로 완결 판정 가능 — **잡 B의 hold 판정에 사용**(§5.1.3) | `schema.prisma:1864-1888` (`relatedType/relatedId:1873-1874`, `closedAt:1876`), enum `V1InquiryStatus:282-287`, `V1InquiryRelatedType:289-297` |
| `V1SmsEventLog` | `phoneMasked` (끝 4자리만) | 설계상 마스킹 — 양호 | `schema.prisma:1701-1707` (주석 포함) |
| `V1PhoneVerificationChallenge` | `phone`(원본, unique) | 가입 전 인증 — 만료 후에도 row 잔존 | `schema.prisma:632-641` |
| `V1VerificationToken` | `target`(원본 phone/email) | 소비 후에도 row 잔존 | `schema.prisma:615-630` |

### 1.2 노출 표면 실태

| 표면 | 실태 | 증거 |
|---|---|---|
| **공개 대회 기록 (라인업/득점자/MVP)** | 참가자 실명 스냅샷이 **동의·계정연동 여부와 무관하게 항상 공개** (2026-08-13 오너 결정, 게스트·탈퇴자 포함). 정책 근거·롤백 경로가 코드 주석으로 박제됨 | `public-tournament-records.service.ts:772-805` |
| **롤백 스위치** | `V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE=true` 설정 + 프로세스 재시작 시 이전 Task 24 동의 게이팅으로 복귀 — 켜면 `loadParticipantConsentEligibility` 조회가 되살아나고(`:394-397`) 이름 공개 판정이 "스태프 우회 OR 동의 eligible"로 좁혀진다. 스위치 동작은 spec으로 검증돼 있음 | `public-tournament-records.service.ts:803-805`, `public-tournament-records.service.spec.ts:384-443`, `public-tournament-records.schedule-scorers.spec.ts:215-216` |
| **동의 게이팅 엔진 (여전히 살아있음)** | `projectParticipantForPublic` — 공개 shape에 `realName` 원천 배제, ACTIVE 연동 + GRANTED 동의 시에만 nickname. **다른 두 소비자**(개인 기록 `public-user-records.service.ts`, 팀매치 시리즈 `team-match-series-public.service.ts`)는 지금도 이 게이팅을 유지 — 대회 기록 route만 정책 공개로 우회 | `participant-projection.ts:8-41`, `public-tournament-records.service.ts:798-801` (주석) |
| **팀원 대상 로스터 조회** | `listPlayers`가 `assertTeamMember`(일반 member 등급)만 통과하면 `serializePlayer`로 `realName`+`birthDateSnapshot`+`genderSnapshot`+**`eligibilityNote`(운영 심사메모)** 전부 반환 | `tournament-players.service.ts:153-172` (게이트), `:777-789` (serialize) |
| **어드민 CSV export** | `realName,birthDate,gender,eligibility,nickname` — 어드민 게이트(`getActiveAdmin`, support 등급 포함) 뒤 | `tournament-players.service.ts:489-526` |
| **사용자 단위 기록 동의** | `V1UserRecordConsent` opt-in 기본(row 없으면 미동의), `granted=false` 즉시 전체 비공개 | `profile.service.ts:660-684`, `schema.prisma:2714` |

### 1.3 동의서·약관이 약속한 것

| 약속 | 출처 |
|---|---|
| 대회 개인정보 이용 목적 **10개**: ①참가 신청 접수 ②참가자 확인 ③참가 자격 검토 ④선출·비선출 구분 ⑤참가비 입금 확인 ⑥경기 운영 ⑦실격·제재 관리 ⑧대회 안내 ⑨분쟁 대응 ⑩부정·대리 참가 확인 — **"기록·명단의 대외 공개 게시"는 없음** | `prisma/migrations/20260722090000_v1_managed_terms_v11_baseline/migration.sql:560-585` (tournament_privacy v1.1 본문) |
| 대회 PII 보관: **대회 종료 후 최대 3년**. 단 **"분쟁·사고·부정참가·환불·정산 대응이 필요한 경우 해당 사유 종료 시까지 보관"** — 즉 3년은 절대 만료가 아니라 **사유 미해소 시 연장되는 기간**이다. 잡 B는 이 연장 조항을 hold 조건으로 그대로 구현한다(§5.1.3) | 같은 문서 "3. 보유 및 이용 기간" |
| 서비스 개인정보: 목적 달성 후 **지체 없이 파기** / **회원 탈퇴 시까지**, 단 부정이용·분쟁 대응 **탈퇴 후 최대 1년** | `apps/v1_web/src/components/auth/terms-client.tsx:599-604` |
| 문의·신고 처리 기록 처리 완료 후 최대 3년 / **부정 이용·제재 기록: "서비스 질서 유지 및 재가입 방지를 위해 최대 3년"** — 재가입 방지가 명시적 보관 목적이다. 파기(식별자 마스킹)와 정면 충돌하는 지점 — §5.1.2-③·§10.1-L7 | `terms-client.tsx:606-616` |
| **만 14세 미만 가입 불허**, 법정대리인 미동의 가입 확인 시 계정 제한·삭제. 수집 항목에 "만 14세 이상 여부" 명시 | `terms-client.tsx:618-622`, `:459` |
| 위치정보: 목적 달성 후 지체 없이 파기 (직접 설정한 활동 지역은 탈퇴/삭제 시까지) | `terms-client.tsx:544` |
| (기획) 대회 roster 실명·생년월일·성별·휴대폰은 **자격 검토 관리자만** 조회, 현장 운영자는 표시명/등번호/자격여부만. public cache에 phone/birthDate/eligibilityNote/operator memo 절대 금지 | 문서02 §13.2 |
| (기획) 선수 탈퇴/계정 삭제 시 **공식 기록은 display snapshot 유지**, 공개 profile link는 privacy policy 따라 제거 | 문서02 §13.4 |

### 1.4 탈퇴·파기의 코드 실태

- **사용자 탈퇴 신청** = `accountStatus: 'withdrawal_pending'` 플래그(`profile.service.ts:720`) + 팀 멤버십 `left` + 진행 중 대회 로스터 정리 + `V1StatusChangeLog`에 `toStatus='withdrawal_pending'` 기록(`profile.service.ts:757`). **PII는 한 글자도 지우지 않는다** (`profile.service.ts:689-777`).
- **`withdrawal_pending` → `deleted` 자동 전이는 없다.** 유일한 전이 경로는 어드민 수동 삭제다.
- **어드민 수동 삭제**(`admin.service.ts:297-412`)는 **유저 1명 전체가 단일 `$transaction`** 안에서 처리된다(`:299-399` — 잠금·검증·마스킹·감사 로그까지 한 트랜잭션, 소켓 강제 종료만 커밋 후 별도 `:405-409`). 내용: `email`/`phone` 결정론적 마스킹(`buildDeletedEmail/Phone`, `:336-337`), auth identity unlink + `providerUserKey`/`passwordHash` 스크럽(`:344-361`), profile의 `nickname`/`displayName`/`realName`/`bio`/`profileImageUrl` 마스킹("탈퇴 회원", `:362-372`), 감사 로그 `personalDataMasked: 'true'`(`:391`). **그러나 손대지 않는 것**: `V1UserProfile.gender`/`birthDate`(`:362-372` 마스킹 목록에 없음 — 실측), `V1TournamentPlayer`의 realName/birthDateSnapshot/eligibilityNote, `V1Inquiry`, `V1VerificationToken.target`, `V1PhoneVerificationChallenge.phone` (push 구독·검색 이력의 스크럽 여부는 미확인 — `detachUserFromActiveCommitments` 내부 미정독). **이 잔여 범위는 §5.1.2에서 어드민 경로·잡 경로가 공유하는 단일 helper로 통합해 해소한다.**
- **파기 cron은 0건.** `jobs/`에는 lineup-reminders / result-escalation / schedule-reminders / game-operations-worker뿐 (디렉터리 실측).
- **로스터 정리 원칙**: 완료·취소된 대회는 기록 보존을 위해 의도적으로 제외 (`roster-cleanup.ts:24-27`) — 문서02 §13.4의 "display snapshot 유지" 원칙과 일치.
- **잡 인프라 선례**: 이 레포는 `@nestjs/schedule`을 쓰지 않는다. 별도 워커 프로세스(`v1-game-operations-worker.main.ts`, 포트 8122)가 250ms outbox 폴링 루프를 돌고, 주기 스캔이 필요한 라인업 리마인더는 **"스캔 한 번이 끝날 때 다음 스캔을 outbox 행으로 예약"하는 self-rescheduling 체인**으로 구현돼 있다(`v1-game-operations-worker.main.ts:52-62`). 파기 잡도 이 패턴을 재사용한다(§5.1).
- **상태 전이 로그의 커버리지 한계**: `V1StatusChangeLog`(`schema.prisma:1843`) 기록은 `logAdminAction`이 `toStatus`를 받았을 때(`common/admin-context.service.ts:86-99`)와 사용자 탈퇴 신청(`profile.service.ts:757`) 경로에서만 생성된다. **시드·수동 SQL·로그 도입 이전 전이로 completed가 된 대회는 로그 행이 없다** — 잡 B의 종료 시각 파생에 결측 fallback이 필요한 이유다(§5.1.3-②).
- **연령 게이트**: 가입 DTO는 `birthDate`의 **달력 유효성만** 검증한다(`required-signup-profile.dto.ts:17-23, 50-59`). auth/onboarding 전체에 만 14세·guardian 검증 코드 0건 (grep 실측). 즉 **데이터는 이미 있는데 게이트만 없다.**

## 2. 갭 표 — 약속 vs 코드

| # | 약관·문서가 약속한 것 | 코드가 실제로 하는 것 | 심각도 |
|---|---|---|---|
| G1 | 탈퇴 시 지체 없이 파기, 부정이용 대응 최대 1년 보관 (`terms-client.tsx:599-604`) | `withdrawal_pending` 플래그만. 자동 파기·1년 상한 전이 없음. 어드민이 수동 삭제하지 않으면 **무기한 보관** | P1 |
| G2 | 대회 PII 대회 종료 후 최대 3년, **사유(분쟁·환불·정산 등) 미해소 시 연장** (`migration.sql` tournament_privacy) | 3년 만료 파기도, 연장 사유 관리도 없음. `V1TournamentPlayer` PII 영구 보존 | P1 |
| G3 | 이용 목적 10개 (공개 게시 없음) | 실명 스냅샷을 공개 웹에 상시 게시 (`public-tournament-records.service.ts:772-805`) — **동의 범위 밖 처리 가능성** | P1 |
| G4 | roster 실명·생년월일은 자격검토 관리자만, operator memo 노출 금지 (문서02 §13.2) | 일반 팀원 전원에게 `birthDateSnapshot`·`genderSnapshot`·`eligibilityNote` 반환 (`tournament-players.service.ts:153-172, 777-789`) | P2 |
| G5 | 만 14세 미만 가입 불허 + "만 14세 이상 여부" 수집 명시 (`terms-client.tsx:459, 618-622`) | 연령 검증 코드 0건. 만 14세 미만도 가입 가능 | P2 |
| G6 | (관행) 초상권은 개인 동의 | `agreedMediaConsent`는 신청자 1인이 registration 1건에 체크하는 팀 단위 boolean (`schema.prisma:2188`) | P2 |
| G7 | 문의 기록 처리 완료 후 최대 3년 | `V1Inquiry.guestPhone/guestEmail` 원본 무기한 보존 | P2 |
| G8 | 인증 정보는 목적 달성 후 파기 취지 | `V1VerificationToken.target`·`V1PhoneVerificationChallenge.phone` 소비/만료 후에도 잔존 | P3 |
| G9 | 위치정보 목적 달성 후 파기 (`terms-client.tsx:544`) | **미확인** — `V1UserRegion` 파기 경로는 이번 조사 범위 밖 (파기 잡 구현 시 인벤토리에 포함해 확인) | 미확인 |
| G10 | 부정 이용·제재 기록 최대 3년 보관 = **재가입 방지 목적** (`terms-client.tsx:616`) | 재가입 연결 수단 자체가 없음. 그리고 이번 파기 설계가 순진하게 email/phone을 마스킹하면 **재가입 방지 수단을 스펙이 스스로 없애게 된다** — 설계에서 분기 처리(§5.1.2-③) | P2 |

공개 payload 자체의 위생은 양호하다: public-records 디렉터리 전체에 birthDate/phone/eligibilityNote 참조 0건(조사 결과, grep 실측), SMS 로그는 마스킹 저장 — 문제는 "공개 API에 새는 것"이 아니라 **"약속한 파기를 안 하는 것"과 "실명 공개의 동의 근거"** 두 축이다.

## 3. 목표 / 비목표

### 목표
1. **파기 자동화**: 탈퇴 유예 만료 파기 + 보관기간(3년) 만료 파기를 무인 잡으로 이행한다. 공식 경기 기록의 display snapshot은 보존하고 개인 식별자만 제거한다(문서02 §13.4). **약관의 보관 연장 조항(분쟁·환불·정산 미해소)을 hold 조건으로 함께 구현한다** — 파기 잡이 약관의 다른 조항을 위반하지 않게.
2. **실명 공개 정합**: 동의서 문구와 처리 실태를 일치시킨다 (동의 목적 추가를 권고, §5.2).
3. **미성년자 게이트**: 만 14세 미만 가입 차단을 코드로 이행한다.
4. **PII 노출 범위 축소**: 팀원 전체에게 내려가는 생년월일·심사메모를 역할 기반으로 좁힌다.
5. 위 전부를 **되돌릴 수 없는 삭제에 대한 다층 안전장치**(dry-run 기본 → 리포트 → run 단위 승인 → 단계 롤아웃 → 유저 단위 원자성) 위에서 수행한다.

### 비목표
- 데이터 이동성(내 정보 다운로드)·열람권 셀프서비스 API — 후속 과제
- 공개 기록 실명 정책 자체의 번복 (오너 결정 존중 — 정합만 맞춘다)
- 리뷰(상대평가) 시스템의 익명성 개편 (최소표본 게이트 등) — 평가 재설계 트랙(4단계)의 소관
- 채팅 메시지·업로드 자산의 보관기간 정책 수립 — 인벤토리에만 기록, 파기 규칙은 법무 검토 후
- Toss 결제·정산 기록 파기 — 법정 보존 의무 확인 전 손대지 않는다(§10.1-L3)

## 4. 확정된 설계 결정

> 이 표에는 **이 스펙이 확정하는 결정만** 넣는다. 법무·사용자 게이트가 필요한 항목(실명 공개 정합 방향, 탈퇴 유예기간 길이, 3년 만료 시 realName 처분, 제재 이력 보유자의 파기 유예 방식)은 **전부 §10 미결**에 있다 — 미확정을 확정 표에 넣지 않는다.

| ID | 항목 | 결정 | 근거 |
|---|---|---|---|
| P-1 | 진행 방식 | 리그전과 **병행** | 사용자 확정 |
| P-2 | 파기 잡 실행 기반 | 게임 운영 워커의 **self-rescheduling outbox 스캔 체인** 재사용 (제2 스케줄러 도입 금지) | 라인업 리마인더 선례 `v1-game-operations-worker.main.ts:52-62` — 재시작 멱등·체인 자가복구 이미 검증됨 |
| P-3 | 파기 범위의 단일 소스 | **전체 파기 범위(기존 어드민 마스킹 + §5.1.2 확장분)를 공용 helper 하나(`purgeUserPii`)로 통합**하고, 어드민 수동 삭제와 잡 A가 **같은 helper를 호출**한다. "잡 전용 추가분" 개념은 두지 않는다 — 두 경로의 범위가 다르면 어드민 경로로 삭제된 유저의 잔여 PII(gender/birthDate/대회 스냅샷)가 영구 사각이 되기 때문(어드민 삭제 즉시 `accountStatus='deleted'`가 되어 잡 A 후보에서 빠진다). 기존에 이미 수동 삭제된 유저는 **백필 스캔**으로 소급 처리(§5.1.2-④) | `admin.service.ts:362-372` 실측(현행 수동 삭제가 gender/birthDate/대회 스냅샷을 안 지움) + 기술부채 원칙 1 |
| P-4 | 유저 파기의 원자성 | **유저 1명 파기 = 단일 `$transaction`** (helper 전 범위 + `V1PrivacyPurgeItem` 기록 + `accountStatus='deleted'` 전이까지 전부 한 트랜잭션, 상태 전이는 트랜잭션 **마지막** 쓰기). 부분 실패로 "상태만 deleted이고 PII는 남은" 유저가 생기는 경로를 구조적으로 차단 | 어드민 수동 삭제의 기존 단일 트랜잭션 패턴(`admin.service.ts:299-399`)과 동일 원칙. §7.2-⑤ 크래시 시나리오로 검증 |
| P-5 | LIVE 게이트 | **2중 게이트 단일 정의**: ① env `V1_PRIVACY_PURGE_ENABLED=true`(LIVE 능력 자체의 활성화 — 환경 단위) ② **run 단위 사전 승인 레코드**(`V1PrivacyPurgeApproval` — 어드민이 특정 dry-run 리포트를 보고 그 kind+cutoff에 대해 생성, LIVE run이 1회 소비). 둘 다 충족해야 실삭제. 상세 §5.1.5 | 비가역 삭제의 발동 조건이 문서마다 다르게 읽히면 안 되므로 이 표·§5.1.5·§6이 전부 이 정의 하나를 참조한다 |
| P-6 | 스키마 변경 | 신규 테이블 3개(run/item/approval) + enum 3종 + 기존 컬럼 변경 0을 **단일 마이그레이션**으로 | drift gate 재핀 1회 (§8.1) |
| P-7 | 파기 건수의 진실 소스 | **`V1PrivacyPurgeItem`이 단일 진실.** `V1PrivacyPurgeRun.purgedCount`·`report`는 run 종료 시 Item 집계에서 **파생 기록되는 캐시**이며, 불일치 시 Item이 우선한다. Item insert는 해당 파기 UPDATE와 **같은 트랜잭션**(P-4)이므로 원장-실데이터 불일치는 구조적으로 불가능 | 같은 사실의 3중 저장이 부분 실패 시 자기모순을 내는 문제의 해소 |
| P-8 | 감사 원장 보관기간 | `V1PrivacyPurgeRun`/`V1PrivacyPurgeItem`은 **run 종료 후 3년 보관** 후 `LEDGER_SWEEP` kind의 정규 파기 대상이 된다. 보관기간 내에는 불변(UPDATE/DELETE 금지) | 파기 이행의 증적이 분쟁 대응 창구(약관상 3년, `terms-client.tsx:606-616`)보다 먼저 사라지면 안 된다. 자기 삭제도 별도 kind로 정규 파기 흐름에 태워 "제4의 비공식 파기"를 만들지 않는다 |

## 5. 상세 설계

### 5.1 개인정보 파기 자동화

#### 5.1.1 데이터 모델 (마이그레이션 `20260817xxxxxx_v1_privacy_purge` 1개)

```prisma
enum V1PrivacyPurgeKind {
  WITHDRAWAL_EXPIRY   // 잡 A: 탈퇴 유예 만료
  RETENTION_EXPIRY    // 잡 B: 보관기간(3년) 만료
  TOKEN_SWEEP         // 잡 C: 인증 토큰 스윕
  LEDGER_SWEEP        // 잡 D: 파기 원장 자체의 3년 만료 (P-8)
}

enum V1PrivacyPurgeMode {
  DRY_RUN
  LIVE
}

enum V1PrivacyPurgeRunStatus {
  PENDING
  COMPLETED
  FAILED
  SKIPPED
}

/// 파기 실행 단위 감사 레코드. PII 자체는 절대 담지 않는다 — 대상 row id·건수·기준만.
/// purgedCount/report 는 run 종료 시 items 집계에서 파생되는 캐시다 — 불일치 시 items 가 진실 (P-7).
model V1PrivacyPurgeRun {
  id             String    @id @default(uuid())
  kind           V1PrivacyPurgeKind
  mode           V1PrivacyPurgeMode
  cutoffAt       DateTime  @map("cutoff_at")        // 이 시각 이전 대상만
  candidateCount Int       @map("candidate_count")
  purgedCount    Int       @default(0) @map("purged_count")
  heldCount      Int       @default(0) @map("held_count")    // hold 조건으로 skip 된 건수 (§5.1.2-③, §5.1.3-①)
  failedCount    Int       @default(0) @map("failed_count")  // 유저/row 단위 실패 건수 — 다음 run 재시도 대상
  status         V1PrivacyPurgeRunStatus @default(PENDING)
  report         Json                                // 테이블별 건수 + hold 사유별 건수 + cutoff 판정 불가 건수
  approvalId     String?   @map("approval_id")       // LIVE run 이 소비한 승인 레코드 (DRY_RUN 은 null)
  startedAt      DateTime  @default(now()) @map("started_at")
  finishedAt     DateTime? @map("finished_at")

  approval V1PrivacyPurgeApproval? @relation(fields: [approvalId], references: [id], onDelete: SetNull)
  items    V1PrivacyPurgeItem[]

  @@index([kind, startedAt])
  @@map("v1_privacy_purge_runs")
}

/// 개별 파기 항목 원장 — "무엇을 언제 지웠나"의 증적 (row id 만, 값은 없음).
/// 보관기간(3년, P-8) 내 불변 — UPDATE/DELETE 금지, 만료 후 LEDGER_SWEEP 으로만 정리.
model V1PrivacyPurgeItem {
  id        String   @id @default(uuid())
  runId     String   @map("run_id")
  tableName String   @map("table_name")
  rowId     String   @map("row_id")
  action    String                       // MASKED | NULLED | DELETED
  createdAt DateTime @default(now()) @map("created_at")

  run V1PrivacyPurgeRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@index([tableName, rowId])
  @@map("v1_privacy_purge_items")
}

/// LIVE run 의 두 번째 게이트 (P-5). 어드민이 특정 dry-run 리포트를 검토한 뒤 생성하고,
/// 같은 kind 의 LIVE run 이 시작 시 1회 소비한다. 미소비 승인이 없으면 LIVE run 은 SKIPPED.
model V1PrivacyPurgeApproval {
  id                    String    @id @default(uuid())
  kind                  V1PrivacyPurgeKind
  basedOnRunId          String    @map("based_on_run_id")     // 근거가 된 DRY_RUN run
  approvedCandidateCount Int      @map("approved_candidate_count") // 승인 당시 후보 건수 — LIVE 실행 시 편차 검사에 사용
  approvedByAdminUserId String    @map("approved_by_admin_user_id")
  note                  String?
  consumedAt            DateTime? @map("consumed_at")          // 소비 시각 (1회용)
  expiresAt             DateTime  @map("expires_at")           // 생성 후 7일 — 오래된 승인으로 실행 금지
  createdAt             DateTime  @default(now()) @map("created_at")

  runs V1PrivacyPurgeRun[]

  @@index([kind, consumedAt])
  @@map("v1_privacy_purge_approvals")
}
```

기존 테이블 컬럼 추가는 없다 — 탈퇴 시각은 `V1StatusChangeLog`(`toStatus='withdrawal_pending'` 행, `schema.prisma:1843`, 기록 경로 `profile.service.ts:757`)에서, 대회 종료 시각은 §5.1.3-②의 파생 규칙으로 얻는다.

#### 5.1.2 잡 A — 탈퇴 유예 만료 파기 (`WITHDRAWAL_EXPIRY` 스캔)

**① 대상 선정**: 현재 `accountStatus='withdrawal_pending'`인 사용자 중, 그 사용자의 **가장 최근** `toStatus='withdrawal_pending'` 로그 행(`V1StatusChangeLog`, `targetType='user'` 기준 `createdAt` 내림차순 1건)이 유예기간(§10.2-Q2, 권고 30일) 이전인 사용자.
- **"가장 최근" 기준을 명시하는 이유**: 탈퇴 신청 → 어드민 복구 → 재탈퇴가 가능하므로(§9 리스크 표의 복구 완화책이 이 흐름을 전제한다) 같은 유저에 `withdrawal_pending` 로그 행이 여러 개 쌓일 수 있다. 최초 행 기준으로 판정하면 재탈퇴 유저의 실질 유예가 0일이 된다 — **재탈퇴는 유예를 재시작한다.** §7.1 경계값 테스트에 이 시나리오를 포함한다.

**② 처리 — 단일 helper, 단일 트랜잭션 (P-3, P-4)**: 유저 1명에 대해 아래 전 범위 + `V1PrivacyPurgeItem` insert + `accountStatus='deleted'`/`deletedAt` 전이를 **하나의 `$transaction`**으로 수행한다. 상태 전이는 트랜잭션의 **마지막 쓰기**다 — 중간 어디에서 실패해도 트랜잭션 전체가 롤백되어 유저는 `withdrawal_pending`으로 남고, 다음 run이 그대로 다시 잡는다. "deleted인데 PII가 남은" 상태는 커밋 단위에서 존재할 수 없다. 실시간 소켓 강제 종료는 어드민 수동 삭제와 동일하게 커밋 후 fire-and-forget(`admin.service.ts:401-409` 패턴). **개별 유저의 트랜잭션 실패는 run을 FAILED로 만들지 않는다** — 해당 유저만 `failedCount`에 계상하고 다음 run에서 재시도한다(후보 조건에 그대로 남아 있으므로 별도 재시도 큐 불필요).

공용 helper `purgeUserPii`의 전체 범위 (어드민 수동 삭제도 이 helper로 전환한다):

| 대상 테이블·컬럼 | 처리 | 근거 |
|---|---|---|
| `V1User.email` / `phone` | 마스킹 (`buildDeletedEmail/Phone` — 기존 로직 `admin.service.ts:336-337`을 helper로 이동) | `terms-client.tsx:604` — 단 제재 이력 보유자는 ③의 분기 적용 |
| `V1UserProfile.nickname/displayName/realName/bio/profileImageUrl` | 마스킹 (기존 로직 `:362-372` 이동) | G1 |
| `V1UserProfile.gender/birthDate` | **null** (현행 수동 삭제가 누락하던 범위 — helper 통합으로 어드민 경로도 함께 해소) | G1, `admin.service.ts:362-372` 실측 |
| `V1AuthIdentity` | unlink + `providerUserKey`/`passwordHash` 스크럽 (기존 로직 `:344-361` 이동) | G1 |
| `V1VerificationToken` (해당 유저) | **row 삭제** | G8 |
| `V1PushSubscription`, `V1SearchHistory` (해당 유저) | **row 삭제** | 목적 소멸 |
| `V1TournamentPlayer` (해당 유저, **완료 대회 포함**) | `birthDateSnapshot=null`, `genderSnapshot=null`, `eligibilityNote=null`. **`realName`은 유지** | 문서02 §13.4 "공식 기록은 display snapshot 유지" — 공개 기록 정책(§1.2)이 실명 표시를 전제하므로 탈퇴만으로 지우지 않는다. realName 파기 여부 자체는 §10.1-L5·§10.2-Q3 |
| `V1Inquiry` (해당 유저) | `contact=null` (본문은 신고·분쟁 대응 3년 보존) | `terms-client.tsx:606-610` |
| **보존** | `V1GameSide/V1GameParticipant.displayNameSnapshot`(경기 기록), 리뷰 rating/태그, 결제·정산 레코드, `V1StatusChangeLog`(부정이용 대응), 팀 전적 fact | 문서02 §13.4, 전자상거래 거래기록 보존 취지(§10.1-L3) |

**③ 제재 이력 보유자 hold — 재가입 방지 목적과의 충돌 (G10)**: 약관은 부정 이용·제재 기록을 "재가입 방지를 위해 최대 3년" 보관한다고 약속한다(`terms-client.tsx:616`). 그런데 `buildDeletedEmail/Phone`은 userId 파생 값이라(원본과 무관) 마스킹 즉시 **동일 email/phone 재가입을 연결할 수단이 사라진다** — 제재 회피 경로가 열린다. 따라서 잡 A는 **`V1StatusChangeLog`에 `toStatus IN ('suspended','blocked')` 이력이 있는 유저를 자동 파기 대상에서 hold** 하고 `heldCount`(사유: `SANCTION_HISTORY`)로 리포트에 남긴다. hold 해제 방식 — (a) 제재 전이 시각 + 3년 경과 후 파기, (b) phone salted hash만 3년 보관하고 즉시 파기 — 는 **§10.1-L7 법무 확인 + §10.2-Q8 결정 후** 구현한다. 그 전까지 제재 이력 보유자는 어드민 수동 삭제로만 처리 가능(수동 경로는 어드민 판단이 개입하므로 현행 유지).

**④ 백필 스캔 (P-3 후속)**: 이 기능 배포 이전에 어드민 수동 삭제로 `deleted`가 된 유저는 gender/birthDate/대회 스냅샷이 남아 있다. 잡 A의 첫 실행 계열에 **"`accountStatus='deleted'`인데 `V1PrivacyPurgeItem`에 해당 userId 관련 기록이 없는 유저"를 후보에 포함**하는 백필 조건을 넣어 소급 정리한다(동일 helper·동일 트랜잭션·동일 dry-run 게이트). 백필 완료 후에는 이 조건이 자연히 0건이 된다.

#### 5.1.3 잡 B — 보관기간 만료 파기 (`RETENTION_EXPIRY` 스캔)

**① 대상 선정 — hold 조건 포함 (약관의 보관 연장 조항 구현)**: 종료(completed/cancelled) 후 **3년** 경과한 대회의 `V1TournamentPlayer` 전 row (탈퇴 여부 무관) + 해당 `V1TournamentRegistration.depositorName`. **단, 약관이 "분쟁·사고·부정참가·환불·정산 대응이 필요한 경우 해당 사유 종료 시까지 보관"을 명시하므로**(§1.3), 아래 hold 조건 중 하나라도 걸리는 registration은 **skip 하고 `heldCount` + hold 사유별 건수로 리포트에 기록**한다. hold 는 영구 제외가 아니다 — 사유가 해소되면(문의 closed, 결제 종결) 다음 run 에서 자연히 후보로 복귀한다.

| hold 조건 | 판정 쿼리 근거 | 증거 |
|---|---|---|
| 해당 대회·registration·그 결제에 연결된 **미완결 문의** 존재 | `V1Inquiry.status != 'closed'` AND `relatedType IN ('tournament','registration','payment')` AND `relatedId`가 해당 tournament/registration/payment id | `schema.prisma:1864-1888`(`relatedType/relatedId:1873-1874`), `V1InquiryStatus:282-287` |
| 해당 registration의 **미종결 결제** 존재 | `V1TournamentPayment.status NOT IN ('paid','refunded','cancelled','failed')` — 즉 `ready`(입금 확인 미완) 잔존, 또는 `cancelRequestedAt`이 있는데 `refundedAt`이 비어 있는 registration(환불 미완결) | `schema.prisma:2243-2263`, `V1TournamentPaymentStatus:1954-1960`, `V1TournamentRegistration.cancelRequestedAt:2193` |
| 제재·부정참가 대응 진행 중 | 해당 대회를 target으로 하는 `V1StatusChangeLog` 최근 행이 실격·제재 계열 진행 상태를 가리키는 경우 — 구체 판정식은 구현 시 상태 모델 실측 후 확정하고, **판정 불가능하면 hold(보수적 기본값)** | `schema.prisma:1843` |

hold 판정 규칙의 최종 경계(어디까지를 "사유 미해소"로 볼지)는 **§10.1-L3·L8 법무 확인과 연동**해 확정한다 — 그때까지는 위 보수적 규칙(의심스러우면 hold)으로 운영한다. 파기를 늦추는 방향의 오류는 복구 가능하지만 그 반대는 불가능하다.

**② 대회 종료 시각 파생 — 결측 fallback**: `V1Tournament`에는 `completedAt` 컬럼이 없다(`schema.prisma:2003-2066` 실측). 종료 시각은 다음 우선순위로 파생한다:
1. `V1StatusChangeLog`에서 `targetType='tournament'` AND `toStatus IN ('completed','cancelled')`의 **가장 최근 행** `createdAt` — 단 이 로그는 `logAdminAction` 경유 전이에서만 생성되므로(`common/admin-context.service.ts:86-99` 실측) 시드·수동 SQL·로그 도입 이전 대회는 행이 없다.
2. 로그 부재 시 `V1Tournament.scheduledEndAt`(`schema.prisma:2018`).
3. 둘 다 없으면 **cutoff 판정 불가** — 파기하지 않고 run 리포트에 `UNDETERMINED_CUTOFF` 건수로 노출해 어드민이 수동 판단하게 한다. 조용한 미이행(잡히지 않는 대회)이 아니라 **보이는 잔여물**로 만든다.

**③ 처리**: `birthDateSnapshot=null`, `genderSnapshot=null`, `eligibilityNote=null`, `realName` → **§10.2-Q3 결정에 따름** (기본 권고: 유지 — 경기 기록 스냅샷과 동일 원칙. 단 3년 약속의 "보관"에 실명이 포함되는지가 §10.1-L5 법무 질문의 핵심). `V1TournamentRegistration.depositorName=null` (입금 분쟁 3년 경과 + hold 통과 확인 후). registration 1건 = 1 트랜잭션(P-4와 동일 원칙 — 소속 player row들 + Item 기록을 원자 처리).

같은 스캔에서 `V1Inquiry` 중 `status='closed'` AND `closedAt` + 3년 경과 row의 `guestEmail/guestPhone/contact=null` (`closedAt:1876`).

#### 5.1.4 잡 C — 인증 토큰 스윕 (`TOKEN_SWEEP`) · 잡 D — 원장 스윕 (`LEDGER_SWEEP`)

- **잡 C**: `V1VerificationToken`(만료+30일), `V1PhoneVerificationChallenge`(만료+30일) row 삭제. 저위험이므로 롤아웃 첫 LIVE 대상(§7.3).
- **잡 D**: `V1PrivacyPurgeRun`(및 cascade로 items) 중 `finishedAt` + **3년** 경과 run 삭제 (P-8). 파기 원장의 자기 정리를 별도 비공식 규칙이 아니라 정규 kind로 태운다 — 잡 D의 실행 자체도 새 run으로 기록되므로 "원장을 지웠다는 원장"은 남는다.

#### 5.1.5 실행·운영 파라미터 — LIVE 게이트의 단일 정의 (P-5)

| 파라미터 | 값 (권고) | 비고 |
|---|---|---|
| 스캔 주기 | **일 1회** (KST 04:00 목표 슬롯) | 라인업 리마인더처럼 완료 시 다음 스캔을 outbox 행으로 예약 — 슬롯 키 동일 시 무시라 재시작 멱등 |
| 배치 상한 | 계정 파기 run당 **100계정**, row-null 계열 run당 **1,000 row** | 초과분은 다음 날 — 잘못된 기준으로도 하루 피해 상한이 잡힌다 |
| 킬 스위치 | `DISABLE_PRIVACY_PURGE=true` → 스캔 자체 skip (마켓플레이스 cron `DISABLE_*` 선례) | 게이트보다 상위 — 켜져 있으면 dry-run조차 안 돈다 |
| **게이트 1 (환경)** | `V1_PRIVACY_PURGE_ENABLED` 미설정/`false` = **모든 run이 dry-run** (기본). dry-run은 후보 선정(hold 판정 포함)·건수 리포트·`V1PrivacyPurgeRun(mode=DRY_RUN)` 기록까지만 하고 **단 한 row도 변경하지 않는다** | 환경 단위 LIVE 능력 스위치 |
| **게이트 2 (run 승인)** | 게이트 1이 켜져 있어도, 해당 kind의 **미소비·미만료 `V1PrivacyPurgeApproval`이 존재할 때만** LIVE로 실행하고 승인을 소비한다. 없으면 그 run은 dry-run으로 실행된다(관찰은 계속). 승인은 어드민이 **특정 dry-run 리포트를 근거로** 생성(§6)하며 7일 후 만료 | "실수로 누른 버튼"이 아니라 "리포트를 읽고 내린 결정"만 실삭제로 이어진다 |
| **편차 가드** | LIVE run 시작 시점의 실제 후보 건수가 승인의 `approvedCandidateCount` 대비 **+10% 초과**면 실행하지 않고 `SKIPPED` + 운영 알림 — 승인과 실행 사이에 후보 분포가 변했다는 신호 | 승인 시점과 실행 시점의 괴리 방어 |
| 감사 | 모든 run은 `V1PrivacyPurgeRun` + `V1PrivacyPurgeItem`에 기록(진실 소스는 Item — P-7). **파기된 값 자체는 어디에도 남기지 않는다** (감사 로그가 새 PII 저장소가 되는 자가당착 방지) | |
| 알림 | run 완료 시 운영 알림(기존 알림 경로), LIVE run은 건수 요약 + heldCount + failedCount 포함 | |

**롤백 불가성 경고 (문서에 박제할 문구)**: LIVE 모드의 마스킹·null 처리는 **DB 레벨에서 비가역**이다. 복구 수단은 RDS point-in-time recovery뿐이며 이는 전체 DB 되감기라서 사실상 사용 불가능한 최후 수단이다. 되돌릴 수 없는 지점 = "해당 유저/registration 트랜잭션의 커밋"(P-4 덕분에 유저 단위로 all-or-nothing). 그 이전(dry-run·후보 리포트·승인 생성)까지는 전부 무해하다. **PITR 백업 활성 여부는 배포 전 운영 확인 항목이다 (미확인).**

### 5.2 실명 공개 정합 — 동의 목적 추가 vs 게이팅 활성화

| | A. 동의서 v1.2 개정 (목적 추가) — **권고** | B. 롤백 스위치 켜기 (게이팅 복귀) |
|---|---|---|
| 내용 | tournament_privacy 이용 목적에 "⑪ 경기 기록·참가 명단의 서비스 내 공개 게시" 추가, 관리형 약관 신규 버전 발행 | `V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE=true` 설정 + 재시작 |
| 장점 | 오너 결정(상시 공개)과 정합. 관리형 약관 버저닝·해시 검증 체계(`managed-terms-baseline.spec.ts`)를 그대로 활용. 이후 신규 대회 신청부터 정당한 근거 확보 | **재배포 없이 즉시** 노출 중단. 코드 변경 0 |
| 단점 | **소급 문제**: 이미 구 버전에 동의한 참가자·이미 종료된 대회 기록에는 새 목적이 자동 적용되지 않는다(§10.1-L1). 대회별 동의는 신청 시점 1회라 재동의 게이트(`terms-reconsent-access.ts`)가 자동 적용되는 가입 약관과 흐름이 다름 — 다음 신청부터만 신 버전 | 오너 결정 번복. 게스트(동의 수단 없는 참가자)는 영구 비노출 — 정책 의도와 충돌 (`public-tournament-records.service.ts:778-780` 주석). 미연동 참가자 다수인 대회 기록이 대부분 가명화 |
| 적용 시점 | 법무 검토 후 | 즉시 가능 |

**권고**: A를 본선으로 진행하되, **법무 검토에서 "소급 미동의 기록의 공개 유지가 위험하다"는 판단이 나오면 B를 즉시 발동**한다(그래서 스위치를 유지·테스트 상태로 보존하는 것이 이 설계의 일부다 — 스위치 삭제 금지). 이 선택은 사용자·법무 게이트를 통과해야 확정된다(§10.2-Q1).

### 5.3 미성년자 처리

**현행: 없음** (약관 텍스트뿐, §1.4). 생년월일이 이미 가입 필수 수집이므로 게이트는 저비용이다.

1. **가입 게이트 (즉시 구현 가능)**: `RequiredSignupProfileDto` 검증 계층에 만 14세 검사 추가 — 이메일 가입·소셜 가입 완료 양쪽 공통 경로. 위반 시 `422 UNDER_AGE_SIGNUP_BLOCKED`, 메시지 `"만 14세 미만은 가입할 수 없어요."` (해요체, DOMAIN_CODE 규약).
2. **기존 가입자 스캔**: 파기 잡 dry-run 인프라를 재사용해 만 14세 미만 기존 계정 존재 여부를 1회 리포트 (건수만). 발견 시 처리(제한/삭제/법정대리인 동의 소급)는 **§10.1-L4·§10.2-Q4 게이트**.
3. **만 14~18세 대회 참가 법정대리인 동의**: 대회 신청 로스터의 `birthDateSnapshot`으로 판별 가능하지만, 동의 수령 방식(전자 서명? 오프라인 서면 업로드?)은 제품 결정이 필요 — **§10.2-Q4 선택지로 이관**. 이번 스코프는 "판별 가능한 데이터가 있고 게이트가 없다"는 사실 박제 + 가입 게이트까지.

### 5.4 PII 노출 범위 축소 (G4)

`listPlayers`(`tournament-players.service.ts:153-172`)의 응답을 호출자 역할로 분기한다:

| 필드 | 일반 팀원(member) | 팀 manager+ | 어드민 |
|---|---|---|---|
| `realName` | O (팀 내부 명단 — 같은 팀 실명은 오프라인에서 이미 공유되는 정보) | O | O |
| `birthDateSnapshot` | **제거** | O (명단 관리·자격 소명에 필요) | O |
| `genderSnapshot` | **제거** | O | O |
| `eligibilityStatus` | O | O | O |
| `eligibilityNote` | **제거** | **제거** (운영자 심사메모 — 문서02 §13.2 "operator memo" 경계) | O |

구현: `assertTeamMember`가 이미 멤버십 row를 조회하므로 role을 함께 반환하게 확장 → `serializePlayer`에 viewer scope 인자 추가. `eligibilityNote`는 기존 어드민 전용 경로(`listPlayersForAdmin`, `:444`)로만. **API 필드 제거는 프론트 소비처 동반 수정 필수** — 팀 로스터 화면에서 생년월일·메모를 렌더하는 컴포넌트를 같은 PR에서 조정한다(소비처 목록은 구현 시 grep — 미조사). **이 변경은 화면이 바뀌는 UI 변경이므로 3폭 스크린샷 갤러리 규약이 적용된다**(§7.4).

## 6. API·에러 계약 (신규분)

| 엔드포인트 | 권한 | 설명 |
|---|---|---|
| `GET /api/v1/admin/privacy/purge-runs` | 어드민 | run 목록 (kind/mode/status/기간 필터, cursor) |
| `GET /api/v1/admin/privacy/purge-runs/:id` | 어드민 | run 상세 + 테이블별 건수·hold 사유별 건수·`UNDETERMINED_CUTOFF` 건수 리포트 (**`V1PrivacyPurgeItem` 집계가 진실 — P-7**; `report` 캐시와 불일치하면 Item 집계를 반환) |
| `POST /api/v1/admin/privacy/purge-approvals` | 어드민 (owner 등급 권고) | LIVE run의 두 번째 게이트(P-5) — body `{ kind, basedOnRunId, note }`. 서버가 근거 run이 DRY_RUN·COMPLETED인지 검증하고 그 `candidateCount`를 `approvedCandidateCount`로 스냅샷. 7일 후 만료, 1회 소비 |

에러 코드: `UNDER_AGE_SIGNUP_BLOCKED`, `PURGE_RUN_NOT_FOUND`, `PURGE_APPROVAL_BASE_RUN_INVALID`. **실삭제의 발동 조건은 P-5의 2중 게이트가 유일한 정의다**: env(`V1_PRIVACY_PURGE_ENABLED`)는 환경 단위 능력을, 승인 레코드는 개별 run을 게이트한다. 승인 API는 "실행 버튼"이 아니라 "특정 dry-run 리포트에 대한 검토 서명"이며, 이것만으로는 아무것도 지워지지 않는다(env 꺼져 있으면 무효) — 실행 자체를 트리거하는 API는 만들지 않는다(스캔 체인만이 실행 주체).

## 7. 검증 전략 — 파기 잡을 안전하게 테스트하는 법

### 7.1 단위
- **대상 선정 쿼리를 순수함수로 분리**해 spec: 경계값(유예 29일/30일/31일, 대회 종료 2년 364일/3년/3년 1일), 완료 대회 보존 원칙과의 상호작용.
- **복귀→재탈퇴 시나리오**: `withdrawal_pending` 로그 행 2개(31일 전, 1일 전)인 유저가 후보에서 제외됨(가장 최근 행 기준 — 유예 재시작)을 단언.
- **hold 판정 spec**: 미완결 문의(`status != 'closed'`) 연결 registration hold / `V1TournamentPayment.status='ready'` hold / 제재 이력(`toStatus IN ('suspended','blocked')`) 유저 hold — 각각 사유 코드와 함께 `heldCount`에 계상됨을 단언.
- **종료 시각 파생 fallback**: 로그 있음 → 로그 기준 / 로그 없음+`scheduledEndAt` 있음 → scheduledEndAt 기준 / 둘 다 없음 → 파기 0건 + `UNDETERMINED_CUTOFF` 리포트.
- **마스킹 helper 공용화 spec**: 어드민 수동 삭제 경로와 잡 경로가 **동일 helper를 호출해 동일 결과**를 내는지 — 기존 `admin.service.spec.ts`의 삭제 검증을 helper 레벨로 이동하고, gender/birthDate/대회 스냅샷까지 포함된 확장 범위를 양 경로에서 단언.
- dry-run 모드가 **UPDATE/DELETE를 한 건도 발행하지 않음**을 Prisma 쿼리 스파이로 단언.

### 7.2 통합 (테스트 DB — truncate 격리 기존 인프라)
- 시드: 탈퇴 유예 경과/미경과 사용자, 재탈퇴 사용자, 제재 이력 사용자, 3년 경과/미경과 대회, hold 사유(미완결 문의·ready 결제) 딸린 3년 경과 대회, 종료 로그 없는 대회, 게스트 참가자.
- ① **dry-run**: `candidateCount`·`heldCount`·리포트 검증, **DB 스냅샷 불변** 단언.
- ② **LIVE**(승인 레코드 생성 후): 파기 대상 null/마스킹 검증 + **보존 대상 검증**: `displayNameSnapshot` 잔존, 공개 기록 API(`GET /tournaments/:id/matches/:fixtureId`) 응답이 파기 전후 동일, 순위·전적 불변, hold 대상 registration 불변.
- ③ **재실행 멱등**: 2회차 candidateCount=0 (hold 건 제외).
- ④ **원장 정합**: `V1PrivacyPurgeItem`과 실제 변경 row 일치, run의 `purgedCount`/`report`가 Item 집계와 일치.
- ⑤ **중간 크래시 후 재실행 시 잔여 PII 0 (P-4 검증 — blocking 시나리오)**: 유저 3명 후보 중 2번째 유저의 트랜잭션 내부에서 강제 예외(테스트 훅)를 던져 run을 중단 → **단언 (a)** 2번째 유저는 `withdrawal_pending` 그대로이고 PII가 온전히 남아 있다(부분 마스킹 없음 — 트랜잭션 롤백 확인), **(b)** 1번째 유저는 완전 파기 + Item 기록 존재, **(c)** 재실행 시 2·3번째 유저가 다시 후보로 잡혀 완전 파기된다 → **최종 상태: 잔여 PII 0.** "deleted인데 PII 잔존" 유저가 어느 시점에도 존재하지 않음을 전 유저 스캔으로 단언.
- ⑥ **게이트 2**: env 켜짐 + 승인 없음 → dry-run으로 실행됨 / 승인 존재 → LIVE + 승인 `consumedAt` 기록 / 만료된 승인 → dry-run / 후보 편차 +10% 초과 → `SKIPPED`.
- ⑦ **백필**: 구 방식으로 `deleted`된(gender/birthDate 잔존) 시드 유저가 백필 조건에 잡혀 정리됨.
- 스캔 체인: 워커 재시작 시 스캔이 중복 예약되지 않음 (라인업 리마인더 spec 패턴 재사용).

### 7.3 단계적 롤아웃

**alpha (dev 머지 = 즉시 실배포):**
1. **1단계**: 전 잡 dry-run으로 배포 → alpha에서 **2주간** 매일 리포트 관찰. 후보 건수가 직관과 어긋나면(예: 전 사용자가 후보로 잡힘) 이 단계에서 잡는다. **파기 잡 인프라 자체는 화면이 없으므로** run 데이터는 어드민 API로 확인한다 (listPlayers 축소분의 시각 검증은 §7.4 — 별개 PR·별개 게이트).
2. **2단계**: 잡 C(토큰 스윕)만 승인 발행 → LIVE — 저위험 row 삭제로 LIVE 경로·게이트 2·원장 기록을 실전 검증.
3. **3단계**: 잡 A(탈퇴 파기) LIVE — 첫 주는 배치 상한 10계정으로 축소 운영. 제재 이력 hold 동작 확인.
4. **4단계**: 잡 B(3년 만료) LIVE — **법무 검토(§10.1-L3·L5·L8) 통과 후에만.** hold 리포트를 최소 1주 선행 관찰.

**프로덕션 (main 승격 — 별도 DB·별도 env):**
- alpha 관찰은 합성 픽스처 기반이라(예: 경기 전부 fieldId=null — 알려진 alpha 데이터 특성) **실사용 분포의 후보 선정 버그를 잡는 검증력이 낮다.** 프로덕션은 alpha와 독립적으로 같은 단계를 다시 밟는다.
5. **5단계**: main 승격 시 prod는 `V1_PRIVACY_PURGE_ENABLED` **미설정(= dry-run)으로 시작**한다 — env 주입 위치는 `deploy/docker-compose.prod.yml`(alpha compose와 별개 파일이므로 alpha 설정이 prod로 새지 않는다). **prod 실데이터 기준 dry-run 리포트를 2주 관찰** 후, kind별로 alpha와 동일 순서(C → A → B)로 사용자 승인 + 승인 레코드 발행을 거쳐 순차 LIVE 전환한다.
- 각 단계 전 **RDS PITR 활성 확인**(미확인 항목)과 run 리포트 리뷰가 게이트다. 모든 LIVE 전환은 사용자 승인 후 진행한다(파괴적 단계 — 글로벌 규칙 13-b 예외 ①).

### 7.4 UI 변경 시각 검증 (listPlayers 축소 PR)
`birthDateSnapshot`/`eligibilityNote` 제거는 팀 로스터 화면이 실제로 바뀌는 UI 변경이다 — 이 레포 운영 워크플로 규칙에 따라 **📱390 / 📲768 / 🖥1440 3폭 스크린샷 갤러리를 PR 코멘트로 예외 없이 첨부**한다 (member 뷰·manager 뷰 각각, before/after). 파기 잡·미성년 게이트 PR(백엔드 전용)은 이 규약의 대상이 아니다.

## 8. 마이그레이션·배포

### 8.1 drift gate 대응
`schema.prisma` 변경(신규 테이블 3 + enum 3)은 **단일 마이그레이션**으로 묶는다. 같은 PR에서 `apps/v1_api/test/fixtures/game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema`(`:184`)를 **1회 재핀**하고, 파일 상단 관례대로 "무엇이 왜 바뀌었는지" 근거 주석을 덧붙인다(기존 재핀 이력 주석 `:31-113` 형식). **리그전 스펙도 자체 마이그레이션(`20260817000000_v1_tournament_league_format`)으로 재핀을 하므로, 두 트랙이 병행되면 재핀 충돌이 난다** — fixture 주석 이력(`:71-72, 88, 105`)이 기록한 과거 충돌과 동일 패턴. 늦게 머지되는 쪽이 dev 기준으로 재핀을 다시 계산한다(§10.2-Q6에 순서 명시).

### 8.2 배포 순서 — PR 3분할
리뷰·롤백 단위를 좁히기 위해 세 PR로 나눈다 (전부 base=dev, 각각 tsc/테스트/Copilot clean 게이트):

| PR | 내용 | 시각 검증 |
|---|---|---|
| ① | 마이그레이션(테이블 3+enum 3) + fixture 재핀 + 파기 잡 4종(dry-run 기본) + 공용 helper 전환(어드민 수동 삭제 포함) + 백필 조건 + 어드민 run/승인 API | 불필요 (백엔드 전용) |
| ② | 미성년 가입 게이트 (`UNDER_AGE_SIGNUP_BLOCKED`) + 기존 가입자 1회 스캔 리포트 | 불필요 (에러 응답 — 가입 화면 문구가 바뀌면 그때 갤러리) |
| ③ | listPlayers 역할 분기 + 프론트 소비처 동반 수정 | **필수** — §7.4 3폭 갤러리 |

머지 후 §7.3 롤아웃. 실명 공개 정합(§5.2)과 잡 B LIVE는 법무 게이트 뒤 별도 PR.

### 8.3 롤백
- LIVE 전환 전: 전부 무해 — 킬 스위치 또는 env 미설정으로 즉시 중단.
- LIVE 전환 후: 신규 파기만 멈출 수 있고 **이미 파기된 데이터는 복구 불가** (§5.1.5 경고 재인용). 유저 단위 원자성(P-4) 덕에 "반쯤 파기된" 중간 상태는 존재하지 않는다 — 롤백 판단 단위가 깔끔하다.
- 실명 공개: `V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE=true`가 언제든 사용 가능한 즉효 스위치로 존치.

## 9. 리스크

| 리스크 | 완화 |
|---|---|
| 대상 선정 버그로 오삭제 (최악: 활성 사용자 마스킹) | dry-run 기본 + alpha·prod 각 2주 관찰 + run 단위 승인 게이트 + 편차 가드 + 배치 상한 + `V1PrivacyPurgeItem` 원장 + PITR 전제 확인 |
| 부분 실패로 "deleted인데 PII 잔존" 유저 발생 | **구조적으로 차단** — 유저 단위 단일 트랜잭션, 상태 전이가 마지막 쓰기(P-4) + §7.2-⑤ 크래시 시나리오가 잔여 PII 0을 직접 단언 |
| 분쟁·환불 진행 중 증거를 파기 | hold 조건이 대상 선정에 내장(§5.1.3-①), 보수적 기본값(판정 불가 시 hold), `heldCount` 리포트로 가시화 |
| 파기 후 공개 기록·순위가 깨짐 | 보존 대상 통합 테스트(§7.2-②)가 공개 API 응답 불변을 직접 단언 |
| 어드민 수동 삭제와 잡의 마스킹 드리프트 | 단일 helper 강제(P-3, "잡 전용 추가분" 개념 자체를 제거) + 동등성 spec + 기존 삭제분 백필(§5.1.2-④) |
| 재가입 방지 약속과 파기의 충돌 | 제재 이력 보유자 자동 파기 hold(§5.1.2-③) — 해소 방식은 §10.1-L7·§10.2-Q8 게이트 뒤 |
| alpha 관찰의 검증력 한계 (합성 픽스처) | prod 독립 dry-run 2주 관찰을 별도 단계로 강제(§7.3-5단계) |
| 종료 로그 없는 대회가 3년 약속에서 조용히 누락 | fallback 체인 + `UNDETERMINED_CUTOFF` 리포트로 가시화(§5.1.3-②) |
| 리그전 트랙과 fixture 재핀 충돌 | §8.1 — 머지 순서 조율, 늦은 쪽 재계산 |
| 동의서 개정이 소급 적용되지 않는 기간의 노출 지속 | 법무 판단 전까지 리스크 항목으로 기록, 스위치 fallback 상시 대기 (§5.2) |
| 감사 테이블 자체의 무한 증가 | 원장 3년 보관 후 `LEDGER_SWEEP` 정규 kind로 정리(P-8) — 분쟁 대응 3년 창구와 정합 |
| `withdrawal_pending` 사용자가 유예기간 내 복귀를 원함 | 유예기간 동안 파기 전이므로 어드민 복구 가능. 복귀 후 재탈퇴는 유예 재시작(§5.1.2-①) — 복구 흐름이 파기 타이머와 충돌하지 않는다 |
| hold가 과도해 파기가 사실상 미이행 | `heldCount`·사유별 건수가 매 run 리포트에 노출 — hold 장기화 건은 어드민이 사유 해소(문의 close, 결제 종결)로 풀거나 법무 판단으로 개별 처리 |

## 10. 미결 — 선택지와 함께

### 10.1 법무 검토 필요 항목 (확정 자문 아님 — 조문 번호 없이 취지만)

| ID | 항목 | 취지 |
|---|---|---|
| L1 | 실명 공개 게시가 현행 동의 목적 범위를 벗어난 목적 외 이용에 해당하는지, 동의서 개정 시 **소급(기존 참가자·종료 대회)** 처리 방법 | 개인정보 보호 법제의 수집·이용 목적 제한 및 동의 원칙 |
| L2 | 파기 의무의 이행 기한("지체 없이"의 해석)과 탈퇴 유예기간 운영 가능 여부·약관 반영 필요성 | 파기 의무 및 보유기간 원칙 |
| L3 | 결제·정산·거래 기록의 법정 보존 연한 (파기 제외 범위 확정) — **잡 B의 hold 판정 경계(어떤 결제 상태까지를 "정산 미완결"로 볼지) 확정 포함** | 전자상거래 법제의 거래기록 보존 의무 |
| L4 | 만 14세 미만 아동 개인정보의 법정대리인 동의 요건, 기존 미성년 가입자 발견 시 처리 | 아동 개인정보 보호 원칙 |
| L5 | 3년 만료 시 `realName`을 "표시명 스냅샷"으로 계속 보존하는 것이 가명처리/기록 보존 예외로 정당화되는지 | 보유기간 만료 후 처리 원칙 |
| L6 | 초상권: 팀 단위 boolean 동의의 유효성, 개인별 동의 필요 여부 (영상 연결 기능 대상) | 초상권·미디어 동의 일반 원칙 |
| L7 | **재가입 차단 목적의 최소 연결 정보 보관 허용 여부** — 제재 이력 보유자에 한해 phone의 salted hash를 최대 3년 보관하고 원본은 즉시 파기하는 방식이, 약관의 "재가입 방지 최대 3년" 약속과 파기 의무를 동시에 충족하는지. 불허 시 제재 이력 보유자의 파기 유예(제재 시점+3년) 운영 가능 여부 | 목적 제한 하의 최소 수집·가명처리 원칙 |
| L8 | 약관의 보관 연장 조항("분쟁·사고·부정참가·환불·정산 사유 종료 시까지")에서 **"사유 종료"의 판정 기준** — 문의 closed·결제 종결로 충분한지, 별도 시효를 두어야 하는지 (hold 무한 장기화 방지) | 보유기간 연장 사유의 해석 원칙 |

### 10.2 제품·설계 미결 (사용자 게이트 — 확정 표 §4에 넣지 않는다)

| ID | 질문 | 선택지 |
|---|---|---|
| Q1 | 실명 공개 정합 방향 | A. 동의서 v1.2 개정(권고) / B. 게이팅 스위치 활성화 / C. 법무 검토까지 현상 유지+리스크 기록 — L1과 연동 |
| Q2 | 탈퇴 유예기간 | 14일 / **30일(권고)** / 약관의 "최대 1년" 문구에 맞춘 1년 — 약관은 "지체 없이"만 있고 유예 규정이 없으므로 약관 문구 반영과 함께 L2 확인 |
| Q3 | 3년 만료 시 `V1TournamentPlayer.realName` | **유지(권고, display snapshot 원칙)** / null 처리(기록은 `V1GameParticipant` 스냅샷으로만) — L5와 연동 |
| Q4 | 미성년 대회 참가 | 가입 게이트만(이번 스코프) / 만 14~18세 로스터 등록 시 법정대리인 동의 흐름 추가(전자 동의 vs 서면 업로드) — L4와 연동 |
| Q5 | member의 `realName` 열람 | 유지(§5.4 권고) / manager+로 상향 (팀 내부 운영 편의와 상충) |
| Q6 | 리그전 트랙과의 머지 순서 | 리그전 선(先) 머지 → 본 트랙 재핀 재계산(권고 — 리그전이 우선순위 트랙) / 역순 |
| Q7 | `V1UserRegion`(위치정보)·채팅·업로드 자산의 파기 규칙 | 이번 인벤토리 스캔에 포함해 실태만 리포트(권고) / 파기 규칙까지 이번 스코프 |
| Q8 | 제재 이력 보유자의 파기 방식 | A. 제재 시점+3년까지 파기 유예 후 전체 파기 / B. phone salted hash 3년 보관 + 즉시 파기(재가입 차단 로직 신규 구현 필요) / C. 자동 파기 영구 제외, 어드민 수동만 — **전부 L7 법무 확인 선행.** 그때까지 잡 A는 해당 유저를 hold(§5.1.2-③) |

---
*검증 노트: 본 문서의 모든 현행 실태 주장은 2026-08-17 worktree `league-format`(base `origin/dev@36cbf281`)에서 파일을 직접 열어 확인했다. v2에서 추가 실측한 사실: `required-signup-profile.dto.ts`의 `realName` optional·이름 택1 검증(§1.1 정정), `admin.service.ts:299-399` 단일 트랜잭션 구조와 gender/birthDate 미마스킹, `V1Inquiry`의 `relatedType/relatedId/status/closedAt`(hold 판정 가용성), `V1TournamentPayment` 상태 enum, `V1Tournament`에 `completedAt` 부재 + `scheduledEndAt/updatedAt` 존재, `V1StatusChangeLog` 기록 경로가 `logAdminAction`(`common/admin-context.service.ts:86-99`)·탈퇴 신청(`profile.service.ts:757`)에 한정됨, `terms-client.tsx:616` 재가입 방지 문구. "미확인"으로 표시한 항목(G9 위치정보 파기 경로, `detachUserFromActiveCommitments` 내부의 push 구독·검색 이력 스크럽 여부, RDS PITR 활성 여부, listPlayers 프론트 소비처 목록, 제재 진행 상태의 구체 판정식)은 구현 착수 시 우선 확인 대상이다.*