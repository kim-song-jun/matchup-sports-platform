# UI/UX Scenario Test Index

> **프로젝트**: Teameet (TeamMeet) — AI 기반 멀티스포츠 소셜 매칭 플랫폼
> **총 시나리오**: 483개 | **파일**: 15개 | **줄**: 13,342줄
> **뷰포트**: 9종 (D1~D3, T1~T3, M1~M3)
> **대상 페이지**: 92개 page.tsx

---

## 가이드 문서

| 문서 | 용도 |
|------|------|
| [00-template.md](00-template.md) | 시나리오 포맷 SSOT (ID 규칙, 액션 표기법, 9뷰포트 체크리스트) |
| [../prompts/session-a.md](../prompts/session-a.md) | Session A — Claude Desktop 내장 브라우저 실행자 |
| [../prompts/session-b.md](../prompts/session-b.md) | Session B — 스크린샷 파일 감시 + 이동 |
| [../prompts/session-c.md](../prompts/session-c.md) | Session C — 이미지 분석 + 문서 업데이트 |

---

## 시나리오 파일

| # | 파일 | 대상 페이지 | 시나리오 | 줄 |
|---|------|-----------|---------|-----|
| 01 | [01-landing.md](01-landing.md) | `/landing` `/about` `/faq` `/guide` `/pricing` | 42 | 1,158 |
| 02 | [02-auth.md](02-auth.md) | `/login` `/callback/*` `/onboarding` | 40 | 1,028 |
| 03 | [03-home.md](03-home.md) | `/home` `/feed` | 27 | 739 |
| 04 | [04-matches.md](04-matches.md) | `/matches` `/matches/new` `/matches/[id]` `/matches/[id]/edit` | 32 | 901 |
| 05 | [05-teams.md](05-teams.md) | `/teams` `/teams/new` `/teams/[id]/*` (7 sub-pages) | 26 | 722 |
| 06 | [06-team-matches.md](06-team-matches.md) | `/team-matches` `/team-matches/new` `/team-matches/[id]/*` (7 sub-pages) | 35 | 1,008 |
| 07 | [07-mercenary.md](07-mercenary.md) | `/mercenary` `/mercenary/new` `/mercenary/[id]` `/mercenary/[id]/edit` | 29 | 809 |
| 08 | [08-marketplace.md](08-marketplace.md) | `/marketplace` `/marketplace/new` `/marketplace/[id]` `/marketplace/[id]/edit` | 32 | 859 |
| 09 | [09-lessons.md](09-lessons.md) | `/lessons` `/lessons/new` `/lessons/[id]` `/lessons/[id]/edit` | 29 | 822 |
| 10 | [10-chat.md](10-chat.md) | `/chat` `/chat/[id]` | 18 | 501 |
| 11 | [11-payments.md](11-payments.md) | `/payments` `/payments/checkout` `/payments/[id]` `/payments/[id]/refund` | 18 | 485 |
| 12 | [12-profile-settings.md](12-profile-settings.md) | `/profile` `/settings/*` `/my/*` `/reviews` `/user/[id]` (17 pages) | 45 | 1,182 |
| 13 | [13-venues-misc.md](13-venues-misc.md) | `/venues/*` `/notifications` `/badges` `/tournaments/*` | 31 | 818 |
| 14 | [14-admin.md](14-admin.md) | `/admin/*` (20 pages) | 46 | 1,302 |
| 15 | [15-global-ui.md](15-global-ui.md) | 사이드바, 헤더, 하단 네비, 테마, 모달, 토스트, 반응형 | 32 | 926 |
| | **합계** | **92 pages** | **483** | **13,342** |

---

## 실행 순서

```
1. 15-global-ui     ← 사이드바/헤더/네비 기반 확인
2. 02-auth          ← 로그인 (이후 모든 시나리오 사전조건)
3. 03-home          ← 메인 페이지
4. 04-matches       ← 개인 매칭
5. 05-teams         ← 팀 관리
6. 06-team-matches  ← 팀 매칭 lifecycle
7. 07-mercenary     ← 용병
8. 08-marketplace   ← 장터
9. 09-lessons       ← 강좌
10. 10-chat         ← 채팅
11. 11-payments     ← 결제
12. 12-profile-settings ← 프로필/설정/마이페이지
13. 13-venues-misc  ← 구장/알림/뱃지/대회
14. 14-admin        ← 관리자
15. 01-landing      ← 랜딩 (비로그인, 마지막)
```

---

## 인터랙션 유형 커버리지

| 유형 | 커버 파일 |
|------|----------|
| 버튼 클릭 | 전체 15파일 |
| 호버 효과 | 01, 03, 04, 05, 07, 08, 09, 12, 13, 15 |
| 폼 입력 (text/select/checkbox) | 02, 04, 05, 06, 07, 08, 09, 10, 11, 12, 14 |
| 드래그 앤 드롭 | 06 |
| 키보드 단축키 | 10, 15 |
| 테이블/필터/정렬 | 04, 05, 06, 07, 08, 09, 12, 13, 14 |
| 다이얼로그/모달 | 02, 04, 05, 06, 07, 08, 09, 10, 12, 14, 15 |
| 토스트 메시지 | 04, 05, 06, 07, 08, 09, 10, 11, 12, 14, 15 |
| 로딩/스켈레톤 | 전체 |
| 빈 상태 (EmptyState) | 03, 04, 05, 07, 08, 09, 10, 12, 13, 14, 15 |
| 에러 상태 | 02, 03, 04, 08, 09, 13, 14, 15 |
| 다크 모드 | 01, 02, 03, 04, 09, 14, 15 |
| 반응형 (9 뷰포트) | 전체 (D/T/M 체크리스트) |
| 파일 업로드 | 04, 08, 12 |
| 이미지 라이트박스 | 05, 08, 09, 13 |
| Socket.IO 실시간 | 10 |
| OAuth 소셜 로그인 | 02 |
| 결제 플로우 | 04, 09, 11 |
| 접근성 (ARIA, keyboard) | 01, 02, 04, 14, 15 |

---

## 3-세션 파이프라인

```
Session B (먼저)         Session A (둘째)           Session C (셋째)
━━━━━━━━━━━━          ━━━━━━━━━━━━━            ━━━━━━━━━━━━━
Downloads 감시          Claude Desktop            screenshots/ 감시
SC-*.png 이동           내장 브라우저 조작          3팀 병렬 분석
manifest.log 기록       스크린샷 촬영              시나리오 문서 ✅/❌
                       progress.log 기록          issues.log 기록
```

## 프로젝트 정보

| 항목 | 값 |
|------|-----|
| 프로젝트 경로 | `~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform` |
| worktree | `.claude/worktrees/priceless-banzai` |
| 프론트엔드 URL | `http://localhost:3003` |
| 백엔드 API | `http://localhost:8100` |
| 인증 | `POST /api/v1/auth/dev-login` |
| 디자인 가이드 | `DESIGN.md` (블루 #3182F6, Pretendard, 토스 스타일) |
| 브랜드명 | **TeamMeet** (Teameet 아님!) |
