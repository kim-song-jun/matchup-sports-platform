# E2E Analyzer

이 폴더는 기능 단위 스크린샷 셋을 **지속적으로 분석/재개**하기 위한 운영 문서다.

raw screenshot 저장소를 대체하지 않는다.

- raw screenshot: 기존 경로 유지 (`tests/ui-scenarios/`, `screenshots/scenarios/`, `output/playwright/visual-audit/` 등)
- analyzer queue/state/report: `ultraplan/runs/e2e-analyzer/` (또는 source별 sibling root: `ultraplan/runs/e2e-analyzer-*`)

## Intake Contract

이 analyzer는 외부에서 기능별로 들어오는 스크린샷 셋의 **정렬/완료 판정** 용도로 아래 11개 viewport 코드를 사용한다.

| Code | Device | Size |
|------|--------|------|
| `MS` | iPhone SE2 | `375x667` |
| `MM` | iPhone 14 | `390x844` |
| `ML` | iPhone 16 Pro Max | `430x932` |
| `TS` | iPad Mini | `768x1024` |
| `TM` | iPad Air | `820x1180` |
| `TL` | iPad Pro 12.9" | `1024x1366` |
| `DS` | Laptop 13" | `1280x800` |
| `DM` | Monitor 16" | `1440x900` |
| `DL` | Full HD | `1920x1080` |
| `DXL` | 2K QHD | `2560x1440` |
| `DXXL` | 4K UHD | `3840x2160` |

주의:

- 이 11-code contract는 **analyzer intake** 용도다.
- 현재 broad Playwright visual audit의 canonical 9 viewport baseline은 그대로 유지된다.

## Commands

```bash
node scripts/qa/run-e2e-analyzer.mjs status
node scripts/qa/run-e2e-analyzer.mjs scan
node scripts/qa/run-e2e-analyzer.mjs dispatch --run-codex --codex-mode agent-all --dispatch-incomplete --auto-commit --codex-timeout-seconds 900
node scripts/qa/run-e2e-analyzer.mjs tick --run-codex --codex-mode agent-all --dispatch-incomplete --auto-commit --codex-timeout-seconds 900
node scripts/qa/run-e2e-analyzer.mjs watch --run-codex --codex-mode agent-all --dispatch-incomplete --auto-commit --poll-seconds 120 --codex-timeout-seconds 900
```

## Dispatch Modes

- complete-set mode:
  - 11-code viewport matrix가 다 모이거나 `CAPTURE_DONE.flag`가 있을 때 dispatch
- incomplete-immediate mode:
  - `--dispatch-incomplete`가 켜져 있으면 최근 변경된 incomplete set도 즉시 dispatch
  - 기본 recent window는 `300s`
  - 같은 set은 fingerprint가 바뀔 때만 다시 queue 된다

즉, monitor는:

1. 완성된 set은 계속 기존 규칙대로 처리하고
2. 최근에 추가 캡처가 들어온 incomplete set은 즉시 분석/수정 대상으로 올린다

둘 다 동시에 동작할 수 있다.

## Auto Commit

- `--auto-commit`이 켜져 있으면 analyzer가 Codex 결과의 `changed_files`를 기준으로 feature 단위 커밋을 시도한다.
- 커밋 메시지 패턴:

```text
fix: apply codex:20260415:ui_fix for <set-id>
```

- 목적:
  - feature 단위 rollback 단위 확보
  - monitor가 만든 UI fix commit 식별성 확보

- 안전장치:
  - 해당 set 실행 전에 이미 dirty였던 파일이 `changed_files`에 포함되면 자동 커밋은 막고 `blocked`로 남긴다.
  - 즉, unrelated local edits를 묶어서 커밋하지 않도록 방어한다.

## Cron-Friendly Mode

`tick`은 idempotent 한 번 실행용 entrypoint다. cron/launchd에서는 `watch` 대신 `tick`을 권장한다.

예시:

```bash
*/2 * * * * cd /Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform && node scripts/qa/run-e2e-analyzer.mjs tick --run-codex --codex-mode agent-all --dispatch-incomplete --auto-commit --codex-timeout-seconds 900 >> tmp/e2e-analyzer-cron.log 2>&1
```

## Recovery Rules

- 실행 중 프로세스가 죽으면 `dispatch.lock`만 남을 수 있다.
- nested `codex exec`가 timeout에 걸리거나 중간 종료돼도 stale lock recovery로 다시 `pending` 또는 `staged`로 복구된다.
- 다음 `tick`은 stale lock을 감지하고 `running` set을 다시 `pending`으로 되돌린다.
- 즉, 진행 상태는 메모리가 아니라 `ultraplan/runs/e2e-analyzer*` 디스크 상태가 source of truth다.

## Per-Set Artifacts

각 set은 `ultraplan/runs/e2e-analyzer*/reports/<set-id>/` 아래에:

- `set-manifest.json`
- `task.md`
- `codex-prompt.md`
- `analysis.md` / `findings.json` / `remediation.md` (Codex가 채움)
- `codex-result.json`
- `codex.stdout.log`
- `codex.stderr.log`

를 남긴다.
