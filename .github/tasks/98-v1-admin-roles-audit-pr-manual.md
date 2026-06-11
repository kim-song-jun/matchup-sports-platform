# Task 98 — v1 Admin 운영자 권한 관리 + 전체 검수 + PR + 사용설명서

> 상태: IN PROGRESS · 브랜치 `feat/v1-admin-redesign-toss`(공유 워크트리 안전상 기존 브랜치 유지) · 선행: Task 96(데스크탑), 97(admin 플랫폼)
> 파이프라인: `/agent-all` ultracode (최대 철저도)

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
- [ ] owner가 운영자(ops)·지원(support) 부여·역할변경·회수 가능, 자기/마지막owner 가드 동작
- [ ] support(활성) 로그인 시 읽기전용(변이 버튼 비노출), ops 변이 가능 — 라이브 확인
- [ ] "관리자" nav가 owner에게만 노출
- [ ] 데스크탑 소비자 전 도메인 검수 완료, 발견 이슈 수정
- [ ] 핵심 API·버튼 동작 라이브 검증
- [ ] PR 생성(적절 제목·본문)
- [ ] 사용설명서 PDF 산출
- [ ] tsc 0 (both apps), 신규/영향 테스트 통과, frontend-review 통과

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
