# alpha 실측 검증 스크립트

`verify_alpha_*.mjs` 는 **alpha 배포본을 실제 렌더해 관측**하는 회귀 확인용 스크립트다.
단위 테스트가 잡지 못하는 것 — 라우팅이 실제로 이어지는지, 링크가 404 로 죽는지,
computed style 이 요구사항을 만족하는지 — 을 잡으라고 있다.

> 이 저장소의 규율상 **로컬 `next` 서버로 검증하지 않는다.** dev 머지 = 즉시 alpha 실배포이므로
> alpha 가 ground truth 다(`CLAUDE.md` 운영 워크플로 7번). 그래서 이 스크립트들은 전부
> `https://alpha.teameet.co.kr` 을 때린다.

## 자격증명

스크립트에 **비밀번호나 토큰을 절대 적지 않는다.** 세션 쿠키만 환경변수로 넘긴다.

```bash
# 1) 로그인해서 세션 쿠키 발급 (teameet_v1_session)
#    쿠키는 stateless HMAC 이라 DB 에서 못 뽑는다 — login API 가 유일한 발급 경로다.
curl -sS -D- -o/dev/null https://alpha.teameet.co.kr/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"<계정>","password":"<비밀번호>"}' \
  | grep -i '^set-cookie: teameet_v1_session'

# 2) 값만 떼어 환경변수로
export ALPHA_SESSION_TOKEN='v1.<payload>.<signature>'
```

## 스크립트

| 파일 | 무엇을 관측하나 | 인증 |
|---|---|---|
| `verify_alpha_penalty_video_group.mjs` | 공개 화면 — 일정의 승부차기 표기(computed font-size/color 까지), 최종결과의 조별리그 경기 조회, 경기 영상 탭 | 불필요 |
| `verify_alpha_staff_full_walk.mjs` | 대회 스태프 진입 동선 — 담당 대회 목록 → 카드 클릭 → 담당 경기 목록 → 경기 콘솔. **링크를 직접 클릭해 따라가고** 4xx 요청을 모아 보고한다 | 스태프 세션 |

```bash
# 공개 화면 (기본 대상 대회는 스크립트 상단 TID 상수, 환경변수로 교체 가능)
node scripts/verify_alpha_penalty_video_group.mjs

# 스태프 동선. TARGET_TITLE 로 어느 대회 카드를 밟을지 고른다 —
# 셸 역할이 섞인 대회는 운영 보드로 가는 게 정상이라, 필드 담당자만 있는 대회를 지정해야
# 그 경로가 검증된다.
ALPHA_SESSION_TOKEN="$ALPHA_SESSION_TOKEN" TARGET_TITLE='이승민 test' \
  node scripts/verify_alpha_staff_full_walk.mjs
```

두 스크립트 모두 **mutation 을 보내지 않는다**(읽기·클릭만). 스크린샷은 `OUT_DIR`
(기본값은 각 스크립트 상단) 에 남는다.

## 배포 창을 피할 것

alpha 배포 중에는 502 가 뜬다 — 배포 창 안에서 측정하면 멀쩡한 화면을 결함으로 오진한다
(2026-08-13 실사고). 측정 전에 배포가 끝났는지 확인한다.

```bash
gh run list --workflow deploy-alpha.yml --limit 1 \
  --json headSha,status,conclusion --jq '.[0]'
# 그리고 그 SHA 가 내 머지를 포함하는지:
git merge-base --is-ancestor <내 머지 커밋> <배포 SHA> && echo "포함됨"
```
