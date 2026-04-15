# Session C — Screenshot Analyzer & Document Updater

> **실행 환경**: Claude Code CLI (터미널)
> **시작 순서**: 3번째 (Session B → Session A → Session C)
> **역할**: screenshots/ 디렉토리의 새 이미지를 감시하고, 3팀 병렬 분석 후 시나리오 문서를 ✅/❌ 업데이트
> **절대 하지 않는 것**: 브라우저 조작, 스크린샷 촬영

---

## 1. 전체 흐름

```
manifest.log에 새 "SAVED" 라인 감지
    ↓
해당 PNG 파일을 Read tool로 읽기 (Claude 멀티모달 — 이미지 직접 분석)
    ↓
3개 분석 에이전트를 병렬로 발사 (design-main, qa-uiux, ui-manager)
    ↓
3팀 결과 종합
    ↓
시나리오 문서(.md)의 검증 체크리스트를 ✅/❌/⚠️ 로 업데이트
    ↓
❌ 이슈 → issues.log에 append
    ↓
🔴 Critical → 즉시 frontend-ui-dev 빌더 에이전트 발사
```

---

## 2. Claude Code CLI에 붙여넣을 프롬프트

프로젝트 디렉토리에서 실행: `cd ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform && claude`

---

```
TeamMeet(Teameet) 프로젝트의 UI 시나리오 테스트 분석을 할 거야.
다른 세션들이 스크린샷을 찍어서 tests/ui-scenarios/screenshots/ 에 저장하고 있어.

너는 새 스크린샷이 저장될 때마다 분석하고, 시나리오 문서를 업데이트해.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 프로젝트 정보

- 프로젝트 경로: ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform
- worktree: .claude/worktrees/priceless-banzai
- 디자인 가이드: DESIGN.md
  - 토스 스타일 (시인성)
  - 블루 #3182F6 단일 액센트
  - Pretendard 폰트
  - 라이트+다크 모드
  - navbar/bottom-nav/modal만 글래스모피즘, 본문은 solid-first
- 브랜드: **TeamMeet** (Teameet 아님!)
- 종목 컬러: lib/constants.ts의 sportCardAccent (11종목)
- UI 컴포넌트: components/ui/ (EmptyState, ErrorState, Modal, Toast 등)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 감시할 파일들

| 파일 | 용도 |
|------|------|
| tests/ui-scenarios/screenshots/manifest.log | Session B가 새 스크린샷 저장 시 기록 |
| tests/ui-scenarios/reports/.last-analyzed | 마지막으로 분석한 manifest 라인 수 |
| tests/ui-scenarios/reports/issues.log | 발견된 이슈 (append only) |
| tests/ui-scenarios/reports/analysis-report.md | 종합 분석 보고서 |
| tests/ui-scenarios/scenarios/*.md | 시나리오 문서 (✅/❌ 업데이트 대상) |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 감시 루프 (`/loop 60` 사용 — 60초마다 반복)

### Step 1: 새 스크린샷 확인

```bash
cd ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform

LAST=$(cat tests/ui-scenarios/reports/.last-analyzed 2>/dev/null || echo 0)
TOTAL=$(grep -c "^SAVED" tests/ui-scenarios/screenshots/manifest.log 2>/dev/null || echo 0)
NEW=$((TOTAL - LAST))

if [ "$NEW" -le 0 ]; then
  echo "⏳ 새 스크린샷 없음 (분석: $LAST / 전체: $TOTAL)"
else
  echo "🆕 새 스크린샷 ${NEW}개 발견!"
  echo ""
  tail -n "$NEW" tests/ui-scenarios/screenshots/manifest.log | grep "^SAVED"
fi
```

새 항목이 있으면 → Step 2로 진행.
없으면 → 이번 루프 종료, 다음 60초 후 재확인.

### Step 2: 이미지 분석

manifest의 새 항목에서 파일 경로를 추출하고, **Read tool로 PNG 파일을 직접 읽는다**.
Claude는 멀티모달이라 이미지를 시각적으로 분석할 수 있음.

```
# manifest 라인 예시: "SAVED SC-03-005-S01-D2.png 2026-04-13 19:31:05"
# → 파일 경로: tests/ui-scenarios/screenshots/03-home/SC-03-005-S01-D2.png

Read(file_path: "tests/ui-scenarios/screenshots/03-home/SC-03-005-S01-D2.png")
→ Claude가 이미지를 보고 분석
```

### Step 3: 3팀 병렬 분석 에이전트 발사

같은 시나리오의 스크린샷을 모아서 (예: SC-03-005-S01-D2, SC-03-005-S01-M2)
3개 에이전트를 **동시에** `run_in_background: true`로 발사:

```
Agent(
  subagent_type: "design-main",
  run_in_background: true,
  prompt: """
  [{SC-ID}] 디자인 시스템 일관성 분석

  ## 분석 대상
  스크린샷: tests/ui-scenarios/screenshots/{dir}/{filename}.png
  시나리오 문서: tests/ui-scenarios/scenarios/{NN}-{area}.md
  시나리오 ID: {SC-ID}

  ## 디자인 기준 (DESIGN.md + .impeccable.md)
  1. 블루(#3182F6) 단일 액센트 준수 — 다른 액센트 컬러 사용 금지
  2. Pretendard 폰트 — text-2xs(10px) ~ text-6xl(56px) 토큰 사용
  3. 종목별 tint/badge/dot — sportCardAccent 토큰 (11종목)
  4. glass-mobile-header (gradient 0.88-0.72) vs floating-bottom-nav (solid 0.82/0.72) 구분
  5. 본문 solid-first — glass는 navbar/header/overlay/button/panel chrome에서만
  6. EmptyState 컴포넌트 사용 (인라인 빈 상태 금지)
  7. shadow hairline-depth 중심, border subtle full-border 중심
  8. 라이트/다크 모드 토큰 대비 4.5:1
  9. 터치 타겟 min-h-[44px]
  10. border-l-4 패턴 금지 (전체 테두리, 배경색, 그림자 대안)

  ## 출력 형식
  각 항목: ✅ 통과 | ❌ 실패 | ⚠️ 확인필요
  실패 시: 위치 + 기대값 + 실제값
  **200자 이내** 간결하게.
  """
)

Agent(
  subagent_type: "qa-uiux",
  run_in_background: true,
  prompt: """
  [{SC-ID}] UI/UX QA 분석

  ## 분석 대상
  스크린샷: tests/ui-scenarios/screenshots/{dir}/{filename}.png

  ## QA 기준
  1. 로딩 상태 — Skeleton 또는 Spinner 사용
  2. 빈 상태 — EmptyState 컴포넌트 (아이콘+메시지+CTA)
  3. 에러 상태 — ErrorState 컴포넌트 (재시도 버튼)
  4. hover 시각 피드백 — 배경 밝아짐, 테두리 변화
  5. focus 시각 피드백 — blue-500 outline + 2px offset
  6. disabled 시각 피드백 — opacity-50 + cursor-not-allowed
  7. 반응형 레이아웃 — 뷰포트에 맞는 변환 (사이드바→Sheet, 테이블→카드)
  8. 수평 스크롤 없음 (모바일에서)
  9. 텍스트 truncate 적절 (... 처리)
  10. 에러 메시지 해요체 어조 ("~했어요", "~해주세요")

  ## 출력
  ✅/❌/⚠️ + 한 줄 근거. **200자 이내.**
  """
)

Agent(
  subagent_type: "ui-manager",
  run_in_background: true,
  prompt: """
  [{SC-ID}] 픽셀 레벨 UI 품질 분석

  ## 분석 대상
  스크린샷: tests/ui-scenarios/screenshots/{dir}/{filename}.png

  ## 품질 기준
  1. 정렬 — 수평/수직 일관성
  2. 간격 — 4px 그리드 (gap-1=4px, gap-2=8px, gap-3=12px, gap-4=16px)
  3. 타이포그래피 — text-caption/text-label/text-body/text-heading 계층
  4. 컬러 — bg-surface-page > bg-surface-card > bg-surface-elevated 계층
  5. 컴포넌트 — Button/Input/Select/Card/Badge 형태 일관
  6. 아이콘 — CVA [&_svg]:size-4 기본, 크기 하드코딩(h-3.5 w-3.5) 금지
  7. 보더/그림자 — border-edge-subtle, shadow hairline 일관
  8. 잘림/오버플로우 — 텍스트, 이미지 잘림 없음

  ## 출력
  ✅/❌/⚠️ + 가능하면 file:line 참조. **200자 이내.**
  """
)
```

### Step 4: 분석 결과 종합 → 시나리오 문서 업데이트

3개 에이전트의 결과를 기다린 후 종합:

```
판정 규칙:
- 3팀 모두 ✅ → 해당 뷰포트 열을 ✅
- 1팀이라도 ❌ → 해당 뷰포트 열을 ❌ + 이슈 메모
- ⚠️만 있으면 → ☐ 유지 (수동 확인 필요)
```

시나리오 문서의 검증 체크리스트를 Edit tool로 수정:

```
Edit(
  file_path: "tests/ui-scenarios/scenarios/03-home.md",
  old_string: "| V1 | 배경 bg-surface-page 적용 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |",
  new_string: "| V1 | 배경 bg-surface-page 적용 | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |"
)
```

⚠️ old_string이 파일 내에서 unique한지 반드시 확인! (줄 전체를 사용)

### Step 5: 이슈 기록

❌ 판정이 나온 항목은 issues.log에 append:

```bash
echo "❌ SC-03-005-S01-D2 V3: 종목 칩 active 상태에서 blue-500 미적용 — design-main 지적 | 2026-04-13 19:35" >> tests/ui-scenarios/reports/issues.log
```

### Step 6: 진행 추적 업데이트

```bash
echo "$TOTAL" > tests/ui-scenarios/reports/.last-analyzed

# 현황 출력
ISSUES=$(wc -l < tests/ui-scenarios/reports/issues.log 2>/dev/null || echo 0)
echo ""
echo "📊 분석 현황: $TOTAL장 완료 | 이슈: ${ISSUES}건"
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 이슈 심각도 분류

| 등급 | 기준 | 조치 |
|------|------|------|
| 🔴 Critical | 기능 불가, 크래시, 데이터 손실, 보안 | 즉시 빌더 에이전트 발사 |
| 🟡 Warning | 디자인 토큰 위반, 접근성 미달, 레이아웃 깨짐 | ❌ 마킹 + issues.log |
| 💡 Info | 미세 간격, 개선 가능, Suggestion | ✅ 유지 + 메모만 |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🔴 Critical 발견 시 즉시 수정

```
Agent(
  subagent_type: "frontend-ui-dev",
  prompt: """
  🔴 Critical UI 이슈 수정

  ## 이슈
  {이슈 설명}

  ## 위치
  스크린샷: tests/ui-scenarios/screenshots/{dir}/{file}.png
  코드 파일: {추정 파일}:{추정 라인}

  ## 수정 후 검증
  1. npx tsc --noEmit 통과
  2. npm run lint 통과
  """
)
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 시나리오 파일 완료 시 보고서

한 시나리오 파일(예: 03-home.md)의 모든 스크린샷 분석이 끝나면:

```bash
cat >> tests/ui-scenarios/reports/analysis-report.md << 'EOF'

---

## {날짜} — {NN}-{area} 분석 완료

| 항목 | 값 |
|------|-----|
| 총 시나리오 | {N}개 |
| 총 검증 항목 | {N}개 |
| ✅ 통과 | {N} ({%}) |
| ❌ 실패 | {N} ({%}) |
| ⚠️ 수동확인 | {N} |
| 🔴 Critical | {N} |
| 🟡 Warning | {N} |

### 발견된 이슈
{issues.log에서 해당 SC-{NN}- 항목 추출}
EOF
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 핵심 규칙

1. **manifest.log가 SSOT** — 이 파일에 "SAVED"가 추가되면 분석 시작
2. **Read tool로 PNG 직접 읽기** — Claude 멀티모달 분석
3. **3팀 동시 발사** — 순차 아님, 반드시 병렬 (run_in_background: true)
4. **시나리오 문서가 최종 결과** — ✅/❌ 체크리스트가 진실의 원천
5. **issues.log는 append only** — 수정/삭제 금지
6. **Edit 시 old_string unique 확인** — 줄 전체를 사용하여 충돌 방지
7. **스크린샷 파일은 증거** — 분석 후에도 삭제 금지
```
