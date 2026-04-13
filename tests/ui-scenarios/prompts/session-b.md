# Session B — Screenshot Extraction & Manifest

> **실행 환경**: Claude Code CLI (터미널)
> **시작 순서**: 1번째 (가장 먼저 시작!)
> **역할**: Session A의 JSONL 대화 파일에서 base64 이미지 추출 + 파일 저장 + manifest 기록
> **절대 하지 않는 것**: 브라우저 조작, 이미지 분석, 코드 수정

---

## 실행 흐름

Session A(Claude Desktop)는 computer() 도구로 스크린샷을 캡처 → base64로 인코딩 → JSONL 대화 파일에 저장.
Session B가 이 JSONL 파일을 감시 → base64 디코딩 → JPEG 파일로 저장 → 올바른 하위디렉토리 이동 → manifest.log 기록.
→ Session C가 manifest.log를 보고 새 이미지를 감지할 수 있게 함.

---

## 프로젝트 정보

- **프로젝트 경로**: ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform
- **Session A JSONL 파일**: ~/.claude/projects/*/def8f2e6-c170-4929-88aa-bc08b91632ff.jsonl (자동 감지)
- **스크린샷 저장**: tests/ui-scenarios/screenshots/{NN}-{area}/*.jpg
- **manifest**: tests/ui-scenarios/screenshots/manifest.log
- **추출 스크립트**: /tmp/e2e-queue/extract-screenshots.py (Python 3)
- **추적 상태**: /tmp/e2e-queue/last-jsonl-line.txt

---

## Phase 0: 초기 설정 (최초 1회)

```bash
cd ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform

# 1. 스크린샷 하위 디렉토리 생성 (15개 영역 + unknown)
for d in 01-landing 02-auth 03-home 04-matches 05-teams 06-team-matches 07-mercenary 08-marketplace 09-lessons 10-chat 11-payments 12-profile-settings 13-venues-misc 14-admin 15-global-ui unknown; do
  mkdir -p tests/ui-scenarios/screenshots/$d
done

# 2. 리포트 디렉토리 생성
mkdir -p tests/ui-scenarios/reports

# 3. manifest 초기화
echo "Session B started $(date '+%Y-%m-%d %H:%M:%S')" > tests/ui-scenarios/screenshots/manifest.log

# 4. 분석 추적 초기화
echo "0" > tests/ui-scenarios/reports/.last-analyzed

# 5. 임시 추출 디렉토리 생성
mkdir -p /tmp/e2e-queue
echo "0" > /tmp/e2e-queue/last-jsonl-line.txt

# 6. Session A JSONL 파일 경로 자동 감지
JSONL_FILE=$(ls -t ~/.claude/projects/*/def8f2e6-c170-4929-88aa-bc08b91632ff.jsonl 2>/dev/null | head -1)
[ -n "$JSONL_FILE" ] && echo "✅ 감시 대상: $JSONL_FILE" || echo "⚠️ JSONL 파일을 찾을 수 없음"
```

---

## Phase 1: Base64 추출 (Python 스크립트)

프로젝트 디렉토리에서 아래를 실행:

```bash
cd ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform

# Python 스크립트를 read 도구로 /tmp/e2e-queue/extract-screenshots.py에서 확인하고 실행
python3 /tmp/e2e-queue/extract-screenshots.py
```

**스크립트 로직** (참고):

1. Session A JSONL 파일의 마지막 읽은 라인 위치 추적 (`/tmp/e2e-queue/last-jsonl-line.txt`)
2. 새 라인 읽기 → JSON 파싱
3. `tool_result` 타입 진입에서 base64 이미지 탐색
4. `SC-XX-NNN` 패턴 매칭으로 스크린샷 ID 추출 (XX = 파일번호, NNN = 시나리오번호)
5. base64 디코딩 → JPEG 저장 (해당 디렉토리)
6. manifest.log에 "SAVED {filename}" 추가
7. 5초마다 반복

**파일번호 → 디렉토리 매핑**:

| 파일번호 | 디렉토리 |
|---------|---------|
| 01 | 01-landing |
| 02 | 02-auth |
| 03 | 03-home |
| 04 | 04-matches |
| 05 | 05-teams |
| 06 | 06-team-matches |
| 07 | 07-mercenary |
| 08 | 08-marketplace |
| 09 | 09-lessons |
| 10 | 10-chat |
| 11 | 11-payments |
| 12 | 12-profile-settings |
| 13 | 13-venues-misc |
| 14 | 14-admin |
| 15 | 15-global-ui |
| (기타) | unknown |

---

## Phase 2: 상태 확인 (수동 대시보드)

현황을 보려면:

```bash
cd ~/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform

echo "╔══════════════════════════════════╗"
echo "║     Session B 현황 대시보드      ║"
echo "╚══════════════════════════════════╝"
echo ""

# manifest 라인 수 (저장된 파일 수 = SAVED 라인)
SAVED=$(grep -c "^SAVED" tests/ui-scenarios/screenshots/manifest.log 2>/dev/null || echo 0)
echo "📸 저장된 스크린샷: ${SAVED}장"

# 실제 파일 수
ACTUAL=$(find tests/ui-scenarios/screenshots -type f \( -name "*.jpg" -o -name "*.png" \) | wc -l)
echo "📁 실제 파일: ${ACTUAL}개"

# 분석 진행 (Session C)
ANALYZED=$(cat tests/ui-scenarios/reports/.last-analyzed 2>/dev/null || echo 0)
echo "🔍 Session C 분석: ${ANALYZED}장"

echo ""
echo "📊 디렉토리별 파일 수:"
for d in tests/ui-scenarios/screenshots/*/; do
  [ -d "$d" ] || continue
  c=$(find "$d" -type f \( -name "*.jpg" -o -name "*.png" \) 2>/dev/null | wc -l | tr -d ' ')
  [ "$c" -gt 0 ] && printf "   %-25s: %3d장\n" "$(basename $d)" "$c"
done

echo ""
echo "📋 최근 저장 5건:"
tail -5 tests/ui-scenarios/screenshots/manifest.log 2>/dev/null | grep "^SAVED"
```

---

## manifest.log 형식

```
Session B started 2026-04-13 19:30:00
SAVED SC-03-001-S01-D2.jpg 2026-04-13 19:31:05
SAVED SC-03-001-S01-M2.jpg 2026-04-13 19:31:12
SAVED SC-15-002-S01-D2.jpg 2026-04-13 19:31:25
...
```

Session C는 이 파일의 "SAVED" 라인 수를 세어서 새 이미지가 있는지 판단합니다.

---

## 중요 사항

1. **Session A보다 먼저 시작** — JSONL 파일 유실 방지
2. **JSONL 파일 경로는 자동 감지** — `~/.claude/projects/*/def8f2e6-c170-4929-88aa-bc08b91632ff.jsonl`
3. **manifest.log는 append only** — 수정/삭제 금지
4. **loop 간격은 5초** — CPU 부하 최소화
5. **unknown 디렉토리로 간 파일** → 파일번호 매핑 누락, 수동 확인 필요
6. **JSONL 라인 추적** → `/tmp/e2e-queue/last-jsonl-line.txt`에 저장되어 재시작 후에도 진행 상태 유지
