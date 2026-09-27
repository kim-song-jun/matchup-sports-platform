# Task 62: UI 감성 품질 전면 개편

> 생성일: 2026-04-13
> 우선순위: Critical
> 상태: In Progress

## Context

사용자가 직접 스크린샷 10장을 제공하며 다음 문제를 지적:
- 텍스트 크기 위계가 전혀 통일되어 있지 않음 (난잡하고 복잡)
- 뱃지/태그 크기가 페이지마다 제각각
- 하단 CTA와 bottom-nav 겹침
- 모바일 퍼스트 디자인이 기본인데 레이아웃이 이를 반영하지 못함
- 토스 스타일의 깔끔함과 시인성이 부족

## Goal

**토스/당근마켓 수준의 모바일 퍼스트 UI 품질** 달성.
모든 페이지에서 텍스트 위계, 뱃지, 간격, 컬러가 하나의 디자인 시스템으로 통일.

## Original Conditions (사용자 직접 지적)

### Image 1 — 매치 상세 하단
- [x] "참가 후 결제하기 · 12,000원" 버튼 어색 → text-base font-semibold로 축소
- [x] "캘린더에 추가" 버튼 시각적 무게 과다 → subtle 처리
- [ ] 하단 CTA와 bottom-nav 겹침 → mb-24 여백 필요

### Image 2 — 참가자 목록
- [x] 글씨 크기 위계 없음 → 섹션 라벨/이름/뱃지 3단계 분리
- [x] "확정"/"대기" 뱃지 너무 작음 → badge-lg 적용
- [x] 호스트 뱃지 강조 부족 → bg-blue-50 text-blue-500

### Image 3 — 매치 찾기 목록
- [x] 종목 태그와 퀵 필터 구분 애매 → solid vs outline 분리
- [x] 검색바 위치/스타일 어색 → 상단 배치, h-9 compact
- [x] 매치 카드 이미지 짤림 → max-h 제거, aspect-[16/9]만
- [x] 오버레이 텍스트 부적합 → drop-shadow + gradient 강화
- [ ] 필터 위치/레이아웃 모바일 퍼스트 재검토

### Image 4 — 팀 리스트
- [x] 태그 글씨 크기 → text-xs로 통일
- [x] 이미지 크기 → w-20 h-20 rounded-xl
- [x] 카드 형식 개선 → 패딩/간격 정리
- [x] 위치 글씨 크기 위계 → text-xs text-gray-400
- [x] "모집중" 뱃지 → bg-blue-50 pill 뱃지화

### Image 5 — 팀 상세
- [x] "팀원 모집중" CTA 불명확 → blue 카드 + 명확한 뱃지
- [x] 아이콘 없음/강조 부족 → UserPlus, MessageSquare 추가
- [x] "연락하기" 아이콘 이상 → MessageSquare로 교체
- [x] "허브 섹션" 어색 → "팀 활동"으로 변경 + 아이콘 추가

### Image 6 — 장터
- [x] 카드 이미지 크기 문제 → 확인 필요
- [x] 태그 크기 제각각 → badge-md 통일
- [x] 글씨 크기/아이템 배치 → 타이포 위계 수정
- [x] 필터/검색 개선 → 거래유형 필터 행 추가
- [x] "대여"/"공동구매" 필터 누락 → listingType 필터 추가

### Image 7 — 마이페이지
- [x] 상단 navbar 어색 → subtitle 제거
- [x] 종목 뱃지 어색 → sportCardAccent dot + 텍스트만
- [x] 매치/점수/종목 숫자 위계 → text-2xl bold / text-2xs label
- [x] "매칭 찾기" 글씨 짤림 → whitespace-nowrap + 헤더 간소화
- [ ] 텍스트 크기 위계 전반 재검토

### Image 8 — 홈
- [x] 아이덴티티 부족 → 빠른 액션 2x2 그리드 추가
- [x] 기능 노출 없음 → 매치/팀매칭/용병/장터 퀵 카드
- [x] 위계/설득력 부족 → AI 추천 매치 섹션 + 첫 일정 하이라이트
- [ ] 모바일 퍼스트 레이아웃 재검토

### Image 9 — 마이페이지 퀵 메뉴
- [ ] 리스트 글씨 크기 → text-sm 통일
- [ ] 구분선 이상 → divide-gray-50 subtle
- [ ] 그룹 헤더 스타일 올드 → text-xs font-medium text-gray-400
- [ ] "+ 만들기" 뱃지 → text-blue-500 text-xs 텍스트 링크

### Image 10 — CTA/Nav 겹침
- [ ] "신청하기" CTA와 bottom-nav 겹침 → 하단 여백 확보

## Cross-cutting Issues (전체 시스템)

### 텍스트 위계 표준 (미완료)
| 역할 | 클래스 | 용도 |
|------|--------|------|
| 페이지 타이틀 | `text-xl font-bold` | 최상단 |
| 섹션 헤더 | `text-base font-bold` | 섹션 구분 |
| 카드 제목 | `text-[15px] font-semibold` | 카드 내 |
| 본문 | `text-sm` | 일반 텍스트 |
| 보조 텍스트 | `text-xs text-gray-500` | 메타 정보 |
| 캡션 | `text-2xs text-gray-400` | 최하위 |

### 뱃지 표준 (미완료)
| 타입 | 크기 | 패딩 | radius |
|------|------|------|--------|
| badge-sm | `text-2xs font-medium` | `px-1.5 py-0.5` | `rounded-md` |
| badge-md | `text-xs font-medium` | `px-2 py-0.5` | `rounded-full` |
| badge-lg | `text-xs font-medium` | `px-2.5 py-1` | `rounded-full` |

### 하단 CTA 겹침 (미완료)
- 모든 하단 고정 CTA에 `pb-24` 여백
- 또는 CTA를 `bottom-[calc(80px+env(safe-area-inset-bottom))]`로 배치

### 모바일 퍼스트 원칙
- 모든 레이아웃은 375px 모바일부터 설계
- `sm:` → `md:` → `lg:` → `@3xl:` 순으로 확장
- bottom-nav 모바일 전용, 데스크탑은 사이드바

## Acceptance Criteria

- [ ] 전 페이지 텍스트 위계 표준 적용 (위 표 기준)
- [ ] 전 컴포넌트 뱃지 3단계 표준 적용
- [ ] 하단 CTA/bottom-nav 겹침 0건
- [ ] 마이페이지 퀵 메뉴 토스 스타일 적용
- [ ] `tsc --noEmit` 통과
- [ ] Vitest 289 tests 통과

## QA 초보 사용자 피드백 (추가)

### Critical
- [ ] "마감되었습니다" → "마감되었어요" (합니다체 위반) — matches/[id]/page.tsx:588
- [ ] "모집이 마감되었어요" vs "마감되었습니다" 중복 — matches/[id]/page.tsx:584,588
- [ ] 모바일 매치 상세 Sticky CTA 없음 — 참가 버튼이 스크롤 아래에만 존재

### Warning
- [ ] "참가"/"신청" 용어 혼재 — matches/[id]/page.tsx:579,604,607
- [ ] "매칭 찾기" vs "매치 찾기" 혼용 — ko.json:244,245
- [ ] "오늘 경기" — 다른 곳은 "매치" 사용 — ko.json:132
- [ ] 비로그인 홈에서 스포츠 맥락 즉시 전달 부족
