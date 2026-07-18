# 세션 핸드오프 — 2026-07-14 (Teameet v1 대회 도메인 폴리시 + main↔dev 통합)

## 2026-07-15 재개 스냅샷 (최신 결정 — 아래의 오래된 충돌 항목보다 우선)

### 사용자 최신 결정

- 실제 작업 브랜치와 PR base는 `dev`다. 루트 체크아웃은 다른 세션 보호를 위해 건드리지 않고, 격리 워크트리 `.claude/worktrees/dev-verify`의 로컬 `dev`에서 작업한다.
- v1 웹 개발 서버는 기존 `3013` 하나만 사용한다. 별도 웹 포트를 추가로 띄우지 않는다. API는 `8121`이다.
- production은 dump/pull 전용 read-only다. production 쓰기, 마이그레이션 실행, 데이터 수정은 금지한다.
- production snapshot은 기존 로컬 dev DB를 먼저 임시 backup한 뒤 그 DB 자체에 복원한다. production에는 `pg_dump` 외 작업을 하지 않고, 남은 migration과 이벤트 데이터 삽입은 복원된 로컬 DB에서만 실행한다.
- 회원가입 신규 사용자에게 이름, 휴대폰 번호, 생년월일, 성별을 모두 필수로 요구한다. 이 결정은 아래 §4의 과거 optional 결정보다 우선한다. 기존 nullable production row는 보존하고 신규 가입 경계에서만 강제하므로 이 변경 자체에는 DB 마이그레이션이 필요하지 않다.
- 대회 마케팅 페이지는 동적 캠페인 템플릿으로 만든다. 각 이벤트가 대회 전용 페이지처럼 보이도록 편집 가능해야 하고, 일회성 사용 후에도 DB 레코드는 남긴다.
- 브라우저 코멘트 4건을 모두 처리한다: 대회 목록 배너 정렬, 홈 배너 비율, 팀 기본 identicon 이음선 제거, 회원가입 필수 필드.
- Web은 browser `/v1` base path를 완전히 제거하고 모든 페이지를 root route로 제공한다. `/v1/*` alias/redirect는 남기지 않아 HTTP 404여야 하며 backend `/api/v1` prefix는 유지한다.
- UI 변경은 라이브 브라우저 기능 검증과 390/768/1440 시각 QA를 거친다.

### 현재 Git·런타임·DB 기준점

- [x] 이 wave 직전 committed cursor는 `d25a3875` (`docs(tasks): record dev verification progress`)다. 이후 변경은 최종 검증과 pathspec commit 전까지 미커밋 상태로 관리한다.
- [x] 기존 개발환경만 사용한다: Web `3013`, API `8121`, 기존 dev PostgreSQL. 별도 Web/API/DB를 검증 기준으로 만들지 않았고 production은 쓰지 않았다.
- [x] 기존 dev DB의 54개 migration 상태는 교체 전 custom-format backup으로 보존했다. 2026-07-17에는 사용자가 승인한 production read-only snapshot을 이 기존 DB 자체에 복원하고 저장소의 17개 migration을 적용해 성공 migration 이름 57개, public tournament 2개를 유지했다. 별도 DB, reset, seed reset, db push는 사용하지 않았다.
- [x] 브라우저 root promotion 실제 응답: `/home` 200, `/v1/home` 404, `/api/v1/health` 200. backend `/api/v1`은 유지되고 browser `/v1` alias는 없다.
- [x] 브라우저 코멘트 4건 구현 및 focused RED→GREEN 검증. 회원가입 필수 필드는 390/768/1440 라이브 시각 QA까지 완료했고, 전체 통합 검증은 최종 게이트에서 한 번만 실행한다.
- [x] 동적 캠페인 backend/data/Web 계약 구현: persistent 1:1 row, typed content, required `highlightsSectionTitle`/`faqSectionTitle`, permanent slug, published/archived lifecycle, dedicated admin preview, public/admin UI, audit, frontend hook/MSW 계약.
- [x] 기존 dev runtime lifecycle: QA campaign `cc6a970d-b25d-4ebd-99de-a21024efab1b` / `ulw-qa-campaign-20260715-0436`을 draft create → preview → edit/reload persistence → publish → public API/page/CTA → archive retention/public 404 → republish visual fix 확인 → final archive 순으로 검증했다. public archive 상태는 proxy 경유 `GET`과 `HEAD` 모두 실제 HTTP 404였다.
- [x] owner는 기존 `admin@teameet.v1`을 사용했다. 기존 dev DB에 support persona가 없어 live support 브라우저 검증은 하지 않았고, support read-only/owner·ops mutation 경계는 focused permission tests로 검증했다.
- [x] QA cleanup은 exact transaction으로 status log 5, action log 8, campaign 1개만 삭제했다. cleanup 뒤 campaign 0, QA action log 0, QA status log 0, tournament 2를 확인했다.
- [x] public/admin/archive UI를 390×844, 768×1024, 1440×900에서 최종 재캡처했다. 공개 화면은 가로 넘침·깨진 이미지·비정상 콘솔 오류 0, CTA 50px였고, archive는 실제 HTTP 404와 CTA 44px를 확인했다. 관리자 화면은 캠페인 상태/편집/초안/보관 컨트롤과 실화면 preview를 세 viewport에서 확인했다. 최종 증거는 `output/playwright/visual-audit/session-handoff-2026-07-14/campaign-live-qa/final-*`다. 재검증용 캠페인 `13227f35-c48b-49a0-bc1b-9e8263096465`은 action log 3/status log 2/row 1만 transaction 삭제했고 campaign 0, tournament 2로 원복했다.
- [x] 브라우저 SEO: `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` 200, 공개 목록/상세별 title·description·canonical·Open Graph·Twitter metadata, 개인/인증/관리/action route `X-Robots-Tag: noindex`, 공개 상세와 campaign true HTTP 404를 적용했다. dev sitemap은 undefined URL 없이 39개 URL을 반환한다.
- [x] 보안 즉시 개선: 이미지/영상 업로드는 MIME+크기뿐 아니라 실제 JPEG/PNG/WebP/WebM/ISO-BMFF signature를 검증하고 spoof temp를 삭제한다. 알림 deep link는 same-origin root-relative route만 허용한다. 홈 geolocation은 자동 요청하지 않고 user gesture 뒤에만 요청하며 Open-Meteo에는 2자리 좌표만 전송한다. 온보딩 API/session draft는 raw latitude/longitude를 저장하지 않고 matched region id/name만 보존한다. `/my/settings/location`도 dev 브라우저에서 진입 시 요청 0회, 명시 버튼 클릭 뒤 1회, same-origin region resolver 201, 좌표 미저장 안내와 390×844 레이아웃을 확인했다(`output/playwright/security-audit/location-settings-390x844.png`).
- [x] Codex Security standard 전체 scan `ac898bd4-fc5c-4024-9360-9ef52bb9162e`은 workspace `1a52d3a8-1d57-434b-881a-9430e0460095`에서 152/152 파일, validation 44/44, attack-path 44/44, reportable finding 21건(Critical 1, Medium 11, Low 9)을 완료했다. manifest·finding write-up 21건·hardening portfolio·final Markdown report는 schema validation 후 로컬 sealed 상태다. plugin indexing transport만 미완료이며 remediation 상태는 `docs/security/v1-security-scan-remediation.md`가 canonical ledger다.
- [ ] UI 완료 후 pathspec commit을 만들고 committed-tree 검증 → `dev` push, 기존 PR #69 정리 판단.

### 2026-07-18 이벤트 허브·캠페인 후속 폴리시

- [x] 브라우저 코멘트 기준으로 `/events`를 desktop 3열, tablet 2열, mobile 1열의 동일 비율 카드 그리드로 재구성하고 제목·요약·일정·장소·상금·신청 마감·상세 CTA의 정보 위계를 통일했다.
- [x] 캠페인 hero에 실제 `registrationDeadlineAt` 기반 마감 카운트다운과 상태별 실제 CTA를 추가했다. 상단 핵심 정보는 일정·장소·총 상금·후원사로 바꾸고 참가 현황·참가비는 제거했다.
- [x] 상금 블록을 강조하고 구조화 상금 배분을 노출했다. 후원사 섹션은 실제 sponsor 데이터를 카드로 표시하며, 데이터가 없을 때는 가짜 후원사를 만들지 않고 공개 예정 상태를 명시한다.
- [x] 이벤트 허브와 캠페인 각각 Lazyweb 리포트를 생성했다: `f5f48213-8638-4c79-a857-fc57327363ff`, `4eca22f5-ae06-49ca-ae5d-e701cc17ac48`.
- [ ] 호스트 preflight는 load 3.80/12 cores였지만 Node 683개, swap 27.47/28GB로 비정상 압박을 확인했다. 다른 세션 프로세스는 종료하지 않았고 새 dev server·Vitest·typecheck·build를 시작하지 않았다. 기존 Node REPL 프로세스에서 변경 TSX/CSS syntax만 확인했으며 오류는 0개다. GitHub CI와 alpha 배포 뒤 headed browser 390/768/1183/1440 검증을 완료해야 한다.

### 2026-07-16 production snapshot + 이벤트 데이터 추가

- [x] `matchup-prod` SSH alias로 production PostgreSQL health와 read-only 통계를 확인했다. 2026-07-17 fresh snapshot은 약 14.8MB, 성공 migration 40개, public 대상 대회 2개/풋살 1종목이며 캠페인 테이블 migration 전 상태다. 사용자/인증/PII 데이터 본문은 조회하거나 출력하지 않았다.
- [x] 기존 local dev DB는 약 15.6MB, 성공 migration 54개, campaign 0개, public 대상 대회 2개다.
- [x] `apps/v1_api/prisma/seed-event-campaigns.ts`를 추가했다. production mode, 명시적 opt-in 부재, non-loopback DB를 모두 거부하고, 기존 실제 캠페인은 보존하며 `dev-event-*` 캠페인만 멱등 갱신한다.
- [x] 같은 local-only seed에 production 사용자와 무관한 `윤하늘` QA 사용자와 `청라 블루웨이브 FC` 풋살팀을 멱등 upsert한다. 실제 dev header-auth 계약의 session storage 키를 결과로 제공하고, 사용자·팀 신뢰 신호는 `sample`로 명시한다.
- [x] production 공통 migration 37개의 checksum은 현재 저장소와 37/37 일치한다. fresh snapshot의 production-only 3개(chat room polish, profile real name, chat membership backfill)는 최신 main 통합 전까지 로컬 DB에 그대로 보존하며, nullable/defaulted 컬럼이라 local seed와 현 dev runtime을 막지 않는다. 최종 schema diff는 최신 main 통합 뒤 닫는다.
- [x] 이벤트 seed는 검증된 종목별 local 실사 mock을 ignored `apps/v1_api/uploads/dev-events/`에 복사하고 `/uploads/dev-events/*`로 사용한다. production upload 파일이나 원격 이미지는 가져오지 않는다.
- [x] 대회 신청 시작·최종 제출·취소 요청·취소 철회에 same-tick 연속 클릭을 막는 동기 ref lock을 추가했다. `isPending` 반영 전 두 요청이 나갈 수 있던 경계를 닫았고 실제 network request count 검증은 복원 후 수행한다.
- [x] 기획자 전달용 진행 문서 `docs/plans/2026-07-16-event-hub-user-scenario-qa-report.md`를 만들고 DB 기준·실사용 시나리오·스크린샷 인덱스를 누적하기 시작했다.
- [x] 현재 dev DB custom-format backup 검증 → production read-only stream dump 검증 → 기존 dev DB 교체 복원 → local-only `prisma migrate deploy`를 완료했다. production에는 `pg_dump` 외 쓰기가 없었고 rollback backup은 최종 검증 전까지 mode 0600 임시 보관한다.
- [x] 혼성부·남자부 실제 대회 데이터에 캠페인 2건을 로컬에 넣었다. opt-in 부재 시 mutation 전 거부, 1차 `created=2`, 2차 `created=0/updated=2`, SQL의 campaign/distinct slug 각 2를 확인했다.
- [x] `/events` 목록·풋살 필터·상세·뒤로가기 query 복원·신청 경계와 로딩/애니메이션/이중 submit을 실제 사용자 속도로 검증했다. 22개 PNG, 단일 mutation request count, exact DB cleanup, 기획자 전달 문서를 `docs/plans/2026-07-16-event-hub-user-scenario-qa-report.md`에 기록했다.

### Historical blocker / current residual

- 호스트 부하 게이트(2026-07-15 13:30→13:41→13:42→13:44 KST)는 12코어에서 load 10.69→23.90→25.85→22.79, swap 사용 12.1GB/13GB→17.8GB/18GB→17.3GB/18GB→18.9GB/19GB, Node/Next/Nest/테스트 계열 프로세스 575→729→747→821개로 악화됐고 Web 3013/API 8121은 계속 down이었다. 읽기 전용 process-parent 집계에서 서로 다른 ChatGPT/Codex 작업이 띄운 MCP/Playwright/LSP/codegraph 실행 묶음이 주요 command별로 42개씩 중복된 상태를 확인했다. 현재 task 소유권을 증명할 수 없으므로 종료하지 않으며, 상태가 안정되기 전에는 새 dev server·브라우저·테스트·typecheck·build·lint·보안 서브에이전트를 시작하지 않는다. 정책 문서 pathspec commit도 기존 QA contract 검증을 안전하게 실행할 수 있을 때까지 보류한다.
- 자동 재개 후 3회 감사에서도 blocker가 반복됐다. 마지막 2026-07-15 13:46 KST에는 중복 프로세스가 350개로 감소했지만 load가 30.88까지 급등했고 swap은 12.8GB/14.3GB였다. 코어 수를 크게 넘는 load와 지속적인 swap 압박 중 하나라도 남아 있으면 안전 상태로 보지 않는다.
- Lazyweb 연결은 복구되었고 캠페인 UI report(https://www.lazyweb.com/report/lazyweb/51a09311-a5d3-4fd2-bead-89dcc6ab6b38/?source=create)와 회원가입 필수-field report(https://www.lazyweb.com/report/lazyweb/d886f37f-7131-46a9-8b29-899aa288c1a4/?source=create)가 모두 `degraded=false`, `failures=[]`로 완료됐다. 회원가입 실제 화면 증거는 `output/playwright/visual-audit/session-handoff-2026-07-14/signup-required-fields/`의 390x844, 768x1024, 1440x900 캡처다.
- 캠페인 관리자 API는 signed HttpOnly v1 session을 사용하고 production의 forged identity header는 fail-closed로 검증됐다. Production은 강한 session secret이 없거나 legacy `V1_ALLOW_HEADER_AUTH=true`가 남아 있으면 부팅을 거부하며, client-controlled identity header를 다시 활성화하는 opt-in 경로는 없다.
- 업로드 저장소는 사용자 소유권 원장과 24시간/retained quota, MIME signature, 실패 cleanup을 갖췄다. 다만 public unguessable URL 방식이며 attachment별 delete/retention/orphan collector와 malware scanner는 아직 없어 private document 저장소로 사용하지 않는다.
- 알림은 현재 DB 기반 in-app notification이다. Browser Push API/service worker/VAPID subscription/notification permission prompt는 active v1 runtime에 구현되어 있지 않다.
- 2026-07-17 14:05~14:06 호스트는 load 약 28~30/12 cores, swap 여유 약 0.5~0.65GB로 악화됐다. DB 복원·migration·소량 seed까지만 직렬 완료했고, dev server 재기동·브라우저·테스트·build·GPT review는 회복 전 시작하지 않는다. 외부 Virtualization/Chrome/검색 프로세스가 주요 부하이며 다른 세션 소유 프로세스는 종료하지 않는다.

### 세션 2 (2026-07-15) — 캠페인·이벤트·프로필 진행 스냅샷

**커밋 SHA**: `287fa869` (`feat(v1/campaign): event hub, trust profile, campaign list API`)

**완료된 작업**:
- PR #69 (main→dev 통합) CLEAN+CI SUCCESS → dev 머지 완료 (`3fc5bfc2`)
- 백엔드: `GET /tournaments/campaigns` 목록 엔드포인트 추가 (cursor pagination, sportCode 필터, max 50)
- 프론트엔드: `/events` 이벤트 허브 페이지 (published 캠페인 목록, 종목 필터, EmptyState, ErrorState)
- 프론트엔드: `/tournaments` 목록 페이지에 이벤트 허브 배너 추가
- 프론트엔드: `/users/[id]` 신뢰 중심 공개 프로필 개선 (TrustState verified/estimated/sample + 매너점수 명시)
- 타입: `V1TournamentCampaignListItem`, `V1TournamentCampaignList` 추가
- 훅: `useV1TournamentCampaigns()` 추가
- MSW: 목록 핸들러 + `createV1TournamentCampaignListItemFixture` 추가
- 문서: `docs/scenarios/16-tournament-campaigns.md` 신규 작성
- 문서: `docs/api/v1/domains/tournaments.md` 캠페인 API 섹션 추가

**신규 페이지·프로필 결정**:
- A/A 자율 진행: 이벤트 허브(`/events`) + 신뢰 중심 프로필(`/users/[id]`) 구현 완료
- 사용자 명시 확인이 필요했으나 자리를 비워 아티팩트 기준 A/A 적용

**블로커 (다음 세션에서 처리)**:
1. **대회 생성 폼 4단계 위저드(Task #93)**: Phase 2(성별 쿼터 재조정) 미반영 상태로 착수 불가. `feat/v1-tournament-gender-quota` Phase 2 PR 생성 후 dev 머지되면 착수 가능.
2. **Visual QA**: 당시에는 서버 불안정으로 미실시였으나 세션 3에서 기존 dev 서버 기준 390/768/1440 및 클릭 QA를 완료했다.
3. **성별 쿼터(Phase 2)**: 당시 미구현이었으나 세션 3에서 기존 `genderSnapshot` 기반으로 backend·DB·관리자 UI까지 재조정해 구현했다.

### 세션 3 (2026-07-16) — 성별 쿼터·대회 위저드·전역 폰트 진행 스냅샷

- [x] `V1TournamentGenderCategory`와 대회 쿼터 4필드, nonnegative/range/mixed-only/roster-capacity DB 제약을 추가했다. 선수 성별은 새 컬럼을 만들지 않고 기존 `genderSnapshot`을 재사용한다.
- [x] 혼성 명단 잠금은 registration row lock과 쿼터 집계·감사 로그를 하나의 serializable transaction에 묶고, 미충족 시 `TOURNAMENT_GENDER_QUOTA_NOT_MET`의 남성/여성 상세를 반환한다.
- [x] 생성 폼을 4단계 controlled wizard로 교체했다. D-3 신청 마감, D-7 명단 마감, 8/6/10 기본값, 직전 대회 계좌 복사, 구조화 상금, 커버, 홈/목록 홍보 미리보기를 포함한다.
- [x] 생성·수정에서 날짜, 커버, 상금 배분, 홍보 카드 컴포넌트를 공유하도록 상세 편집의 중복 구현을 제거했다.
- [x] v1 Web의 root/font utility/form control/code 기본 폰트를 self-hosted Pretendard Variable로 통일하고, 규정·환불 입력의 별도 monospace 지정을 제거했다. 외부 CDN 대신 `/public/fonts`의 로컬 WOFF2와 OFL 라이선스를 사용해 production CSP에서도 실제 폰트가 로드된다.
- [x] 보안 scan의 마지막 source finding R05-001에 `V1UploadAsset` 소유권 원장, rolling 24시간 이미지 50MB/영상 500MB, 사용자별 retained 2GB 한도와 동시 요청 row lock을 구현했다. quota/DB 실패는 temp·이동 파일을 정리한다.
- [x] 사용자 지정 `insane-review` Codex 스킬과 실행 런타임을 설치하고 환경 점검(`node/deps/browser=ok`)을 통과했다. 권한·최종 코드리뷰는 테스트·브라우저 증거가 모인 뒤 현재 스킬이 요구하는 GPT-5.6 Pro로 실행한다.
- [x] `/events`를 공개 SEO route와 sitemap에 포함하고, 캠페인 이미지에 runtime fallback을 적용했다. 목록은 첫 30개에서 조용히 잘리지 않도록 cursor infinite query와 직렬 `더 보기`를 사용하며, 후속 페이지 실패 시 이미 불러온 목록을 유지한다. public campaign query의 `limit`은 DTO에서 1~50 정수로 검증하고 동일 `publishedAt`에서도 안정적인 id tie-break 정렬을 사용한다.
- [x] Focused backend/Web tests와 changed-scope typecheck/build를 호스트 preflight 뒤 직렬 실행했다. API 관련 suite는 보완 재실행까지 모두 green이고 Web은 37 file·237 test를 단일 worker/no file parallelism으로 통과했다. API tsc/Nest build와 Web tsc/Next production build도 green이며 Web 3013을 webpack dev mode로 복구했다.
- [ ] GPT-5.6 Pro, 5-lane post-implementation review, Codex Security deep scan과 시각 gate를 끝내고 blocker를 수정한다.
- [x] 사용자의 light-runtime 진행 지시에 따라 기존 `v1_postgres` dev 컨테이너만 재시작하고 API `8121`, Web `3013`을 각각 추적 가능한 단일 프로세스로 띄웠다. 새 DB/seed/reset/db push는 만들거나 실행하지 않았다. 기존 dev DB에는 canonical `migrate deploy`만 적용했고 heavy 검증은 여전히 중단 상태다.
- [x] dev DB에서 이전 기능 브랜치의 `20260714020000_v1_tournament_gender_category`가 적용됐지만 파일 트리에서 빠진 migration-history drift를 발견했다. DB checksum과 동일한 선행 migration을 복원하고 후속 migration이 legacy `gender` 값을 `gender_snapshot`으로 보존한 뒤 중복 컬럼을 제거하고 8개 제약을 설치하도록 정리했다. 실패 row는 Prisma `resolve --rolled-back`으로 복구했고 재실행에서 54 migrations/no pending/schema up to date, 업로드 원장 테이블, API DB health 200을 확인했다.
- [x] Prisma client 생성 후 API를 동일 `8121`에서 재시작하고 R05-001 실제 업로드를 검증했다. 정상 PNG는 201과 1,060-byte 소유권 원장 row를 남겼고 MIME 위조 PNG는 400으로 차단됐다. QA row/file을 exact ID/path로 삭제했으며 업로드 루트 temp file 0을 확인했다. 최종 closure에는 focused upload service test만 남았다.
- [x] 기존 dev DB → 현재 `schema.prisma` 읽기 전용 `prisma migrate diff --exit-code`는 `No difference detected`로 종료했다.
- [x] 기존 dev 환경 브라우저 QA: `/events`와 대회 목록/상세, 신뢰 프로필, 관리자 생성 4단계 위저드, 관리자 상세의 신청·대진·캠페인·리뷰·개인 어워드 탭, 공개 결과·브래킷·후기·시상 경로, 알림 빈 상태를 실제 클릭·로드했다. 생성 위저드는 제출하지 않았고 기존 대회의 mutation 버튼도 누르지 않았다. `/v1/home`은 404, 공개 SEO 자산은 200이며 콘솔 오류와 확인한 viewport의 가로 넘침은 없었다.
- [x] 라이브 QA에서 생성 위저드의 여성 최소 쿼터 오류 연결 누락/남성 최대 중복 `error` prop을 수정했고, 의도적인 `남성 최소 5 > 최대 4`와 `여성 최소 -1` 입력에서 각 필드별 오류가 정확히 표시되는 것을 확인했다. 관리자 상세와 생성 4단계 커버 미리보기의 LCP lazy-load 경고는 해당 사용처에서만 eager/high priority로 좁혀 제거했고, 각각 새 탭 재검증에서 warning/error 0을 확인했다.
- [x] 2026-07-16 16:32~16:41 KST에는 새 브라우저를 띄우지 않고 기존 Chrome CDP에 임시 컨텍스트 하나씩만 붙여 저부하 클릭 QA를 이어갔다. 대회→이벤트 링크, 공개 상세·결과·브래킷·후기·시상·신청, 관리자 8개 탭, 프로필 수정, 알림 목록·설정, 위치 설정을 확인했다. 알림 설정은 첫 switch를 ON→OFF→ON으로 원복했고, 위치는 거부 안내와 허용 시 `서울 종로구` 매칭을 모두 확인했으며 저장은 누르지 않았다. 화면은 Pretendard, HTTP 200, 확인 구간의 가로/텍스트 overflow 0이었고 증거는 `output/playwright/visual-audit/session-handoff-2026-07-14/integrated-dev-qa-2026-07-16/`에 있다.
- [x] 캠페인이 없는 관리자 탭에서 campaign 조회와 무관한 preview 조회까지 실행해 추가 404 콘솔 오류를 만들던 원인을 확인했다. preview query를 실제 campaign data가 있을 때만 enable하도록 수정하고, disabled 상태에서 API를 호출하지 않는 focused hook test를 추가했다. 기존 dev 화면에서 `캠페인이 아직 없어요` 빈 상태와 preview endpoint 미호출을 확인했다.
- [x] read-only frontend/security/git 감사에서 유료 대회 계좌 없이 공개·신청 가능한 경계, 홍보 이미지 업로드의 stale state overwrite, 프로필 조회 실패 시 빈 폼, 알림 switch의 브라우저 push 오인, 위치 권한 오류·동의 범위, 이벤트 초기 재시도·복귀 컨텍스트·ARIA, 홍보 우선순위, 모바일 챔피언 키보드 접근, sitemap 단일 도메인 실패 전파, 업로드 원장 실패 cleanup 검증 공백을 확인했다. 각 원인은 create/open/submit 서버 불변식, reducer patch, loading/retry state, in-app-only copy, per-use consent flag와 1회 좌표 전송 안내, 안전한 events query/back link, ordinary pressed-button semantics, priority 범위 검증, keyboard activation, `Promise.allSettled`, 실제 이동 파일 rollback test로 수정했다. 관련 focused test는 호스트 안전 게이트 뒤 최종 커밋 전에 한 번씩 직렬 실행한다.
- [x] 2026-07-16 17:17~17:26 KST에는 Web `3013`/API `8121`/기존 dev DB를 유지하고 기존 Chrome CDP에 임시 탭 하나만 열어 추가 저부하 QA를 수행했다. 위치 약관 링크가 `/terms?document=location`의 실제 문서를 열고, `/events` 로딩 종료 후 빈 상태와 종목 filter가 모바일·데스크톱에서 정상이며, 프로필 수정 폼 7개 control, 알림의 `앱 안 알림`/push 미지원 안내, 위치 버튼 전 1회 좌표 전송 안내와 허용 후 `서울 종로구` 매칭, 유료 대회 참가비 `50,000` 입력 시 은행명·계좌번호·예금주 3필드 차단을 확인했다. 대회는 생성하지 않았고 활동 지역도 저장하지 않았다. 390×844와 1440×900에서 가로 overflow 0, body Pretendard, console/page/network error 0이었으며 캡처는 `output/playwright/visual-audit/session-handoff-2026-07-14/integrated-dev-qa-2026-07-16-post-audit/`에 있다. 현재 dev DB에는 published campaign이 0개라 새 events→campaign→events query 복귀 링크의 라이브 클릭 대상은 없으며, 해당 계약은 focused page test에서 최종 확인한다.
- [x] 이후 기존 풋살 대회에 QA campaign `ulw-events-context-1784191420823`을 잠시 create/publish해 `/events?sport=futsal` → campaign → `/events?sport=futsal` 실제 클릭을 완료했다. 카드 href는 `from=events&sport=futsal`, campaign back href는 `/events?sport=futsal`, 복귀 전후 풋살 filter는 모두 `aria-pressed=true`였다. 캡처 `09-events-campaign-context-390x844.png`, `10-campaign-filtered-back-390x844.png`을 시각 검수했고 레이아웃 이상은 없었다. campaign id `526aea03-424a-408d-b1ee-022dc7f997ec`과 해당 status/action log만 transaction 삭제해 campaign 0, tournament 2로 원복했다.
- [x] 프로필 조회와 이벤트 목록 요청을 임시 탭에서만 503으로 가로채 각각 빈 편집 폼 대신 retryable error, 이벤트 초기 error+`다시 시도하기`를 확인했다. 가로채기 해제 후 같은 버튼으로 실제 dev API 데이터/빈 상태까지 복구됐고, 캡처는 `11-profile-retry-error-390x844.png`, `12-events-retry-error-390x844.png`다.
- [x] 같은 최신 API 프로세스에서 위치 resolver는 `locationConsentAccepted` 누락 시 400 `VALIDATION_ERROR`, `true`일 때만 201과 `종로구`를 반환했다. 또 유효 형식의 미존재 sport UUID를 사용한 유료 대회 create probe는 sport 조회나 생성 전에 400 `TOURNAMENT_PAYMENT_INSTRUCTIONS_REQUIRED`로 차단되어 DB mutation이 없었다.
- [x] 2026-07-16 17:32 KST에 기존 Web/API 프로세스가 외부 세션 정리와 함께 종료된 것을 발견했다. 기존 dev PostgreSQL과 15432 bridge는 정상이라 새 DB/포트 없이 API를 PID 57936/8121, Web을 PID 99456/3013으로 같은 `dev-verify` worktree에서 복구했다. `pnpm exec`가 자동 install/approve-builds preflight를 끼워 넣어 실패하며 `pnpm-workspace.yaml` placeholder를 생성했으므로 즉시 원복했고, Web은 설치된 `next` 바이너리를 직접 실행해 재발을 피했다. 복구 후 `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` 200, sitemap `/events` 포함/`undefined` 없음, `/home` 200+noindex, `/v1/home` 404, `/events` 200+index 가능, 전 경로 `DENY`/`nosniff`/Permissions-Policy를 재확인했다.
- [x] 배포 정적 보안 재검토에서 Next의 `X-Frame-Options: DENY`와 production nginx의 `SAMEORIGIN`이 중복될 수 있는 설정 불일치를 발견했다. nginx의 기본/API/static/upload/Web 응답을 모두 `DENY`로 통일했고, 현재 dev Web의 `/events`와 `/home`도 각각 공개/noindex 계약과 함께 `DENY`를 반환한다.
- [x] SEO 실응답 감사에서 존재하지 않는 대회의 `/bracket`, `/results`, `/awards`, `/reviews`가 메타데이터만 noindex이고 HTTP 200인 soft-404임을 발견했다. 공개 entity proxy preflight를 대회 하위 4경로까지 확장하고 page-level `notFound()`도 유지해, 미존재 UUID는 4/4 모두 404, 실제 대회는 4/4 모두 200임을 같은 dev Web/API에서 확인했다.
- [x] 2026-07-16 18:03~18:26 KST 저부하 브라우저 SEO/시각 QA에서 sitemap 공개 정적·대표 상세 11개 경로를 실제 렌더링했다. 모두 HTTP 200, canonical/index/OG, Pretendard, 가로 overflow 0, console/page/5xx error 0이었다. 이 과정에서 `/tournaments`와 대회 `/bracket`·`/results`·`/awards`·`/reviews`의 누락된 page-level `h1`, `/notices`와 팀 상세의 responsive 중복 `h1`을 발견해 각 공개 화면이 정확히 하나의 의미 있는 `h1`을 갖도록 수정했다. 모바일 390×844와 데스크톱 1440×1000 재검증에서도 레이아웃 변화와 오류가 없었고 캡처는 `output/playwright/visual-audit/session-handoff-2026-07-14/integrated-dev-qa-2026-07-16-post-audit/`의 `07`~`18` 파일에 남겼다.
- [x] 공개 대회 상세 API가 유료 대회의 은행명·계좌번호·예금주를 익명 요청에 반환하는 보안 경계 누수를 dev 실응답으로 확인했다. 공개 presenter와 Web public detail 타입에서 계좌 필드를 제거하고, `bank_transfer + ready`인 권한 있는 팀 신청 응답에만 nullable `paymentInstructions`를 포함하도록 이동했다. 신청 완료·재진입·내 신청 화면은 더 이상 공개 대회 payload를 결제 안내 원천으로 사용하지 않는다.
- [x] 2026-07-16 18:27 KST에 최신 보안 소스를 반영하려고 API를 재기동하는 과정에서 환경 파일을 읽지 않은 첫 시도가 DB 인증에 실패했다. 새 DB나 포트를 만들지 않고 기존 healthy PostgreSQL 컨테이너의 런타임 설정과 기존 `15432` bridge만 내부적으로 재사용해 API를 PID `77045`/`8121`로 복구했고, Web PID `99456`/`3013`과 함께 health를 확인했다. 현재 dev DB의 공개 대회 2건 상세은 모두 계좌 key 0개를 반환한다.
- [x] 2026-07-16 18:31~18:39 KST 저부하 클릭 QA에서 대회 목록 카드→상세, 상세 back, bottom-nav 마이→비로그인 `/login?redirect=%2Fmy`, 이벤트 종목 filter를 실제 클릭했다. 대회 상세의 desktop-only 시각 제목이 숨겨져도 DOM에는 두 번째 `h1`으로 남는 SEO 중복을 발견해 non-semantic `div`로 바꾸고 회귀 테스트를 추가했다. 수정 후 상세·브래킷·결과·시상·후기·이벤트·마이/로그인 모두 `h1=1`, Pretendard, 가로 overflow 0, console/page/4xx/5xx 0이었다. 캡처는 같은 `post-audit` 폴더의 `19`~`23` 파일이다.
- [x] 기존 seed owner identity를 localStorage dev-auth로만 주입해 홈→마이→프로필 수정, 설정→위치, 홈→알림을 실제 클릭했다. 별도 로그인 계정·DB mutation은 만들지 않았다. 모든 화면은 Pretendard, 가로 overflow 0, console/page/4xx/5xx 0이었고 프로필·위치 UI는 `24`·`25` 캡처로 확인했다. 이 과정에서 canonical `/home`과 `/my`에 page-level `h1`이 0개인 문서 구조 누락을 발견해 각각 시각 변화 없는 `Teameet 홈`, `마이페이지` sr-only heading을 추가했고 라이브 `h1=1` 및 `26-my-single-h1-auth-mobile.png`으로 재검증했다.
- [x] 결제 안내 경계 정적 감사에서 submit 트랜잭션이 잠금 후 최신 계좌/참가비를 재검증하고 payment row에는 반영하면서도, 최종 응답은 잠금 전 tournament snapshot으로 직렬화하는 TOCTOU 잔여를 발견했다. 트랜잭션 안에서 읽은 `lockedTournament`를 결과와 함께 반환해 `paymentInstructions`도 같은 snapshot을 사용하게 수정하고 회귀 테스트를 추가했다. API를 최신 소스로 PID `84783`/`8121`에 재기동한 뒤 health 200, 공개 대회 상세 2건의 계좌 key 0개를 다시 확인했다.
- [ ] 권한 있는 실제 신청 응답의 `paymentInstructions` live 확인을 위해 dev DB의 2개 대회와 기본 seed persona 6명, 이어서 ready bank-transfer payment row를 읽기 전용으로 조회했으나 현재 등록/결제 후보가 0건이었다. 공개 비노출 live 증거는 확보했으며 guarded 응답은 최종 host gate 뒤 `tournament-registrations.service.spec.ts` focused test로 마감한다. 검증용 registration/payment DB row는 새로 만들지 않는다.
- [ ] 2026-07-16 14:55~16:41 KST preflight에서 load는 18.75→5.22로 낮아졌지만 swap은 12.76/13GB→24.06/25GB로 악화됐고 Node 223, browser 67, MCP-like 239가 남아 있다. Web 3013/API 8121은 정상 유지하고 다른 세션 소유 프로세스는 종료하지 않았으며, focused test/typecheck/build/Pro review 직전에 같은 preflight를 다시 수행한다.
- [ ] 2026-07-16 17:17 KST 재확인에서도 12코어 load 6.62/7.74/7.78, swap 28.33/28.67GB(여유 339MB), Node 311, browser-like 99로 swap 압박과 프로세스 증가가 지속됐다. 따라서 브라우저 클릭 외 Jest/typecheck/build/lint/GPT Pro review는 시작하지 않고, 다른 세션 프로세스도 종료하지 않았다.
- [ ] 2026-07-16 17:51 KST에는 load 10.22/9.59/9.17, swap 23.15/24.58GB, Node 46, browser-like 97이었다. 사용자 소유 Chrome renderer 하나가 CPU 약 100%, RSS 약 4.4GB를 계속 사용해 새 브라우저·Jest·typecheck·build·GPT Pro review는 보류했고, 기존 Web/API는 200 상태로 유지했다.
- [ ] 2026-07-16 18:03 KST에는 12코어 load 18.36/17.55/13.37, Node 64, browser-like 68이며 외부 Virtualization 프로세스와 ChatGPT renderer가 높은 CPU를 사용했다. 기존 Web PID 99456/3013과 API PID 57936/8121은 계속 정상이라 유지했고, 새 서버·DB 없이 기존 CDP의 임시 QA 탭만 사용해 종료 후 해당 탭만 닫았다. focused Jest/Vitest/typecheck/build/GPT Pro review는 호스트가 안전해질 때까지 계속 보류한다.
- [ ] 2026-07-16 19:01 KST 재확인에서는 12코어 load 14.21/19.91/15.50, free page 약 65MB, 외부 Virtualization 프로세스 약 195% CPU, Node 60, browser-like 111로 악화됐다. Web PID 99456/3013, API PID 84783/8121, bridge PID 70621/15432, 기존 `v1_postgres`는 모두 정상이고 `/events`와 `/api/v1/health`도 200이다. 새 브라우저/Playwright context를 포함한 자동 QA와 Jest/Vitest/typecheck/build/GPT Pro review는 시작하지 않고 서버만 유지한다.
- [ ] 19:04~19:26 KST 추가 preflight에서도 swap 여유는 0.47~0.99GB에 불과했고 19:26 load는 19.09/13.64/12.85, swap used 29.7GB/30GB, Node 99, browser-like 114였다. 외부 Virtualization PID 78119가 약 257% CPU를 사용하며 압박이 계속 커져, 변경 test/typecheck/build/새 browser context/review-work/insane-review를 시작하지 않았다. 다른 세션 프로세스는 종료하지 않았고 현재 task 소유 Web/API/bridge/DB는 유지한다.
- [x] 최종 검증용 직접 설치 바이너리 `apps/v1_api/node_modules/.bin/{jest,tsc,nest}`와 `apps/v1_web/node_modules/.bin/{vitest,tsc,next}`가 모두 존재함을 확인했다. 변경된 test/spec는 API 10개+integration 1개, Web 16개로 총 27개이며 `git diff --check`는 clean이다. 최종 게이트에서는 `pnpm exec`를 사용하지 않고 이 바이너리를 `nice -n 10`, 직렬·최소 worker로 한 번씩 실행한다.
- [x] dirty tree의 untracked test까지 포함하면 이번 wave 관련 검증 파일은 API unit 20개, API integration 3개, Web unit/component 36개와 기존 v1 E2E 변경분이다. API integration harness는 `v1_migrate_check` 또는 `ulw_v1_integration_*`라는 별도 격리 DB만 허용하고 campaign fixture를 실제 생성·삭제하므로, “기존 dev DB만 사용하고 새 DB를 열지 않는다”는 사용자 결정과 충돌한다. 따라서 최종 게이트는 변경 API unit spec을 직렬 실행하고 현재 `8121` dev API의 health/public/permission 계약을 live probe로 확인한다. 별도 integration DB suite와 광범위 Playwright E2E는 실행하지 않는다.
- [x] 변경 파일 크기 감사에서 250줄 초과 TS/TSX가 다수 확인됐지만 대부분 기존 대형 v1 화면·공유 계약 파일이다. 별도 목표·범위·검증 계약 없이 전면 분해하면 최신 main 통합과 현재 기능 검증 범위를 확장하므로 이번 wave에서는 자동 refactor하지 않는다. 현재 변경에 필요한 국소 중복 제거와 TypeScript escape-hatch 제거만 유지하고, 광범위 모듈 분리는 별도 사용자 결정 작업으로 남긴다.
- [x] `X-OpenAI-Internal-Codex-Responses-Lite requires reasoning.context=all_turns` 오류 기록은 2026-07-16 13:49 KST의 Codex `0.144.2` 세션에서 발생했다. `reasoning.context`는 repo나 `~/.codex/config.toml`에 넣을 사용자 설정 키가 아니며 current app binary/CLI가 Responses Lite 요청에 맞게 직렬화해야 하는 내부 계약이다. 현재 `/Applications/ChatGPT.app/Contents/Resources/codex`와 전역 CLI는 모두 `0.144.5`, 앱 내 app-server PID 96720은 업데이트 후인 17:32 KST에 시작됐다. 임의 unknown config나 model-cache 변조는 하지 않으며, 최종 visual/review agent 호출 성공을 실제 회귀 증거로 사용한다.
- [ ] 기존 최신 캡처를 새 브라우저 없이 직접 재검수한 결과 events mobile/desktop, tournament detail mobile/desktop, my mobile/desktop, location, paid-account validation, bracket/awards/reviews, profile edit, notification settings, events campaign/back, notices/team detail, signup 390/768/1440 화면은 CJK 잘림·가로 overflow·깨진 이미지 없이 의도한 상태였다. 다만 `11-tournament-results-mobile-390x844.png`는 390×844 PNG 자체는 유효하지만 본문 하단이 검은 사각형으로 합성된 `[evidence]` 결함이고, `results-page-client.tsx` 최종 수정 시각(18:10)보다 캡처(18:05)가 오래돼 stale이다. `12-events-retry-error-390x844.png`도 검은 본문 배경이지만 error branch와 `.tm-app-frame`에는 검은 배경 코드가 없고 최종 events source(18:00)보다 캡처(17:45)가 오래돼 같은 `[evidence]` 결함으로 분류한다. 제품 수정 없이 최종 browser gate에서 results mobile과 events retry error를 fresh 재캡처하고, profile edit은 마지막 생년월일/성별/안내 카드까지 스크롤해 fixed CTA 비가림을 확인한다.


- 범용 CMS나 임의 HTML/CSS 빌더를 만들지 않는다. 코드에 고정된 Teameet 대회 전용 템플릿 1개와 대회별 `V1TournamentCampaign` 1:1 레코드만 추가한다.
- 새 레코드는 `tournamentId @unique`, 영구 고유 `slug`, `draft | published | archived`, versioned typed JSON content, `publishedAt`/`archivedAt`/timestamps를 가진다.
- hard delete API는 만들지 않고 archive 후에도 콘텐츠와 slug를 보존한다. 발행된 slug는 변경·재사용하지 않는다.
- 일정·장소·참가비·정원·상금·규정·환불·협찬은 기존 `V1Tournament`와 sponsor/registration 데이터를 SSOT로 재사용하고 content JSON에 복제하지 않는다.
- public은 published 캠페인만 `/api/v1/tournaments/campaigns/:slug`로 조회한다. dedicated admin preview는 active owner/ops/support가 draft/published/archived의 public-safe projection을 읽고, owner/ops만 create/update/status mutation 가능하며 기존 admin action log를 사용한다.
- 콘텐츠는 required editable plain-text `highlightsSectionTitle`과 `faqSectionTitle`을 포함한다. 저장·직렬화·read-time parsing에서 같은 1~120자 계약을 적용한다.
- 이 기능은 새 enum/table/unique/FK가 필요하므로 migration 파일이 필수다. 기존 대회 backfill은 하지 않고 production에는 직접 적용하지 않는다. 현재 검증은 기존 dev DB에서 수행하며 production-clone 결과는 historical evidence로만 보존한다.

### 동적 대회 캠페인 구현·검증 스냅샷

- Prisma: `V1TournamentCampaignStatus`, `V1TournamentCampaign`, migration `20260714012000_v1_tournament_campaigns`. `publishedAt`은 최초 공개 시 고정되고 `archivedAt`은 archive 진입 시 설정/draft 복귀 시 해제된다.
- API: public `GET /tournaments/campaigns/:slug`; dedicated admin `GET /admin/tournaments/:id/campaign/preview`; active admin read, owner/ops create/update/status. status reason 필수, empty/no-op PATCH 거절, DB JSON read-time 재검증.
- 경쟁 조건: update/status read·conditional update·audit를 serializable transaction에 묶고 stale write를 `TOURNAMENT_CAMPAIGN_CONCURRENT_UPDATE`로 거절한다.
- public SSOT projection: tournament 일정/장소/정원/참가비/상금/규정/환불, active sponsors, confirmed count, confirmed/waitlisted team summary. bank/PII/admin identity 제외.
- 프론트 계약: `campaignSlug`, campaign types/payloads, query keys, public/admin hooks, MSW fixtures/handlers, public server-rendered template, admin create/edit/preview/status UI가 구현됐다. upstream campaign 404만 Next `notFound()`로 변환해 실제 HTTP 404를 내고 5xx는 load error로 유지한다.
- 검증: focused RED→GREEN, 기존 dev DB/API lifecycle, exact cleanup, initial 390/768/1440 browser capture까지 완료했다. final visual revision과 저장소 전체 typecheck/test/build는 최종 게이트에서 한 번 실행한다. 상세 상태는 `docs/scenarios/16-tournament-campaigns.md`를 따른다.

> 새 세션에서 이 문서를 그대로 붙여넣고 이어서 진행하면 됩니다. 이 문서는 이전 세션의 전체 대화 맥락·사용자 지시·결정사항·진행상황을 담고 있습니다.

## 0. 가장 먼저 확인할 것 (실행 순서)

0. **루트 체크아웃(메인 작업트리, `/Users/sungjun/Documents/projects/matchup-sports-platform`)은 의도적으로 `feat/tournament-results-2leg-desktop` 브랜치에 그대로 둔다 — dev로 전환하지 않는다.** (2026-07-14 사용자 명시 확인: "지금은 전환하지 말기") 다른 세션이 이 경로/브랜치를 쓰고 있을 수 있어서다. **실제 작업(PR)은 전부 `.claude/worktrees/<name>` 격리 워크트리에서 `origin/dev` 기준으로 새로 만들어 진행**하고, 루트 체크아웃 자체는 절대 브랜치 전환·커밋하지 않는다. 새 세션에서도 이 원칙을 그대로 유지할 것 — 임의로 루트를 dev로 전환하지 말고, 필요하다고 판단되면 반드시 먼저 사용자에게 확인(AskUserQuestion)한다.
1. `.claude/worktrees/main-dev-integration` 워크트리에서 진행 중이던 **main→dev 통합 + 성별 쿼터 재조정** 워크플로우(§3, Task ID `wrmjqqhg9` / Run ID `wf_30ed6477-492`)가 끝났는지 확인:
   ```bash
   gh pr list --state open --json number,title,mergeStateStatus
   cat /Users/sungjun/.claude/projects/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/subagents/workflows/wf_30ed6477-492/journal.jsonl
   ```
   **핸드오프 문서 작성 시점(마지막 확인) 기준: 아직 진행 중** — journal.jsonl에 Phase 1(main→dev 통합) 에이전트의 `started` 이벤트만 있고 `result` 없음, 열린 PR도 0개(아직 PR 생성 전 단계, 충돌 해소/테스트 진행 중으로 추정). 끝났으면 PR 상태(CI/Copilot/머지 여부)를 확인해 마무리(§3 참고). 아직이면 이어서 모니터링(TaskList로 살아있는지 확인, 죽어있으면 §3 내용을 참고해 재실행).
2. 열려 있는 PR 전체 확인: `gh pr list --state open` — 각각 CI/Copilot 리뷰 상태 확인 후 clean하면 `gh pr merge <N> --merge` (base는 항상 `dev`, **`main`은 절대 직접 push/merge 금지**).
3. §5 "대회 생성 폼 전면 재설계"는 **성별 쿼터 기능이 dev에 완전히 반영된 뒤** 시작할 것 — 같은 파일(`apps/v1_web/src/app/admin/tournaments/new/page.tsx`)을 재작성하므로 순서가 중요.

## 1. 사용자의 핵심 지시사항 (반드시 지킬 것)

- **"내가 지시하는 작업들은 항상 다 subagent에게 위임해서 너는 management만 해."** (2026-07-14, 강화 재지시 — 전날 "왠만하면" 표현에서 "항상/전부"로 강화됨) — 실제 코드 편집·빌드·**라이브 브라우저 검증**까지 전부 `Agent`/`Workflow` 서브에이전트로 위임. 메인은 요구 파악·프롬프트 작성·결과 검토·PR 상태 확인·머지 실행 정도만 직접 수행. (메모리 파일: `sonnet-subagent-implementation.md`)
- **"우리의 소스가 더 좋다하더라도, 항상 이전버전 호환성 유지되어지게끔 데이터 구조를 명확하게 들고있자."** — main/팀원이 이미 만든 필드명·계약(예: `V1TournamentPlayer.genderSnapshot`)이 있으면, 내가 독자적으로 만든 것(`gender`)보다 **기존 명명을 우선**한다. 스키마 필드 충돌 시 항상 "이미 배포/공유된 쪽"을 기준으로 통일.
- **Git 정책**: `main` 직접 push/머지 절대 금지(사용자 승인 없이는). 통합 브랜치는 `dev`. `dev→main` 승격은 사용자 게이트.
- **Decision Matrix는 항상 AskUserQuestion으로.** 여러 옵션이 있는 결정은 표로 먼저 보여준 뒤 AskUserQuestion으로 실제 선택을 받는다. 절대 서브에이전트가 임의로 하나를 골라 구현하지 않는다.
- **PR 워크플로**: 격리된 `.claude/worktrees/<name>` 에서 작업 → `pnpm install --frozen-lockfile` → (백엔드면 `pnpm exec prisma generate`) → `tsc --noEmit` → 라이브 스크린샷 검증 → 내 파일만 pathspec 커밋 + `git show --stat HEAD` 검증 → push → `gh pr create --base dev` → `gh pr edit <N> --add-reviewer copilot-pull-request-reviewer` → Copilot 리뷰 폴링(3-8분) → finding 적대적 검증 후 실제 문제만 수정 → GraphQL `addPullRequestReviewThreadReply`(서명: 마지막 줄 이탤릭 "Addressed by Claude Code" 링크 `https://claude.com/claude-code`) + `resolveReviewThread` → CI 통과 + `mergeStateStatus: CLEAN` + 미해결 스레드 0 확인 → `gh pr merge <N> --merge`.

## 2. 알아야 할 함정 (이번 세션에서 실제로 겪은 문제들)

- **포트 3013은 이제 harness가 추적하는 "루트 체크아웃"(main-worktree, 현재 브랜치 `feat/tournament-results-2leg-desktop`) 전용 서버입니다.** `.claude/launch.json`의 `v1_web` 설정(`pnpm --filter v1_web dev`, port 3013, `autoPort:false`)은 **루트 저장소 경로**에서 실행됩니다 — `.claude/worktrees/*` 안의 파일 변경은 이 서버에 반영되지 않습니다. 서브에이전트가 어떤 워크트리에서든 라이브 검증이 필요하면 **반드시 3013이 아닌 별도 임시 포트**를 쓰고 검증 후 반드시 종료해야 합니다. (과거엔 `nohup`으로 수동 기동했다가 harness의 tracked 서버와 충돌해서 "Port 3013 in use" 에러가 난 적 있음 — `kill` 후 `preview_start({name:'v1_web'})`로 재기동해서 해결.)
- **서브에이전트가 "백그라운드 폴러가 있으니 기다리겠다"며 멈추는 패턴이 반복됩니다.** 그런 자동 폴러는 실제로 없습니다 — Agent tool로 dispatch한 서브에이전트는 자기 턴 안에서 스스로 재확인(sleep+retry 등)하지 않으면 그냥 멈춥니다. CI 대기 중 이런 응답이 오면 **직접 `gh pr checks <N>` / `gh pr view <N> --json mergeStateStatus,mergeable`로 상태를 확인**하고, 아직이면 다음에 다시 확인하거나 `SendMessage(to: <agentId>, ...)`로 재개시키세요. CI 완전 clean인데 그냥 멈춘 경우는 메인이 직접 `gh pr merge`해도 됩니다(순수 상태확인+머지는 위임 예외로 처리해왔음).
- **같은 파일을 여러 워크플로우가 동시에 재작성하면 충돌합니다.** 실제로 "성별 필드 기능"과 "main→dev 통합"이 `V1TournamentPlayer`에 각각 다른 이름(`gender` vs `genderSnapshot`)으로 같은 개념의 필드를 추가하다가 충돌 직전에 발견해서 재조정했습니다(§3). 새 큰 작업을 델리게이트하기 전에 **진행 중인 다른 워크플로우가 같은 파일/모델을 건드리는지 먼저 확인**하세요.
- **`git worktree` 목록이 매우 많습니다**(과거 세션들의 잔재 포함, `.claude/worktrees/*`와 `/private/tmp/.../scratchpad/worktrees/*` 양쪽에 분산). 새 작업은 항상 **`origin/dev`를 fresh fetch한 뒤 새 worktree**를 만드세요 — 오래된 worktree를 재사용하면 dev와 크게 벌어져 있을 수 있습니다.
- **fablize 훅이 가끔 "tool failure"를 오탐**합니다(예: 로그에 "failed"라는 단어가 우연히 포함된 정상 케이스, 또는 정상 종료된 툴콜에 대해). 실제 에러 유무는 도구 결과 자체로 판단하세요.

## 3. main → dev 통합 + 성별 쿼터 재조정 (진행 중이었음 — 최우선 확인 대상)

### 배경
사용자가 "main에 최신 업데이트가 올라왔어... dev에 conflict 안나게 병합, 새 기능 파악, 남길 기능은 남기고, 이전버전 호환성 유지"를 요청. 조사 결과:

- **main-only 커밋 5개** (`origin/dev..origin/main`), **dev-only 150개** (이번 세션 대부분의 PR 포함).
- main-only 중 3개(`8b4d857` revert, `7a5462a1` DROP TABLE, `58fd4ff9` 머지)는 **PR #31(대회 후기·개인 시상·경기 영상 기능) 전체를 되돌리는 커밋**인데, dev는 같은 기능을 같은 날짜(7/13)에 리뷰 모더레이션까지 추가하며 활발히 확장 중이었음. 루트 체크아웃 브랜치명 자체가 `feat/tournament-results-2leg-desktop`이라 이 기능이 여전히 진행형인 정황.
- 나머지 main-only 2개는 순수 신규/유용한 기능: `a2a0fd1f`(프로모 캐러셀 + 공지 팝업 어드민 관리) / `0758c22f`(대회 명단에 성별 스냅샷 + 어드민 전용 로스터 조회 엔드포인트로 403 버그 수정 + CSV 성별 컬럼 + 프론트 모달 개선 — **팀원 `seeungmin`이 이미 완성·테스트 완료한 기능**, 필드명 `V1TournamentPlayer.genderSnapshot`/`gender_snapshot`, 백필 포함).

### 사용자 확정 결정
1. **main의 revert 3개 커밋은 dev에 적용하지 않는다** — dev의 대회 후기/시상/영상 기능을 그대로 유지.
2. **main의 나머지 2개(프로모 캐러셀·공지팝업, 성별 로스터 접근 수정)는 dev로 가져온다.**

### 중복 발견 및 재조정
이 결정 전에 이미 별도로 "대회 성별 카테고리 + 성별 쿼터" 기능을 서브에이전트에 위임해서 **백엔드(커밋 `76ee0dfa`)와 프론트엔드(커밋 `12319075`)가 완성되어 브랜치 `feat/v1-tournament-gender-quota`에 push된 상태**였음. 이 기능이 `V1TournamentPlayer`에 독자적으로 `gender`(String?, `@map("gender")`) 필드를 추가했는데, main의 `genderSnapshot`과 **같은 목적의 중복 필드**임을 발견 — "이전버전 호환성 유지" 원칙에 따라 **`genderSnapshot`으로 통일하기로 재조정** 지시.

### 실행 중이던 워크플로우 (Task ID: `wrmjqqhg9`, Run ID: `wf_30ed6477-492`)
- **Phase 1 (main→dev 통합)**: `.claude/worktrees/main-dev-integration` (브랜치 `chore/v1-main-dev-integration`, base `origin/dev`)에서 `git merge origin/main --no-commit` 실행 → 26건 충돌(content 19 / modify-delete 7) 해소 → revert 관련 DROP 마이그레이션은 제외, `genderSnapshot` 마이그레이션은 타임스탬프 재넘버링(`20260714005000_v1_tournament_player_gender_snapshot`, dev의 동일 prefix `20260714000000_v1_tournament_geo_integration_settings`와 충돌 방지) → tsc/전체 테스트 → PR 생성 → Copilot 루프 → merge.
- **Phase 2 (성별 쿼터 재조정)**: Phase 1이 반영된 dev 기준으로 `feat/v1-tournament-gender-quota`를 재작업 — `V1TournamentPlayer.gender` 필드 제거하고 이미 존재하는 `genderSnapshot`을 재사용하도록 백엔드/프론트 전부 리네이밍, 마이그레이션에서 player 컬럼 추가 부분 제거(genderCategory+쿼터 4필드만 남김), 중복 로직/UI 제거 → 재검증 → PR → Copilot 루프 → merge.

**확인 방법**: 위 §0-1 명령으로 journal.jsonl 확인. 완료됐으면 `gh pr list --state open`에서 관련 PR(제목에 "main", "통합", "성별" 포함) 상태 확인 후 마무리.

### ⚠️ 완료 후 반드시 함께 검증할 것 (회귀 체크리스트)

이 작업은 **150개 dev 커밋과 5개 main 커밋을 병합하며 26건의 충돌을 수동 해소**한 작업이라, PR이 머지된 뒤 아래 항목을 **반드시 라이브로 재검증**할 것 — CI/tsc/유닛테스트가 통과해도 실제 화면에서 깨질 수 있는 지점들이다.

- **[Phase 1 회귀 체크]** dev의 대회 후기·개인 시상·경기 영상 기능(PR #31 유래)이 병합 후에도 **그대로 정상 동작**하는지: 대회 결과 페이지, 개인 시상 페이지, 리뷰 작성/조회, 리뷰 모더레이션(숨김/복원), 경기 영상 업로드/재생 — 전부 화면에서 직접 클릭해 확인. (충돌 해소 과정에서 "dev 쪽 유지"로 기계적으로 처리한 파일들이 실제로는 프로모 신규 코드와 뒤섞여 있어 수동 병합이 필요했던 지점 — `tournament-hero-card.tsx`, `use-v1-api.ts`, `types/api.ts`, `tournaments/page.tsx`, `globals.css`/`tournaments.css`/`home.css` — 이 파일들이 정상 렌더되는지 특히 주의.)
- **[main 신규기능 반영 체크]** 홈/대회목록 프로모 캐러셀이 정상 노출되는지, 어드민 `/admin/popups` 공지 팝업 관리 화면이 동작하는지.
- **[성별 로스터 접근 기능 체크 — main 유래]** 어드민이 팀 비멤버여도(예: ops/support 권한) 로스터 조회가 403 없이 되는지, 로스터 모달에 "남성/여성/미등록"이 정상 표시되는지, CSV 다운로드에 성별 컬럼이 포함되는지, 기존 로스터 행이 프로필 성별로 **백필**되어 있는지(신규 마이그레이션의 백필 SQL 실행 결과 확인).
- **[성별 쿼터 기능 체크 — 재조정 후]** `genderSnapshot` 필드로 통일된 뒤에도: 혼성 대회 생성 시 성별 카테고리+쿼터 필드 노출, 로스터 화면 성별 집계 패널이 **main에서 가져온 로스터 모달의 남성/여성/미등록 표시와 중복되지 않고** 자연스럽게 공존하는지, 명단 확정(잠금) 시 쿼터 미충족이면 실제로 차단되는지(`TOURNAMENT_GENDER_QUOTA_NOT_MET`), 회원가입 성별 select가 정상 동작하는지.
- **[스키마 드리프트 최종 재확인]** `prisma migrate diff`로 drift 0 재확인 — 두 브랜치의 마이그레이션이 합쳐진 뒤라 타임스탬프 순서/의존성이 꼬이지 않았는지 최종적으로 한 번 더 확인.
- 위 항목 중 하나라도 깨져 있으면 **"재검토 필요" 항목으로 처리하고 사용자에게 보고** — 임의로 되돌리거나 추측으로 고치지 말 것(규칙: 모호함은 재계획 진입).

## 4. 성별(gender) 관련 기능 전체 요구사항 요약 (여러 메시지에 걸쳐 확정됨)

| 결정 항목 | 확정 내용 |
|---|---|
| 대회 성별 카테고리 | `V1Tournament.genderCategory` 전용 enum 필드(`mixed\|male\|female`), 자유문자열 아님 |
| 인원 자동 필터링 범위 | 선수 추가 시엔 집계만 표시(차단 없음). **"명단 확정/잠금" 시점에만** 성별 쿼터(`genderMinMale/genderMaxMale/genderMinFemale/genderMaxFemale`, 전부 nullable) 충족 검증 → 미충족 시 확정 차단. `genderCategory==='mixed'`인 대회에만 적용(남성부/여성부는 검증 대상 아님, 단순 태깅만) |
| 유저/선수 성별 데이터 흐름 | `V1UserProfile.gender`(이미 존재) → 선수 로스터 추가 시 서버가 스냅샷(폼 수동입력 아님, `realName`/`birthDate`와 동일 패턴) → **필드명은 `genderSnapshot`으로 통일**(main 기존 관례 따름, 제가 만들었던 `gender` 필드명은 폐기) |
| 회원가입 이름·성별·전화번호·생년월일 | **2026-07-14 최신 결정으로 신규 이메일·소셜 가입 시점에 모두 필수**. 기존 nullable production row는 유지하고 신규 가입 DTO/UI 경계에서만 강제한다. 이 행은 과거 optional 결정을 명시적으로 supersede한다. |
| 신규 DB 컬럼 필요 여부 | 유저 성별/전화번호/생년월일 컬럼은 **이미 존재** — 신규 추가 불필요. 신규 컬럼은 대회의 `genderCategory`+쿼터 4개, 선수의 `genderSnapshot`(main에서 이미 옴)뿐 |
| 에러 코드 | `TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID`(400, 대회 생성/수정 시 min>max 등) / `PLAYER_REQUIRED_PROFILE_MISSING`(400, 재사용) / `TOURNAMENT_GENDER_QUOTA_NOT_MET`(409, 명단 확정 시, `details.male/female` 포함) |
| 제외 범위 | 남성부/여성부 대회의 성별 불일치 검증 없음. 기존 자유문자열 `genderRule`(Match/TeamMatch/TeamProfile)은 불변경, 완전 별개 |

## 5. 대기 중: 대회 생성 폼 전면 재설계 (설계 완료, 구현 미착수)

### 사용자 피드백
"대회 등록할때 현재있는 대회 수정과 하단에 있는 상품 등록... 플로우가 좀 다른것같아... 폼이 레거시... 날짜나 시간 입력도 수기로 입력해야해서 불편... 자동으로 완성할수있는것들은 자동완성... 대회 등록과 추가정보 등록 모두 개선."

### 조사 결과 (핵심)
- `apps/v1_web/src/app/admin/tournaments/new/page.tsx`(생성 폼): 날짜 3필드(`scheduledAt`/`scheduledEndAt`/`registrationDeadlineAt`)가 **수기 텍스트**(`DatetimeTextInput`, 로컬 정의), 상금 배분도 자유 textarea, 커버 이미지·홍보카드 입력 자체가 없음.
- `.../[id]/tournament-detail-client.tsx`(수정 화면): 날짜는 **native `datetime-local`**, 상금 배분은 구조화 행 편집기(합계 자동채움 + 라이브 미리보기), 커버 이미지 업로더, 홍보 카드 구조화 폼 — 전부 이미 존재하지만 **생성 폼과 컴포넌트 공유 없음(중복 구현)**.
- 사용자가 **"C. 전면 재설계"** 선택(A: 날짜picker만 교체 / B: 공용화+자동완성 3종 / C: 다단계 위저드+라이브미리보기+생성시커버·프로모통합, 전부 제시 후 C 선택).

### 확정 설계 스펙 (구현 에이전트가 그대로 따를 문서 — 아래는 요약, 전체 스펙은 이전 세션 기록 참고)
- **4단계 위저드**: Step1 기본정보(종목/대회명/형식/**성별카테고리 슬롯**) → Step2 일정·장소(native date/time picker, 마감일 D-3 자동제안) → Step3 참가조건(팀수/선수수 기본값 프리필 8/6/10, **성별 쿼터 슬롯**, 계좌 "직전 대회 불러오기") → Step4 상금·규정·홍보(구조화 상금편집기+라이브미리보기+커버+홍보카드).
- **"위저드 상태소실" 회귀 방지가 Critical**: 전 스텝 필드를 부모의 단일 `useReducer`/`useState` 객체 하나로만 관리, 스텝 컴포넌트는 controlled(자체 필드 state 금지). 6개 구체 테스트 시나리오(T1~T6, 뒤로가기/스텝점프/재업로드 시 값 보존)로 검증할 것.
- **공용 컴포넌트 4종 신규 추출**(생성+수정 화면 공용): `tournament-datetime-field.tsx`, `prize-breakdown-editor.tsx`, `cover-image-uploader.tsx`, `promo-card-fields.tsx` — 전부 기존 detail-client.tsx의 검증된 로직을 그대로 승격.
- **자동완성 스펙**: 마감일=시작일 D-3 23:59(수동편집 시 자동제안 중단, `deadlineDirty` 플래그), 기본값 프리필(팀수8/최소6/최대10/형식 `group_knockout`), 계좌 "직전 대회 불러오기"(`useV1AdminTournaments` 재사용, createdAt desc 정렬 후 계좌 3필드만 복사).
- **후속 필수**: `tournament-detail-client.tsx`도 동일 공용 컴포넌트로 스왑해 중복 제거(별도 커밋 권장 — 안 하면 기술부채 잔존).

### 왜 대기 중인가
성별 카테고리(§4)의 프론트 필드가 정확히 이 `new/page.tsx`의 Step1/Step3에 들어가야 하는데, §3의 main↔dev 통합과 성별 쿼터 재조정이 먼저 이 파일을 건드리고 있어서, **그 작업이 dev에 완전히 반영된 뒤에 이 위저드 재설계를 시작**하기로 순서를 잡음(같은 파일 동시 재작성 충돌 방지).

### ⚠️ 구현 착수 전 + 완료 후 함께 검증할 것
- **착수 전**: §3의 main↔dev 통합 + 성별 쿼터 재조정 PR이 dev에 완전히 머지됐는지, 그리고 §3의 회귀 체크리스트가 전부 통과했는지 먼저 확인. 머지된 `new/page.tsx`에 성별 카테고리/쿼터 필드가 정확히 어떤 모양으로 들어가 있는지(변수명·UI 위치) 실제로 읽고 나서 위저드 스펙의 Step1/Step3 슬롯 위치에 맞춰 넣을 것 — 스펙 작성 시점엔 아직 그 필드가 병합되지 않아 "위치만" 지정해뒀음.
- **완료 후**: 이 위저드 재설계가 끝나면 **성별 카테고리+쿼터 필드가 새 위저드 안에서도 정상 동작하는지 반드시 함께 재검증**할 것(단, 필드를 이 폼에 처음 만드는 게 아니라 기존 필드를 새 레이아웃으로 옮기는 것이므로 백엔드 재검증은 불필요, 프론트 렌더링·제출 payload만 확인). 구체적으로: (1) 혼성 선택 시 Step3에 쿼터 4필드가 조건부 노출되는지, (2) 스텝 전환(뒤로가기 포함)에도 성별 카테고리/쿼터 값이 유실되지 않는지(§5의 T1~T6 시나리오에 이 필드도 포함해서 검증), (3) 제출 payload에 성별 필드가 정상 포함되는지.

## 6. 이번 세션에서 완료·머지된 것 (dev 기준, 참고용)

PR #58, #59, #60, #61, #62, #63, #64, #65, #66, #67, #68 — 전부 dev에 머지 완료. 주요 내용:
- 매치 상세 `toDetailMode` 'closed' 모드 신설(비참가자에게 거짓 "승인완료" 배너 뜨던 버그)
- 어드민 문의 답변 수정 기능
- 대회 배너 CTA 비대칭 여백 수정
- 대회 일정 시간 표시 + 안내문구 hairline
- 어드민 문의 미확인 건수 배지
- 대회 현장안내 배지 제거(정보 없는 뱃지)
- 홍보카드 실시간 미리보기
- 어드민 대진관리 탭 3단계 스텝 위저드 재설계(Copilot이 지적한 "확정 팀 없어도 3단계 열리는" 버그도 수정)
- 회원가입 프로필 사진 선택 영역 시각 개선
- 팀원 0명일 때 명단 등록 크래시 수정(+ 매치 신청자 목록에도 동일 가드 적용)

## 7. 진행 중 작업 #82 (이 세션 이전부터 있던 별도 in_progress 태스크)

"전역 로딩중 이중 제출(더블클릭) 방지 점검" — 이번 세션에서 다루지 않음. 필요시 확인.

## 8. 전체 태스크 #1~#95 — 사용자 지시 리스트업

> 세션 TaskList(`TaskList` 도구)의 태스크 번호이며, **GitHub PR 번호와는 별개의 체계**다(우연히 숫자대가 겹치니 혼동 주의 — 예: Task #60 ≠ PR #60).
> **#1~#84는 이 대화 맥락 시작 이전(요약된 이전 세션)에 생성된 항목**이라 사용자의 원문 그대로를 이 세션에서 보유하고 있지 않다 — 아래 "지시 요약"은 TaskList에 기록된 제목(subject)을 그대로 옮긴 것이며 실제 원문 문장이 아니다. **#85부터는 이 대화에서 직접 확인한 사용자 발화**라 원문에 가깝게(또는 완전 원문으로) 적었다.

### #1~#84 (원문 미보유 — TaskList 제목 그대로, 완료됨)

| # | 지시 요약(TaskList 제목) |
|---|---|
| 1 | 대회 도메인 전체 표면 파악 (프론트·백엔드·어드민) |
| 2 | 어드민 "대회 정보" 탭 신설 — 상금 3필드 수정 기능 구축 |
| 3 | 레이아웃·아이콘·컬러칩 감사 — 4개 폼팩터 |
| 4 | 테스트 시나리오 작성 + 전 시나리오 실행 |
| 5 | QA·기획 전달용 아티팩트 제작 (디자인 스펙 + 시퀀스 플레이어) |
| 6 | 경기 영상 URL 기능 — 스키마·API·어드민 입력·공개 표시 |
| 7 | 공지·규정·환불정책 텍스트 포매팅 일관화 |
| 8 | 대회 도메인 아이콘 lucide 통일 |
| 9 | 터치타겟 44px — 푸터 링크 + 어드민 백링크 |
| 10 | 종목(sportId) 생성 후 변경 가능화 |
| 11 | 핸드오프 아티팩트 전면 재제작 — 풀페이지·인벤토리·플로우·GIF |
| 12 | 루트 라우팅 → /v1 얼라이어스 (구앱 아카이빙, historical title; 현재 결정으로 superseded되어 browser `/v1/*`는 제거·404) |
| 13 | 대회 커버 이미지 업로드 — DTO·서비스·어드민 UI |
| 14 | 아티팩트 캡처 결함 수정 + 재발행 |
| 15 | 금액 입력 자동 콤마 포맷 (생성폼·수정모달·대회정보 탭) |
| 16 | 영상 사용자 UI — 유튜브 썸네일 카드 + 페이지 내 모달 재생 |
| 17 | 신청·명단·승인 플로우 보강 + 어드민 폴리시 (워크플로우 P0 반영) |
| 18 | 다중 경기 영상 스키마·API |
| 19 | 영상 업로드+스트리밍 백엔드 |
| 20 | 어드민 다중 영상 입력 UI |
| 21 | 공개 영상 UI/UX 재설계 |
| 22 | 캡처 전면 재작업 (톨 뷰포트) |
| 23 | 아티팩트 v5 |
| 24 | PR #31 작성·업데이트 |
| 25 | 기존 PR 리뷰 코멘트 |
| 26 | 최종결과 페이지 시각 절제 재설계 |
| 27 | 명단 추가 플로우 실테스트+캡처 |
| 28 | 리뷰·영상 안내 UX 명확화 |
| 29 | PR 수정→재리뷰 사이클 (#32·#30) |
| 30 | 아티팩트 v6 + PR #31 갱신 |
| 31 | P1·P2 로드맵 전건 구현 (ultracode) |
| 32 | PR #30 충돌 해소 — 새 main 기준 union merge·검증·푸시 |
| 33 | QA 문서 PR 6건(#23~28) CI green 확인 후 머지 |
| 34 | 어드민 사람·팀 입력 → 기존 데이터 기반 선택 UI (검색 dropdown/테이블 모달) |
| 35 | awards admin 라우트 권한 게이트 수정 — PR 리뷰·머지 |
| 36 | 구앱 아카이빙 전체 랜딩 — PR #37 + 파이프라인 정합화 |
| 37 | 시각검증 갭 스윕 — 미캡처 화면 + tablet 뷰포트 |
| 38 | 상금 A안(스마트 자유값) 구현 — 물품 나열 지원 |
| 39 | 배포 헬스체크 443 실경로 검증 강화 — PR |
| 40 | 어드민 대진관리 탭 UI 개선 (dev 최신 기준) |
| 41 | 대회정보 상금 입력 — 금액 전용처럼 보이는 UI 개선 |
| 42 | 어드민 신청관리 카드 개선 |
| 43 | 최종결과 히어로 — CHAMPION 문구 제거·트로피 개선·입장 애니메이션 |
| 44 | 최종결과 그리드 — 최종순위/결선경기 레이아웃 재균형 |
| 45 | 검증·PR·Copilot 사이클 — dev 머지 |
| 46 | Batch-2 백엔드 커밋 (리뷰 모더레이션·알림 3종·참가팀 로고) |
| 47 | Track A — 어드민 리뷰 모더레이션 탭 (숨김/복원) |
| 48 | Track B — 알림 뱃지·플로우 개선 (신청/입금/공지 3종) |
| 49 | Track C — 참가팀 조회·참여 신청 UI/UX 폴리시 |
| 50 | Batch-2 검증·PR·Copilot 사이클 (base dev) |
| 51 | Fix stale test mock — participantTeams teamLogoUrl/teamRegionName 드리프트 |
| 52 | 대회 상세 UX 재구성 — 상태 인식 + 허브 컴팩트화 (Toss) |
| 53 | 테스트 갭 — 재구성(히어로·아코디언·액션리스트) 커버리지 |
| 54 | 테스트 갭 — 알림 뱃지 로직 + 어드민 리뷰 모더레이션 |
| 55 | 명단 제출 마감일 — 백엔드 (스키마·서비스·API) |
| 56 | 명단 제출 마감일 — 프론트 (생성폼·수정모달·팀 로스터·어드민 예외토글) |
| 57 | AdminDataTable 팀명 컬럼 압축 버그 수정 |
| 58 | 경기 일정 만들기 폼 — 어웨이 팀 필드 그리드 홀수 오차폭 수정 |
| 59 | 팀 기본 아이콘 통합 컴포넌트 배포 |
| 60 | 대회 커버 이미지 — 생성 마법사 업로드 + 카드 fallback |
| 61 | 알림 팝오버 기능 설계·구현 |
| 62 | 아이덴티콘·팀로고·대회카드 아이콘 폴리시 |
| 63 | 브랜드 아이콘·GNB·my페이지 레이아웃 폴리시 |
| 64 | 홈 배너 비율 + 팀/매치/대회 섹션 조사 |
| 65 | 팀 카드 리디자인 — 팀장/감독 정보 노출 |
| 66 | 홈 채팅섹션 패딩 + 프로필수정 버튼 정렬 |
| 67 | 배치 PR 정리·병합 (팀아바타 등, PR #45 계열) |
| 68 | prod DB 데이터 로컬 dev 재동기화 |
| 69 | 남은 폴리시 작업 일괄 진행 (팀카드/브랜드아이콘/my페이지) |
| 70 | 홈 히어로 카드 이미지 비중 확대 + 카드 간격 개선 |
| 71 | 대회 목록 배너 비율 + 카드 썸네일 폴백 개선 |
| 72 | 채팅 UI 메시지 그룹핑 개선 |
| 73 | 팀 아바타 xl 사이즈 확대 (/teams) |
| 74 | 대회 현장안내 — 실제 위치정보 노출 |
| 75 | 카카오맵 SDK 임베드 + 내비게이션 앱 딥링크 |
| 76 | 카카오 API 키 어드민 입력(DB 연동 설정) 기능 |
| 77 | 규정/환불정책 마크다운 구분선 + 접기토글 스타일 축소 |
| 78 | 대회 상세 "문의하기" CTA (비회원 게스트 지원) |
| 79 | 배치 작업 전체 PR화 → Copilot 리뷰 → dev 머지 → 로컬 재기동 |
| 80 | 이메일 로그인 화면 폴리시 (에러문구/위치, 비번 토글, 로고) |
| 81 | 홈 히어로 CTA 텍스트-버튼 여백 수정 |
| 82 | 전역 로딩중 이중 제출(더블클릭) 방지 점검 — **미완료, in_progress 상태 유지** (§7 참고) |
| 83 | 매치 상태별 목데이터 생성 + 어드민 테스트 |
| 84 | 불필요 dev 서버 정리 + "서버 1쌍만 유지" 지침 반영 |

### #85~#95 (이 대화에서 직접 확인 — 원문 그대로 또는 근사)

| # | 상태 | 사용자 지시 (원문/근사) |
|---|---|---|
| 85 | 완료 | (원문) *"그럼 # 1 ~ # 84까지 ultracode subagent(sonnet)으로 적대적 검증 다시 모두 진행하고 실제배포할수있는지까지 모두 확인해보자. 그리고 문제있으면 수정도 하고."* — ultracode Workflow 2건으로 11개 도메인 적대적 검증 실행, PR #57 merge-readiness 확인 + 회귀 2건 수정. |
| 86 | 완료 | 매치 상세 `toDetailMode` 'closed' 모드 신설 — 비참가자가 마감/취소/완료/만료/정원마감 매치를 볼 때 실제 참가자와 동일한 초록 "승인 완료" 배너가 잘못 뜨던 버그. (이 정확한 요청 원문은 이 세션 시작 이전 창에서 있었던 것으로 추정되어 원문 미보유, TaskList 제목 기준) PR #58. |
| 87 | 완료 | (원문) *"문의 답변 수정도 있어야할 듯"* — 어드민이 이미 작성한 문의 답변을 수정할 수 있는 기능. 백엔드 PATCH 엔드포인트 + 감사로그, 프론트 인라인 수정 UI. |
| 88 | 완료 | (원문, 5개 항목 결합 메시지) *"어드민 또 대진관리에서 조만들기, 경기일정 만들기 각각이 좀 애매한것같아... 그리고 홍보카드에서 이미지도 미리보기에서 좀 나와야할것같아... 대회 어드민에서는, 여기는 날짜랑 시간 같이 작성을 하는데 대회 페이지에 막상 시간은 안나오네. 그리고 모든 대회에 항상, 시간도 나오고 아래에 '대회 일정 및 경기 방식은 현장 상황에 따라 일부 변경될 수 있습니다'... 여기 현장안내에 확인가능이라는 태그가 무슨 의미가 있냐는거야. 그리고 어드민 들어왔을떄 문의가 쌓여있으면 문의 옆에 숫자로... 신청이 현재 몇개 들어왔는지 숫자가 뜨면 좋겠어."* — 5건 조사→PR #62(일정 시간표시+안내문구), #63(문의 미확인 배지), #64(현장안내 뱃지 제거), #65(홍보카드 라이브 미리보기), #66(대진관리 스텝 위저드, Decision Matrix A/B/C 중 사용자가 B 선택). |
| 89 | 완료 | (이 세션 내 발생, 스크린샷 첨부) *"마찬가지로 팀원이 한명도 없을떄 에러가 뜨네, 대회에서 팀 명단 등록하려고하면."* — `tournament-roster-client.tsx` AddPlayerForm의 `useInfiniteQuery` 관련 `Cannot read properties of undefined (reading 'length')` 크래시. PR #68. |
| 90 | 완료 | (스크린샷 첨부, 정확한 문구는 스크린샷 다음 메시지에서 지시) 회원가입 온보딩 "프로필을 완성해 주세요" 단계의 사진 선택 영역이 플랫한 회색 박스라 어색하다는 지적 — frontend-design 스킬 기반 개선. PR #67. |
| 91 | 완료 | (원문) *"그리고 이제 진행중인거에서 새로운 세션에서 이 작업을 이어가기위해서... 그리고 내가 지시하는 작업들은 항상 다 subagent에게 위임해서 너는 managemet만해."* — 위임 원칙 재확인, 메모리 갱신(`sonnet-subagent-implementation.md`). |
| 92 | 진행 중 | (원문) *"그리고 팀 선수추가할때 혼성경기인 경우 성별도 입력받게끔 해야할것같아. 그래서 애초에 대회를 만들때도 혼성/남성/여성 그걸 받아야할것같고, 그거에 자동으로 인원 필터링이 되어야하고, 유저한태 회원가입할대 성별도 입력받게끔 해야할것같아."* + 후속 확인 *"그리고 이제 진행중인거에서... 회원가입하고 등록할려면 성별 / 전화번호 / 생년월일 (대회 혹은 팀) 입력 필요..."* — §4 참고. |
| 93 | 대기 (설계 완료) | (원문) *"대회 등록할때 현재있는 대회 수정과 하단에 있는 상품 등록, 그런것들과 플로우가 좀 다른것같아... 대회 등록하는 form이 레거시라는거지, 날짜나 시간 입력도 수기로 입력해야해서 불편하고. 자동으로 완성할수있는것들은 자동으로 완성해주고... 대회 등록과 추가정보 등록을 모두 개선이 되어야하는거지."* — §5 참고. |
| 94 | 진행 중 | (원문) *"main에 최신 업데이트가 올라왔어 그걸 local로 땡겨와서, dev에 머지해서 conflict 안나게 그리고 새로운 기능들이 뭐가 더 들어갓는지 파악하고 우리 소스코드랑 비교분석해서 남아야하는 기능들은 남기고, 우리의 소스가 더 좋다하더라도, 항상 이전버전 호환성 유지되어지게끔 데이터 구조를 명확하게 들고있자."* — §3 참고. |
| 95 | 진행 중(이 문서 자체) | (원문) *"그리고 이제 진행중인거에서 새로운 세션에서 이 작업을 이어가기위해서, 진행할 md 문서(여태까지 대화내용, 내가 지시한 사항들, 중요한것들이 모두 담겨져있는) 하나 만들어줘."* + 후속 *"그럼 문서에도 지금 진행중인거 적어주고, 나중에 저게 완료되면 검증할때도 같이 검증해야한다던가 그런거 잘 적어주고, 우리가 #1 ~ # 90번때까지 내가 지시한것들이 있잖아? 그것도 리스트업해서 내가 지시한 내용 그대로 웬만하면 다 들어갈수있게 하는게 좋겠는데."* + 그 사이 *"그럼 브랜치도 dev가 맞아? 그리고 문서도 잘 업데이트 해줘야지"* + *"그리고 우리 브랜치는 dev에서 진행하는거야 알겠지? 항상 우리는 dev에서 시작하는거고 여기에 머지하는거고 여기에다가 푸쉬하는거야."* — 이 문서. |

## 9. 참고 — 프로젝트 규칙 원문 위치

- 전역 규칙: `~/.claude/CLAUDE.md`
- 프로젝트 규칙: `matchup-sports-platform/CLAUDE.md` (Git 브랜치 정책, DB 마이그레이션 규율, 7대 원칙, PR·Copilot 리뷰 워크플로 등)
- 자동 메모리: `~/.claude/projects/-Users-sungjun-Documents-projects-matchup-sports-platform/memory/` (특히 `sonnet-subagent-implementation.md` — 위임 원칙 최신 반영됨)
