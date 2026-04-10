# Task 30 — Frontend Quality Improvements (LCP Preload + Form Labels)

## Context

MatchUp 프론트엔드(`apps/web/src/`)의 성능 및 접근성 품질 개선 태스크. 두 가지 핵심 문제를 해결한다:

1. **SafeImage 컴포넌트가 `<img>` 태그 기반**: Next.js `<Image priority>`의 `<link rel="preload">` 자동 주입 불가. LCP 요소가 SafeImage를 사용하는 페이지에서 preload 최적화가 동작하지 않음.
2. **Form label 연결 누락**: WCAG 2.1 AA 기준 위반. 전체 192개 폼 요소 중 htmlFor 연결은 74건뿐(39%). 26개 파일에 label이 전혀 없음.

**NOTE**: 원본 요청에 포함된 `transition-all` 교체 항목은 코드베이스 전수 조사 결과 **0건** 잔존 (이미 교체 완료). 따라서 본 태스크 스코프에서 제외한다.

## Goal

- SafeImage를 `next/image` 기반으로 리팩토링하여 LCP preload를 완전 지원
- 전체 폼 요소에 `<label htmlFor>` + `<input id>` 연결을 적용하여 WCAG 2.1 AA 준수
- 기존 기능/테스트를 깨뜨리지 않고 점진적으로 개선

## Original Conditions (checkboxes)

- [ ] SafeImage 컴포넌트를 `next/image` 기반으로 리팩토링
- [ ] `next/image`의 `priority` prop이 `<link rel="preload">` 를 자동 주입하도록 동작
- [ ] SafeImage의 기존 인터페이스(src, fallbackSrc, alt, onError, className 등) 호환 유지
- [ ] `next/image` 필수 속성(width/height 또는 fill) 적절히 처리
- [ ] 12개 파일, 23개 SafeImage 사용처 전부 정상 렌더링 확인
- [ ] 42개 파일의 모든 `<input>`, `<select>`, `<textarea>`에 `<label htmlFor>` + `id` 연결
- [ ] 시각적으로 label을 숨겨야 하는 경우 `sr-only` 클래스 사용
- [ ] `tsc --noEmit` 통과
- [ ] 기존 테스트 전체 통과 (`pnpm test`)
- [ ] ~~transition-all 교체~~ (0건 잔존 확인, 스코프 제외)

## User Scenarios

### SafeImage (LCP)
1. **홈페이지 접속**: 히어로 영역 이미지가 `<link rel="preload">`로 사전 로드되어 LCP 개선
2. **매치 목록 페이지**: 카드 이미지가 `next/image`로 렌더링, lazy loading 자동 적용
3. **이미지 로드 실패**: fallbackSrc로 자동 대체 (기존 동작 유지)
4. **Capacitor 빌드**: `next.config.ts`의 `images.unoptimized: true` 설정에서 정상 동작

### Form Labels
1. **스크린리더 사용자**: 모든 폼 필드에서 label 읽기 가능
2. **label 클릭**: label 클릭 시 연결된 input에 포커스 이동
3. **검색 바/필터**: 시각적 label 불필요한 경우 `sr-only`로 접근성 유지

## Test Scenarios

### Happy Path
- SafeImage `priority` prop 전달 시 HTML에 `<link rel="preload">` 존재 확인
- SafeImage `fill` 모드 렌더링: 부모 `relative` + 자식 `fill` 정상 동작
- SafeImage `width/height` 모드 렌더링: 지정된 크기로 정상 동작
- 모든 `<input>` 요소가 `id` 속성 보유, 대응 `<label htmlFor>` 존재

### Edge Cases
- src가 null/undefined일 때 fallbackSrc 또는 placeholder 표시
- src와 fallbackSrc 모두 실패 시 빈 상태 처리
- Capacitor export 모드에서 `next/image` unoptimized 동작
- `<input type="hidden">`, `<input type="submit">` 등 label 불필요 요소 제외
- 동적으로 생성되는 폼 필드 (예: marketplace 옵션 추가)의 id 유일성

### Error Cases
- 잘못된 이미지 URL → onError 콜백 + fallback 동작
- `fill` 모드에서 부모에 `position: relative` 누락 시 → 레이아웃 경고

### Mock Updates
- SafeImage 사용하는 테스트 파일이 있으면 `next/image` mock으로 업데이트
- MSW 핸들러 변경 불필요 (이미지 URL 자체는 변경 없음)

## Parallel Work Breakdown

### Phase 1: SafeImage Refactoring (Sequential — shared component)

**담당**: `frontend-ui-dev` (단독)

**이유**: SafeImage는 12개 파일에서 import하는 공유 컴포넌트. 병렬 수정 시 충돌 불가피.

#### Step 1-1: SafeImage 컴포넌트 리팩토링
- `apps/web/src/components/ui/safe-image.tsx` 수정
- `<img>` → `next/image` (`Image`) 교체
- 새 props 추가: `priority?`, `fill?`, `width?`, `height?`, `sizes?`
- fallback 로직 유지 (onError → activeSrc 교체)
- `next/image`의 `onError`는 네이티브 `<img>` onError와 시그니처 다름 주의
- `unoptimized` prop: Capacitor 빌드 대응

**인터페이스 설계**:
```typescript
type SafeImageProps = {
  src?: string | null;
  fallbackSrc?: string | null;
  alt?: string;
  className?: string;
  priority?: boolean;
  // Layout: fill mode (부모 relative 필수) 또는 explicit size
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  onError?: () => void;
  // 추가 HTML 속성 (style, onClick 등)
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler;
};
```

**핵심 결정사항**:
- `fill`이 true이면 width/height 무시 (next/image 규칙)
- `fill`도 width/height도 없으면 기본값 `fill={true}` 적용 (기존 `<img>` 동작과 가장 유사)
- `className`은 `next/image`에 직접 전달 가능 (Next.js 13+)
- `<img>`의 spread props(`...props`) 패턴은 제거 — `next/image`가 허용하지 않는 HTML 속성 다수 존재

**next/image onError 시그니처 대응** (ADR-30-3):
- 기존 `SafeImage`: `onError?: (event: SyntheticEvent<HTMLImageElement, Event>) => void` (네이티브 img)
- `next/image`: `onError?: () => void` (인자 없음, Next.js 15 기준)
- **Decision**: 새 SafeImage의 공개 `onError` prop은 `() => void`로 변경. 현재 12개 사용처 중 onError를 직접 전달하는 곳은 0건(전부 fallbackSrc에 의존)이므로 breaking change 없음. 내부 fallback 로직은 `next/image`의 `onError` 콜백에서 `setActiveSrc(fallbackSrc)` 호출.

**next/image src 필수값 대응**:
- `next/image`의 `src`는 빈 문자열 허용하지 않음 (`src` prop must not be empty string)
- `src`와 `fallbackSrc` 모두 falsy인 경우: 1x1 투명 placeholder data URI 사용 (`data:image/svg+xml,...`) 또는 렌더링 자체를 건너뛰기
- **Decision**: src/fallbackSrc 모두 falsy이면 `<div>` placeholder 렌더링 (next/image 렌더링 안 함) — 빈 이미지 에러 방지

#### Step 1-2: 사용처 12개 파일 업데이트

**파일 목록** (23개 JSX 사용처):

| # | File | Usage Count | Notes |
|---|------|-------------|-------|
| 1 | `components/ui/media-lightbox.tsx` | 2 | lightbox: fill mode |
| 2 | `app/(main)/home/page.tsx` | 3 | 홈 카드: LCP 후보, priority 고려 |
| 3 | `app/(main)/matches/page.tsx` | 1 | 리스트 카드 이미지 |
| 4 | `app/(main)/matches/[id]/page.tsx` | 3 | 히어로 + 갤러리 |
| 5 | `app/(main)/matches/[id]/edit/page.tsx` | 1 | 편집 미리보기 |
| 6 | `app/(main)/lessons/page.tsx` | 1 | 리스트 카드 |
| 7 | `app/(main)/lessons/[id]/page.tsx` | 2 | 히어로 + 갤러리 |
| 8 | `app/(main)/teams/[id]/page.tsx` | 3 | 커버 + 로고 + 포토 |
| 9 | `app/(main)/teams/team-list.tsx` | 2 | 팀 카드 이미지 |
| 10 | `app/(main)/marketplace/page.tsx` | 1 | 리스트 카드 |
| 11 | `app/(main)/marketplace/[id]/page.tsx` | 2 | 상품 이미지 |
| 12 | `app/(main)/venues/[id]/page.tsx` | 2 | 구장 이미지 |

**각 사용처에서 확인할 사항**:
- 부모 요소에 `position: relative` + 명시적 크기 있는지 (fill 모드 필수)
- 고정 width/height 사용 가능한지 (카드 썸네일 등)
- LCP 후보 이미지에 `priority` 추가 (홈 히어로, 상세 페이지 히어로)
- `sizes` prop 설정 (반응형 이미지 최적화)

#### Step 1-3: next.config.ts images 설정 — remotePatterns 불필요 (ADR-30-1)

**Context**: API 서버(`main.ts` L15)가 `app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' })` 로 업로드 파일을 서빙한다. 프론트엔드는 `next.config.ts` rewrites(`/api/:path*` → `localhost:8111/api/:path*`)로 API를 프록시하지만, `/uploads/` 경로는 이 rewrite 대상이 아니다.

**그러나** 프론트엔드에서 이미지 URL은 `uploads/2026/04/xxx.webp` 같은 상대 경로(DB `Upload.path` 필드 값)로 저장되며, `SafeImage`가 `<img src={relativePath}>` 로 렌더링한다. 이 상대 경로는:
- 개발: Next.js 프론트(3003)에서 직접 참조 → 404 (NestJS 8111에만 static mount)
- 프로덕션: 리버스 프록시(nginx 등)가 `/uploads/` → API 서버로 라우팅

**Decision**: `remotePatterns` 추가는 **불필요**하다. 이유:
1. 업로드 이미지 URL은 같은 origin의 상대 경로(`/uploads/...`)이거나 Next.js rewrite를 거친다. 외부 hostname이 아님.
2. `next/image`의 `remotePatterns`는 **외부 hostname**(예: `images.unsplash.com`)에만 적용. 같은 origin 경로는 제한 없이 사용 가능.
3. 단, 개발 환경에서 `/uploads/` 경로가 404되는 기존 문제는 본 태스크 스코프 밖. 별도로 Next.js rewrite에 `/uploads/:path*` → API 서버 프록시를 추가하면 해결되지만, 이는 이미지 최적화와 무관한 인프라 이슈.

**Consequences**:
- `next.config.ts`의 `images.remotePatterns`는 현재 `images.unsplash.com`만 유지, 변경 없음
- 프로덕션에서 `/uploads/` 이미지에 `next/image` 최적화(리사이즈, webp 변환, CDN 캐시) 적용됨 — 로컬 리소스이므로 remotePatterns 무관
- Capacitor 빌드는 `images.unoptimized: true` 설정에 의해 `next/image` 최적화 바이패스 — 문제 없음
- Unsplash 외 새로운 외부 이미지 호스트 추가 시에만 remotePatterns 업데이트 필요

### Phase 2: Form Label 적용 (Parallel — 파일 간 독립)

**담당**: `frontend-ui-dev` + `frontend-data-dev` 병렬 (파일 도메인 분리)

#### Label ID 네이밍 컨벤션 (ADR-30-2)

**Context**: 42개 파일에 걸쳐 두 에이전트가 병렬로 id를 추가하므로 충돌 방지 규칙이 필요하다.

**Decision**: `{page-prefix}-{field-name}` 패턴 사용.
- `page-prefix`: 파일 경로 기반 축약 (예: `match-list`, `lesson-edit`, `admin-venue-new`)
- `field-name`: 필드 의미 (예: `title`, `location`, `search`, `sport-type`)
- 동적 리스트 내 폼: `{page-prefix}-{field-name}-{item.id 또는 index}` (예: `team-eval-comment-abc123`)
- 검색/필터 바 등 시각적 label 불필요 시: `<label htmlFor="..." className="sr-only">검색</label>`

**Consequences**: 페이지별 prefix가 고유하므로 병렬 작업에서 id 충돌 불가. 리스트 아이템은 고유 key 접미사로 보장.

**예시**:
```tsx
// matches/page.tsx (prefix: match-list)
<label htmlFor="match-list-search" className="sr-only">매치 검색</label>
<input id="match-list-search" ... />

// lessons/[id]/edit/page.tsx (prefix: lesson-edit)
<label htmlFor="lesson-edit-title">제목</label>
<input id="lesson-edit-title" ... />
```

#### 파일 도메인 분리 기준

- **frontend-ui-dev**: 목록 페이지, 채팅, 결제, 리뷰, 설정, 공유 컴포넌트 — 폼 요소 소수(1~4개)인 가벼운 파일
- **frontend-data-dev**: 생성/편집 페이지, admin 페이지 — 폼 요소 다수(5개 이상)인 form-heavy 파일
- 분리 기준은 이미 아래 테이블에 명시됨. **파일 단위로 배타적** — 한 파일은 한 에이전트만 수정

**label 누락 파일 26개** (htmlFor 없는 파일):

#### frontend-ui-dev 담당 (13 files — UI/페이지 레이어)

| # | File | Form Elements |
|---|------|---------------|
| 1 | `app/(main)/chat/[id]/chat-room-embed.tsx` | input 2 |
| 2 | `app/(main)/lessons/page.tsx` | input 1 |
| 3 | `app/(main)/marketplace/page.tsx` | input 1 |
| 4 | `app/(main)/marketplace/[id]/edit/page.tsx` | input 2, textarea 1 |
| 5 | `app/(main)/matches/page.tsx` | input 3 |
| 6 | `app/(main)/payments/page.tsx` | input 2 |
| 7 | `app/(main)/payments/[id]/refund/page.tsx` | textarea 1 |
| 8 | `app/(main)/reviews/page.tsx` | textarea 1 |
| 9 | `app/(main)/settings/account/page.tsx` | input 4 |
| 10 | `app/(main)/team-matches/page.tsx` | input 1 |
| 11 | `app/(main)/venues/page.tsx` | input 1 |
| 12 | `components/admin/admin-toolbar.tsx` | input 1 |
| 13 | `components/venue/review-form.tsx` | textarea 1 |

#### frontend-data-dev 담당 (13 files — form-heavy 페이지)

| # | File | Form Elements |
|---|------|---------------|
| 1 | `app/(main)/lessons/[id]/edit/page.tsx` | input 8, select 2, textarea 2 |
| 2 | `app/(main)/mercenary/[id]/edit/page.tsx` | input 5, textarea 1 |
| 3 | `app/(main)/team-matches/[id]/arrival/page.tsx` | input 2 |
| 4 | `app/(main)/team-matches/[id]/edit/page.tsx` | input 11, select 1, textarea 1 |
| 5 | `app/(main)/team-matches/[id]/evaluate/page.tsx` | textarea 1 |
| 6 | `app/(main)/team-matches/[id]/score/page.tsx` | input 2 |
| 7 | `app/admin/disputes/[id]/page.tsx` | textarea 1 |
| 8 | `app/admin/lessons/[id]/page.tsx` | select 1 |
| 9 | `app/admin/matches/[id]/page.tsx` | select 1 |
| 10 | `app/admin/teams/[id]/page.tsx` | input 1 |
| 11 | `app/admin/users/[id]/page.tsx` | textarea 1 |
| 12 | `app/admin/venues/new/page.tsx` | input 11, select 1, textarea 1 |
| 13 | `app/admin/venues/[id]/page.tsx` | input 11, select 1, textarea 1 |

#### Do NOT touch (충돌 방지)

- `frontend-ui-dev`: Phase 2에서 frontend-data-dev 담당 13개 파일 수정 금지
- `frontend-data-dev`: Phase 2에서 frontend-ui-dev 담당 13개 파일 수정 금지, Phase 1의 SafeImage 관련 파일 수정 금지
- 양쪽 모두: `safe-image.tsx`, `next.config.ts` 수정 금지 (Phase 1 전담)

### Phase 2에서 htmlFor 이미 있는 16개 파일도 점검

이미 htmlFor가 있는 파일에서도 **일부 input에만** 적용된 경우가 있음 (총 192 요소 vs 74 htmlFor = 118 누락). 아래 파일들은 기존 담당 에이전트가 자기 도메인 내에서 추가 점검:

- `app/(main)/lessons/new/page.tsx` (input 8 vs htmlFor 12 — OK)
- `app/(main)/team-matches/new/page.tsx` (input 12 vs htmlFor 13 — OK)
- `app/(main)/matches/new/page.tsx` (input 7 vs htmlFor 2 — 누락 있음)
- `app/(main)/teams/new/page.tsx` (input 9 vs htmlFor 4 — 누락 있음)
- `app/(main)/teams/[id]/edit/page.tsx` (input 6 vs htmlFor 9 — 확인 필요)
- `app/(main)/matches/[id]/edit/page.tsx` (input 6 vs htmlFor 3 — 누락 있음)
- `app/(main)/mercenary/new/page.tsx` (input 4 vs htmlFor 6 — 확인 필요)
- 기타 이미 htmlFor 있는 파일: 전수 점검 후 누락분 추가

**배정 원칙**: 해당 파일이 속한 Phase 2 에이전트 도메인에 따라 배정.

### Phase 3: Verification (Sequential)

**담당**: 오케스트레이터 또는 리뷰어

1. `tsc --noEmit` 전체 통과
2. `pnpm test` (apps/web) 전체 통과
3. SafeImage 사용처 12개 파일에서 `next/image` 렌더링 확인 (브라우저 DevTools)
4. 홈/상세 페이지 LCP 이미지에 `<link rel="preload">` 존재 확인
5. htmlFor 전수 점검: `grep -c 'htmlFor' + grep -c '<input\|<select\|<textarea'` 비교
6. `git diff --stat`으로 의도하지 않은 파일 변경 없는지 확인

## Acceptance Criteria

1. **SafeImage**: `next/image` 기반으로 동작, `priority` prop 시 preload 주입 확인
2. **SafeImage 호환성**: 기존 12개 파일 23개 사용처에서 이미지 정상 렌더링
3. **SafeImage fallback**: src 실패 시 fallbackSrc 대체 동작 유지
4. **Form labels**: 모든 `<input>`, `<select>`, `<textarea>`에 `<label htmlFor>` + `id` 연결 (hidden/submit 제외)
5. **sr-only**: 시각적 label 불필요 시 `<label className="sr-only">` 사용
6. **TypeScript**: `tsc --noEmit` 통과
7. **Tests**: `pnpm test` (apps/web) 전체 통과
8. **No regression**: 기존 기능 동작 확인

## Tech Debt Resolved

- `<img>` 태그 직접 사용 → `next/image` 전환 (이미지 최적화 파이프라인 통합)
- WCAG 2.1 AA form label 미준수 → 전수 적용
- ~~transition-all 성능 문제~~ (이미 해결됨, 본 태스크와 무관)

## Security Notes

- `next/image`의 `remotePatterns` 설정: 허용된 호스트만 이미지 최적화 대상. 와일드카드(`**`) 사용 금지
- form label 추가는 보안 영향 없음
- `dangerouslySetInnerHTML` 신규 사용 없음

## Risks & Dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| `next/image` fill 모드에서 부모 레이아웃 깨짐 | High | 각 사용처의 부모 요소 `position: relative` + 명시적 크기 확인 |
| Capacitor export 모드에서 `next/image` 호환성 | Medium | `next.config.ts`의 `images.unoptimized` 설정 확인, Capacitor 빌드 테스트 |
| ~~API 서버 이미지 URL이 `remotePatterns`에 미등록~~ | ~~Medium~~ | **해결**: ADR-30-1 — 같은 origin 상대 경로이므로 remotePatterns 불필요. `next.config.ts` 변경 없음 |
| SafeImage의 `...props` spread 제거 시 사용처 컴파일 에러 | High | 사용처 23곳에서 전달되는 실제 props 전수 조사 후 인터페이스 확정 |
| id 중복 (동적 리스트에서 같은 id 생성) | Low | id에 index 또는 unique key 접미사 추가 |

## Ambiguity Log

| # | Question | Resolution | Date |
|---|----------|------------|------|
| 1 | transition-all 교체 필요? | 전수 조사 결과 0건 잔존. 스코프 제외. | 2026-04-10 |
| 2 | SafeImage에 fill도 width/height도 전달하지 않는 기존 사용처 처리? | 기본 `fill={true}` 적용, 부모에 relative+크기 보장 | 2026-04-10 |
| 3 | API 서버 업로드 이미지의 remotePatterns 등록 필요? | **불필요** — ADR-30-1 참조. 업로드 이미지는 같은 origin 상대 경로(`/uploads/...`)이므로 remotePatterns 대상 아님. `next.config.ts` 변경 없음. | 2026-04-10 |
