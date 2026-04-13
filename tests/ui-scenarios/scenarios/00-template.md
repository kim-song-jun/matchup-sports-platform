# Task — Scenario Template (SSOT)

> 모든 시나리오 파일은 이 포맷을 따릅니다.

---

## 파일 헤더

```markdown
# {NN}-{area} — {Area Name} 시나리오

> **대상 페이지**: {routes}
> **총 시나리오**: {N}개
> **뷰포트**: D1~D3(Desktop) · T1~T3(Tablet) · M1~M3(Mobile) — 9종
```

## 시나리오 블록

```markdown
---

### SC-{NN}-{NNN}: {시나리오 제목}

| 항목 | 값 |
|------|-----|
| **URL** | `/{path}` |
| **권한** | all / admin |
| **사전 조건** | {조건} |

#### Steps

| # | 액션 | 기대 결과 | 📸 |
|---|------|-----------|-----|
| 1 | `navigate(/path)` | 페이지 로드됨 | `SC-{NN}-{NNN}-S01` |
| 2 | `click("로그인" 버튼)` | 폼 제출됨 | `SC-{NN}-{NNN}-S02` |
| 3 | `hover(매칭 카드 1)` | 호버 이펙트 표시 | `SC-{NN}-{NNN}-S03` |

#### 검증 체크리스트

| # | 검증 항목 | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 배경 `bg-surface-page` 적용 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 버튼 `blue-500` 액센트 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 사이드바 펼침 | ☐ | ☐ | ☐ | — | — | — | — | — | — |
| V4 | 사이드바 Sheet 전환 | — | — | — | ☐ | ☐ | ☐ | — | — | — |
| V5 | 하단 네비 pill 바 | — | — | — | — | — | — | ☐ | ☐ | ☐ |
```

## 액션 표기법

| 표기 | 의미 | 예시 |
|------|------|------|
| `navigate(url)` | URL 이동 | `navigate(/home)` |
| `click(selector)` | 클릭 | `click("매칭 참여" 버튼)` |
| `hover(selector)` | 호버 | `hover(매칭 카드 "풋살 A")` |
| `type(selector, value)` | 텍스트 입력 | `type(검색 input, "풋살")` |
| `press(key)` | 키 입력 | `press(Enter)` / `press(Cmd+K)` |
| `select(selector, value)` | 드롭다운 선택 | `select(종목, "풋살")` |
| `toggle(selector)` | 스위치 토글 | `toggle(알림 Switch)` |
| `drag(from, to)` | 드래그 | `drag(카드1, 슬롯2)` |
| `scroll(direction)` | 스크롤 | `scroll(down 200px)` |
| `wait(ms)` | 대기 | `wait(300)` |
| `clear(selector)` | 입력 초기화 | `clear(검색 input)` |

## 검증 체크리스트 규칙

- **D1/D2/D3** = Desktop (1920/1440/1280)
- **T1/T2/T3** = Tablet (1024/768/600)
- **M1/M2/M3** = Mobile (430/375/320)
- ☐ = 미확인, ✅ = 통과, ❌ = 실패, — = 해당없음
- 검증 항목은 **한 가지만** 체크 (복합 금지)
- 반응형 차이가 없으면 전 뷰포트 동일

## 스크린샷 ID 규칙

```
SC-{파일번호}-{순번}-S{스텝번호}
스크린샷 파일: SC-{NN}-{NNN}-S{SS}-{뷰포트}.png

예: SC-03-015-S02-T2.png
 → 03-home, 시나리오 15, 스텝 2, Tablet 세로(768×1024)
```
