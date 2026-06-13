# Task 98 — v1 Admin 운영자 권한 관리 + 전체 검수 + PR + 사용설명서

> 상태: **COMPLETE ✅** · 브랜치 `feat/v1-admin-redesign-toss`(공유 워크트리 안전상 기존 브랜치 유지) · 선행: Task 96(데스크탑), 97(admin 플랫폼)
> 파이프라인: `/agent-all` ultracode (최대 철저도)
>
> **산출물**: PR [#19](https://github.com/kim-song-jun/matchup-sports-platform/pull/19) (제목·본문 전체 스코프 갱신) · 사용설명서 PDF `docs/manual/teameet-admin-console-manual.pdf` (8섹션, 스크린샷 임베드) · 커밋 `c92d2995`
> **검증**: v1_web tsc0/7테스트 · v1_api tsc0/72 admin테스트 · frontend-review 2건 PASS · 라이브 QA(owner/ops/support 역할 + 소비자 데스크탑 10화면, 검색 nav Critical 수정)

## Context (사용자 요청 원문)
"나머지 기능,(최고운영자 외 그냥 운영자) 페이지도 모두 만들어주고, 이어서 mobile 페이지 기반으로 desktop을 만들었는데 그것도 전체 검수 + api 기능들, 버튼들 동작이 모두 다 올바르게 하는지 까지해주고 pr 내용도 적절하게 적어주면서 branch 네이밍이나 그런것도 잘 해줘 .그리고 모두 끝나면, 스크린샷을 가지고 사용설명서 보고서를 pdf로 만들어줘. ultracode"

## 진단 (Phase 1)
- 역할: owner|ops|support. support=읽기전용(이미 `status:write` 게이팅 동작). **`admin:owner` 능력 미사용** — owner 전용 기능 없음.
- **관리자 관리 기능 완전 부재**: ops/support 부여·회수 엔드포인트/페이지 없음(시드만 admin 생성). `grantedByAdminUserId`/`revokedAt` 워크플로 미노출.
- 시드에 **활성 support admin 없음**(g=suspended, f=revoked) → 읽기전용 QA 불가.
- 검수 표면: 소비자 59 라우트, 데스크탑 CSS 14파일, admin 14 라우트, 변이 28+.
- 인프라: web(3013)·api(8121)·pg UP, gh 로그인(kim-song-jun), origin 리모트 존재.

## Goal
1. **운영자 권한 관리(Admin Management) 기능 신설** — 최고운영자(owner)가 일반 운영자(ops)·지원(support)을 부여·역할변경·회수. owner 전용. 이로써 "(최고운영자 외) 운영자 페이지" 완성 + `admin:owner` 능력 실사용.
2. **역할별 경험 완비·검증** — ops/support 각 역할로 라이브 검증(support 읽기전용 확인). 활성 support 시드 보강.
3. **데스크탑(소비자) 전체 검수** — Task 96 데스크탑 반응형 전 도메인 시각 검수, 발견 이슈 즉시 수정.
4. **API·버튼 동작 기능 검증** — 핵심 변이 플로우 라이브 실행, 동작/권한/실패처리 확인.
5. **PR 생성** — 적절한 제목·본문(Task 96/97/98 포괄), 기존 브랜치 push(공유 워크트리 안전).
6. **사용설명서 PDF** — 스크린샷 기반 운영/사용 가이드 보고서.

## Admin Management 설계 (바인딩)

### 백엔드 (`apps/v1_api/src/admin/`)
신규 owner 전용 엔드포인트(`getOwnerAdmin()` = getActiveAdmin + adminRole==='owner', 아니면 403):
- `GET /admin/admins` — 전체 admin 목록 `{adminUserId, userId, nickname, displayName, email, adminRole, status, grantedByAdminUserId, grantedAt, revokedAt}` (cursor)
- `POST /admin/admins` — `{userId, adminRole: 'ops'|'support', reason}` — 부여(신규 또는 revoked→active 재활성). 대상 userId 존재 검증. 이미 active admin이면 409. 액션 로그.
- `PATCH /admin/admins/:userId` — `{adminRole?: 'ops'|'support'|'owner', status?: 'active'|'revoked', reason}` — 역할 변경/재활성/회수. **가드: 자기 자신 강등·회수 금지, 마지막 활성 owner 강등·회수 금지(`LAST_OWNER`/`SELF_MODIFICATION` 409)**. 액션 로그.
- (회수는 PATCH status='revoked'로 통일, revokedAt 기록)
- DTO: class-validator. 응답 형태 프론트에 보고.
- spec: owner 부여/역할변경/회수 happy; ops·support 호출 시 403; 자기/마지막 owner 가드 409; 액션로그 기록 검증.

### 시드 (`apps/v1_api/prisma/seed.ts`)
기존 suspended/revoked support 케이스 보존하면서 **활성 support admin 1명 추가** — 기존 활성 일반유저(`coverage-extra-e@teameet.v1`)에 support/active 부여(upsert). QA 페르소나: owner=`admin@teameet.v1`, ops=`coverage-extra-h@teameet.v1`, support=`coverage-extra-e@teameet.v1`.

### 프론트 (`apps/v1_web`)
- 데이터: `useV1AdminAdmins`, `useV1GrantAdmin`, `useV1UpdateAdminRole`(역할변경+회수 겸용) + 타입 + query keys. invalidate: `adminAdmins` + `adminOverview`.
- 페이지 `/admin/admins/page.tsx` (owner 전용): admin 목록 테이블(닉네임/이메일/역할/상태/부여일) + "운영자 추가"(사용자 검색→ops/support 부여 모달) + 행별 역할변경/회수(사유 모달). support/ops가 직접 URL 접근 시 `_gate` 통과하나 페이지에서 owner 아님 → 접근 거부 상태.
- AdminShell: nav에 "관리자" 항목 추가 **owner에게만 노출**(capabilities `admin:owner` 또는 adminRole==='owner'). shell이 role/capabilities를 prop으로 받아 조건부 렌더.
- 디자인: Task 97 Admin Design Contract 그대로(AdminDataTable/FilterBar/StatusPill/ReasonModal 재사용, 토큰·a11y·해요체).

## Parallel Work Breakdown
- **Wave A** (backend, 단독): admin-mgmt 엔드포인트+DTO+service+owner guard+spec + 시드 활성 support — `apps/v1_api/src/admin/**` + `prisma/seed.ts`.
- **Wave B** (frontend-data, A 후): admin-mgmt 훅+타입+keys.
- **Wave C** (frontend-ui, B 후): `/admin/admins` 페이지 + AdminShell owner-only nav.
- **Wave D** (gate+QA): 재기동+재시드 → owner가 support 부여→support 로그인 읽기전용 확인→ops 확인. frontend-review.
- **Wave E** (소비자 데스크탑 검수): 도메인별 라이브 시각 QA(1280/1440), 이슈 즉시 수정.
- **Wave F** (기능 검증): 핵심 변이 플로우 라이브 실행.
- **Wave G** (PR): push + gh pr create (포괄 제목·본문).
- **Wave H** (PDF): 스크린샷 기반 사용설명서 보고서.

## Acceptance Criteria
- [x] owner가 운영자(ops)·지원(support) 부여·역할변경·회수 가능, 자기/마지막owner 가드 동작
- [x] support(활성) 로그인 시 읽기전용(변이 버튼 비노출), ops 변이 가능 — 라이브 확인
- [x] "관리자" nav가 owner에게만 노출
- [x] 데스크탑 소비자 전 도메인 검수 완료, 발견 이슈 수정
- [x] 핵심 API·버튼 동작 라이브 검증
- [x] PR 생성(적절 제목·본문)
- [x] 사용설명서 PDF 산출
- [x] tsc 0 (both apps), 신규/영향 테스트 통과, frontend-review 통과

## Security Notes
- admin-mgmt 전 엔드포인트 `getOwnerAdmin` 게이트(owner만). 권한 상승 방지: ops/support는 부여 불가.
- 자기 강등·마지막 owner 회수 차단으로 lockout/권한공백 방지.
- 모든 변경 `V1AdminActionLog` 기록.
- 프론트 owner-only nav는 UX용, 신뢰 경계는 백엔드.

## Risks
- 공유 워크트리: 브랜치 생성·전환·rename 금지 → 기존 `feat/v1-admin-redesign-toss` 사용, push만.
- 검수/기능검증은 라이브 서비스 의존(web3013·api8121·pg). api 재기동 시 신규 라우트 반영 필요(watch 없음).
- 59 라우트 전수 스크린샷은 비현실적 → 도메인 대표+위험페이지 중심, 커버리지 명시(silent cap 금지).

## Ambiguity Log
- "나머지 기능(운영자 페이지)" → Admin Management(부여/회수) 신설로 해석(유일한 명확한 미구현 + 역할 직결). 추측 날조 아님.
- branch naming → 공유 워크트리 Critical 안전상 신규 브랜치 생성 대신 기존 feature 브랜치 사용, PR 본문으로 스코프 충실 반영.

---

## 추가 사이클 (98-B) — 사용설명서 전면 재작성 + 라이브 재검수

> 트리거(원문): "admin 사용설명서가 모든 기능에 대한 설명이 들어가있지도 않으니 처음부터 만든다고 생각하고(모든 기능에 대해서 플로우별로 상세하게 다 나와야함) 그리고 desktop webpage 설명서도 마찬가지로(apps) 상세하게 모두 다 준비되어야해."

### 산출물
- **사용설명서 PDF 2종 (처음부터 재작성, 전 기능 플로우별)**
  - `docs/manual/teameet-admin-console-manual.pdf` — 18p, 11개 장(접속·개요·회원·매치·팀·팀매치·감사로그·운영자권한관리·역할차이·모바일). 14화면 임베드 + 목차 + 콜아웃.
  - `docs/manual/teameet-desktop-web-manual.pdf` — 34p, 15개 장(랜딩·로그인·가입·온보딩·홈·매치·팀매치·팀·채팅·검색·알림·공지·마이페이지·설정). 36화면 임베드 + 목차.
- **공통 PDF 엔진** `scripts/manual_common.py` (ManualBuilder — 표지·자동 목차(afterFlowable TOCEntry)·플로우 단계·콜아웃·역할표·이미지 헬퍼). 두 콘텐츠 스크립트가 공유.
- **라이브 캡처 50화면** `docs/visual-qa/manual-v2/{admin,desktop}/` — owner/ops/support 3역할 + host 소비자 페르소나, 결정론적 재시드 데이터, 1440px 데스크탑(+admin 390px 드로어).

### 라이브 재검수 중 발견·수정한 실제 버그
- **팀 멤버 목록 비공개(403 `MEMBERS_VISIBILITY_DISABLED`) UX**: 프론트가 이를 일반 "팀 목록을 불러오지 못했어요 / 다시 시도" 에러로 표시(재시도 무의미) → 전용 `restricted` 상태("멤버 목록이 비공개예요 — 팀 운영진만 열람 가능") 신설. `teams.types.ts`/`teams.view-model.ts`/`teams-client.tsx`/`teams-page.tsx` 4파일. 비공개 상태에서 무의미한 팀 검색바도 제거. 정상 멤버 페이지(owner) 회귀 확인.
- **`my/reviews` PageProps 타입 위반**: Next 16에서 `searchParams`/`params`는 항상 Promise인데 `Promise<...> | {...}` union이 생성 타입 제약을 위반(tsc 1 에러) → Promise 단일 타입으로 정정. `my/reviews/page.tsx` + `my/reviews/[sourceType]/[sourceId]/page.tsx`.

### 검증
- v1_web **tsc 0** (위 union 정정으로 복원) · **7/7 테스트 통과**
- 라이브 QA: admin 14플로우(역할 게이팅 — ops nav에 관리자 없음 / support 상태변경 버튼 0개 / owner 전용 페이지 접근 차단 모두 확인) + 소비자 36플로우 전수 캡처
- PDF 2종 렌더 검증(목차 페이지번호·한글 폰트·스크린샷 임베드·콜아웃) — 누락 이미지 0, 미사용 캡처 0
