# MatchUp 디자인 통일성 검사 보고서

> 검사일: 2026-03-25
> 대상: 랜딩 제외 전체 사용자 페이지 (50+)

## 수정 필요 항목

### 🔴 Critical: my/ 페이지 h1 크기 (7건)

| 페이지 | 현재 | 표준 |
|--------|------|------|
| /my/matches | text-[15px] | text-[22px] |
| /my/teams | text-[15px] | text-[22px] |
| /my/team-matches | text-[15px] | text-[22px] |
| /my/lessons | text-[15px] | text-[22px] |
| /my/listings | text-[15px] | text-[22px] |
| /my/mercenary | text-[15px] | text-[22px] |
| /my/reviews-received | text-[15px] | text-[22px] |

### 🟡 Medium: settings 하위 + chat h1 (5건)

| 페이지 | 현재 | 비고 |
|--------|------|------|
| /settings/account | text-[16px] | 서브페이지라 OK 가능 |
| /settings/notifications | text-[16px] | 동일 |
| /settings/terms | text-[16px] | 동일 |
| /settings/privacy | text-[16px] | 동일 |
| /chat | text-[15px] | 수정 필요 |

### 🟡 Medium: 필터 칩 active 색상 혼재

- bg-gray-900 text-white: 3건 (일부 페이지)
- bg-blue-500 text-white: 14건 (대부분)
- **결정 필요**: 하나로 통일

## 통과 항목 ✅

| 항목 | 상태 |
|------|------|
| 비표준 텍스트 (17/19/21/23px) | 0건 |
| h-8 spacer | 0건 (h-6 통일) |
| 검색 바 스타일 | 4/4 통일 |
| 헤더 패딩 pt-4 pb-3 | 대부분 통일 |
| dark mode | 18/50+ 적용 (진행 중) |

## 디자인 시스템 표준 (확정)

```
타이포:
  h1 (페이지 제목): text-[22px] font-bold
  h2 (섹션 제목): text-[16px] font-bold
  h3 (카드 제목): text-[15px] font-semibold truncate
  body: text-[14px]
  caption: text-[12px] text-gray-400
  small: text-[11px] text-gray-400

간격:
  헤더: pt-4 pb-3
  섹션 간: mt-5 (tight) or mt-6 (generous)
  카드 간: space-y-2 (모바일) / lg:gap-2.5 (데스크탑)
  카드 내: p-4 (standard) / p-5 (featured)
  하단: h-6

색상:
  액센트: blue-500
  필터 active: bg-gray-900 text-white
  카드 border: border-gray-100
  배경: bg-gray-50 / bg-white
```
