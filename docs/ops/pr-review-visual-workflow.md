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

- 폴링은 `run_in_background`로 띄우고 task-notification으로 회수(foreground `sleep`은 블록됨).
- ⚠️ **이 count 증분은 "뭔가 왔다" 는 힌트다. 도착 확정·clean 판정은 §2.2-a의 5게이트로 한다** —
  스레드에 답해도 리뷰 수가 오르고, 기준선을 push 직후 재면 그 리뷰가 기준선에 삼켜진다.
- ⚠️ **count 폴링은 위 `gh pr view --json reviews --jq` 방식 사용**(REST count). 인라인 GraphQL을 루프 안에 넣으면 한 줄 쿼리의 **중괄호 불균형**(`query{repository{pullRequest{reviews{totalCount}}}}` 은 닫는 `}` 4개 필요)으로 매 회차 파싱 실패가 조용히 누적돼 새 리뷰를 못 잡는다(실측 함정). GraphQL 직접 호출 시엔 열고 닫는 `{`/`}` 개수를 반드시 맞출 것.

### 2.2-a clean 판정 — **다섯 개를 다 봐야 한다**

`Comments generated: 0 new` **하나로 판정하지 마라.** 2026-08-31 `#876`·`#881` 두 PR에서
**네 건의 실재 지적이 그 한 조건을 통과**했다. 셋은 요약 문장의 범위 오류였고 하나는
suppressed 블록이었다.

| # | 게이트 | 빠뜨리면 무슨 일이 나나 |
|---|---|---|
| 1 | 작성자가 Copilot인가 | **스레드에 답하면 리뷰 수가 오른다** — GitHub이 답변도 review 레코드로 만든다. 내 답변을 상대의 재리뷰로 읽는다(5→7을 그렇게 읽을 뻔했다) |
| 2 | 제출시각 > head 커밋 시각 | 리뷰가 있어도 **이전 커밋을 본 것**이면 아직 안 본 것이다 |
| 3 | `Comments generated: 0` | — |
| 4 | `Suppressed comments` 블록 없음(또는 열어서 확인) | **스레드를 안 만들고 새 코멘트도 아니다** → ③·⑤를 **둘 다 통과한다.** 실재 지적이 그대로 통과한 사례가 있다 |
| 5 | 미해결 스레드 0 | 내가 방금 resolve해도 0이 된다 — 단독으로는 clean의 근거가 아니다 |

**③+⑤만 보면 안 된다.** `0 new`는 *"지적이 없다"*가 아니라 *"새 코멘트가 없다"*다.
suppressed 블록은 그 둘 사이로 빠져나간다.

> **한 줄로 다 하지 않는다.** 예전엔 다섯을 하나의 `jq` 로 합쳤는데, 리뷰 세 라운드가
> **전부 그 합치는 부분**을 지적했다(상한·순서·정규식·fail-open). **표와 함정은 지적 0건이었다.**
> 집계가 문제지 조회가 아니다 — 게이트마다 한 줄이면 틀릴 자리가 없다.
> 편의가 필요하면 스크립트로 옮긴다: **문서에 실린 명령은 CI 가 안 보지만 스크립트는 본다.**

**게이트 1·2 — 최신 Copilot 리뷰의 제출시각을 head 와 나란히 본다**
```bash
gh api graphql -f query='{repository(owner:"<owner>",name:"<repo>"){pullRequest(number:<N>){
  commits(last:1){nodes{commit{committedDate}}}
  reviews(last:100){nodes{author{login} submittedAt}}}}}' \
  --jq '.data.repository.pullRequest
    | "head  \(.commits.nodes[0].commit.committedDate)",
      "리뷰  " + (([.reviews.nodes[]|select(.author.login=="copilot-pull-request-reviewer")]
                   |max_by(.submittedAt)|.submittedAt) // "없음 — Copilot 리뷰가 아직 0건이다")'
```
**리뷰 시각이 head 보다 뒤여야** 그 리뷰가 지금 상태를 본 것이다. `last:100`·`max_by` 인 이유는
아래 ②-b 참고. "없음" 이면 아직 판정할 것이 없다(통과가 아니다).

**게이트 3·4 — 본문을 파일로 받아 두 줄을 grep. 값에 정규식을 걸지 않는다**
```bash
gh api graphql -f query='{repository(owner:"<owner>",name:"<repo>"){pullRequest(number:<N>){
  reviews(last:100){nodes{author{login} submittedAt body}}}}}' \
  --jq '[.data.repository.pullRequest.reviews.nodes[]
         |select(.author.login=="copilot-pull-request-reviewer")]|max_by(.submittedAt)|(.body // empty)' > /tmp/rv.md
[ -s /tmp/rv.md ] || echo "리뷰가 0건이다 (형식 문제가 아니다)"
grep -nE '^[[:space:]]*[-*][[:space:]]+\*\*Comments generated|Suppressed comments' /tmp/rv.md
```
**grep 이 빈 결과여도 통과가 아니다.** 두 경우를 먼저 가른다 — **파일이 비었으면 리뷰가 0건**,
**비지 않았는데 안 잡히면 형식이 바뀐 것**이다. 어느 쪽이든 본문을 직접 연다.

> 폴백은 반드시 **`// empty`** 다. 실측(jq 1.7.1)으로 셋이 갈린다:
> ```
> 폴백 없음     파일에 문자열 `null` 5바이트   → 구분 자체가 안 된다
> // ""        개행 1바이트                  → `-s` 도 `wc -c == 0` 도 "비었다"로 안 본다
> // empty     0바이트                       → `[ -s ]` 로 정확히 갈린다  ✅
> ```
`Suppressed comments` 가 잡히면 **반드시 펼쳐 읽는다**(스레드를 안 만들어 게이트 5에 안 잡힌다).

**게이트 5 — 미해결 수는 "받은 수 / 전체 수" 와 함께 본다**
```bash
gh api graphql -f query='{repository(owner:"<owner>",name:"<repo>"){pullRequest(number:<N>){
  reviewThreads(first:100){totalCount nodes{isResolved}}}}}' \
  --jq '.data.repository.pullRequest.reviewThreads
    | "받은 \(.nodes|length) / 전체 \(.totalCount) · 미해결 \([.nodes[]|select(.isResolved==false)]|length)"'
```
**"받은" 과 "전체" 가 다르면 그 미해결 수는 못 믿는다** — 잘린 것이고 **판정 불가**다.
잘린 채 "0건" 을 읽으면 게이트 5를 통과한 것으로 오독한다.

#### 도착 감지·판정의 함정 넷 — 넷 다 실제로 밟았다

**① 개수 증분은 *힌트*지 판정이 아니다.** §2.2의 count 폴링은 "뭔가 왔다" 를 알리는 용도로
그대로 써도 된다 — 다만 **도착 확정은 게이트 2(제출시각 > head)**, **clean 판정은 5게이트 전부**다.
개수만 믿으면 이렇게 깨진다: 워처를 push 직후 걸면서 기준선을 *그 순간* 재면,
감시하려는 리뷰가 기준선에 삼켜진다(4초 만에 도착해 `6 > 6`이 성립 안 했다). 게다가
**조용히** 실패해서 "아직 안 왔다"로 읽힌다. **시각 비교(게이트 2)로 판정하면 기준선이
없으므로 이 경합 자체가 없다.**

**② 빈 결과는 0이 아니다.** `grep` 이 아무것도 못 찾으면 출력이 없다 — 그걸 `0`으로 읽으면
**지적이 있는 리뷰를 통과로 읽는다.** 비면 통과가 아니라 **형식이 바뀐 것**으로 보고 본문을 연다.

그리고 **본문 값에 jq 정규식을 걸지 않는 이유**가 여기 있다(실측, jq 1.7.1):
```
매칭 실패      값을 안 낸다(empty). `// "폴백"` 이 받아 준다 — 에러는 아니다
입력이 null    ❌ rc=5 로 종료: "null (null) cannot be matched, as it is not a string"
               **단 이건 null 에 `capture`/`test` 같은 정규식을 적용할 때다.**
               위 게이트 3·4 는 `.body` 를 파일로 내보낼 뿐이라 여기 안 걸린다(rc=0) —
               대신 파일에 `null` 이 들어가므로 `// ""` 로 받아 **빈 파일**이 되게 한다
```
`//` 는 매칭 실패는 막아도 **null 입력은 못 막는다.** 그래서 게이트 3·4 는 본문을 파일로 받아
`grep` 하고, 게이트 1·2 는 리뷰가 없을 때를 **`// "없음 …"`** 으로 이름 붙여 찍는다.

> 잡을 때는 **불릿 형태**(`- **Comments generated:**`)로 좁힌다 — suppressed 블록이 지적 본문에서
> 그 문구를 **인용**할 수 있어서(이 PR 에서 실제로 그렇게 잡혔다) 요약 줄 대신 남의 문장을 읽는다.

**②-b 위 조회들이 왜 그 형태인가** (Copilot #884 suppressed 지적에서 나왔다):
```
reviews(last:100)          first:100 은 리뷰가 100개를 넘으면 **오래된 쪽**을 가져와
                           최신 리뷰를 놓친다. last 로 최신 쪽을 받는다
max_by(.submittedAt)       **최신 리뷰를 제출시각으로 고른다.** 예전엔 `| last` 였는데 그건
                           반환 순서를 가정한다(이 저장소에선 시간순이었지만 보장은 없다)
reviewThreads totalCount    **받은 수와 전체 수를 같이 찍는다.** 다르면 잘린 것이고 그 미해결
                           수는 못 믿는다 — **판정 불가이지 통과가 아니다.** 게이트 5는 0이어야
                           의미가 있어서, 잘린 채 "0건" 만 보면 통과 쪽으로 오판한다.
                           숫자를 숨기지 않고 분모를 함께 보여 읽는 사람이 갈리게 한다
```

**③ `git log --date=format:` 은 TZ를 무시한다.** `submittedAt`은 UTC인데 커밋 시각을
KST로 뽑아 `Z`를 붙이면 기준이 **9시간 미래**가 되어 어떤 리뷰도 통과하지 못한다.
```bash
TZ=UTC git log -1 --format=%cd --date=format:'%Y-%m-%dT%H:%M:%SZ'        # ❌ 로컬시각에 Z만 붙는다
TZ=UTC git log -1 --format=%cd --date=format-local:'%Y-%m-%dT%H:%M:%SZ'  # ✅ 실제 UTC
```

**④ 일반형 — 시각을 *만들지* 말고 *받아* 써라.** ①③과 셸 비교 문제(`[ "$a" \> "$b" ]`는
zsh에서 `condition expected: >`로 실패한다)는 전부 **두 시각을 서로 다른 출처·형식에서
얻어 맞추려 한** 결과다. 그 맞추는 과정이 곧 버그가 된다.
```
❌  GitHub의 submittedAt(UTC) ↔ 로컬 git의 커밋시각(KST)을 셸에서 변환·비교
✅  둘 다 GitHub API에서 받는다 — submittedAt과 commit.committedDate는 모두 UTC ISO-8601
    비교도 셸이 아니라 jq 안에서:  select(.submittedAt > $head)
```
**같은 출처·같은 형식이면 변환이 없고, 변환이 없으면 변환 버그도 없다.**

### 2.3 미해결 스레드 조회

```bash
gh api graphql -f query='
query { repository(owner:"<owner>", name:"<repo>") {
  pullRequest(number:<N>) { reviewThreads(first:100) {
    nodes { id isResolved path line originalLine comments(first:1){nodes{author{login} body}} } } } } }' > /tmp/threads.json
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

4. 미해결 0 확인 → §2.1 재요청 → §2.2 폴링. **§2.2-a 의 5게이트를 다 만족할 때까지 반복.**
   (`Comments generated: 0` 하나로 끝내지 않는다 — **suppressed 블록 없음**과 **제출시각 > head** 가 함께 필요하다.)

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

### 3.5 라이브 시각 검증 (commit 전) + PR 첨부 필수 (예외 없음)

- 레이아웃/마크업/CSS 변경은 commit·완료 보고 전 **Playwright로 실제 화면을 직접 보고** 검증(요소 존재/부재만으론 정렬·균형을 못 잡음).
- 비시각 변경(a11y aria·로직·타이머)은 `tsc` + 테스트로 충분.
- **UI 변경이 포함된 PR은 §3.4 갤러리 코멘트(📱mobile 390/📲tablet 768/🖥desktop 1440) 첨부가 완료의 필수 조건이다.** "라이브로 확인은 했지만 PR엔 안 올림"은 미완료 취급 — 코드 리뷰가 아닌 팀원도 PR만 보고 화면을 판단할 수 있어야 한다. PR을 이미 올린 뒤 UI 변경 사실을 뒤늦게 인지했을 때도 같은 PR에 갤러리 코멘트를 추가로 게시해 채운다.

---

### 3.6 네이티브 앱 셸 (`apps/v1_ios`, `apps/v1_android`) — 웹 3폭 대신 기기 2종 × 테마

위 3폭(📱390 / 📲768 / 🖥1440)은 브라우저 폭 규약이다. 네이티브 셸 PR은 브라우저 폭이 아니라
**기기 클래스와 시스템 테마**가 변수이므로 규약이 다르다.

| 축 | 최소 조합 |
|---|---|
| 기기 | 작은 화면 1종(iPhone 17e 급) + 큰 화면 1종(iPhone 17 Pro Max 급) |
| 테마 | light + dark |

즉 **4장**이 최소다. 셸이 화면을 그리지 않으므로 캡처 대상은 웹 화면이지만, 확인하려는 것은
웹 레이아웃이 아니라 **셸이 웹에 준 값이 맞는지**다:

- 하단 안전영역 — 셸이 주입하는 `--teameet-native-safe-bottom` / `--v1-shell-safe-bottom`이
  홈 인디케이터를 피하는가. 웹에는 `viewport-fit=cover`가 없어 `env(safe-area-inset-bottom)`이
  0이므로, 이 주입이 없으면 하단 내비가 인디케이터에 깔린다 — **주입이 load-bearing이다.**
- 상단 — 상태바와 헤더가 겹치지 않는가.
- 다크 모드 — 셸의 배경(웹 로드 전·에러 화면)이 시스템 테마를 따르는가. 로드 중 흰 화면이
  번쩍이면 여기서 잡힌다.

```bash
# 테마와 글자 크기는 시뮬레이터에 직접 지시한다
xcrun simctl ui <UDID> appearance dark
xcrun simctl ui <UDID> content_size accessibility-extra-large
xcrun simctl io <UDID> screenshot shot.png
```

**`shutdown all` 같은 all-scope 명령은 쓰지 않는다.** 이 저장소는 여러 세션이 각자 시뮬레이터를
띄우므로 남의 기기를 내린다. 기기는 항상 UDID로 지정한다.

푸시·권한·딥링크가 걸린 변경이면 스크린샷만으로는 부족하다 —
`scripts/ios/verify-push-slice.sh`가 권한 프롬프트·행 상태·알림 탭 착지를 실제로 밟는다.
**그 결과 번들(`*.xcresult`)에는 테스트 계정 비밀번호가 평문으로 남으므로 PR에 첨부하지
않는다.** 첨부는 거기서 추출한 스크린샷만 한다.

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
| Copilot clean | **5게이트**(작성자·제출시각>head·`Comments generated: 0`·suppressed 없음·미해결 0) — §2.2-a. `0 new` 하나로 판정하지 말 것 |
| Copilot 한도 | 변경 파일 **300개** 초과 시 리뷰 불가 |
| 캡처 3폭 | mobile **390** / tablet **768** / desktop **1440** |
| 갤러리 URL | `raw.githubusercontent.com/<owner>/<repo>/<SHA>/docs/visual-qa/...` (SHA 고정) |
| CI flake | Postgres `40P01 deadlock` 등 → `gh run rerun <id> --failed` |
