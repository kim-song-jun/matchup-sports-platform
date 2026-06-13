# 운영 워크플로 — PR · Copilot 리뷰 루프 · 시각 검증 · CI

> 이 프로젝트에서 **검증된 운영 런북**입니다. PR을 올리고, Copilot 리뷰를 clean까지 돌리고,
> 라이브 스크린샷으로 시각 검증해 PR에 올리는 전 과정을 그대로 따릅니다.
> (요약 규칙은 `CLAUDE.md`의 "운영 워크플로" 섹션 참조 — 이 문서가 상세 소스입니다.)

---

## 0. 황금률

1. **커밋은 내가 만든 파일만 pathspec으로** → 직후 `git show --stat HEAD`로 휩쓸린 파일 검증. (`git add -A`/`commit -a`/`stash` 금지 — 공유 작업트리)
2. **완료 보고 전 검증 게이트**: `tsc 0` + 관련 테스트 통과 + (시각 변경이면) **라이브 스크린샷**. "tsc+테스트만"으론 완료 아님.
3. **결정·롤백·아키텍처 변경은 사용자 게이트.** 적대적 검증으로 real만 고치고, 광범위/구조 변경은 분리·추적.

---

## 1. PR 작업 + 커밋 안전

```bash
# 내가 만든 파일만 명시 커밋 (pathspec)
git commit -m "<msg>" -- path/to/a.ts path/to/b.tsx
git show --stat HEAD            # 휩쓸린 파일 없는지 확인
git push origin <current-branch>  # 항상 현재 브랜치 (브랜치 생성/전환 금지)
```

- 커밋 트레일러: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- PR 본문 트레일러: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- PR 본문/코멘트 갱신: `gh pr edit <N> --body-file <file>` / `gh pr comment <N> --body-file <file>`

### 1.1 squash-merge 후 같은 브랜치 재사용 금지 (CONFLICTING 함정)

- PR이 **squash-merge**되면 머지된 변경은 브랜치 히스토리에 없는 **새 단일 커밋**이 된다. 그 브랜치를 그대로 이어서 새 작업 → 새 PR을 올리면 merge-base가 squash 이전이라 **3-dot diff가 과거 전체를 포함**(실측: 154 파일) + **`CONFLICTING`**.
- **진단**: `gh pr view <N> --json mergeable` 가 `CONFLICTING`이고 변경 파일 수가 실제 작업량보다 비정상적으로 크면 이 함정을 의심. `git merge-base origin/main HEAD` 가 squash 커밋보다 과거인지 확인.
- **복구**: 최신 `origin/main` 기준 **fresh 브랜치**를 만들어(공유 트리 안전 규칙상 **사용자 승인 게이트** 필수 — 전역 규칙 7·21) 필요한 커밋만 **cherry-pick** → 실제 변경분만 담긴 깨끗한 PR. (실측: 154→68 파일, `MERGEABLE`)
  ```bash
  git fetch origin main
  git cherry-pick <sha1> <sha2> <sha3>   # 사용자 승인 후 fresh 브랜치에서
  ```
- **예방**: PR 머지 후에는 그 브랜치를 **버리고** 항상 최신 main에서 다음 작업을 시작.

---

## 2. Copilot 리뷰 루프 (clean까지 반복)

### 2.1 리뷰 요청

```bash
gh pr edit <N> --add-reviewer copilot-pull-request-reviewer
```

- ⚠️ REST `requested_reviewers`는 봇에 대해 **422 "not a collaborator"**로 실패. 반드시 위 `gh pr edit` (GraphQL requestReviewsByLogin 경로) 사용.
- 리뷰는 **비동기 ~3–8분 후** 도착. 새 코드 push마다 재요청.

### 2.2 도착 폴링 (백그라운드)

```bash
BEFORE=$(gh pr view <N> --json reviews --jq '[.reviews[]|select(.author.login=="copilot-pull-request-reviewer")]|length')
for i in $(seq 1 30); do
  sleep 30
  NOW=$(gh pr view <N> --json reviews --jq '[.reviews[]|select(.author.login=="copilot-pull-request-reviewer")]|length')
  if [ "$NOW" -gt "$BEFORE" ]; then echo "NEW_REVIEW $BEFORE->$NOW"; break; fi
done
```

- **clean 판정**: 최신 리뷰 본문이 `generated no new comments` → 루프 종료.
- 폴링은 `run_in_background`로 띄우고 task-notification으로 회수(foreground `sleep`은 블록됨).
- ⚠️ **count 폴링은 위 `gh pr view --json reviews --jq` 방식 사용**(REST count). 인라인 GraphQL을 루프 안에 넣으면 한 줄 쿼리의 **중괄호 불균형**(`query{repository{pullRequest{reviews{totalCount}}}}` 은 닫는 `}` 4개 필요)으로 매 회차 파싱 실패가 조용히 누적돼 새 리뷰를 못 잡는다(실측 함정). GraphQL 직접 호출 시엔 열고 닫는 `{`/`}` 개수를 반드시 맞출 것.

### 2.3 미해결 스레드 조회

```bash
gh api graphql -f query='
query { repository(owner:"<owner>", name:"<repo>") {
  pullRequest(number:<N>) { reviewThreads(first:100) {
    nodes { id isResolved path line originalLine comments(first:1){nodes{author{login} body}} } } } }' > /tmp/threads.json
# python으로 isResolved==false만 파싱 (jq --jq + >는 raw JSON이 아니므로 python 파싱 권장)
```

### 2.4 finding 처리 → 리플라이 → resolve

1. **적대적 검증**: 각 finding을 직접 코드 읽고 real/false 판정. Copilot도 자주 틀림(예: React Query `partialMatchKey`에서 키 말미 빈 객체 `{}`는 임의 객체를 부분일치 → invalidate 정상). **확실히 real만 수정**, false는 근거와 함께 dismiss.
2. real 수정 → 커밋·push (§1).
3. 스레드별 **리플라이 + resolve** (GraphQL):

```bash
# reply
gh api graphql -f query='mutation($tid:ID!,$body:String!){
  addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$tid,body:$body}){comment{id}}}' \
  -f tid="PRRT_..." -f body="맞는 지적이라 <sha>에서 …"
# resolve
gh api graphql -f query='mutation($tid:ID!){
  resolveReviewThread(input:{threadId:$tid}){thread{isResolved}}}' -f tid="PRRT_..."
```
- 한국어 본문은 bash 따옴표 문제로 **python `subprocess`로 호출** 권장.

4. 미해결 0 확인 → §2.1 재요청 → §2.2 폴링. **`generated no new comments` 나올 때까지 반복.**

### 2.5 300-파일 한도 (중요)

- PR 변경 파일이 **300개 초과면 Copilot이 리뷰 거부**("exceeds the maximum number of files (300)").
- 원인은 보통 **커밋된 스크린샷 PNG**. → **PNG를 트리에서 분리**(`git rm`)하면 갤러리 코멘트(§3)는 **SHA 고정 raw URL**이라 그대로 동작(히스토리 blob 유지). 코드 중심으로 줄여 재리뷰 가능.

```bash
git diff --name-only origin/main...HEAD | grep '\.png$' | tr '\n' '\0' | xargs -0 git rm --quiet
```

---

## 3. 시각 검증 + 스크린샷 갤러리

### 3.1 v1 스택 기동 (스크린샷에 실데이터 필요)

```bash
# DB: 컨테이너 teameet_v1_pg (포트 5432, teameet_v1_user / teameet_v1_password / teameet_v1_dev) — 시드 완료 상태
docker ps | grep teameet_v1_pg
# v1_api 기동 (포트 8121)
cd apps/v1_api
DATABASE_URL='postgresql://teameet_v1_user:teameet_v1_password@localhost:5432/teameet_v1_dev' \
JWT_SECRET='v1-dev-secret' API_PORT=8121 NODE_ENV=development pnpm dev &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8121/api/v1/health   # 200 확인
# web: 3013/3014 (pnpm --filter v1_web dev). next.config가 localhost:8121로 프록시.
```

### 3.2 헤더 기반 dev 인증 (캡처/검증용)

- 프론트는 `localStorage` `teameet.v1.userId` / `teameet.v1.userEmail`을 읽어 요청 헤더 `x-v1-user-id` / `x-v1-user-email`로 전송 (`apps/v1_web/src/lib/api-client.ts`).
- Playwright `context.addInitScript`로 페이지 로드 전에 주입:

```js
await ctx.addInitScript(([id, email]) => {
  localStorage.setItem('teameet.v1.userId', id);
  localStorage.setItem('teameet.v1.userEmail', email);
}, [USER_ID, USER_EMAIL]);
```

- 주요 페르소나:
  - host `0cf89db6-3e53-406c-b896-89ade09add9a` / `host@teameet.v1` (소비자 페이지)
  - admin `admin@teameet.v1` (admin 콘솔; userId는 dev-login 또는 DB로 해석)
  - onboarding `coverage-not-started@teameet.v1` (`/onboarding/*` 미완 유저)
- userId 해석: `POST /api/v1/auth/dev-login {email}` 응답의 `session.userId`, 또는 prisma로 직접 조회.

### 3.3 캡처 스크립트 규칙

- **스크립트는 repo 내부(`scripts/`)에 둔다.** `/tmp`에선 `require('@playwright/test')` **모듈 해석 실패**.
- 전 페이지 3폭 캡처기: `scripts/capture_responsive.js` (mobile 390 / tablet 768 / desktop 1440, fullPage, 그룹별 인증).
- devtools 오버레이 숨김: `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`.
- 출력: `docs/visual-qa/<set>/<breakpoint>/<name>.png`.

### 3.4 PR 갤러리 코멘트 (SHA 고정 raw URL)

1. 캡처 → 커밋(§1) → 그 **커밋 SHA**를 사용.
2. 이미지 마크다운: `https://raw.githubusercontent.com/<owner>/<repo>/<SHA>/docs/visual-qa/.../x.png`
   - SHA 고정이라 이후 트리에서 PNG를 빼도(§2.5) 히스토리 blob으로 **계속 렌더**.
3. 페이지별 **📱Mobile · 📲Tablet · 🖥Desktop 3열 표** + 1줄 기능 설명, 섹션별 `<details>` 접이식.
4. 게시 전 `curl -s -o /dev/null -w '%{http_code}' <raw-url>`로 **200 확인**.
5. 본문 65,536자 초과 시 여러 코멘트로 분할.

### 3.5 라이브 시각 검증 (commit 전)

- 레이아웃/마크업/CSS 변경은 commit·완료 보고 전 **Playwright로 실제 화면을 직접 보고** 검증(요소 존재/부재만으론 정렬·균형을 못 잡음).
- 비시각 변경(a11y aria·로직·타이머)은 `tsc` + 테스트로 충분.

---

## 4. 전체 검수 (8차원 적대적 리뷰)

- 큰 검수/피드백은 **built-in `Workflow`(ultracode)**로(=evidence-producing). `/agent-all`은 PR-shipping 코드 변경용이며, 본 레포는 그 Phase 0 전제(트리 청결·`planner/dev/reviewer` 로스터·`agent-policy-hook`)를 미충족.
- 패턴: 차원별 finder(sonnet) → finding별 **적대적 검증**(sonnet, 회의적, 확실할 때만 real) → **종합 리포트**(opus). 차원 예: correctness(backend/admin/consumer) · security-authz · a11y(WCAG AA) · design-consistency · ux-responsive · data-state.
- 모델 배정(규칙 11): **결정/심사/종합 = opus/fable, finder/verifier/실행 = sonnet/haiku**.
- 산출물: 우선순위 피드백 리포트를 **PR 코멘트로 inline 게시** + contained fix는 disjoint 파일그룹으로 병렬 구현 후 홀리스틱 검증(tsc+테스트).

---

## 5. CI 진단 + flaky 재실행

```bash
gh pr checks <N>                       # Test/Deploy 상태
gh run view <run-id> --log-failed | grep -iE 'fail|error|FAIL'   # 실패 라인
```

- **flaky 신호**(timeout·runner died·네트워크·Postgres `deadlock detected 40P01`)는 **재실행**:
  ```bash
  gh run rerun <run-id> --failed
  ```
- 단, **재실행 전 내 변경과 무관함을 확인**: `git diff --name-only origin/main...HEAD | grep '^apps/api/'` 처럼 실패 테스트가 속한 앱을 내가 안 건드렸는지 검증. 무관하면 flake, 관련 있으면 재현+수정.
- 머지 준비 = `gh pr view <N> --json mergeable,mergeStateStatus` → **`MERGEABLE/CLEAN`** + 미해결 스레드 0 + CI pass.

---

## 6. 빠른 상수 레퍼런스

| 항목 | 값 |
|---|---|
| v1 web (dev) | `localhost:3013` / `3014` |
| v1 api (dev) | `localhost:8121` (`apps/v1_api`, `pnpm dev`) |
| v1 DB | `teameet_v1_pg` :5432 · `teameet_v1_user`/`teameet_v1_password`/`teameet_v1_dev` |
| main api (dev) | `:8111` · DB `teameet_dev` :5433 (별개) |
| dev 인증 헤더 | `x-v1-user-id` · `x-v1-user-email` (← localStorage `teameet.v1.userId`/`userEmail`) |
| Copilot 요청 | `gh pr edit <N> --add-reviewer copilot-pull-request-reviewer` |
| Copilot clean | 리뷰 본문 `generated no new comments` |
| Copilot 한도 | 변경 파일 **300개** 초과 시 리뷰 불가 |
| 캡처 3폭 | mobile **390** / tablet **768** / desktop **1440** |
| 갤러리 URL | `raw.githubusercontent.com/<owner>/<repo>/<SHA>/docs/visual-qa/...` (SHA 고정) |
| CI flake | Postgres `40P01 deadlock` 등 → `gh run rerun <id> --failed` |
