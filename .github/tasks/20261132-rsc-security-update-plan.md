# Task 20261132: React Server Components 보안 권고 영향 분석 및 패치 계획

Status: Planning
**Owner**: Codex → 후속 frontend/security 구현
**Created**: 2026-11-12
**Scope**: 이번 PR은 docs only. 후속 구현은 frontend 및 의존성 lockfile.

## Context

사용자 요청: “우선 계획 잡아서 pr 부터 올려줘. 어떤 이슈고 뭐 해야하고 우리 상황은 어떻고 뭘 진행할건지”.
ICTIS 2026-11-12 권고 PDF 3쪽 전체를 읽고 공식 React/Next.js 권고와 최신 origin/dev 및 배포 SHA를 대조했다.

### 어떤 이슈인가

- CVE-2026-126187 / GHSA-xqc2-xf4c-x3h3: React Server Components의 신뢰할 수 없는 데이터 역직렬화로 인증 없는 원격 코드 실행이 가능한 Critical 취약점(CVSS v4 9.5).
- React 공식 설명의 악용 조건은 응답에 여러 typed array와 공격자가 제어하는 값이 함께 실리는 경우다. RSC 사용 자체만으로 실제 악용 가능성을 확정하지 않는다.
- 대상 패키지는 react-server-dom-webpack / react-server-dom-parcel / react-server-dom-turbopack. 각 계열의 영향 범위 → 최소 패치 버전은 19.0.0–19.0.8 → 19.0.9, 19.1.0–19.1.9 → 19.1.10, 19.2.0–19.2.8 → 19.2.9, 19.3.0 → 19.3.1.
- Next.js 자체 권고 GHSA-673q-mjm6-r5xr는 next 16.0.0–16.4.0을 대상으로 16.4.1에서 수정했다. App Router + Cache Components + 여러 typed array를 반환하는 use cache 함수가 전제다. 그런 함수가 없어도 즉시 업그레이드를 권고한다.
- 잠재 영향은 웹 서버 권한으로 코드 실행 및 서버가 접근 가능한 데이터·비밀값 침해다. 현재 침해 흔적이나 공격 성공을 확인했다는 의미는 아니다.

### 근거

1. React 공식: https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3
2. Next.js 공식: https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr
3. 사용자 제공 ICTIS SMR261112 PDF: 2쪽 CVE 및 패치 표. 원본 SHA256 `F67E6C5B80B5B97FF17C7222D7A77B8C2FFC084E9671E407676B454D710C53B4`.

PDF 참고 링크에는 SAP 문서 및 CVE-2026-120017이 섞여 있다. 본문 CVE/표는 React 공식과 일치하지만 참고 링크 전체를 이 취약점 근거로 취급하지 않는다. PDF 원본과 사용자 로컬 경로는 커밋하지 않는다.

## Goal

계획 PR에서 현재 상태와 대응 범위를 검토 가능하게 고정하고, 후속 구현에서 패치 버전으로 빌드·Alpha 검증한 뒤 사용자가 운영 승격을 판단할 증거를 제공한다.

## Original Conditions (must all be satisfied)

- [x] 어떤 이슈인지 CVE·위험·악용 전제·공식 근거로 설명한다.
- [x] 무엇을 해야 하는지 최소 패치 버전과 변경 파일을 명시한다.
- [x] 우리 상황을 최신 dev·운영 배포 소스·실제 공개 배포 식별자로 대조한다.
- [x] 진행 순서·검증·완료 조건·남은 불확실성을 남긴다.
- [x] 이 문서만 담은 dev 대상 계획 PR을 생성한다: https://github.com/kim-song-jun/matchup-sports-platform/pull/2349

## Current Situation — 우리 상황

조회 시각: 2026-11-12 16:22 KST. 분석 기준 최신 dev `4a53b95b12b9c0b77744ad3a46e4c555609af072`.

| 항목 | 확인 결과 | 판단 |
|---|---|---|
| v1 웹 | apps/v1_web/package.json의 next 16.3.8, @next/bundle-analyzer 16.3.8 | Next.js 공식 영향 버전 범위, 패치 필요 |
| React / React DOM | manifest ^19.2.5, pnpm-lock.yaml 실제 해석 19.2.5 | 후속에서 19.2.9 이상 같은 계열로 정렬. react 버전만으로 RSC 패키지 버전을 단정하지 않음 |
| RSC 구현 | App Router, src/app/layout.tsx 서버 shell | 단순 브라우저 전용 React 앱으로 제외할 수 없음 |
| 악용 전제 검색 | dev의 apps/v1_web/src 및 next.config.ts에서 use cache/cacheComponents/dynamicIO 미발견 | 알려진 Next.js 악용 경로는 현재 확인되지 않음. 안전 확정이나 패치 면제 근거로 쓰지 않음 |
| 운영 소스 검색 | 아래 운영 SHA의 next.config.ts에서 cacheComponents/dynamicIO/use cache 미발견, src에서 use cache 미발견 | 같은 제한적 판정. 실행 이미지 내부 설정은 별도 확인 필요 |
| RSC 패키지 | lockfile에 react-server-dom-* 직접 항목 미발견 | Next 내부 번들 존재 여부는 별도. lockfile 검색 및 pnpm audit만으로 안전 판정 금지 |
| 빌드·배포 | deploy/Dockerfile.v1-web은 frozen lockfile 설치 후 standalone Next 서버를 복사·실행 | Next 자체 업데이트 및 이미지 재빌드·재배포 필요 |
| 설정 호환성 | next.config.ts에서 next/dist/shared/lib/router/utils/html-bots 내부 경로 import | 업그레이드 시 경로 및 설정 로드·크롤러 동작 검증 필요 |
| API·모바일 | NestJS API와 배포된 웹을 로드하는 Android/iOS shell | 이번 직접 패치 대상은 웹. 웹 업그레이드 후 앱 WebView 기본 흐름 확인 |

### 배포 증거와 한계

| 환경 | 공개 /landing HEAD | 최근 배포 workflow |
|---|---|---|
| Alpha | HTTP 200; release 1.17.1-alpha.20261112.g4a53b95b12b9; commit 4a53b95b12b9c0b77744ad3a46e4c555609af072 | https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43150624512 — success, 동일 SHA |
| 운영 | HTTP 200; release 1.17.1; commit 6d12d118ebf3fee7f7c970b7a7f18c72c9fe5edf | https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43084502152 — success, 동일 SHA |

운영 SHA의 apps/v1_web/package.json도 next 16.3.8 / react 및 react-dom ^19.2.5다. 따라서 **Alpha·운영 모두 취약 버전 범위의 소스로 배포된 상태로 판단**한다. 이는 공개 헤더·workflow·Git 소스의 교차 근거이며 컨테이너 내부 실제 패키지 버전이나 악용 성공을 검증한 결과는 아니다. 후속에서 이미지 digest 및 런타임 버전을 증거로 보완한다.

## Execution Plan — 무엇을 진행할 것인가

### Phase 0: 계획 검토 (이번 PR)

- [x] PDF·공식 권고 대조, 최신 dev·운영 소스 및 공개 배포 SHA 확인.
- [x] 변경 범위·후속 검증·운영 승격 책임 기록.
- [x] dev 대상 계획 PR #2349 게시. 이번 요청의 종료 지점은 계획 PR 게시이며 자동 머지하지 않는다.

### Phase 1: 의존성 패치 (후속 구현 PR)

- [ ] 착수 시 origin/dev를 다시 fetch하고 이 문서의 기준과 drift 확인. 배포된 SHA도 재조회.
- [ ] next 및 @next/bundle-analyzer를 16.4.1 이상 패치가 포함된 호환 안정 버전으로 같은 버전에 고정한다. 16.4.1은 이 권고의 최소 수정 버전이며 후속 실행 시 새 권고/릴리스 확인 후 정확한 목표 버전을 기록한다.
- [ ] react / react-dom은 19.2.9 이상 동일 19.2 계열의 같은 패치 버전으로 정렬한다. Next의 peer 조건 및 실제 resolve 결과를 확인한다.
- [ ] apps/v1_web/package.json과 pnpm-lock.yaml을 pnpm으로 동기화한다. 다른 의존성의 무관한 대량 갱신을 피한다.
- [ ] Next에 포함된 compiled RSC와 적용 패치를 공식 릴리스/배포 산출물로 확인한다. react만 업데이트하거나 직접 RSC 패키지 override를 덧붙이는 방식으로 끝내지 않는다.
- [ ] 웹 패치 changeset 추가. API/DB 계약 변경은 계획하지 않음.

### Phase 2: 검증 및 리뷰

- [ ] 호스트 부하 사전 확인 후 최소 worker로 관련 회귀 테스트 1회 및 v1_web lint/typecheck 1회 실행. 전체 반복 빌드는 CI에 맡기고 실제 배포 이미지 빌드 성공을 확인한다.
- [ ] frozen lockfile 설치가 성공하고 Next 설정 및 html-bots 내부 import가 유효한지 확인한다. 호환성 문제가 있으면 그 범위만 수정한다.
- [ ] crawler/SEO·서버 렌더링·hydration·라우팅과 API/uploads/socket.io rewrite 회귀 여부를 검증한다. 단순 버전 문자열 검사는 기능 회귀 검증을 대체하지 않는다.
- [ ] manifest·lockfile·실제 빌드 산출물의 버전을 대조하고 해당 CVE 경고를 확인한다. audit 결과만으로 bundled 코드 안전성을 주장하지 않는다.
- [ ] PR diff·changeset·신규 tech-debt marker·미추적 의존성 누락을 확인하고 CI 및 리뷰 결과를 남긴다.

### Phase 3: dev 머지 후 Alpha 검증

- [ ] 후속 구현 PR이 dev에 머지되면 deploy-alpha 성공 및 공개 release/commit 헤더가 수정 SHA를 포함하는지 확인한다.
- [ ] Alpha 실행 이미지 digest 및 Next/React 실제 버전을 비밀값 없는 방식으로 기록한다. 조회 권한/수단 부재 시 명시적으로 미검증 처리한다.
- [ ] Alpha 실제 브라우저에서 /landing, 로그인 후 /home, 대회 목록·상세 및 권한별 운영 화면을 확인한다. 익명/일반 사용자/운영자 흐름, console/network·SSR·hydration 오류를 기록한다.
- [ ] 모바일 390 / 태블릿 768 / 데스크톱 1440에서 기본 navigation 및 화면 깨짐을 확인하고 웹을 로드하는 모바일 shell의 기본 진입·로그인 회귀를 점검한다. native 실행 불가면 별도 미검증 항목으로 남긴다.
- [ ] QA는 기존 계정을 사용하고 생성한 데이터·프로세스·브라우저만 정리한다. 운영/Alpha에 공격 payload를 보내는 실증은 하지 않는다.

### Phase 4: 사용자 운영 승격 및 사후 확인

- [ ] 사용자에게 패치 PR·CI·Alpha 증거·잔여 위험을 제공한다. dev → main PR 생성/머지 및 운영 승격은 사용자만 수행한다.
- [ ] 사용자 승격 뒤 공개 SHA·배포 성공·실행 버전·health·핵심 흐름을 재확인한다. 계획 PR 또는 Alpha 패치만으로 운영 조치 완료라 표시하지 않는다.
- [ ] 회귀가 생기면 증상·로그를 확인하고 사용자에게 알린다. 취약 버전 rollback은 보안 위험을 재도입하므로 자동 대응으로 두지 않는다.

## Upgrade Impact Review — 실제 코드 변경과 회귀 검증

2026-11-12 사용자 보완 요청: 업데이트 뒤 실제 코드가 변경되면서 생기는 문제와 주변 영향을 함께 확인한다. 패치 버전 적용과 기존 서비스 계약 보존을 각각 증명해야 한다. 아래는 **검증 계획이며 아직 실행 결과가 아니다**.

### 착수 전 기준선 및 변경 영향 분석

- [ ] 정확한 목표 버전을 정하기 전에 현재 버전부터 목표 버전까지 공식 릴리스 노트·migration/deprecation·알려진 회귀·peer/Node 요구사항을 확인하고 우리 코드의 해당 사용 지점과 연결한다. 문서화되지 않은 모든 프레임워크 내부 변경이 안전하다고 추정하지 않는다.
- [ ] 업데이트 전 Alpha의 SHA·persona·route·viewport·행동·화면/HTTP 결과·console/network 상태를 기준선으로 남긴다. 후속 Alpha에서 같은 조건으로 비교한다. 기존 실패는 별도로 기록해 업데이트 회귀와 구분한다.
- [ ] manifest/lockfile의 직접·전이 의존성 변경을 분류한다. Next 관련 SWC/compiled RSC·React·타입·서드파티 peer 변화를 확인하고, React 중복 설치·타입 불일치·불필요한 lockfile 대량 변경을 해소한다.
- [ ] 실제로 수정한 앱 코드마다 “변경 전 계약 → 변경 이유 → 변경 후 동작 → 영향 consumer → 회귀 증거”를 PR에 남긴다. 앱 코드를 바꾸지 않아도 프레임워크 런타임은 바뀌므로 아래 항목을 생략하지 않는다.

### 코드 근거에 연결한 검증표 (10개 영역)

| # | 실제 코드/계약 | 업데이트로 확인해야 할 문제 | 검증 방법 및 통과 기준 |
|---|---|---|---|
| 1 | next.config.ts의 html-bots 내부 import, bundle analyzer, standalone Docker 빌드 | 내부 경로 이동·config 옵션 타입 변화·빌드/실행 산출물 누락 | frozen install, lint/typecheck, CI production 이미지 빌드와 Alpha 시작 성공. 배포 이미지에서 정적 chunk/font 및 실행 버전 확인 |
| 2 | src/app/layout.tsx, providers.tsx, Suspense를 쓰는 chat/page.tsx·callback/kakao/page.tsx | SSR/client 경계·hydration 불일치·빈 화면·무한 로딩 | 직접 URL 진입/새로고침과 Link 이동을 모두 확인. hydration/runtime 오류 및 무한 skeleton 없음. Kakao callback은 성공/실패 복귀 경로 확인 |
| 3 | src/proxy.ts의 공개 상세 404 처리, next.config.ts의 redirect/rewrite | 실제 없는 상세가 HTTP 200이 되거나 정상 정적 경로가 404, redirect loop | 존재/미존재 ID, 잘못된 ID, /notices/feed.xml 정적 예외는 실제 NOTICES_FEED_PATH 값을 먼저 확인하고 검사. /v1 및 league legacy redirect의 Location·쿼리 보존 확인. HTML과 client navigation 모두 결과 일치 |
| 4 | landing/page.tsx의 revalidate, lib/landing/landing-v4-data.ts의 no-store, SEO/feed route | 정적/동적 판정 변화·오래된 공개 목록·메타데이터 누락 | 일반 UA와 crawler UA의 원본 HTML head 확인, 게시 상태 변경 시 실제 목록 갱신 확인. 공개하지 않은 항목 노출 및 사용자 데이터 캐시 혼입 없음. 알려진 cache 정책 유지 |
| 5 | lib/api-client.ts의 credentials include, providers의 인증 gate·query persist | 로그인 쿠키 전달 누락·로그아웃 뒤 이전 계정 데이터 잔존·인증 hydrate 전 잘못된 차단 | 익명/로그인/로그아웃/다른 계정 재로그인, 보호 상세 직접 진입. 실제 401/403과 UI 일치, 계정 간 데이터 누출 없음. 인증 UI hydrate 뒤 다음 보호 route 이동 |
| 6 | useSearchParams 사용 화면, navigation history·scroll restoration | 필터 쿼리 유실·뒤로가기 복원 실패·클릭 후 navigation 유실 | 대회 목록 필터 연속 변경 → 상세 → 뒤로/앞으로 → 새로고침. URL/조회 payload/선택 UI 일치, 중복 이동 및 scroll/focus 회귀 없음 |
| 7 | lib/assets.ts의 getImageProps, content/rich-content-renderer.tsx의 next/image, uploads rewrite | 이미지 변환 400/404·크기/비율 변화·업로드 파일 proxy 오류 | 기존 업로드/로컬 mock/허용 원격 이미지/실패 fallback과 확대 확인. 지원하는 업로드·수정 폼은 실제 저장 후 재진입해 값·이미지 보존 검증 |
| 8 | socket.io rewrite, providers의 NotificationSocketBridge, chat | trailing slash redirect 재발·polling/upgrade 실패·재연결·중복 구독 | 실제 Alpha 채팅/알림 수신·화면 왕복·재연결 확인. polling/upgrade 정상, 메시지 중복/누락 및 console/network 오류 없음 |
| 9 | @tiptap/react 편집기, react-dom createPortal 대화상자, persisted query provider | peer 호환·편집기 mount·portal/focus/effect 순서 변화 | 편집 → 저장 → 상세 재조회, dialog 열기/닫기/Escape/포커스 복귀. 중복 요청·이벤트 누수·콘텐츠 손실 없음. 실제 사용 흐름으로 확인 |
| 10 | admin/tournament-ops·shared/game-operations, native app surface/update gate | 권한 분기·운영 command 중복 제출·WebView 복귀 및 기존 열린 탭 chunk 오류 | 일반 사용자 권한 차단과 허용된 운영자 흐름을 확인. 변경을 수반하는 대표 흐름은 Alpha 전용 테스트 엔티티에서 저장·재조회·정리까지 검증. 배포 전 열린 탭에서 배포 후 이동/새로고침, Android/iOS 기본 진입·로그인·복귀 확인 |

표의 정적 경로·테스트 엔티티·허용 액션은 실행 직전 현재 v1 route/API와 대조해 고정한다. 실패하는 경로를 유사한 정상 화면으로 바꿔 통과 처리하지 않는다. 미검증 영역은 반드시 별도로 남긴다.

### 테스트 선택과 결과 기록

- 기존 테스트 후보: e2e/v1-tests/account-recovery-hydration.spec.ts, chat-notifications.spec.ts, tournament-staff-authorization.spec.ts, tournament-live-operations.spec.ts, responsive.spec.ts 및 apps/v1_web/src/lib/query-client.test.ts, public-competition-discovery.test.ts. 후보 전체를 무조건 실행하지 않고 실제 변경 계약과 기존 assertion을 읽어 필요한 최소 집합을 고정한다.
- 단위 테스트의 Next router/image/fetch mock이 실제 프레임워크 회귀를 숨길 수 있다. 해당 mock 테스트가 green이어도 CI production 빌드 및 Alpha 실제 동작 확인을 대체하지 않는다. CI E2E가 mock인지 실제 API인지도 증거에 명시한다.
- 앱 호환성 수정을 추가하면 가능한 경우 해당 동작의 RED → GREEN 증거를 남긴다. build/lint 통과와 사용자 시나리오 통과는 각각 기록한다.
- 증거 표 필수 열: 영역 번호, 기준/수정 SHA와 의존성 버전, persona/route/viewport, 실제 행동·HTTP/API 결과, console/network, PASS/FAIL/BLOCKED, 원인/수정/재검증, cleanup. 진행 상태는 **검증 완료 M/10, 실패 F, 미검증 B**로 보고한다. 영역별 대표 사례 검증이며 전체 route 전수 QA라고 표현하지 않는다.
- 주요 흐름을 막는 신규 회귀·권한/데이터 누출·저장 유실·빌드/기동 실패는 해결 전 머지 게이트 실패다. Alpha에서 발견되면 운영 승격을 보류하고 최소 수정 후 실패 영역과 직접 영향 영역을 재검증한다. 실행 환경 부재는 PASS가 아니다.
- 메모리/응답 시간·chunk 요청 실패·5xx는 동일 endpoint/조건의 업데이트 전후를 비교한다. 부하 테스트를 자동 추가하지 않으며 관측 악화가 있으면 원인과 사용자 영향부터 분석한다.

## User Scenarios

1. 운영자는 이 문서에서 취약 버전 배포 여부, 악용 전제의 확인 범위, 패치 우선순위를 구분해 판단한다.
2. 개발자는 Phase 1–3에 따라 웹 의존성을 패치하고 기존 로그인·조회·운영 흐름이 유지됨을 검증한다.
3. 사용자는 Alpha 증거를 검토한 뒤 운영 승격을 수행하고 별도 운영 완료 증거를 받는다.

## Test Scenarios

### Happy path

- [ ] 후속 구현의 frozen install·관련 회귀 테스트·lint 및 CI 이미지 빌드 성공.
- [ ] Alpha에서 수정 SHA 및 실행 패치 버전 확인 후 핵심 사용자 흐름 통과.

### Edge cases

- [ ] Next 내부 html-bots import 및 SSR 메타데이터/크롤러 동작 호환성 확인.
- [ ] cacheComponents/use cache 미사용이어도 패치를 적용하고 전제 조건 부재와 버전 패치 완료를 구분.
- [ ] React만 올렸거나 RSC lockfile 항목이 없다는 이유로 Next 패치를 생략하지 않음.

### Error paths

- [ ] 설치/설정 로드/빌드/로그인/라우팅 실패는 실제 오류로 보고하며 mock 성공으로 대체하지 않음.
- [ ] 배포 SHA 불일치·이미지 버전 조회 불가·모바일 shell 미검증은 완료 판정에서 분리.

### Mock data updates needed

API/DTO/Prisma 변경이 없어 fixture/MSW/public mock 갱신은 기본적으로 불필요하다. 후속 호환성 수정이 계약에 영향을 주면 관련 테스트와 fixture를 같은 변경에 동기화한다.

## Parallel Work Breakdown

사용자가 병렬 에이전트를 요청하지 않아 단일 실행으로 Phase 0 → 1 → 2 → 3 → 4 순서를 따른다.

- Backend: 직접 구현 없음. Alpha health·API proxy 회귀 확인만 수행.
- Frontend: package/lockfile 및 필요한 최소 호환성 수정 담당.
- Infra: 기존 이미지 빌드·배포 계약 사용. 배포 로직 변경은 별도 필요성 확인 후 범위를 재고정.
- Sequential: 계획 PR 게시 → 후속 패치 PR → 리뷰/CI → dev 머지 → Alpha → 사용자 운영 승격 → 사후 확인.

### Owned / Forbidden files

- 이번 PR Owned: .github/tasks/20261132-rsc-security-update-plan.md 하나.
- 후속 예상 Owned: apps/v1_web/package.json, pnpm-lock.yaml, .changeset/*.md, 최소한의 v1_web 호환성 수정/테스트, 이 task의 증거 업데이트.
- Forbidden: .env* 읽기/출력, 다른 세션 WIP, legacy v0 참조, 불필요한 API/DB/schema 변경, 사용자 대신 main 승격.

## Acceptance Criteria

### 이번 계획 PR

- [x] CVE·패치 버전·출처·현재 의존성·알려진 악용 조건·배포 근거와 한계가 구분되어 있다.
- [x] 구현 파일·단계·검증·운영 승격 책임·오류 경로가 정리되어 있다.
- [x] 단일 문서 committed diff 및 git diff --check 검증. dev 대상 PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2349

### 후속 보안 조치 완료

- [ ] 정확한 목표 버전과 bundled RSC 패치 근거가 기록되고 CI/리뷰를 통과한다.
- [ ] 변경 영향 분석과 10개 영역의 검증 결과 M/10·실패·미검증 및 앱 코드 수정별 회귀 증거가 기록된다. 주요 신규 회귀는 해결되어야 한다.
- [ ] dev 머지 및 Alpha 수정 SHA·실행 버전·브라우저 회귀 증거가 확보된다.
- [ ] 사용자 운영 승격 이후 운영 SHA·실행 버전·health·핵심 흐름 증거가 확보된다.
- [ ] 미검증 범위가 없거나 소유자·사유·후속 경로가 명시된다.

## Tech Debt Resolved

이번 PR은 대응 계획과 근거를 추가한다. 런타임 취약점은 아직 해결하지 않았다. 패치되지 않은 Next/React 의존성은 Phase 1에서 해소한다.

## Security Notes

공개 저장소이므로 비밀값·계정·토큰·서버 내부 정보·로컬 사용자 경로를 싣지 않는다. 조회는 공개 HTTP HEAD·Git 소스·배포 workflow metadata로 제한했다. 침해 여부 조사 및 비밀값 교체는 이번 계획에서 실행하지 않았고, RCE 성공이나 유출 증거를 관측하면 별도 사고 대응으로 전환한다. 권한 없는 공격 재현·운영 변경은 수행하지 않는다.

## Risks & Dependencies

- Next 16.3 → 16.4는 minor 상승이므로 내부 import와 서버 렌더링 회귀를 검증해야 한다.
- 이번 문서 PR 게시로 서버 의존성이 바뀌지 않으며 패치 필요 상태가 유지된다.
- 배포 헤더와 소스의 대조는 이미지 내부 패키지 버전 확인을 대체하지 않는다.
- 런타임 버전 조회 권한 및 실제 모바일 실행 환경 확보는 후속 검증의 의존성이다.
- 운영 조치 완료에는 사용자 승격이 필요하다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-11-12 | Codex | PDF와 실제 공지가 같은 이슈인가? | PDF 본문 CVE와 표를 React 공식 권고와 대조해 확인. 섞인 SAP/다른 CVE 참고 링크는 근거에서 제외. |
| 2026-11-12 | Codex | 현재 실제 악용 가능한가? | 취약 Next 버전 범위는 확인. 알려진 use cache/Cache Components 전제는 dev·운영 소스에서 미발견. 공격 실증 및 이미지 내부 검증 없이 악용 가능/불가를 확정하지 않음. |
| 2026-11-12 | 사용자 | 이번에 어디까지 진행하는가? | 우선 계획 PR 생성까지. 의존성 수정·머지·배포는 후속 단계. |

## Progress Snapshot

- Phase 0: PDF 전체 본문·공식 권고·최신 origin/dev·운영 SHA·배포 기록·공개 헤더 확인 및 계획 작성 완료. 단일 문서 committed diff·공백 검사 통과, 새 tech-debt marker 없음. 계획 PR #2349 게시 완료. 실행 코드 변경이 없어 테스트/빌드는 생략.
- 2026-11-12 보완: 실제 v1 프레임워크 사용 지점에 연결한 10개 회귀 검증 영역·업데이트 전후 기준선·코드 수정별 증거·머지/승격 차단 기준을 추가했다. 검증 실행 결과로 간주하지 않는다.
- Phase 1–4: 미착수. 이 문서의 체크박스가 후속 resume cursor다.
- 계획 기준 Git cursor: 4a53b95b1 (PR #2347), 직전 f0679eef1 (PR #2345 release/version-1.17.0).
- 로컬 원본 tree의 기존 미추적 문서·worktree는 보존. 전용 worktree/branch에서 이 문서만 커밋한다.
