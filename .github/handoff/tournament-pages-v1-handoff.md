# 토너먼트 서브페이지 구현 핸드오프 프롬프트

> **세션 재개용 프롬프트 — 2026-07-11 기준**
> 이 문서를 새 세션에 붙여넣으면 이전 작업을 바로 이어받을 수 있습니다.

---

## 프로젝트 컨텍스트

**Repository**: `matchup-sports-platform` (pnpm monorepo, Turborepo)
**Active Branch**: `feat/tournament-results-2leg-desktop`
**PR**: #31 (https://github.com/kim-song-jun/matchup-sports-platform/pull/31)

### 실행 환경

| 서비스 | 포트 | 명령 |
|--------|------|------|
| v1_web (Next.js 16) | 3013 | `cd apps/v1_web && ./node_modules/.bin/next dev --webpack --hostname 0.0.0.0 --port 3013` |
| v1_api (NestJS) | 8121 | `cd apps/v1_api && node -r ts-node/register/transpile-only src/main.ts` |
| PostgreSQL (Docker) | 5432 | `docker start v1_pg_dev` |

- **v1_web URL**: `http://localhost:3013/v1/...` (basePath 없음, `/v1/` prefix는 beforeFiles rewrite로 동작)
- **v1_api URL**: `http://localhost:8121/api/v1/...`
- **Admin auth**: localStorage `teameet.v1.userId=7e4122c9-4246-463a-80b9-d5154a0ead29`, `teameet.v1.userEmail=admin@teameet.v1`
- **Test tournament (completed)**: `5c46e679-7f80-4e55-a126-6075ca7ad4b2`
- **Test tournament (in_progress)**: `dcce32e8-834f-450b-94a7-feb7186e99df`

---

## 이번 세션에서 완료한 작업

### 1. 토너먼트 서브페이지 4개 구현

#### `/tournaments/[id]/bracket` — 순위·브래킷
- 조별 순위표 (A조, B조)
- 월드컵 스타일 SVG 커넥터 대진표 + 드래그 스크롤
- **4강 2차전 합산 스코어**: `fixtureNumber` 기준 1차전/2차전을 집계하여 합산 카드 표시
  - `tournament-bracket.tsx`: `aggregateByMatchup()`, `AggregateMatchCard`, `isMultiLeg()` 추가
  - `groupFixturesByRound()`: sortIndex 최솟값 업데이트 버그 수정
- 진행 단계 스테퍼 (조별리그 ✓ → 4강 ✓ → 결승 ✓)

#### `/tournaments/[id]/results` — 최종결과
- 모바일 챔피언 히어로: `tm-res-hero` CSS 활용, springy 등장 애니메이션, confetti 32개, **탭하면 애니메이션 재실행**
- 최종 순위 테이블 (파란색 1위 강조, blue50 배경)
- 결선 경기 카드형 레이아웃 (결승/4강 그룹/3·4위전 각각 독립 카드, 팀명 전체 표시)

#### `/tournaments/[id]/awards` — 시상·리뷰
- 시상대 (포디움 2위/1위/3위 순서)
- 상금·시상 섹션
- 개인 어워드 섹션 (실제 데이터 or "집계 중" 메시지)
- 참가팀 후기 (실제 DB 연동, 참가팀 권한 gate)

#### `/tournaments/[id]` — 대회 상세 (기존 + 개선)
- `BracketSection`: 결선 픽스처 없을 때 완전 숨김 (플레이스홀더 제거)
- 모집 중/조별 리그 진행 중에는 결선 대진표 미표시

### 2. 토너먼트 리뷰·어워드 풀스택 구현

#### Backend (v1_api)
- **DB**: `v1_tournament_reviews`, `v1_tournament_awards` 테이블 추가 (Prisma migration 완료)
- **API 엔드포인트**:
  - `GET /tournaments/:id/reviews` — 공개
  - `POST /tournaments/:id/reviews` — 인증 + 참가팀 gate (1팀 1리뷰)
  - `GET /tournaments/:id/reviews/me` — 내 리뷰 조회
  - `GET /tournaments/:id/participant-check` — 참가자 여부
  - `PUT /admin/tournaments/:id/awards` — 어드민 어워드 설정
- **tournament detail 응답**: `reviews[]`, `awards[]` 배열 포함

#### Frontend (v1_web)
- **새 훅**: `useV1TournamentReviews`, `useV1MyTournamentReview`, `useV1TournamentParticipantCheck`, `useV1SubmitTournamentReview`, `useV1SetTournamentAwards`
- **api-client.ts**: `v1Put()` 함수 추가
- **타입**: `V1TournamentReview`, `V1TournamentAward` 추가
- **어워드 페이지**: 실제 리뷰 데이터 표시, 별점 모달, 참가팀만 쓰기 버튼 노출
- **어드민 대회 상세**: "개인 어워드" 탭 추가 (MVP/득점왕 등 입력 UI)

### 3. 디자인 통일

- **`TournamentHubHeader` 제거**: bracket, awards 서브페이지에서 대형 토너먼트 제목 제거
  - 이전: 각 서브페이지 상단에 큰 제목 + 뱃지 표시
  - 이후: topbar의 페이지 제목만 (순위·브래킷 / 최종결과 / 시상·리뷰)
- **결선 경기 테이블**: `borderLeft` 안티패턴 제거, 카드형 레이아웃으로 팀명 전체 표시
- **상금 표시 버그 수정**: `prizeBreakdown` 쉼표 분리 버그 수정

### 4. 기타 수정
- `FinalStandingsTable` (순위 테이블): 금/은/동 색상 배경 → 1위만 blue50, 나머지 transparent
- `MobileChampionBanner`: 클릭 시 confetti 애니메이션 재실행

---

## 현재 상태 / 남은 작업

### ✅ 완료된 기능
- 4개 서브페이지 전체 구현 및 데이터 연동
- 4강 2차전 합산 시스템 (DB 시드 포함)
- 리뷰/어워드 백엔드 + 프론트엔드
- 디자인 통일 (헤더, 테이블, 카드)

### 🔄 남은 작업 / 알려진 이슈

#### 높은 우선순위
1. **개발 서버 파일 와처 불안정**: Next.js dev 서버가 파일 변경을 자동 감지하지 못함. 코드 수정 후 서버 재시작 필요. (근본 원인: nohup 백그라운드 실행 시 kqueue 이벤트 미수신)

2. **v1Put import 경고**: `use-v1-api.ts`에서 `v1Put`을 import하나 dev 서버 캐시에서 "not exported" 경고 발생. 실제로는 export 됨 — 서버 재시작 후 해결.

3. **awards 페이지 리뷰 섹션 `ReviewsSection` 렌더링 조건**:
   - 현재 `참가팀 후기` 헤딩이 항상 표시됨
   - 비참가자에게는 "후기 없음" 상태만 보여야 함 (OK)
   - 하지만 헤딩 아래 Card 컨테이너의 padding/spacing이 항상 표시 → 개선 여지

#### 중간 우선순위
4. **어드민 어워드 탭**: `AwardsTab` 컴포넌트가 `useV1AdminTournament` 훅을 통해 기존 awards 로드 시도하나, `V1AdminTournament` 타입에 `awards` 필드가 없음 → TypeScript에서 as 캐스팅으로 우회 중. 타입 정확히 추가 필요.

5. **대회 목록 페이지 (`/tournaments`)**: 진행 중인 대회에 LIVE 배지 + 빠른 진입 CTA가 없음. 카드 디자인 개선 여지.

6. **bracket 페이지 조별 순위 섹션**: `A조 상위 2팀 진출` 같은 진출 조건 레이블이 없음.

#### 낮은 우선순위 / 미래 작업
7. **개인 어워드 관리자 입력**: 어드민 탭은 구현됐으나 `useV1AdminTournament`가 `awards`를 반환하지 않아 초기값 로드 안 됨 → `GET /admin/tournaments/:id/awards` 엔드포인트 활용 필요
8. **리뷰 작성 시 아바타 이미지**: 현재 팀명 첫 글자만 표시, 실제 팀 로고 연동 가능
9. **모바일 bracket 페이지 스크롤**: 대진표 드래그 스크롤이 iOS Safari에서 간헐적으로 기본 스크롤과 충돌

---

## 코드 변경 파일 목록

### v1_web (프론트엔드)
```
apps/v1_web/src/
├── app/tournaments/[id]/
│   ├── tournament-detail-client.tsx  # BracketSection 조건 수정, CTA 추가
│   ├── bracket/bracket-page-client.tsx  # TournamentHubHeader 제거, 4강 합산
│   ├── results/results-page-client.tsx  # 챔피언 히어로, 결선 경기 카드 레이아웃
│   └── awards/awards-page-client.tsx   # 실제 리뷰/어워드 연동, 권한 gate
├── app/admin/tournaments/[id]/tournament-detail-client.tsx  # 어워드 탭 추가
├── components/tournaments/tournament-bracket.tsx  # 합산 카드, sortIndex 수정
├── hooks/use-v1-api.ts  # 리뷰/어워드/참가자 확인 훅 추가
├── lib/api-client.ts  # v1Put 추가
├── types/api.ts  # V1TournamentReview, V1TournamentAward 타입
└── app/globals.css  # 애니메이션 CSS (기존 유지)
```

### v1_api (백엔드)
```
apps/v1_api/
├── prisma/schema.prisma  # V1TournamentReview, V1TournamentAward 모델 추가
├── src/tournaments/
│   ├── tournament-reviews.service.ts  # 신규: 리뷰/어워드 서비스
│   ├── tournament-reviews.controller.ts  # 신규: 리뷰/어워드 컨트롤러
│   ├── tournaments.module.ts  # 신규 서비스/컨트롤러 등록
│   └── tournaments-read.service.ts  # detail에 reviews/awards 포함
```

---

## 주요 DB 정보

```sql
-- 테스트 토너먼트 (completed, with 4강 2차전 데이터)
SELECT id, title, status FROM v1_tournaments WHERE id = '5c46e679-7f80-4e55-a126-6075ca7ad4b2';

-- 4강 픽스처 확인 (2차전 데이터 포함)
SELECT fixture_number, leg_number, home_team_name, away_team_name
FROM v1_tournament_fixtures
WHERE tournament_id = '5c46e679-7f80-4e55-a126-6075ca7ad4b2'
AND round = 'semi'
ORDER BY fixture_number, leg_number;

-- 신규 테이블 확인
SELECT COUNT(*) FROM v1_tournament_reviews;
SELECT COUNT(*) FROM v1_tournament_awards;
```

---

## 새 세션에서 이어받기

### 즉시 해야 할 것
1. 서버 상태 확인:
   ```bash
   curl -s "http://localhost:8121/api/v1/health" | grep '"db":true'
   curl -s -o /dev/null -w "%{http_code}" "http://localhost:3013/tournaments"
   ```

2. 아직 안 된다면 DB 시작:
   ```bash
   docker start v1_pg_dev
   ```

3. PR 최신 상태 확인:
   ```bash
   cd /Users/sungjun/Documents/projects/matchup-sports-platform
   git log --oneline -8
   gh pr view 31 --json state,url
   ```

### 추천 다음 작업 순서
1. 어드민 `AwardsTab` 타입 수정 (V1AdminTournament에 awards 필드 추가)
2. 대회 목록 페이지 카드 디자인 개선 (LIVE 배지, 진입 CTA)
3. bracket 페이지 조별 진출 조건 레이블
4. 리뷰 작성 모달 UX 개선 (성공 후 목록 갱신)

---

## 중요 설계 결정사항

1. **4강 2차전 합산**: `fixtureNumber`로 묶어 집계. leg1 홈팀 기준 정규화, isReversed로 홈/어웨이 뒤집힘 처리
2. **TournamentHubHeader 제거 결정**: 서브페이지들(bracket/results/awards)은 topbar 제목으로만 페이지 식별, 대형 중복 헤더 없음
3. **결선 대진표 미표시 조건**: 픽스처 없으면 완전 숨김 (플레이스홀더 카드 금지)
4. **리뷰 권한 gate**: `confirmed` 상태 registration의 `appliedByUserId`만 작성 가능, 1팀 1리뷰
5. **borderLeft 안티패턴**: 프로젝트 규칙상 decorative left rail 금지 → 배경색으로 강조
