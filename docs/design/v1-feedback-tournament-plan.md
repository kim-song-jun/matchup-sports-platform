# Teameet v1 — 기존 기능 피드백 + 대회(풋살 토너먼트) 도메인 설계 계획

> **상태**: 🟢 골격 결정 + IA 재정의 확정(2026-06-13). 버그픽스 먼저 / 신규 Tournament 도메인 / PG 포함 / realName 대회 신청 시 / 알림 전체확장 / **navbar 5탭(홈·매치·대회·팀·마이) · 매치=개인+팀 병존 · 대회=상금+구조**(§G 참고). **선출여부=자기신고+어드민검토 · 결제=PG+계좌이체 택1 확정(2026-06-14, §D #6·#7)**. **Wave1+1.5 버그픽스 커밋 완료(bd5d6377)** · **Wave1.6 IA 재정의 구현·검증 완료** · PR #21 Copilot clean(머지 보류). **Wave2 진행 중**: ① Prisma 스키마 10모델 db push 완료 · ② V1Tournament 어드민 CRUD(list/get/create/update/status, AdminContextService 공용 인증·감사, status 전이 가드, jest 12 + 라이브 스모크 19 통과) 완료 — 다음: V1TournamentRegistration 신청 상태머신.
> **근거**: 8-finder 병렬 현황 조사(sonnet) → 설계 종합(opus). 모든 항목 file:line 근거 보유.
> **작성**: 2026-06-13 · 브랜치 `feat/v1-admin-redesign-toss` (조사 대상은 v1 소비자/어드민 앱)

## 0. 한 줄 요약

기존 4개 surface 피드백 16건 중 **실제 버그/미구현은 6건뿐**이고 나머지는 이미 동작하거나 UX 강조 부족이라 대부분 S 규모로 정리 가능하다. 반면 **알림 trigger 부재(L)·이미지 업로드 파이프라인 부재(L)·지역 시드 미비(M)**가 진짜 차단 요소다. 대회 도메인은 기존 V1Team/멤버십/어드민 감사로그를 그대로 재사용할 수 있어 신규 엔티티 8~9개로 1차(계좌이체 수동확인 + 어드민 수동운영) 구현이 현실적이며, **버그픽스(Wave 1) → 대회 1차 핵심(Wave 2~3) 순서**를 권고한다.

---

## A. 기존 기능 피드백

### A-1. 매치 상세

| 피드백 | 현황 | 근거(file) | 제안 | 규모 | BE |
|---|---|---|---|---|---|
| 공유 버튼이 안 눌림 | 구현 존재. `navigator.share` 없으면 clipboard 복사. async가 `void Promise`로 실행되어 미지원 브라우저/비-HTTPS에서 silent 실패 가능 | matches-client.tsx:183, 461-478 / matches-page.tsx:227 | clipboard도 try/catch로 감싸고 실패 시 URL prompt fallback. 성공 메시지 '링크가 복사되었어요'로 명확화 | S | X |
| 알림 버튼이 안 눌림 | `onNotify`가 단순 `router.push('/notifications')`. 매치별 구독 기능 없음 | matches-client.tsx:184 / matches-page.tsx:228 | 의도가 목록 이동이면 aria-label '알림 목록'으로 명확화. 매치별 구독은 BE 신규 필요 | M | O(구독 시) |
| 마감시간이 실제 적용 안 됨 | **서버 enforce 정상**(approveApplication deadline check, DEADLINE_PASSED). 프론트는 eligibility 응답에 의존해 버튼 disable | matches.service.ts:612-616, 848-855, 431-448 / schema.prisma:513 | 동작 정상. `getDisplayState()`에서 `deadlineAt<now` 시 'closed' 즉시 표시로 UX 선행 | S | X |
| 인원 카운트가 호스트 포함해야 | **이미 포함**. create 시 host가 role='host', status='active'로 삽입, count에 반영 | matches.service.ts:251-258, 858-860, 724-740 | 조치 불필요. '(호스트 포함)' 안내 문구 정도 | S | X |
| 신청 방식은 없어도 될 듯 | UI에 신청 방식 요소 없음. 서버는 `approvalRequired:true` 하드코딩 | matches-page.tsx:249-256 / matches.service.ts:179,779 | 이미 없음. 카드 actionLabel '승인제 신청'→'참가 신청' 통일 | S | X |
| 승인완료를 하단에 신청상태로 | 하단 CTA에 statusLabel('승인 완료') 이미 표시. 단 approved StateCard 미렌더 | matches-page.tsx:280-281,334-335 / matches-client.tsx:408-414 | mode='approved' 시 StateCard(tone='green') 본문 추가로 시각 강조 | S | X |
| 설명 text 제외 | description 있으면 본문 카드로 렌더(desktop+mobile) | matches-page.tsx:257, 310 | 조건부 렌더 2블록 제거 또는 disclosure 처리 | S | X |
| 참가자는 호스트만 + 관리 페이지 이동 | **이미 호스트 only 표시 + 관리 링크**. 단 manageHref가 `/edit`로 연결, 전용 관리(신청자 목록) 라우트 미구현 | matches-client.tsx:225-244,164-168 / matches.service.ts:150-157 | 관리 진입점을 `/matches/:id/applications` 신청자 관리 페이지로 변경(신규 화면) | M | X |
| 채팅은 승인 후에만 | **게이팅 정상**(approved/participant만). 단 호스트는 제외되어 채팅 버튼 미노출 | matches-client.tsx:420-422,177-179 / matches-page.tsx:193 | 호스트 채팅 필요 시 canOpenMatchChat에 'host' 추가 | S | X |

### A-2. 매치 생성

| 피드백 | 현황 | 근거(file) | 제안 | 규모 | BE |
|---|---|---|---|---|---|
| 이미지 업로드 안 됨 | FileReader로 base64 data URI를 imageUrl로 직접 전송. **v1_api에 업로드 엔드포인트 0건**. JSON body 1MB 제한으로 거의 항상 실패, 통과해도 DB에 base64 원문 저장 | matches-page.tsx:669-700 / matches-create-client.tsx:313 / mutate-match.dto.ts:29-31 / main.ts:21-28 | POST /uploads(multer+S3/로컬) 신규. ImageUploadField는 선택 즉시 업로드 후 URL 저장 | L | O |
| 지역 선택 안 됨 | (A) V1Region 시드 없으면 빈 배열→옵션 없음 (B) children select에 parentId 누락(클라 폴백으로 부분 회피) | master.service.ts:39-66 / use-v1-api.ts:227-239 / matches-create-client.tsx:39-43,300 | 시드 확인·추가 + children select에 `parentId:true` 추가 | M | O |
| 마감시간 입력받는가(연계) | deadlineDate/deadlineTime 필드 존재, deadlineAt ISO 조합 전송 | matches-page.tsx:784-788 / matches-create-client.tsx:303-306 | 조치 불필요 | S | X |
| 정원에 host 자동 포함(연계) | create 시 host participant 즉시 생성, count=1 시작 | matches.service.ts:251-259,858-860 | 버그 아님. '(호스트 포함)' 문구로 혼동 방지 | S | X |

### A-3. 팀매치

| 피드백 | 현황 | 근거(file) | 제안 | 규모 | BE |
|---|---|---|---|---|---|
| "팀 정보 보러가기" 버튼 빈약 | sm-neutral 한 글자 '보기' 버튼만. 로고/매너/멤버수 메타 없음. BE detail엔 hostTeam.logoUrl·trustState 이미 포함 | team-matches-page.tsx:220-227 / globals.css:934 / team-matches.types.ts:66-70 / service.ts:107-111 | ViewModel에 로고·멤버수·trustState 추가, 카드 재설계 + CTA primary 격상 | S | X(데이터 이미 있음) |
| 신청은 호스트만 + 관리 이동 | **권한 게이팅 완성**(HOST_TEAM_CANNOT_APPLY). 단 applicantTeams onApprove/onReject 콜백이 types에만 있고 미연결 | service.ts:803-808,858,384 / client.tsx:397-402,455-456 / page.tsx:145 | mine 상태 배너 안내 + onApprove/onReject 실제 뮤테이션 연결(인라인 승인/거부) | M | X |
| 채팅은 승인 후 | **정상**. approved만 노출. 단 라벨만 있고 버튼 미렌더라 안내 공백 | client.tsx:417-418,191-195 / page.tsx:119 | disabled 버튼 항상 렌더 + '승인 완료 후 이용 가능' 안내 | S | X |
| 생성 시 "내 팀" 없음/고정 팀 | **실제로는 동적 로드**. 단 로딩 중 EmptyState 즉시 노출(오인), view-model fallback에 하드코딩 3팀 | create-client.tsx:29,37-39,62-63 / teams.service.ts:450 / page.tsx:479 | isLoading 스켈레톤 + EmptyState 분기를 `data!==undefined && length===0`로 한정 + fallback 빈 배열 | S | X |
| manager/owner만 + 권한 팀 리스트 | **권한 필터 완성**(canCreateTeamMatch). member 팀은 완전히 사라져 혼란 | service.ts:803-808 / teams.service.ts:450 / create-client.tsx:38-39 / page.tsx:479 | member 팀 disabled+'권한 필요' 배지로 표시, FAB 진입 전 차단, 0팀이면 /teams/new 유도 | M | X |

### A-4. 알림·채팅

| 피드백 | 현황 | 근거(file) | 제안 | 규모 | BE |
|---|---|---|---|---|---|
| 알림 trigger 전수 | 모델·목록·읽음·선호도 모두 완성. **실제 trigger는 단 1곳**(chat.service.ts:149 채팅 메시지). 매치/팀/팀매치 도메인 trigger 0건 | chat.service.ts:149 | 핵심 이벤트(매치 승인/거절, 팀가입 수락/거절, 팀매치 승인/거절 등)에 tx.v1Notification.createMany 추가 + 선호도 필터 helper 신설 | L | O |
| 빈 상태 text | EmptyState 텍스트 존재 | community-page.tsx:146-148 | trigger 추가 후 sub 문구를 실제 알림 종류에 맞게 검토 | S | X |
| 채팅 접근 게이팅 | **BE 게이팅 완성**(assertCanUse* 3종). 단 FE canOpenTeamMatchChat이 host_team 누락 버그 | chat.service.ts:252-288 / team-matches-client.tsx:417-418 | FE 조건에 `\|\| viewerState==='host_team'` 추가(S) | S | X |

> **실시간 인프라 참고**: v1에 WebSocket/SSE 게이트웨이 없음. 알림은 순수 REST polling(페이지 진입 단발). 자동 반영 필요 시 refetchInterval(FE only, S) 또는 SSE/WS 신설(L).
> **선호도 스키마 주의**: V1NotificationPreference는 8필드인데 notifications.controller PATCH는 3필드만 노출, 나머지 5개(matchEnabled 등)는 profile 경로로만 수정. trigger 추가 시 5개 세분화 필드 기준으로 필터링해야 함.

---

## B. 대회(풋살 토너먼트) 도메인 설계

### B-1. 데이터 모델

**재사용(신규 컬럼/enum 확장만):**
- `V1Team` + `V1TeamMembership` (schema.prisma:593,653) — 팀 엔티티, owner/manager/member 역할, assertManagerOrOwner 패턴 그대로 → 대회 팀단위 참가신청 권한
- `V1TeamJoinApplication` 패턴 — 참가신청 스테이트머신 원형
- `V1AdminUser` + `V1AdminActionLog`(:979) + `V1StatusChangeLog` — 입금확인·참가확정·명단잠금 어드민 액션 감사로그(targetType='tournament_registration')
- `V1Sport`/`V1SportLevel`/`V1UserRegion` — 종목(futsal)·지역 FK
- `V1Notification` + `V1NotificationPreference`(:903) — targetType enum에 'tournament' 추가
- `V1ChatRoom`(:838) — matchId/teamId/teamMatchId 모두 @unique 확인됨 → tournamentId 추가는 마이그레이션 필요(M)

**신규 엔티티 (1차 핵심 9개):**

| 모델 | 핵심필드 | 관계 |
|---|---|---|
| V1Tournament | id, sportId, status(draft/open/closed/in_progress/completed/cancelled), registrationDeadlineAt, scheduledAt, teamCount, minPlayers/maxPlayers, entryFee, bankAccount/bankHolder, rulesText, createdByAdminUserId | sportId→V1Sport |
| V1TournamentRegistration | id, tournamentId, teamId, appliedByUserId, status(§10 머신), depositorName, agreedRules/Privacy/Refund, confirmedByAdminUserId, rosterLockedAt | teamId→V1Team |
| V1TournamentPlayer | id, registrationId, userId, **realName**, birthDateSnapshot, eligibilityStatus(non_pro/pro/needs_review), addedAt/removedAt | userId→V1User |
| V1TournamentGroup | id, tournamentId, name(A/B), phase(group/semi/final/third_place), sortOrder | — |
| V1TournamentGroupTeam | id, groupId, registrationId, sortOrder | 조-팀 매핑 |
| V1TournamentFixture | id, tournamentId, groupId(nullable), round, fixtureNumber, legNumber, parentFixtureId(자기참조), home/awayRegistrationId, scheduledAt, venue, status | 4강 합산용 self-ref |
| V1TournamentFixtureResult | id, fixtureId(1:1), home/awayScore, hasPenalty, home/awayPenaltyScore, recordedByAdminUserId | — |
| V1TournamentStanding | id, groupId, registrationId(복합 unique), points/wins/draws/losses/goalsFor/goalsAgainst/position, recalculatedAt | — |
| V1TournamentAnnouncement | id, tournamentId, title, body, audience(all_registered/confirmed_only/waitlist), publishedAt | — |

### B-2. 상태머신

**신청(V1TournamentRegistration.status, §10):**
`draft →[팀장 제출]→ submitted →[입금안내]→ awaiting_payment →[어드민 입금확인 시작]→ payment_checking →[어드민 확정]→ confirmed | waitlisted`. confirmed/waitlisted →[취소요청]→ `cancel_requested →[어드민 처리]→ cancelled`. confirmed → `roster_open →[어드민 잠금]→ roster_locked`(명단변경은 roster_open 복귀 후 재잠금). 대기팀 자동승격은 **1차 수동**.

**경기 진행(V1TournamentFixture.status, §11):**
`scheduled →[당일 시작]→ in_progress →[결과 입력]→ completed | cancelled`. 4강 2차전 합산은 parentFixtureId로 연결된 두 fixture가 모두 completed일 때 합산. 동률 승부차기는 hasPenalty+penalty 필드. 조별리그 전 경기 완료 → standing 재계산(**1차 어드민 수동 트리거**).

### B-3. 회원가입/선출여부 데이터 갭 (검증 완료)

- **phone**(schema.prisma:223): `String? @unique` — 있으나 nullable. 대회 필수 → 신청 시 not-null 검증 필요
- **birthDate**(:293): `String?` nullable — 신청 시 not-null 검증 + V1TournamentPlayer.birthDateSnapshot 스냅샷
- **gender**(:292): `String?` nullable, enum 아님 — 대회 선택 항목
- **realName(법적 실명)**: **스키마에 없음**(nickname만 필수). 방안 A: V1UserProfile에 realName 컬럼(글로벌 영향) / 방안 B: V1TournamentPlayer.realName에만 보관(PII 범위 최소화) → **방안 B 권고**
- **eligibilityStatus(선출여부)**: 스키마 없음. 개인 프로필 아닌 대회 참가단위 속성 → V1TournamentPlayer에만 기록(글로벌 불필요)

### B-4. API 초안

**참가자/팀장:**
`GET /tournaments` | `GET /tournaments/:id` | `POST /tournaments/:id/registrations`(팀장, draft) | `PATCH .../registrations/:id`(submit, 입금자명, 동의체크) | `POST .../registrations/:id/players`(명단 6~10명, realName/birthDate/선출여부) | `DELETE .../players/:id` | `POST .../registrations/:id/cancel-request`

**어드민:**
`POST /admin/tournaments`(생성) | `PATCH /admin/tournaments/:id`(수정·상태) | `PATCH /admin/registrations/:id/confirm-payment`(payment_checking) | `PATCH /admin/registrations/:id/confirm`(confirmed/waitlisted) | `POST /admin/tournaments/:id/groups`·`/group-teams`·`/fixtures`(대진등록) | `POST /admin/fixtures/:id/result`(결과입력) | `POST /admin/tournaments/:id/standings/recalculate`(수동) | `POST/DELETE /admin/registrations/:id/roster-lock` | `GET /admin/registrations/:id/players/export`(CSV/XLSX, **어드민 게이트 필수**) | `POST /admin/tournaments/:id/announcements`

### B-5. 화면 목록

**소비자:** 대회 목록 / 대회 상세(규정·일정·대진·조별순위·최종결과) / 참가신청(팀 선택→동의→입금안내) / 명단 작성(팀원 선택+실명/생년월일/선출여부) / 내 신청 상태 / 대회 공지

**어드민:** 대회 생성·편집 / 신청 목록·입금확인·참가확정 / 명단 검토(선출여부 needs_review 처리) / 대진 등록 / 결과 입력 / 순위 관리(수동 recalc) / 명단 엑셀 다운로드 / 공지 발송

### B-6. 권한 모델

| 액션 | 일반팀원 | 팀장/운영진(manager+) | 어드민 |
|---|---|---|---|
| 대회 신청·명단 작성 | X | O (assertManagerOrOwner) | — |
| 신청 취소요청 | X | O | O |
| 입금확인·참가확정·명단잠금 | X | X | O |
| 대진·결과·순위·공지 | X | X | O |
| 명단(PII) 엑셀 다운로드 | X | X | O (엔드포인트 격리) |

---

## C. 단계별 로드맵 (Wave 분할)

**Wave 1 — 기존 기능 버그픽스/폴리시 (§16 1차 필수, 대부분 S):**
1. (S) 매치: 공유 fallback, approved StateCard, description 제거/disclosure, 신청 방식 라벨 통일
2. (S) 팀매치: 팀 카드 재설계(데이터 이미 존재), 채팅 disabled 안내, 생성 로딩 스켈레톤
3. (S, FE 버그) 팀매치 채팅 host_team 게이팅 누락 수정 (team-matches-client.tsx:418)
4. (M) 매치 신청자 관리 페이지(`/matches/:id/applications`) 신규
5. (M) 팀매치 인라인 승인/거부 연결, member 팀 disabled 표시

**Wave 1.5 — 차단 인프라(독립 병렬, BE 필요):**
6. (M) 지역 시드 + master.service parentId 추가 → 매치 생성 차단 해제
7. (L) POST /uploads 파이프라인 → 이미지 업로드
8. (L) 알림 trigger 도메인 이벤트 배선 + 선호도 필터 helper

**Wave 2 — 대회 1차 핵심(어드민 수동운영·계좌이체 수동확인):**
9. V1Tournament + CRUD(어드민) (S)
10. V1TournamentRegistration + 신청 상태머신 + 동의/입금자명 (M)
11. V1TournamentPlayer + 명단 UI(realName 방안 B) (M)
12. 어드민 입금확인·참가확정 (S)

**Wave 3 — 대진·결과·순위(수동):**
13. Group/GroupTeam/Fixture + 어드민 대진등록 (M)
14. FixtureResult + 결과입력 (S)
15. Standing + 조별순위(수동 recalc) (M)
16. 명단 엑셀 다운로드(어드민 게이트) (S) + 명단잠금/해제 (S) + 대회 상세 페이지 (S)

**Later(2차 이후):** PG 자동결제, QR 체크인, 자동 대진 생성, 순위 자동계산, 득점 기록/개인상, 갤러리, 팀레벨 반영, 후기(sourceType 'tournament').

---

## D. 의사결정 필요 항목 (확정 대기)

| # | 결정 | 확정 | 상태 |
|---|---|---|---|
| 1 | 작업 순서 | **버그픽스(Wave1) 먼저 → 대회** | ✅ 확정 |
| 2 | 대회 아키텍처 | **신규 Tournament 도메인 신설** | ✅ 확정 |
| 3 | 결제 | **PG 포함** (권고 '계좌이체 수동'과 다름 — 아래 §F 참고) | ✅ 확정 |
| 4 | realName 데이터 | **대회 신청 시 입력(V1TournamentPlayer, PII 격리)** | ✅ 확정 |
| 5 | 알림 trigger 1차 범위 | 권고: 매치 승인/거절 + 팀가입 수락/거절 + 팀매치 승인/거절 6종 | ⬜ Wave1.5 착수 시 |
| 6 | 선출여부 판단 주체 | **자기신고 + 어드민 검토(needs_review)** | ✅ 확정(2026-06-14) |
| 7 | 결제 방식(§F) | **PG + 계좌이체 둘 다 지원, 신청 시 택1** (`V1TournamentPayment.method`) | ✅ 확정(2026-06-14) |

---

## E. 리스크 & 오픈 퀘스천

**리스크:**
- **PII(High):** realName+birthDate+phone 조합. V1TournamentPlayer 접근·엑셀 다운로드 API는 어드민 전용 격리 필수
- **마이그레이션(Medium):** 신규 모델 9개 + enum 확장(Notification/PostEventReview targetType에 tournament). 알림 targetType switch 전수 확인
- **명단잠금 경쟁조건(Medium):** roster_locked 동시 변경 방어. $transaction + status 검증
- **4강 합산 복잡도(Medium):** legNumber 1/2 두 fixture 조인 + 승부차기. **1차는 어드민 수동 다음대진 배정으로 단순화 권고**
- **선출여부 분쟁(Low-Med):** needs_review 어드민 처리 SLA. 명단 검토 화면 1차 필수
- **취소 환불(Low):** refundPolicyText는 안내용, 실제 환불은 운영자 수동. 결제 자동화 전 부분환불 프로세스 명문화

**오픈 퀘스천(설계 확정 전 해소 필요):**
- 대기팀 자동승격: 1차 수동 가정(확인 필요)
- 명단변경 후 어드민 승인: 별도 엔티티 vs roster_open 해제→변경→재잠금 단순 흐름
- V1ChatRoom tournamentId FK 추가 시점(@unique 확인됨, 마이그레이션+코드 영향 검토)
- 대회 공지 V1Notice로 충분한지 vs V1TournamentAnnouncement 별도 필요(참가확정팀 타겟 공지 시나리오 유무)
- 8팀 고정 vs 가변(teamCount 컬럼 추상화로 가변 가정)

---

## F. PG 결제 결정 반영 (#3 확정 = PG 포함)

> ⚠️ 사용자가 붙인 대회 스펙 §16/§17에는 "결제는 일단 계좌이체" + "PG 결제는 추후 확장"으로 적혀 있었으나, **방금 결정에서 1차 PG 포함을 명시 선택**. 결정을 따르되 아래로 반영.

**스코프 영향:**
- v1_api에 **payment 도메인 전무** → 신규 결제 모듈 신설 필요(L). main 앱은 토스페이먼츠를 쓰므로 동일 PG(토스페이먼츠) 재사용이 자연스러움. 단 v1은 결제 스키마/웹훅/환불 경로가 0이라 그대로 가져올 수 없고 v1 모델 기준 신규 구축.
- 신규 모델: `V1TournamentPayment`(registrationId 1:1, provider, providerTxId, amount, status(ready/paid/failed/cancelled/refunded), paidAt, raw webhook ref) + 웹훅 엔드포인트 + 환불 API.
- 신청 상태머신 연동: `submitted → awaiting_payment →[PG 결제완료 webhook]→ paid →[어드민/자동]→ confirmed`. (어드민 수동 입금확인 단계가 PG 자동확인으로 대체)

**권고(구현 시 반영 예정, Wave2 착수 때 재확인):**
1. **PG primary + 계좌이체 수동확인 fallback 병행** — PG 장애/대량 단체신청 대비 어드민 수동확인 경로를 함께 남김(운영 resilience). 상태머신에 두 진입 모두 수용.
2. **PG는 대회 Wave의 별도 서브트랙(L)** — Wave2 핵심(신청/명단)과 분리해 병렬 진행. 결제 미연동 상태에서도 신청 draft~submitted까지 동작하도록 설계.
3. 환불: PG 부분환불 + 운영 정책 텍스트. 토스 cancel 연동.

**Wave 매핑 갱신:** Wave2에 `T-PAY` 서브트랙 추가(`V1TournamentPayment` + 토스 prepare/confirm/webhook/refund). 기존 Wave2 항목 9~12는 결제 비의존으로 선행 가능.

---

## G. IA·개념 재정의 (2026-06-13 결정)

> 사용자 방향: navbar를 **홈·매치·대회·팀·마이** 5탭으로, "팀매치" 탭 자리를 "대회"로 교체. 경쟁 포맷을 **매치(무상금 단발) / 대회(상금 토너먼트)** 2종으로 단순화. 결정: 개인 매치는 **개인+팀 병존**, 구분 기준은 **상금+구조**.

### G-1. 모바일/데스크톱 navbar 5탭
홈 · **매치** · **대회** · 팀 · 마이. 기존 "팀매치" 탭 제거 → "대회" 탭 신설.
- `apps/v1_web/src/components/v1-ui/shell.tsx`: `V1NavTab` `'teamMatches'` → `'tournaments'`, href `/tournaments`, 라벨 "대회", 아이콘 교체. BottomNav + DesktopNav 동시.
- "매치" 탭(`/matches`)은 유지하되 의미 확장(G-2).

### G-2. 매치 = 개인 + 팀 병존(필터), 대회 = 상금+구조
- **매치(`/matches`)**: 무상금 단발 경기. **개인 참가자 모집 매치(현 `V1Match`) + 팀 vs 팀 매치(현 `V1TeamMatch`) 둘 다** 노출, 목록에 **개인/팀 세그먼트 필터**로 구분. (결정: 개인+팀 병존)
- **대회(`/tournaments`)**: **상금 + 조별리그→토너먼트 구조** (신규 Tournament 도메인, §B). (결정: 상금+구조 경계)
- 기존 `V1TeamMatch` 도메인은 **폐지하지 않고** "매치"의 팀 종류로 재배치(navbar 별도 탭만 제거). → 진행 중 워크플로의 개인·팀 매치 폴리시 **둘 다 유효**.

### G-3. 홈 "오늘의 추천"에 대회
- `/home` "오늘의 추천" 섹션에 진행 중/예정 대회 카드 추가(대회 목록 API 의존 → 대회 도메인 이후 실데이터, 그전 placeholder).

### G-4. 구현 영향 / 규모
| 항목 | 파일 | 규모 |
|---|---|---|
| navbar 탭 교체 | shell.tsx (V1NavTab·tabs·BottomNav·DesktopNav) | S |
| 매치 탭 개인/팀 세그먼트 필터 + 팀매치 항목 노출 | `/matches` 목록 페이지 + 데이터 병합 | M |
| 대회 탭 skeleton(empty/coming-soon → 도메인 채움) | `/tournaments/*` 신규 | M(껍데기 S) |
| 오늘의 추천 대회 슬롯 | `/home` | S(placeholder) |
| 매치 상세 진입 라우트 | 기존 `/matches/[id]`(개인)·`/team-matches/[id]`(팀) 유지, 매치 탭에서 진입 | S |

### G-5. 로드맵 반영 (C절 보강)
- **Wave 1.6 — IA 재정의 (버그픽스 Wave1 이후):** navbar 5탭 교체 + 매치 탭 개인/팀 세그먼트 필터 + 대회 탭 skeleton(empty) + 오늘의 추천 대회 슬롯(placeholder). **skeleton-first** — 대회 도메인 전에 껍데기/네비게이션 먼저.
- **Wave 2~3 — 대회 도메인:** §B대로 채우면 대회 탭·오늘의 추천 카드에 실데이터 연결. ("대회" 탭이 §B의 Tournament 도메인 소비처.)

### G-6. 오픈 (확정 전 가벼운 확인)
- 매치 상세 라우트 통합 여부: 개인/팀을 `/matches/[id]` 단일로 합칠지 vs 기존 2라우트 유지(권고: **기존 2라우트 유지 + 매치 탭에서 type별 진입** — 회귀 최소). Wave1.6 착수 시 확정.
