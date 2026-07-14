# 세션 핸드오프 — 2026-07-14 (Teameet v1 대회 도메인 폴리시 + main↔dev 통합)

## 2026-07-14 재개 스냅샷 (최신 결정 — 아래의 오래된 충돌 항목보다 우선)

### 사용자 최신 결정

- 실제 작업 브랜치와 PR base는 `dev`다. 루트 체크아웃은 다른 세션 보호를 위해 건드리지 않고, 격리 워크트리 `.claude/worktrees/dev-verify`의 로컬 `dev`에서 작업한다.
- v1 웹 개발 서버는 기존 `3013` 하나만 사용한다. 별도 웹 포트를 추가로 띄우지 않는다. API는 `8121`이다.
- production은 dump/pull 전용 read-only다. production 쓰기, 마이그레이션 실행, 데이터 수정은 금지한다.
- 회원가입 신규 사용자에게 이름, 휴대폰 번호, 생년월일, 성별을 모두 필수로 요구한다. 이 결정은 아래 §4의 과거 optional 결정보다 우선한다. 기존 nullable production row는 보존하고 신규 가입 경계에서만 강제하므로 이 변경 자체에는 DB 마이그레이션이 필요하지 않다.
- 대회 마케팅 페이지는 동적 캠페인 템플릿으로 만든다. 각 이벤트가 대회 전용 페이지처럼 보이도록 편집 가능해야 하고, 일회성 사용 후에도 DB 레코드는 남긴다.
- 브라우저 코멘트 4건을 모두 처리한다: 대회 목록 배너 정렬, 홈 배너 비율, 팀 기본 identicon 이음선 제거, 회원가입 필수 필드.
- UI 변경은 라이브 브라우저 기능 검증과 390/768/1440 시각 QA를 거친다.

### 현재 Git·런타임·DB 기준점

- [x] 로컬 `dev`에 `origin/dev`, 검증된 main↔dev 통합, 최신 `origin/main` 반영 확인.
- [x] 현재 HEAD `0a4f63a9` (`fix(v1/db): align popup id default with Prisma schema`). 로컬 `dev`는 `origin/dev`보다 28커밋 앞섬.
- [x] `3013` 웹과 `8121` API가 모두 `.claude/worktrees/dev-verify`에서 실행 중임을 PID cwd로 확인.
- [x] production 최신 dump를 read-only로 가져와 disposable local DB clone에 복구.
- [x] Prisma migration 50개 적용, `prisma migrate status` up-to-date, `migrate diff` drift 0.
- [x] production 업로드 참조 12개 전수 검사: local `/uploads/*` 12, remote 0, missing 0. 대표 이미지 API·3013 proxy 200 및 1600×900 decode 확인.
- [x] 대회 집중 테스트: API 15 suites / 266 tests, Web 21 files / 133 tests 통과.
- [x] 전체 단위 테스트: API 46 suites / 602 tests, Web 47 files / 274 tests 통과.
- [x] production clone과 분리된 일회성 `ulw_v1_integration_*` DB에 50개 migration을 새로 적용하고 API integration 2 tests 통과 후 DB를 즉시 삭제.
- [x] 양 패키지 `tsc --noEmit` 및 v1 web pattern check 통과.
- [x] 현재 committed tree에서 Next production build(75 routes)와 Nest production build 통과 후 유일한 웹 서버를 같은 `3013`에 재기동하고 web/API HTTP 200 확인.
- [x] 공개 대회 라이브 QA: 2개 목록, 혼성 상세, 비로그인 신청 redirect, 결과 공개 전 상태, 후기 빈 상태, 모바일 overflow, console/network 재검증. 데스크톱 프로모 배너의 좌우 20px 과도한 inset을 실제 geometry로 재현.
- [x] 관리자 팝업·대회 명단·성별 표시 라이브 QA: owner/ops에서 팝업 목록·상세·수정 진입과 혼성 대회 신청 9팀/명단 12명/CSV affordance 확인, console/network 오류 0. clone에 support 계정이 없어 support 역할만 미검증이며 권한 데이터는 인위적으로 추가하지 않음.
- [ ] 브라우저 코멘트 4건 구현 및 before/after 시각 QA.
- [ ] 동적 캠페인 템플릿 설계·구현·마이그레이션·QA.
- [ ] 전체 테스트·빌드와 committed-tree 검증 후 `dev` push, 기존 PR #69 정리 판단.

### 현재 blocker

- 프로젝트 전역 규칙이 모든 product UI 변경 전에 Lazyweb report 생성을 강제한다. 현재 세션에는 `lazyweb_generate_report` / `lazyweb_get_report` 도구가 노출되지 않았고 설치 후보도 없다. Lazyweb 연결이 복구되기 전에는 UI 구현을 시작하지 않는다. 기능·데이터·테스트 검증은 계속 진행한다.

### 동적 대회 캠페인 최소 계약 (구현 전 분석 완료)

- 범용 CMS나 임의 HTML/CSS 빌더를 만들지 않는다. 코드에 고정된 Teameet 대회 전용 템플릿 1개와 대회별 `V1TournamentCampaign` 1:1 레코드만 추가한다.
- 새 레코드는 `tournamentId @unique`, 영구 고유 `slug`, `draft | published | archived`, versioned typed JSON content, `publishedAt`/`archivedAt`/timestamps를 가진다.
- hard delete API는 만들지 않고 archive 후에도 콘텐츠와 slug를 보존한다. 발행된 slug는 변경·재사용하지 않는다.
- 일정·장소·참가비·정원·상금·규정·환불·협찬은 기존 `V1Tournament`와 sponsor/registration 데이터를 SSOT로 재사용하고 content JSON에 복제하지 않는다.
- public은 published 캠페인만 `/api/v1/tournaments/campaigns/:slug`로 조회한다. admin active role은 조회, owner/ops만 create/update/status mutation 가능하며 기존 admin action log를 사용한다.
- 이 기능은 새 enum/table/unique/FK가 필요하므로 migration 파일이 필수다. 기존 대회 backfill은 하지 않고 production에는 직접 적용하지 않는다. disposable 최신 prod clone에서 migration 0-drift와 기존 row count 불변을 검증한다.

> 새 세션에서 이 문서를 그대로 붙여넣고 이어서 진행하면 됩니다. 이 문서는 이전 세션의 전체 대화 맥락·사용자 지시·결정사항·진행상황을 담고 있습니다.

## 0. 가장 먼저 확인할 것 (실행 순서)

0. **루트 체크아웃(메인 작업트리, `/Users/sungjun/Documents/projects/matchup-sports-platform`)은 의도적으로 `feat/tournament-results-2leg-desktop` 브랜치에 그대로 둔다 — dev로 전환하지 않는다.** (2026-07-14 사용자 명시 확인: "지금은 전환하지 말기") 다른 세션이 이 경로/브랜치를 쓰고 있을 수 있어서다. **실제 작업(PR)은 전부 `.claude/worktrees/<name>` 격리 워크트리에서 `origin/dev` 기준으로 새로 만들어 진행**하고, 루트 체크아웃 자체는 절대 브랜치 전환·커밋하지 않는다. 새 세션에서도 이 원칙을 그대로 유지할 것 — 임의로 루트를 dev로 전환하지 말고, 필요하다고 판단되면 반드시 먼저 사용자에게 확인(AskUserQuestion)한다.
1. `.claude/worktrees/main-dev-integration` 워크트리에서 진행 중이던 **main→dev 통합 + 성별 쿼터 재조정** 워크플로우(§3, Task ID `wrmjqqhg9` / Run ID `wf_30ed6477-492`)가 끝났는지 확인:
   ```bash
   gh pr list --state open --json number,title,mergeStateStatus
   cat /Users/sungjun/.claude/projects/-Users-sungjun-Documents-projects-matchup-sports-platform/95f8eae2-88a5-4daf-a4ec-ceb8f356baf9/subagents/workflows/wf_30ed6477-492/journal.jsonl
   ```
   **핸드오프 문서 작성 시점(마지막 확인) 기준: 아직 진행 중** — journal.jsonl에 Phase 1(main→dev 통합) 에이전트의 `started` 이벤트만 있고 `result` 없음, 열린 PR도 0개(아직 PR 생성 전 단계, 충돌 해소/테스트 진행 중으로 추정). 끝났으면 PR 상태(CI/Copilot/머지 여부)를 확인해 마무리(§3 참고). 아직이면 이어서 모니터링(TaskList로 살아있는지 확인, 죽어있으면 §3 내용을 참고해 재실행).
2. 열려 있는 PR 전체 확인: `gh pr list --state open` — 각각 CI/Copilot 리뷰 상태 확인 후 clean하면 `gh pr merge <N> --merge` (base는 항상 `dev`, **`main`은 절대 직접 push/merge 금지**).
3. §5 "대회 생성 폼 전면 재설계"는 **성별 쿼터 기능이 dev에 완전히 반영된 뒤** 시작할 것 — 같은 파일(`apps/v1_web/src/app/admin/tournaments/new/page.tsx`)을 재작성하므로 순서가 중요.

## 1. 사용자의 핵심 지시사항 (반드시 지킬 것)

- **"내가 지시하는 작업들은 항상 다 subagent에게 위임해서 너는 management만 해."** (2026-07-14, 강화 재지시 — 전날 "왠만하면" 표현에서 "항상/전부"로 강화됨) — 실제 코드 편집·빌드·**라이브 브라우저 검증**까지 전부 `Agent`/`Workflow` 서브에이전트로 위임. 메인은 요구 파악·프롬프트 작성·결과 검토·PR 상태 확인·머지 실행 정도만 직접 수행. (메모리 파일: `sonnet-subagent-implementation.md`)
- **"우리의 소스가 더 좋다하더라도, 항상 이전버전 호환성 유지되어지게끔 데이터 구조를 명확하게 들고있자."** — main/팀원이 이미 만든 필드명·계약(예: `V1TournamentPlayer.genderSnapshot`)이 있으면, 내가 독자적으로 만든 것(`gender`)보다 **기존 명명을 우선**한다. 스키마 필드 충돌 시 항상 "이미 배포/공유된 쪽"을 기준으로 통일.
- **Git 정책**: `main` 직접 push/머지 절대 금지(사용자 승인 없이는). 통합 브랜치는 `dev`. `dev→main` 승격은 사용자 게이트.
- **Decision Matrix는 항상 AskUserQuestion으로.** 여러 옵션이 있는 결정은 표로 먼저 보여준 뒤 AskUserQuestion으로 실제 선택을 받는다. 절대 서브에이전트가 임의로 하나를 골라 구현하지 않는다.
- **PR 워크플로**: 격리된 `.claude/worktrees/<name>` 에서 작업 → `pnpm install --frozen-lockfile` → (백엔드면 `pnpm exec prisma generate`) → `tsc --noEmit` → 라이브 스크린샷 검증 → 내 파일만 pathspec 커밋 + `git show --stat HEAD` 검증 → push → `gh pr create --base dev` → `gh pr edit <N> --add-reviewer copilot-pull-request-reviewer` → Copilot 리뷰 폴링(3-8분) → finding 적대적 검증 후 실제 문제만 수정 → GraphQL `addPullRequestReviewThreadReply`(서명: 마지막 줄 이탤릭 "Addressed by Claude Code" 링크 `https://claude.com/claude-code`) + `resolveReviewThread` → CI 통과 + `mergeStateStatus: CLEAN` + 미해결 스레드 0 확인 → `gh pr merge <N> --merge`.

## 2. 알아야 할 함정 (이번 세션에서 실제로 겪은 문제들)

- **포트 3013은 이제 harness가 추적하는 "루트 체크아웃"(main-worktree, 현재 브랜치 `feat/tournament-results-2leg-desktop`) 전용 서버입니다.** `.claude/launch.json`의 `v1_web` 설정(`pnpm --filter v1_web dev`, port 3013, `autoPort:false`)은 **루트 저장소 경로**에서 실행됩니다 — `.claude/worktrees/*` 안의 파일 변경은 이 서버에 반영되지 않습니다. 서브에이전트가 어떤 워크트리에서든 라이브 검증이 필요하면 **반드시 3013이 아닌 별도 임시 포트**를 쓰고 검증 후 반드시 종료해야 합니다. (과거엔 `nohup`으로 수동 기동했다가 harness의 tracked 서버와 충돌해서 "Port 3013 in use" 에러가 난 적 있음 — `kill` 후 `preview_start({name:'v1_web'})`로 재기동해서 해결.)
- **서브에이전트가 "백그라운드 폴러가 있으니 기다리겠다"며 멈추는 패턴이 반복됩니다.** 그런 자동 폴러는 실제로 없습니다 — Agent tool로 dispatch한 서브에이전트는 자기 턴 안에서 스스로 재확인(sleep+retry 등)하지 않으면 그냥 멈춥니다. CI 대기 중 이런 응답이 오면 **직접 `gh pr checks <N>` / `gh pr view <N> --json mergeStateStatus,mergeable`로 상태를 확인**하고, 아직이면 다음에 다시 확인하거나 `SendMessage(to: <agentId>, ...)`로 재개시키세요. CI 완전 clean인데 그냥 멈춘 경우는 메인이 직접 `gh pr merge`해도 됩니다(순수 상태확인+머지는 위임 예외로 처리해왔음).
- **같은 파일을 여러 워크플로우가 동시에 재작성하면 충돌합니다.** 실제로 "성별 필드 기능"과 "main→dev 통합"이 `V1TournamentPlayer`에 각각 다른 이름(`gender` vs `genderSnapshot`)으로 같은 개념의 필드를 추가하다가 충돌 직전에 발견해서 재조정했습니다(§3). 새 큰 작업을 델리게이트하기 전에 **진행 중인 다른 워크플로우가 같은 파일/모델을 건드리는지 먼저 확인**하세요.
- **`git worktree` 목록이 매우 많습니다**(과거 세션들의 잔재 포함, `.claude/worktrees/*`와 `/private/tmp/.../scratchpad/worktrees/*` 양쪽에 분산). 새 작업은 항상 **`origin/dev`를 fresh fetch한 뒤 새 worktree**를 만드세요 — 오래된 worktree를 재사용하면 dev와 크게 벌어져 있을 수 있습니다.
- **fablize 훅이 가끔 "tool failure"를 오탐**합니다(예: 로그에 "failed"라는 단어가 우연히 포함된 정상 케이스, 또는 정상 종료된 툴콜에 대해). 실제 에러 유무는 도구 결과 자체로 판단하세요.

## 3. main → dev 통합 + 성별 쿼터 재조정 (진행 중이었음 — 최우선 확인 대상)

### 배경
사용자가 "main에 최신 업데이트가 올라왔어... dev에 conflict 안나게 병합, 새 기능 파악, 남길 기능은 남기고, 이전버전 호환성 유지"를 요청. 조사 결과:

- **main-only 커밋 5개** (`origin/dev..origin/main`), **dev-only 150개** (이번 세션 대부분의 PR 포함).
- main-only 중 3개(`8b4d857` revert, `7a5462a1` DROP TABLE, `58fd4ff9` 머지)는 **PR #31(대회 후기·개인 시상·경기 영상 기능) 전체를 되돌리는 커밋**인데, dev는 같은 기능을 같은 날짜(7/13)에 리뷰 모더레이션까지 추가하며 활발히 확장 중이었음. 루트 체크아웃 브랜치명 자체가 `feat/tournament-results-2leg-desktop`이라 이 기능이 여전히 진행형인 정황.
- 나머지 main-only 2개는 순수 신규/유용한 기능: `a2a0fd1f`(프로모 캐러셀 + 공지 팝업 어드민 관리) / `0758c22f`(대회 명단에 성별 스냅샷 + 어드민 전용 로스터 조회 엔드포인트로 403 버그 수정 + CSV 성별 컬럼 + 프론트 모달 개선 — **팀원 `seeungmin`이 이미 완성·테스트 완료한 기능**, 필드명 `V1TournamentPlayer.genderSnapshot`/`gender_snapshot`, 백필 포함).

### 사용자 확정 결정
1. **main의 revert 3개 커밋은 dev에 적용하지 않는다** — dev의 대회 후기/시상/영상 기능을 그대로 유지.
2. **main의 나머지 2개(프로모 캐러셀·공지팝업, 성별 로스터 접근 수정)는 dev로 가져온다.**

### 중복 발견 및 재조정
이 결정 전에 이미 별도로 "대회 성별 카테고리 + 성별 쿼터" 기능을 서브에이전트에 위임해서 **백엔드(커밋 `76ee0dfa`)와 프론트엔드(커밋 `12319075`)가 완성되어 브랜치 `feat/v1-tournament-gender-quota`에 push된 상태**였음. 이 기능이 `V1TournamentPlayer`에 독자적으로 `gender`(String?, `@map("gender")`) 필드를 추가했는데, main의 `genderSnapshot`과 **같은 목적의 중복 필드**임을 발견 — "이전버전 호환성 유지" 원칙에 따라 **`genderSnapshot`으로 통일하기로 재조정** 지시.

### 실행 중이던 워크플로우 (Task ID: `wrmjqqhg9`, Run ID: `wf_30ed6477-492`)
- **Phase 1 (main→dev 통합)**: `.claude/worktrees/main-dev-integration` (브랜치 `chore/v1-main-dev-integration`, base `origin/dev`)에서 `git merge origin/main --no-commit` 실행 → 26건 충돌(content 19 / modify-delete 7) 해소 → revert 관련 DROP 마이그레이션은 제외, `genderSnapshot` 마이그레이션은 타임스탬프 재넘버링(`20260714005000_v1_tournament_player_gender_snapshot`, dev의 동일 prefix `20260714000000_v1_tournament_geo_integration_settings`와 충돌 방지) → tsc/전체 테스트 → PR 생성 → Copilot 루프 → merge.
- **Phase 2 (성별 쿼터 재조정)**: Phase 1이 반영된 dev 기준으로 `feat/v1-tournament-gender-quota`를 재작업 — `V1TournamentPlayer.gender` 필드 제거하고 이미 존재하는 `genderSnapshot`을 재사용하도록 백엔드/프론트 전부 리네이밍, 마이그레이션에서 player 컬럼 추가 부분 제거(genderCategory+쿼터 4필드만 남김), 중복 로직/UI 제거 → 재검증 → PR → Copilot 루프 → merge.

**확인 방법**: 위 §0-1 명령으로 journal.jsonl 확인. 완료됐으면 `gh pr list --state open`에서 관련 PR(제목에 "main", "통합", "성별" 포함) 상태 확인 후 마무리.

### ⚠️ 완료 후 반드시 함께 검증할 것 (회귀 체크리스트)

이 작업은 **150개 dev 커밋과 5개 main 커밋을 병합하며 26건의 충돌을 수동 해소**한 작업이라, PR이 머지된 뒤 아래 항목을 **반드시 라이브로 재검증**할 것 — CI/tsc/유닛테스트가 통과해도 실제 화면에서 깨질 수 있는 지점들이다.

- **[Phase 1 회귀 체크]** dev의 대회 후기·개인 시상·경기 영상 기능(PR #31 유래)이 병합 후에도 **그대로 정상 동작**하는지: 대회 결과 페이지, 개인 시상 페이지, 리뷰 작성/조회, 리뷰 모더레이션(숨김/복원), 경기 영상 업로드/재생 — 전부 화면에서 직접 클릭해 확인. (충돌 해소 과정에서 "dev 쪽 유지"로 기계적으로 처리한 파일들이 실제로는 프로모 신규 코드와 뒤섞여 있어 수동 병합이 필요했던 지점 — `tournament-hero-card.tsx`, `use-v1-api.ts`, `types/api.ts`, `tournaments/page.tsx`, `globals.css`/`tournaments.css`/`home.css` — 이 파일들이 정상 렌더되는지 특히 주의.)
- **[main 신규기능 반영 체크]** 홈/대회목록 프로모 캐러셀이 정상 노출되는지, 어드민 `/admin/popups` 공지 팝업 관리 화면이 동작하는지.
- **[성별 로스터 접근 기능 체크 — main 유래]** 어드민이 팀 비멤버여도(예: ops/support 권한) 로스터 조회가 403 없이 되는지, 로스터 모달에 "남성/여성/미등록"이 정상 표시되는지, CSV 다운로드에 성별 컬럼이 포함되는지, 기존 로스터 행이 프로필 성별로 **백필**되어 있는지(신규 마이그레이션의 백필 SQL 실행 결과 확인).
- **[성별 쿼터 기능 체크 — 재조정 후]** `genderSnapshot` 필드로 통일된 뒤에도: 혼성 대회 생성 시 성별 카테고리+쿼터 필드 노출, 로스터 화면 성별 집계 패널이 **main에서 가져온 로스터 모달의 남성/여성/미등록 표시와 중복되지 않고** 자연스럽게 공존하는지, 명단 확정(잠금) 시 쿼터 미충족이면 실제로 차단되는지(`TOURNAMENT_GENDER_QUOTA_NOT_MET`), 회원가입 성별 select가 정상 동작하는지.
- **[스키마 드리프트 최종 재확인]** `prisma migrate diff`로 drift 0 재확인 — 두 브랜치의 마이그레이션이 합쳐진 뒤라 타임스탬프 순서/의존성이 꼬이지 않았는지 최종적으로 한 번 더 확인.
- 위 항목 중 하나라도 깨져 있으면 **"재검토 필요" 항목으로 처리하고 사용자에게 보고** — 임의로 되돌리거나 추측으로 고치지 말 것(규칙: 모호함은 재계획 진입).

## 4. 성별(gender) 관련 기능 전체 요구사항 요약 (여러 메시지에 걸쳐 확정됨)

| 결정 항목 | 확정 내용 |
|---|---|
| 대회 성별 카테고리 | `V1Tournament.genderCategory` 전용 enum 필드(`mixed\|male\|female`), 자유문자열 아님 |
| 인원 자동 필터링 범위 | 선수 추가 시엔 집계만 표시(차단 없음). **"명단 확정/잠금" 시점에만** 성별 쿼터(`genderMinMale/genderMaxMale/genderMinFemale/genderMaxFemale`, 전부 nullable) 충족 검증 → 미충족 시 확정 차단. `genderCategory==='mixed'`인 대회에만 적용(남성부/여성부는 검증 대상 아님, 단순 태깅만) |
| 유저/선수 성별 데이터 흐름 | `V1UserProfile.gender`(이미 존재) → 선수 로스터 추가 시 서버가 스냅샷(폼 수동입력 아님, `realName`/`birthDate`와 동일 패턴) → **필드명은 `genderSnapshot`으로 통일**(main 기존 관례 따름, 제가 만들었던 `gender` 필드명은 폐기) |
| 회원가입 성별·전화번호·생년월일 | **가입 시점엔 선택(optional) 유지**, 등록(팀/대회 명단) 시점에만 `PLAYER_REQUIRED_PROFILE_MISSING` 게이트로 필수 체크(기존 구조 그대로 — 전화번호/생년월일은 이미 이 구조로 존재, 성별만 새로 이 게이트에 편입). **회원가입 화면 자체를 필수로 바꾸지 않는다** — 이미 결정됨, 재논의 불필요 |
| 신규 DB 컬럼 필요 여부 | 유저 성별/전화번호/생년월일 컬럼은 **이미 존재** — 신규 추가 불필요. 신규 컬럼은 대회의 `genderCategory`+쿼터 4개, 선수의 `genderSnapshot`(main에서 이미 옴)뿐 |
| 에러 코드 | `TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID`(400, 대회 생성/수정 시 min>max 등) / `PLAYER_REQUIRED_PROFILE_MISSING`(400, 재사용) / `TOURNAMENT_GENDER_QUOTA_NOT_MET`(409, 명단 확정 시, `details.male/female` 포함) |
| 제외 범위 | 남성부/여성부 대회의 성별 불일치 검증 없음. 기존 자유문자열 `genderRule`(Match/TeamMatch/TeamProfile)은 불변경, 완전 별개 |

## 5. 대기 중: 대회 생성 폼 전면 재설계 (설계 완료, 구현 미착수)

### 사용자 피드백
"대회 등록할때 현재있는 대회 수정과 하단에 있는 상품 등록... 플로우가 좀 다른것같아... 폼이 레거시... 날짜나 시간 입력도 수기로 입력해야해서 불편... 자동으로 완성할수있는것들은 자동완성... 대회 등록과 추가정보 등록 모두 개선."

### 조사 결과 (핵심)
- `apps/v1_web/src/app/admin/tournaments/new/page.tsx`(생성 폼): 날짜 3필드(`scheduledAt`/`scheduledEndAt`/`registrationDeadlineAt`)가 **수기 텍스트**(`DatetimeTextInput`, 로컬 정의), 상금 배분도 자유 textarea, 커버 이미지·홍보카드 입력 자체가 없음.
- `.../[id]/tournament-detail-client.tsx`(수정 화면): 날짜는 **native `datetime-local`**, 상금 배분은 구조화 행 편집기(합계 자동채움 + 라이브 미리보기), 커버 이미지 업로더, 홍보 카드 구조화 폼 — 전부 이미 존재하지만 **생성 폼과 컴포넌트 공유 없음(중복 구현)**.
- 사용자가 **"C. 전면 재설계"** 선택(A: 날짜picker만 교체 / B: 공용화+자동완성 3종 / C: 다단계 위저드+라이브미리보기+생성시커버·프로모통합, 전부 제시 후 C 선택).

### 확정 설계 스펙 (구현 에이전트가 그대로 따를 문서 — 아래는 요약, 전체 스펙은 이전 세션 기록 참고)
- **4단계 위저드**: Step1 기본정보(종목/대회명/형식/**성별카테고리 슬롯**) → Step2 일정·장소(native date/time picker, 마감일 D-3 자동제안) → Step3 참가조건(팀수/선수수 기본값 프리필 8/6/10, **성별 쿼터 슬롯**, 계좌 "직전 대회 불러오기") → Step4 상금·규정·홍보(구조화 상금편집기+라이브미리보기+커버+홍보카드).
- **"위저드 상태소실" 회귀 방지가 Critical**: 전 스텝 필드를 부모의 단일 `useReducer`/`useState` 객체 하나로만 관리, 스텝 컴포넌트는 controlled(자체 필드 state 금지). 6개 구체 테스트 시나리오(T1~T6, 뒤로가기/스텝점프/재업로드 시 값 보존)로 검증할 것.
- **공용 컴포넌트 4종 신규 추출**(생성+수정 화면 공용): `tournament-datetime-field.tsx`, `prize-breakdown-editor.tsx`, `cover-image-uploader.tsx`, `promo-card-fields.tsx` — 전부 기존 detail-client.tsx의 검증된 로직을 그대로 승격.
- **자동완성 스펙**: 마감일=시작일 D-3 23:59(수동편집 시 자동제안 중단, `deadlineDirty` 플래그), 기본값 프리필(팀수8/최소6/최대10/형식 `group_knockout`), 계좌 "직전 대회 불러오기"(`useV1AdminTournaments` 재사용, createdAt desc 정렬 후 계좌 3필드만 복사).
- **후속 필수**: `tournament-detail-client.tsx`도 동일 공용 컴포넌트로 스왑해 중복 제거(별도 커밋 권장 — 안 하면 기술부채 잔존).

### 왜 대기 중인가
성별 카테고리(§4)의 프론트 필드가 정확히 이 `new/page.tsx`의 Step1/Step3에 들어가야 하는데, §3의 main↔dev 통합과 성별 쿼터 재조정이 먼저 이 파일을 건드리고 있어서, **그 작업이 dev에 완전히 반영된 뒤에 이 위저드 재설계를 시작**하기로 순서를 잡음(같은 파일 동시 재작성 충돌 방지).

### ⚠️ 구현 착수 전 + 완료 후 함께 검증할 것
- **착수 전**: §3의 main↔dev 통합 + 성별 쿼터 재조정 PR이 dev에 완전히 머지됐는지, 그리고 §3의 회귀 체크리스트가 전부 통과했는지 먼저 확인. 머지된 `new/page.tsx`에 성별 카테고리/쿼터 필드가 정확히 어떤 모양으로 들어가 있는지(변수명·UI 위치) 실제로 읽고 나서 위저드 스펙의 Step1/Step3 슬롯 위치에 맞춰 넣을 것 — 스펙 작성 시점엔 아직 그 필드가 병합되지 않아 "위치만" 지정해뒀음.
- **완료 후**: 이 위저드 재설계가 끝나면 **성별 카테고리+쿼터 필드가 새 위저드 안에서도 정상 동작하는지 반드시 함께 재검증**할 것(단, 필드를 이 폼에 처음 만드는 게 아니라 기존 필드를 새 레이아웃으로 옮기는 것이므로 백엔드 재검증은 불필요, 프론트 렌더링·제출 payload만 확인). 구체적으로: (1) 혼성 선택 시 Step3에 쿼터 4필드가 조건부 노출되는지, (2) 스텝 전환(뒤로가기 포함)에도 성별 카테고리/쿼터 값이 유실되지 않는지(§5의 T1~T6 시나리오에 이 필드도 포함해서 검증), (3) 제출 payload에 성별 필드가 정상 포함되는지.

## 6. 이번 세션에서 완료·머지된 것 (dev 기준, 참고용)

PR #58, #59, #60, #61, #62, #63, #64, #65, #66, #67, #68 — 전부 dev에 머지 완료. 주요 내용:
- 매치 상세 `toDetailMode` 'closed' 모드 신설(비참가자에게 거짓 "승인완료" 배너 뜨던 버그)
- 어드민 문의 답변 수정 기능
- 대회 배너 CTA 비대칭 여백 수정
- 대회 일정 시간 표시 + 안내문구 hairline
- 어드민 문의 미확인 건수 배지
- 대회 현장안내 배지 제거(정보 없는 뱃지)
- 홍보카드 실시간 미리보기
- 어드민 대진관리 탭 3단계 스텝 위저드 재설계(Copilot이 지적한 "확정 팀 없어도 3단계 열리는" 버그도 수정)
- 회원가입 프로필 사진 선택 영역 시각 개선
- 팀원 0명일 때 명단 등록 크래시 수정(+ 매치 신청자 목록에도 동일 가드 적용)

## 7. 진행 중 작업 #82 (이 세션 이전부터 있던 별도 in_progress 태스크)

"전역 로딩중 이중 제출(더블클릭) 방지 점검" — 이번 세션에서 다루지 않음. 필요시 확인.

## 8. 전체 태스크 #1~#95 — 사용자 지시 리스트업

> 세션 TaskList(`TaskList` 도구)의 태스크 번호이며, **GitHub PR 번호와는 별개의 체계**다(우연히 숫자대가 겹치니 혼동 주의 — 예: Task #60 ≠ PR #60).
> **#1~#84는 이 대화 맥락 시작 이전(요약된 이전 세션)에 생성된 항목**이라 사용자의 원문 그대로를 이 세션에서 보유하고 있지 않다 — 아래 "지시 요약"은 TaskList에 기록된 제목(subject)을 그대로 옮긴 것이며 실제 원문 문장이 아니다. **#85부터는 이 대화에서 직접 확인한 사용자 발화**라 원문에 가깝게(또는 완전 원문으로) 적었다.

### #1~#84 (원문 미보유 — TaskList 제목 그대로, 완료됨)

| # | 지시 요약(TaskList 제목) |
|---|---|
| 1 | 대회 도메인 전체 표면 파악 (프론트·백엔드·어드민) |
| 2 | 어드민 "대회 정보" 탭 신설 — 상금 3필드 수정 기능 구축 |
| 3 | 레이아웃·아이콘·컬러칩 감사 — 4개 폼팩터 |
| 4 | 테스트 시나리오 작성 + 전 시나리오 실행 |
| 5 | QA·기획 전달용 아티팩트 제작 (디자인 스펙 + 시퀀스 플레이어) |
| 6 | 경기 영상 URL 기능 — 스키마·API·어드민 입력·공개 표시 |
| 7 | 공지·규정·환불정책 텍스트 포매팅 일관화 |
| 8 | 대회 도메인 아이콘 lucide 통일 |
| 9 | 터치타겟 44px — 푸터 링크 + 어드민 백링크 |
| 10 | 종목(sportId) 생성 후 변경 가능화 |
| 11 | 핸드오프 아티팩트 전면 재제작 — 풀페이지·인벤토리·플로우·GIF |
| 12 | 루트 라우팅 → /v1 얼라이어스 (구앱 아카이빙) |
| 13 | 대회 커버 이미지 업로드 — DTO·서비스·어드민 UI |
| 14 | 아티팩트 캡처 결함 수정 + 재발행 |
| 15 | 금액 입력 자동 콤마 포맷 (생성폼·수정모달·대회정보 탭) |
| 16 | 영상 사용자 UI — 유튜브 썸네일 카드 + 페이지 내 모달 재생 |
| 17 | 신청·명단·승인 플로우 보강 + 어드민 폴리시 (워크플로우 P0 반영) |
| 18 | 다중 경기 영상 스키마·API |
| 19 | 영상 업로드+스트리밍 백엔드 |
| 20 | 어드민 다중 영상 입력 UI |
| 21 | 공개 영상 UI/UX 재설계 |
| 22 | 캡처 전면 재작업 (톨 뷰포트) |
| 23 | 아티팩트 v5 |
| 24 | PR #31 작성·업데이트 |
| 25 | 기존 PR 리뷰 코멘트 |
| 26 | 최종결과 페이지 시각 절제 재설계 |
| 27 | 명단 추가 플로우 실테스트+캡처 |
| 28 | 리뷰·영상 안내 UX 명확화 |
| 29 | PR 수정→재리뷰 사이클 (#32·#30) |
| 30 | 아티팩트 v6 + PR #31 갱신 |
| 31 | P1·P2 로드맵 전건 구현 (ultracode) |
| 32 | PR #30 충돌 해소 — 새 main 기준 union merge·검증·푸시 |
| 33 | QA 문서 PR 6건(#23~28) CI green 확인 후 머지 |
| 34 | 어드민 사람·팀 입력 → 기존 데이터 기반 선택 UI (검색 dropdown/테이블 모달) |
| 35 | awards admin 라우트 권한 게이트 수정 — PR 리뷰·머지 |
| 36 | 구앱 아카이빙 전체 랜딩 — PR #37 + 파이프라인 정합화 |
| 37 | 시각검증 갭 스윕 — 미캡처 화면 + tablet 뷰포트 |
| 38 | 상금 A안(스마트 자유값) 구현 — 물품 나열 지원 |
| 39 | 배포 헬스체크 443 실경로 검증 강화 — PR |
| 40 | 어드민 대진관리 탭 UI 개선 (dev 최신 기준) |
| 41 | 대회정보 상금 입력 — 금액 전용처럼 보이는 UI 개선 |
| 42 | 어드민 신청관리 카드 개선 |
| 43 | 최종결과 히어로 — CHAMPION 문구 제거·트로피 개선·입장 애니메이션 |
| 44 | 최종결과 그리드 — 최종순위/결선경기 레이아웃 재균형 |
| 45 | 검증·PR·Copilot 사이클 — dev 머지 |
| 46 | Batch-2 백엔드 커밋 (리뷰 모더레이션·알림 3종·참가팀 로고) |
| 47 | Track A — 어드민 리뷰 모더레이션 탭 (숨김/복원) |
| 48 | Track B — 알림 뱃지·플로우 개선 (신청/입금/공지 3종) |
| 49 | Track C — 참가팀 조회·참여 신청 UI/UX 폴리시 |
| 50 | Batch-2 검증·PR·Copilot 사이클 (base dev) |
| 51 | Fix stale test mock — participantTeams teamLogoUrl/teamRegionName 드리프트 |
| 52 | 대회 상세 UX 재구성 — 상태 인식 + 허브 컴팩트화 (Toss) |
| 53 | 테스트 갭 — 재구성(히어로·아코디언·액션리스트) 커버리지 |
| 54 | 테스트 갭 — 알림 뱃지 로직 + 어드민 리뷰 모더레이션 |
| 55 | 명단 제출 마감일 — 백엔드 (스키마·서비스·API) |
| 56 | 명단 제출 마감일 — 프론트 (생성폼·수정모달·팀 로스터·어드민 예외토글) |
| 57 | AdminDataTable 팀명 컬럼 압축 버그 수정 |
| 58 | 경기 일정 만들기 폼 — 어웨이 팀 필드 그리드 홀수 오차폭 수정 |
| 59 | 팀 기본 아이콘 통합 컴포넌트 배포 |
| 60 | 대회 커버 이미지 — 생성 마법사 업로드 + 카드 fallback |
| 61 | 알림 팝오버 기능 설계·구현 |
| 62 | 아이덴티콘·팀로고·대회카드 아이콘 폴리시 |
| 63 | 브랜드 아이콘·GNB·my페이지 레이아웃 폴리시 |
| 64 | 홈 배너 비율 + 팀/매치/대회 섹션 조사 |
| 65 | 팀 카드 리디자인 — 팀장/감독 정보 노출 |
| 66 | 홈 채팅섹션 패딩 + 프로필수정 버튼 정렬 |
| 67 | 배치 PR 정리·병합 (팀아바타 등, PR #45 계열) |
| 68 | prod DB 데이터 로컬 dev 재동기화 |
| 69 | 남은 폴리시 작업 일괄 진행 (팀카드/브랜드아이콘/my페이지) |
| 70 | 홈 히어로 카드 이미지 비중 확대 + 카드 간격 개선 |
| 71 | 대회 목록 배너 비율 + 카드 썸네일 폴백 개선 |
| 72 | 채팅 UI 메시지 그룹핑 개선 |
| 73 | 팀 아바타 xl 사이즈 확대 (/teams) |
| 74 | 대회 현장안내 — 실제 위치정보 노출 |
| 75 | 카카오맵 SDK 임베드 + 내비게이션 앱 딥링크 |
| 76 | 카카오 API 키 어드민 입력(DB 연동 설정) 기능 |
| 77 | 규정/환불정책 마크다운 구분선 + 접기토글 스타일 축소 |
| 78 | 대회 상세 "문의하기" CTA (비회원 게스트 지원) |
| 79 | 배치 작업 전체 PR화 → Copilot 리뷰 → dev 머지 → 로컬 재기동 |
| 80 | 이메일 로그인 화면 폴리시 (에러문구/위치, 비번 토글, 로고) |
| 81 | 홈 히어로 CTA 텍스트-버튼 여백 수정 |
| 82 | 전역 로딩중 이중 제출(더블클릭) 방지 점검 — **미완료, in_progress 상태 유지** (§7 참고) |
| 83 | 매치 상태별 목데이터 생성 + 어드민 테스트 |
| 84 | 불필요 dev 서버 정리 + "서버 1쌍만 유지" 지침 반영 |

### #85~#95 (이 대화에서 직접 확인 — 원문 그대로 또는 근사)

| # | 상태 | 사용자 지시 (원문/근사) |
|---|---|---|
| 85 | 완료 | (원문) *"그럼 # 1 ~ # 84까지 ultracode subagent(sonnet)으로 적대적 검증 다시 모두 진행하고 실제배포할수있는지까지 모두 확인해보자. 그리고 문제있으면 수정도 하고."* — ultracode Workflow 2건으로 11개 도메인 적대적 검증 실행, PR #57 merge-readiness 확인 + 회귀 2건 수정. |
| 86 | 완료 | 매치 상세 `toDetailMode` 'closed' 모드 신설 — 비참가자가 마감/취소/완료/만료/정원마감 매치를 볼 때 실제 참가자와 동일한 초록 "승인 완료" 배너가 잘못 뜨던 버그. (이 정확한 요청 원문은 이 세션 시작 이전 창에서 있었던 것으로 추정되어 원문 미보유, TaskList 제목 기준) PR #58. |
| 87 | 완료 | (원문) *"문의 답변 수정도 있어야할 듯"* — 어드민이 이미 작성한 문의 답변을 수정할 수 있는 기능. 백엔드 PATCH 엔드포인트 + 감사로그, 프론트 인라인 수정 UI. |
| 88 | 완료 | (원문, 5개 항목 결합 메시지) *"어드민 또 대진관리에서 조만들기, 경기일정 만들기 각각이 좀 애매한것같아... 그리고 홍보카드에서 이미지도 미리보기에서 좀 나와야할것같아... 대회 어드민에서는, 여기는 날짜랑 시간 같이 작성을 하는데 대회 페이지에 막상 시간은 안나오네. 그리고 모든 대회에 항상, 시간도 나오고 아래에 '대회 일정 및 경기 방식은 현장 상황에 따라 일부 변경될 수 있습니다'... 여기 현장안내에 확인가능이라는 태그가 무슨 의미가 있냐는거야. 그리고 어드민 들어왔을떄 문의가 쌓여있으면 문의 옆에 숫자로... 신청이 현재 몇개 들어왔는지 숫자가 뜨면 좋겠어."* — 5건 조사→PR #62(일정 시간표시+안내문구), #63(문의 미확인 배지), #64(현장안내 뱃지 제거), #65(홍보카드 라이브 미리보기), #66(대진관리 스텝 위저드, Decision Matrix A/B/C 중 사용자가 B 선택). |
| 89 | 완료 | (이 세션 내 발생, 스크린샷 첨부) *"마찬가지로 팀원이 한명도 없을떄 에러가 뜨네, 대회에서 팀 명단 등록하려고하면."* — `tournament-roster-client.tsx` AddPlayerForm의 `useInfiniteQuery` 관련 `Cannot read properties of undefined (reading 'length')` 크래시. PR #68. |
| 90 | 완료 | (스크린샷 첨부, 정확한 문구는 스크린샷 다음 메시지에서 지시) 회원가입 온보딩 "프로필을 완성해 주세요" 단계의 사진 선택 영역이 플랫한 회색 박스라 어색하다는 지적 — frontend-design 스킬 기반 개선. PR #67. |
| 91 | 완료 | (원문) *"그리고 이제 진행중인거에서 새로운 세션에서 이 작업을 이어가기위해서... 그리고 내가 지시하는 작업들은 항상 다 subagent에게 위임해서 너는 managemet만해."* — 위임 원칙 재확인, 메모리 갱신(`sonnet-subagent-implementation.md`). |
| 92 | 진행 중 | (원문) *"그리고 팀 선수추가할때 혼성경기인 경우 성별도 입력받게끔 해야할것같아. 그래서 애초에 대회를 만들때도 혼성/남성/여성 그걸 받아야할것같고, 그거에 자동으로 인원 필터링이 되어야하고, 유저한태 회원가입할대 성별도 입력받게끔 해야할것같아."* + 후속 확인 *"그리고 이제 진행중인거에서... 회원가입하고 등록할려면 성별 / 전화번호 / 생년월일 (대회 혹은 팀) 입력 필요..."* — §4 참고. |
| 93 | 대기 (설계 완료) | (원문) *"대회 등록할때 현재있는 대회 수정과 하단에 있는 상품 등록, 그런것들과 플로우가 좀 다른것같아... 대회 등록하는 form이 레거시라는거지, 날짜나 시간 입력도 수기로 입력해야해서 불편하고. 자동으로 완성할수있는것들은 자동으로 완성해주고... 대회 등록과 추가정보 등록을 모두 개선이 되어야하는거지."* — §5 참고. |
| 94 | 진행 중 | (원문) *"main에 최신 업데이트가 올라왔어 그걸 local로 땡겨와서, dev에 머지해서 conflict 안나게 그리고 새로운 기능들이 뭐가 더 들어갓는지 파악하고 우리 소스코드랑 비교분석해서 남아야하는 기능들은 남기고, 우리의 소스가 더 좋다하더라도, 항상 이전버전 호환성 유지되어지게끔 데이터 구조를 명확하게 들고있자."* — §3 참고. |
| 95 | 진행 중(이 문서 자체) | (원문) *"그리고 이제 진행중인거에서 새로운 세션에서 이 작업을 이어가기위해서, 진행할 md 문서(여태까지 대화내용, 내가 지시한 사항들, 중요한것들이 모두 담겨져있는) 하나 만들어줘."* + 후속 *"그럼 문서에도 지금 진행중인거 적어주고, 나중에 저게 완료되면 검증할때도 같이 검증해야한다던가 그런거 잘 적어주고, 우리가 #1 ~ # 90번때까지 내가 지시한것들이 있잖아? 그것도 리스트업해서 내가 지시한 내용 그대로 웬만하면 다 들어갈수있게 하는게 좋겠는데."* + 그 사이 *"그럼 브랜치도 dev가 맞아? 그리고 문서도 잘 업데이트 해줘야지"* + *"그리고 우리 브랜치는 dev에서 진행하는거야 알겠지? 항상 우리는 dev에서 시작하는거고 여기에 머지하는거고 여기에다가 푸쉬하는거야."* — 이 문서. |

## 9. 참고 — 프로젝트 규칙 원문 위치

- 전역 규칙: `~/.claude/CLAUDE.md`
- 프로젝트 규칙: `matchup-sports-platform/CLAUDE.md` (Git 브랜치 정책, DB 마이그레이션 규율, 7대 원칙, PR·Copilot 리뷰 워크플로 등)
- 자동 메모리: `~/.claude/projects/-Users-sungjun-Documents-projects-matchup-sports-platform/memory/` (특히 `sonnet-subagent-implementation.md` — 위임 원칙 최신 반영됨)
