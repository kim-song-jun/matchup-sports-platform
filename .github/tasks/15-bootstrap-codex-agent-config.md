# Task: bootstrap codex agent config

## Context
- 이 저장소는 Codex용 `AGENTS.md`를 이미 사용하지만, 실제 agent 운영 문서는 Claude 중심인 `.claude/agents/`에 머물러 있다.
- `.claude/agents/team-config.md`와 `.claude/agents/workflow.md`는 존재하지만, Codex 글로벌 스킬이 직접 참조하는 `.claude/agents/prompts.md`는 현재 없고 `prompts.md.legacy`와 backup만 남아 있다.
- 저장소 규칙상 `.agents/`를 새로 만들지 않으므로 Codex 전용 산출물은 다른 경로를 사용해야 한다.

## Goal
- Codex 전용 agent 문서의 canonical 위치를 만든다.
- Codex 글로벌 스킬이 현재 저장소에서 바로 참조할 수 있는 compatibility prompt entry를 복구한다.
- 기존 Claude 전용 개별 agent 문서는 보존한다.

## Original Conditions
- [x] 기존 `.claude/agents/` 구조와 개별 agent 문서를 파악한다.
- [x] `~/.codex/skills/codex-init/SKILL.md`와 Codex `agent-*` 스킬이 기대하는 이름/구조를 파악한다.
- [x] `.agents/` 신규 생성 금지 규칙을 지킨다.
- [x] `.env*` 파일은 읽지 않는다.
- [x] Codex canonical 문서를 추가한다.
- [x] Codex compatibility prompt 파일을 복구한다.
- [x] `AGENTS.md`에 Codex 경로와 sync 규칙을 반영한다.

## User Scenarios
- 저장소 작업자가 Codex 기준 agent 역할과 파이프라인을 빠르게 찾을 수 있다.
- Codex 글로벌 `agent-build`, `agent-review`, `agent-plan` 계열 스킬이 이 저장소의 prompt entry를 읽을 수 있다.
- Claude 전용 상세 agent 문서는 그대로 유지되어 기존 자산이 사라지지 않는다.

## Test Scenarios
- Happy path:
  - `.codex/agents/prompts.md`, `team-config.md`, `workflow.md`와 각 agent 파일이 생성된다.
  - `.claude/agents/prompts.md`가 다시 생기고 Codex compatibility 목적이 명시된다.
  - `AGENTS.md`가 `.codex/agents/`를 canonical로 안내한다.
- Edge:
  - `.agents/` 디렉토리를 만들지 않는다.
  - 기존 `.claude/agents/*.md` 세부 파일은 삭제/변형하지 않는다.
- Error prevention:
  - Codex canonical 문서와 compatibility prompt의 관계를 문서에 명시해 drift 위험을 줄인다.

## Parallel Work Breakdown
- Sequential:
  - 기존 Claude/Codex 스킬 구조 분석
  - Codex roster 설계
  - 문서 생성 및 AGENTS 업데이트
- Follow-up sync point:
  - Codex canonical 문서 작성 후 `.claude/agents/prompts.md` compatibility entry 반영

## Acceptance Criteria
- `.codex/agents/` 아래에 Codex용 prompts/team-config/workflow와 agent별 문서가 존재한다.
- `.claude/agents/prompts.md`가 Codex 글로벌 스킬을 위한 compatibility entry로 복구된다.
- `AGENTS.md`가 `.codex/agents/` canonical 위치와 `.claude/agents/prompts.md` compatibility 목적을 설명한다.
- 기존 Claude 개별 agent 문서는 유지된다.

## Tech Debt Resolved
- Codex 글로벌 스킬이 읽을 prompt entry가 빠져 있던 상태를 해소한다.

## Security Notes
- `.env*`는 읽지 않고, 문서에는 환경변수의 이름/역할만 일반 원칙으로 유지한다.

## Risks & Dependencies
- `.codex/agents/`와 `.claude/agents/prompts.md`가 장기적으로 drift할 수 있다.
- Codex 글로벌 스킬은 현재 `.codex/agents/`를 직접 탐색하지 않으므로 compatibility entry 유지가 필요하다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-04-09 | codex | Codex canonical 경로를 `.agents/` 대신 어디에 둘지 | 저장소 규칙을 따라 `.codex/agents/`를 canonical로 두고 `.claude/agents/prompts.md`를 compatibility entry로 유지 |
