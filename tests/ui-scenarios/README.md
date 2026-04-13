# UI/UX Scenario Test Pipeline

> 3-세션 파이프라인으로 모든 페이지의 모든 인터랙션을 검증합니다.
> Claude Desktop App 기반 스크린샷 + 자동 분석 + 문서 업데이트

---

## 아키텍처

```
Session A (Claude Desktop)        Session B (Claude Code)         Session C (Claude Code)
━━━━━━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━━━━━━━
Chrome 브라우저 직접 조작          Base64 스크린샷 추출             이미지 분석 + 문서 업데이트
                                                               
navigate/click/hover/type         JSONL 파일 감시 (5s poll)       새 파일 감지 → 3팀 병렬 분석
   ↓                                 ↓                            ↓
computer(screenshot)              base64 디코딩                   design-main + qa-uiux + ui-manager
   ↓                                 ↓                            ↓
base64로 JSONL에 저장            JPEG → screenshots/ 저장         시나리오 문서 ✅/❌ 업데이트
   ↓                              manifest.log 기록               ↓
JSONL 파일에 누적                                                issues.log + analysis-report.md
```

**Session B 상세 흐름**:
- JSONL 파일을 5초마다 poll (진행 추적: `/tmp/e2e-queue/last-jsonl-line.txt`)
- 새 라인 → JSON 파싱 → `tool_result` 진입 탐색
- base64 이미지 데이터 추출 → `SC-XX-NNN` 패턴 매칭 (XX=파일번호, NNN=시나리오번호)
- base64 디코딩 → JPEG 저장 (해당 영역 디렉토리)
- `manifest.log`에 `SAVED {filename}` 기록 (Session C가 라인 수로 감지)
- Python 스크립트: `/tmp/e2e-queue/extract-screenshots.py`

## 시작 순서

1. **Session B 먼저 시작** — 파일 감시 시작 (유실 방지)
2. **Session A 시작** — 브라우저 조작 + 스크린샷
3. **Session C 시작** — 분석 루프

## 폴더 구조

```
tests/ui-scenarios/
├── README.md                ← 이 파일
├── prompts/
│   ├── session-a.md         ← 시나리오 실행자 (Claude Desktop, Chrome MCP)
│   ├── session-b.md         ← Base64 추출자 (Claude Code, Python script)
│   └── session-c.md         ← 분석자 (Claude Code, 3팀 병렬 분석)
├── scenarios/               ← 시나리오 문서 (페이지별 분할)
│   ├── 00-template.md       ← 포맷 SSOT
│   ├── 00-index.md          ← 시나리오 색인
│   ├── 01-landing.md
│   ├── 02-auth.md
│   ├── ... (S01~S67, 15개 영역)
│   └── 15-global-ui.md
├── screenshots/             ← 저장된 스크린샷 JPEG 파일 (Session B 생성)
│   ├── 01-landing/          ← SC-01-NNN.jpg (520+ 파일)
│   ├── 02-auth/
│   ├── ... (15개 영역)
│   ├── 15-global-ui/
│   ├── unknown/             ← SC-XX 매핑 불가 파일
│   └── manifest.log         ← 추출 기록 (721 라인: 1 헤더 + 720 SAVED, append only)
└── reports/                 ← 분석 결과
    ├── issues.log           ← 발견된 이슈 (append only)
    ├── analysis-report.md   ← 종합 분석 보고서
    └── .last-analyzed       ← Session C 진행 추적
```

**실제 Session B 결과** (2026-04-13):
- manifest.log: 721 라인 (1 헤더 + 720 SAVED)
- 저장된 파일: 521개 (주로 JPEG)
- identified files: 51개 (14개 영역)
- unknown: 470개 (SC-XX 매핑 불완전)

## 뷰포트 매트릭스 (9종)

| # | 카테고리 | 이름 | 해상도 | 확인 포인트 |
|---|---------|------|--------|-----------|
| D1 | Desktop | 넓은 | 1920×1080 | max-w 제한, 여백 |
| D2 | Desktop | 표준 | 1440×900 | 기본 레이아웃 |
| D3 | Desktop | 좁은 | 1280×800 | 축소 시작점 |
| T1 | Tablet | 가로 | 1024×768 | 2→1컬럼 전환 |
| T2 | Tablet | 세로 | 768×1024 | Sheet 전환 |
| T3 | Tablet | 미니 | 600×960 | 소형 태블릿 최저선 |
| M1 | Mobile | 큰폰 | 430×932 | iPhone 15 Pro Max |
| M2 | Mobile | 표준폰 | 375×812 | iPhone 13 |
| M3 | Mobile | 작은폰 | 320×568 | iPhone SE / 최소 |

## 스크린샷 파일명 규칙

```
SC-{파일번호}-{시나리오번호}-S{스텝번호}-{뷰포트}.png

예시:
SC-01-003-S02-D2.png  → 01-auth, 시나리오 3, 스텝 2, Desktop 표준
SC-07-015-S01-M2.png  → 07-chart-studio, 시나리오 15, 스텝 1, Mobile 표준
```

## 핵심 도구

### Session A (Chrome 조작)
- **Chrome MCP** (`mcp__claude-in-chrome__*`): 브라우저 탐색 + 상호작용 + 스크린샷 캡처
- **computer(screenshot)**: 현재 viewport 캡처 → base64로 JSONL에 저장

### Session B (추출)
- **Python 3** + base64/json/re: JSONL 파싱, base64 디코딩
- **Monitor tool**: 30초 주기 폴링 (또는 `/loop` 5초 bash)
- **ScheduleWakeup**: 270초 주기 heartbeat (continuous operation 보장)

### Session C (분석)
- **Read tool**: 이미지 JPEG 읽기 → 멀티모달 분석
- **Parallel agents**: design-main, qa-uiux, ui-manager (3팀 병렬)

---

## Session B — Base64 추출 파이프라인 상세

Session B는 Session A가 생성한 JSONL 대화 파일에서 base64 인코딩된 스크린샷을 추출, 디코딩, 저장하는 역할을 합니다.

### 작동 원리

1. **JSONL 파일 감시**: `~/.claude/projects/*/def8f2e6-c170-4929-88aa-bc08b91632ff.jsonl`
   - Session A가 computer() 도구로 스크린샷 캡처 → base64 → JSONL에 저장
   - Session B가 5초마다 poll, 마지막 읽은 라인 추적 (`/tmp/e2e-queue/last-jsonl-line.txt`)

2. **Base64 추출 및 디코딩**:
   - 각 라인을 JSON 파싱
   - `tool_result` 타입 진입에서 base64 이미지 탐색
   - Regex `SC-(\d{2})-(\d{3})` 매칭으로 파일번호·시나리오번호 추출
   - base64 디코딩 → JPEG 저장

3. **파일 정리 및 기록**:
   - 파일번호 → 영역 디렉토리 매핑 (15개: 01-landing ~ 15-global-ui)
   - 저장 경로: `tests/ui-scenarios/screenshots/{NN}-{area}/SC-XX-NNN.jpg`
   - `manifest.log`에 `SAVED` 라인 기록 (Session C가 감시)

### 파일번호 매핑 (15개 영역)

| 파일번호 | 영역 | 시나리오 |
|---------|------|---------|
| 01 | landing | S01: Landing, Hero, Pricing |
| 02 | auth | S02-S05: Login, Register, Onboarding, OAuth |
| 03 | home | S06-S08: Home feed, Recommendations, Notifications |
| 04 | matches | S09-S17: Match discovery, detail, create, edit, join, team-up |
| 05 | teams | S18-S19: Team discovery, my teams, create, settings |
| 06 | team-matches | S20: Team match discovery, detail, apply |
| 07 | mercenary | S21: Mercenary posts, apply |
| 08 | marketplace | S22: Marketplace listings, detail, order |
| 09 | lessons | S23: Lessons, class discovery, detail, ticket system |
| 10 | chat | S24-S25: Chat rooms, messages, groups |
| 11 | payments | S26-S29: Payment flows, checkout, refund |
| 12 | profile-settings | S30-S35: Profile, settings, preferences |
| 13 | venues-misc | S36: Venue details, reviews, schedule |
| 14 | admin | S37-S50: Admin dashboard, users, matches, lessons, teams, reports |
| 15 | global-ui | S51-S67: Bottom nav, sidebar, glass header, dark mode, empty/error/loading states |

### 예상 산출물

- **manifest.log**: SAVED 라인 수 = 저장된 파일 수 (Session C가 새 파일 감지 기준)
- **스크린샷 파일**: SC-XX-NNN.jpg 형식 (총 ~ 520+ 파일, 15개 영역 분산)
- **unknown/**: SC-XX 매핑 실패 파일 (파일번호 범위 오류)
- **진행 추적**: `/tmp/e2e-queue/last-jsonl-line.txt` (재시작 후에도 진행 상태 복구)

### 실제 구현 결과 (2026-04-13)

- manifest 라인: **721개** (1 헤더 + 720 SAVED 레코드)
- 저장된 파일: **521개** (JPEG)
- identified 파일: **51개** (14개 영역 — 11-payments 제외)
- unknown 파일: **470개** (아직 SC-XX 매핑 미완성)

### Session B 성공 조건

1. Session A보다 먼저 시작 (JSONL 파일 유실 방지)
2. JSONL 파일 경로 자동 감지 가능
3. Python 스크립트 안정적으로 5초 주기 loop 유지
4. Monitor tool + ScheduleWakeup으로 continuous operation
5. manifest.log 증가 패턴으로 Session C 감지 가능

---

## 참고: MDS 프로젝트 사례

이전 MDS_management 프로젝트에서 동일한 파이프라인으로:
- 1,121개 시나리오 문서화 (30,000줄)
- 30건+ UI/UX 버그 발견 및 수정
- CVA 계약 위반 전수 정리
- 3팀(design/qa/ui) 병렬 리뷰로 품질 검증
