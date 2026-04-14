# E2E 시나리오 템플릿

## 시나리오 ID 규칙

`SC-{파일번호}-{시나리오번호}` (예: `SC-01-003`)

## 시나리오 포맷

```markdown
### SC-{NN}-{NNN}: {시나리오 제목}

| 항목 | 값 |
|------|-----|
| **URL** | `/{path}` |
| **권한** | all / authenticated / admin / team_owner / team_manager |
| **사전 조건** | {preconditions} |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `{action}` | {expected result} | `SC-{NN}-{NNN}-S01` |
| 2 | `{action}` | {expected result} | `SC-{NN}-{NNN}-S02` |

#### 검증 체크리스트

| # | 검증 항목 | D | T | M |
|---|-----------|---|---|---|
| V1 | {check item} | ☐ | ☐ | ☐ |
| V2 | {check item} | ☐ | ☐ | ☐ |

#### UX 개선 제안

| # | 심각도 | 요소 | 현재 | 제안 | 코드 수정 |
|---|--------|------|------|------|-----------|
| UX1 | 🔴/🟡/💡 | {element} | {current behavior} | {suggestion} | `{code snippet}` |

#### 아쉬운 부분

| # | 카테고리 | 설명 | 리디자인 방향 |
|---|----------|------|---------------|
| W1 | 접근성/레이아웃/인터랙션/시각적일관성/성능/카피 | {description} | {redesign direction} |
```

## 액션 표기법

| 표기 | 의미 | Chrome MCP 매핑 |
|------|------|----------------|
| `navigate(url)` | URL 이동 | `navigate({ url, tabId })` |
| `click(selector)` | 요소 클릭 | `find` → `computer(left_click)` |
| `hover(selector)` | 요소 호버 | `computer(hover, coordinate)` |
| `type(selector, value)` | 텍스트 입력 | `find` → `click` → `computer(type, text)` |
| `press(key)` | 키보드 입력 | `computer(key, text)` |
| `select(selector, value)` | 드롭다운 선택 | `find` → `click` → `find` option → `click` |
| `toggle(selector)` | 스위치/체크박스 | `find` → `click` |
| `drag(from, to)` | 드래그 앤 드롭 | `computer(left_click_drag)` |
| `scroll(direction)` | 스크롤 | `computer(scroll)` |
| `resize(w×h)` | 뷰포트 변경 | `resize_window({ width, height })` |
| `wait(ms)` | 대기 | `computer(wait, duration)` |
| `upload(selector, file)` | 파일 업로드 | `find` file input → set |
| `clear(selector)` | 입력 초기화 | `find` → triple-click → delete |

## 뷰포트 약어

| 약어 | 해상도 | 설명 |
|------|--------|------|
| D | 1440×900 | Desktop |
| T | 768×1024 | Tablet |
| M | 375×812 | Mobile |

## 심각도 기준

| 심각도 | 기준 |
|--------|------|
| 🔴 Critical | 터치 타겟 < 44px, 대비 < 4.5:1, 파괴적 액션 피드백 없음, 레이아웃 깨짐, WCAG A 위반 |
| 🟡 Warning | 시각적 계층 미흡, 불일치 간격, hover/transition 없음, 마이크로카피 부적절, WCAG AA 위반 |
| 💡 Suggestion | 즐거움 요소 기회, 애니메이션 개선, 시각적 리듬 향상, 컴포넌트 재사용 기회 |

## UX 리뷰 부록 포맷

각 시나리오 파일의 끝에 다음 구조의 부록을 추가:

```markdown
---

## UX 리뷰 요약

### 개선 제안 통계
| 심각도 | 건수 |
|--------|------|
| 🔴 Critical (즉시 수정) | {N} |
| 🟡 Warning (권장 수정) | {N} |
| 💡 Suggestion (선택적) | {N} |

### UX 개선 제안
| # | 심각도 | 페이지 | 요소 | 현재 | 제안 | 코드 수정 |
|---|--------|--------|------|------|------|-----------|

### 아쉬운 부분
| # | 카테고리 | 페이지 | 설명 | 리디자인 방향 | 우선순위 |
|---|----------|--------|------|---------------|----------|

### 코드 수정 제안 Top 5
| # | 파일 | 라인 | 현재 코드 | 수정 코드 | 사유 |
|---|------|------|-----------|-----------|------|
```

## 스크린샷 ID 규칙

`SC-{NN}-{NNN}-S{step}-{viewport}`

예: `SC-01-003-S02-D` = 파일01, 시나리오003, Step2, Desktop
