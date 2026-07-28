# 시나리오 16 — 대회 캠페인 (Tournament Campaigns)

> 작성일: 2026-07-15 | 세션: 세션 2 (캠페인·이벤트·프로필)

## 개요

대회 캠페인은 공개 대회 정보(서버 원본)와 편집 가능한 마케팅 콘텐츠(hero/intro/highlights/FAQ)를 분리해 운영하는 기능입니다. 캠페인은 `draft → published → archived` 상태를 가지며, 공개된 캠페인만 `/tournaments/campaigns/[slug]`로 접근 가능합니다.

## 엔드포인트

| 방법 | 경로 | 설명 |
|------|------|------|
| GET | `/api/v1/tournaments/campaigns` | published 캠페인 목록 (cursor 페이지네이션) |
| GET | `/api/v1/tournaments/campaigns/:slug` | 단건 published 캠페인 |
| HEAD | `/api/v1/tournaments/campaigns/:slug/availability` | 가용성 확인 |
| GET | `/api/v1/admin/tournaments/:id/campaign` | 어드민 캠페인 조회 |
| GET | `/api/v1/admin/tournaments/:id/campaign/preview` | 어드민 미리보기 |
| POST | `/api/v1/admin/tournaments/:id/campaign` | 캠페인 생성 |
| PATCH | `/api/v1/admin/tournaments/:id/campaign` | 캠페인 수정 |
| POST | `/api/v1/admin/tournaments/:id/campaign/status` | 상태 전환 |

### 목록 쿼리 파라미터

- `cursor`: 커서 페이지네이션
- `limit`: 최대 50 (기본 20)
- `sportCode`: 종목 코드 필터 (예: `futsal`, `basketball`)

## CTA 가용성 계약

`registrationAvailability`는 서버에서 계산해 내려보내며, 프론트는 이를 기준으로 CTA를 결정합니다.

| availability | 대회 status | CTA |
|-------------|------------|-----|
| `available` | `open` | **참가 신청하기** → `/tournaments/:id/my` |
| `deadline_passed` | `open` | CTA 없음 (접수 기간 종료) |
| `full` | `open` | CTA 없음 (정원 마감) |
| `started` | `open` | CTA 없음 (이미 시작) |
| `closed` | `open` | CTA 없음 (접수 없음) |
| `closed` | `in_progress` | **대진표 보기** → `/tournaments/:id/bracket` |
| `closed` | `completed` | **결과 보기** → `/tournaments/:id/results` |
| `closed` | `closed` | CTA 없음 |

보조 CTA는 항상 **대회 상세 보기** → `/tournaments/:id`.

## 캠페인 상태 전환

```
draft ──→ published ──→ archived
  ↑______________|
(draft로 되돌리기는 지원하지 않음)
```

- `slug`는 첫 `published` 전환 전까지만 수정 가능 (`slugLocked = publishedAt !== null`)
- 상태 전환 시 `reason` 필드 필수

## 이벤트 허브 (/events)

### 목적

published 캠페인 목록을 한곳에 모아 사용자가 대회를 발견하는 전용 진입점을 제공합니다.

### 진입 경로

1. 대회 목록 페이지(`/tournaments`)의 "이벤트 허브" 배너
2. 홈 페이지 프로모 카드의 캠페인 슬러그 링크
3. 직접 URL

### 시나리오 체크리스트

- [ ] 목록이 비어 있으면 EmptyState 노출 ("등록된 이벤트가 없어요")
- [ ] 종목 필터 선택 시 해당 종목 캠페인만 표시
- [ ] 카드 클릭 → `/tournaments/campaigns/[slug]`로 이동
- [ ] API 오류 시 ErrorState + 재시도 가능
- [ ] SEO 친화적 title/description (Server Component metadata 지원)
- [ ] 모바일/태블릿/데스크톱 레이아웃 검증

## 캠페인 상세 (/tournaments/campaigns/[slug])

### 시나리오 체크리스트

- [ ] `registrationAvailability === 'available'` → "참가 신청하기" CTA 표시
- [ ] `registrationAvailability === 'deadline_passed'` → CTA 없음, "접수 기간이 종료됐어요" 헤딩
- [ ] `registrationAvailability === 'full'` → CTA 없음, "참가 정원이 모두 찼어요" 헤딩
- [ ] `confirmedCount > 0, pendingPaymentCount > 0` → "N팀 확정 · M팀 입금 대기 / K팀" 표시
- [ ] `status === 'in_progress'` → "대진표 보기" CTA
- [ ] `status === 'completed'` → "결과 보기" CTA
- [ ] `status === 'closed'` → 보조 CTA("대회 상세 보기")만 표시
- [ ] `slug`가 없거나 archived인 경우 404 반환
- [ ] highlights 배열이 비어도 레이아웃 깨지지 않음
- [ ] FAQ 배열이 비어도 레이아웃 깨지지 않음
- [ ] 후원사 섹션: `sponsors.length === 0`이면 렌더 안 함
- [ ] 상금 섹션: `prizePool === null && !prizeSummary`이면 렌더 안 함

## 어드민 캠페인 탭 (/admin/tournaments/[id])

### 시나리오 체크리스트

- [ ] 캠페인 없음 → "캠페인 만들기" 버튼, canWrite=false면 안내 텍스트만
- [ ] 생성 폼: slug 유효성(소문자+하이픈, 중복 불가), content 필드 전부 입력
- [ ] 수정 폼: published 후에는 slug 잠금(slugLocked=true)
- [ ] 미리보기 패널에서 실제 대회 데이터 + 캠페인 콘텐츠 합쳐진 렌더 확인
- [ ] `draft → published`: "발행하기" 버튼, reason 입력 필수
- [ ] `published → archived`: "보관하기" 버튼, reason 입력 필수
- [ ] 상태 변경 성공 후 토스트 표시 + 캐시 무효화

## 비완료/결정 보류 항목

- 대회 생성 폼 4단계 위저드(Task #93) — §3 main↔dev 통합 + 성별 쿼터 재조정 완료 후 착수
- 대회 신청 후 입금/명단 확정 리마인더 알림 — 알림 시스템과 연동 필요
