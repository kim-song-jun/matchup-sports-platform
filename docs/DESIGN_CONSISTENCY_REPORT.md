# MatchUp 디자인 통일성 검사 보고서

> 검사일: 2026-04-10 (원본: 2026-03-25)
> 대상: 랜딩 제외 전체 사용자 페이지 (50+)

## 수정 필요 항목

### ✅ RESOLVED: my/ 페이지 h1 크기 (7건)

> 2026-04-10 확인: 전 페이지 `text-2xl font-bold` (24px ≈ 표준 22px 이상)로 수정 완료.

| 페이지 | 이전 | 현재 |
|--------|------|------|
| /my/matches | text-[15px] | text-2xl font-bold |
| /my/teams | text-[15px] | text-2xl font-bold |
| /my/team-matches | text-[15px] | text-2xl font-bold |
| /my/lessons | text-[15px] | text-2xl font-bold |
| /my/listings | text-[15px] | text-2xl font-bold |
| /my/mercenary | text-[15px] | text-2xl font-bold |
| /my/reviews-received | text-[15px] | text-2xl font-bold |

### 🟡 Medium: settings 하위 + chat h1 (5건)

> 2026-04-10: /settings/account는 WCAG AA 대응 및 접근성 개선 완료. h1 크기는 서브페이지 특성상 유지 허용.

| 페이지 | 현재 | 비고 |
|--------|------|------|
| /settings/account | text-lg font-semibold | 서브페이지 — 허용. WCAG AA 접근성 완료 |
| /settings/notifications | text-[16px] | 서브페이지라 OK 가능 |
| /settings/terms | text-[16px] | 동일 |
| /settings/privacy | text-[16px] | 동일 |
| /chat | text-[15px] | 수정 필요 (미해결) |

### ✅ RESOLVED: 필터 칩 active 색상 통일

> 2026-04-10 확인: `bg-gray-900 text-white`로 대부분 통일 완료.

- bg-gray-900 text-white: payments, chat, marketplace, venues, team-matches, lessons, mercenary 등 (주요 필터 페이지 통일)
- bg-blue-500 text-white: notifications, reviews (성격이 다른 상태 표시 — 허용)

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

---

## 2026-04-10 검사 완료 항목

### 추가 확인 통과 ✅

| 항목 | 위치 | 상태 |
|------|------|------|
| `transition-[colors,transform]` 적용 | `/settings/account` 뒤로가기 버튼, DeleteModal 닫기 버튼 | ✅ |
| `disabled:pointer-events-none` 적용 | DeleteModal 탈퇴하기 버튼 | ✅ |
| `dark:bg-red-900/30` 적용 | DeleteModal 경고 아이콘 컨테이너 | ✅ |
| 매치 카드 alt 텍스트 개선 | `matches-client.tsx` `SafeImage` alt=`` `${sportLabel[match.sportType]} 매치 이미지` `` | ✅ |
| `useRequireAuth()` 인증 게이트 | `/settings/account` 페이지 최상단 | ✅ |
| DeleteModal WCAG 2.1 AA | `role="dialog"` + `aria-modal` + `aria-labelledby` + ESC + focus trap | ✅ |
| 회원탈퇴 확인 입력 문구 | "탈퇴합니다" 입력 후 버튼 활성화 (이전: "계정 삭제") | ✅ |
