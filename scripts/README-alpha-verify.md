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
| `capture_alpha_league_audit.mjs` | 정규 리그 화면 — 📱390/📲768/🖥1440 3폭 캡처 + **DOM computed 진단**(가로 오버플로, 표의 scrollWidth/clientWidth, 44px 터치 타겟, 콘솔 에러, 4xx/5xx). `TARGET_SET=main\|series\|extra\|fixture\|dark\|wave4` 로 대상 세트 선택 | 팀장·운영자 |
| `verify_alpha_league_theme_badges.mjs` | 다크 모드(`localStorage 'tm-theme'`) 강제 전환 + 배지 형제 높이 실측. `LEAGUE_IDS` 로 대상 지정 | 불필요 |
| `verify_alpha_league_e2e.mjs` | **리그 운영 전 구간** — 체계 생성 → 시즌 시딩 → 대진 → 몰수 → 승강 preview → commit → 다음 시즌. `STRICT_PICKER=1` 이면 드롭다운이 안 열릴 때 `C-0 미해결` 로 던진다(= 통과 자체가 회귀 증거) | 운영자 |
| `verify_alpha_league_notifications.mjs` | 대진 배정 알림 1종 — 팀장 알림의 **id 차집합**으로 판정 | 운영자+팀장 |
| `verify_alpha_league_notifications_full.mjs` | 알림 3종 전수 — ① 대진 배정 ② 결과 공식 확정 ③ 승격·강등 확정. `SERIES_ID` 를 주면 기존 시리즈를 재사용한다 | 운영자+팀장 |
| `capture-record-consent-screens.mjs` | 기록 공개 설정 화면 — 알림 착지(`?from=tournament`, 맥락 배너 있음) / 파라미터 없는 기본 화면 / 홈 넛지 배너를 3폭 캡처. 캡처 전에 `GET /me/record-consent` 를 찍어 **배너가 안 뜬 이유를 서버 응답으로 남긴다**(스크린샷만 보고 추측하지 않기 위해) | 선수 |
| `capture-claim-my-record.mjs` | 자가 신원 연결 — 경기 상세의 배너와 **모달을 실제로 열어** 3폭 캡처. 후보 0명/N명 두 상태를 각각 찍으라고 만든 것이다(`FIXTURE_ID` 를 바꿔 가며) | 참가팀 멤버 |
| `capture-public-profile.mjs` | 공개 프로필 + 공개 활동 기록 3폭 캡처. `TARGET_USER_ID` 로 대상 지정 | 선수(타인 프로필도 가능) |
| `capture-my-player-card.mjs` | 마이페이지의 **내 선수 카드** 3폭 캡처. `.tm-player-card` 존재 여부를 함께 판정한다 — 카드가 숨김·로딩·실패로 사라져도 화면은 200 이라 스크린샷만으로는 구분되지 않는다 | 본인 |
| `verify-alpha-league-result-flow.mjs` | 리그 결과가 **순위표까지 닿는지** 릴레이 전체(홈팀 작성·제출 → 원정팀 승인 → 공개 순위표 반영)를 밟는다. 각 칸의 유닛 테스트가 전부 통과하는 동안 릴레이가 통째로 끊겨 있던 적이 있어서(2026-08-24 원정팀이 승인 화면에 진입 불가) 이어짐 자체를 본다. `--dry` 는 게이트 값과 순위표만 읽는다 | 홈팀장+원정팀장 |
| `verify-alpha-result-official-notify.mjs` | 대회 결과 확정 알림(회고 REACH-4)이 **팀장에게 실제로 도착하는지** 전 구간을 밟는다: 예정 픽스처의 라인업 저장·제출 → start → end → SUBMITTED 리비전 officialize(previewHash 클라이언트 재구성) → 팀장 계정 알림 폴링. LINEUP-2 이후 라인업 save/submit 의 expectedVersion 은 **사이드별 라인업 버전**이다(게임 버전 아님 — 409 의 details.currentVersion 으로 1회 재시도해 흡수) | 관리자+팀장 |
| `verify-alpha-og-card.mjs` | 선수 카드 OG 이미지가 **사용자별로 다른 그림**인지 판정. 여러 id 의 응답 바이트를 sha 로 비교해 전원이 같은 폴백을 받는 상태를 잡는다 — HTTP 200·PNG 까지는 통과하므로 상태코드만 보면 못 잡는다 | 불필요 |
| `capture-league-fixture-record.mjs` | 리그 경기 상세의 **대회 패리티 본문**(스코어·정정 배지·경기 기록·정정 이력) — 기록 API(`.../fixtures/:id/record`)의 round/scoreStatus/videos 를 먼저 찍고 예정·완료 경기를 3폭 캡처. `LEAGUE_HINT` 로 대상 리그 지정 | 불필요 |
| `verify-alpha-league-video.mjs` | 리그 경기 영상 **전 구간 릴레이**: 어드민 목록(주차 라벨) → 링크 등록(재실행 시 중복 건너뜀) → 공개 기록 `videos` 반영 → 경기 상세·어드민 화면 캡처. 라우트가 모듈에 등록 안 된 채 배포돼 전부 404 였던 실사고(#755)를 잡으라고 있다 | 플랫폼 관리자 |
| `verify-alpha-league-claim.mjs` | "내 기록 연결(claim)" 리그 확장(#770) 실측: 비인증 401 → 참가팀 멤버 목록 200(`gameId/version/participants` 계약) → **다른 리그 id 교차 조회 404**(스코프 게이트) → 경기 상세 배너 3폭 + 모달 캡처. 계정이 참가팀 멤버인 기록 공개 대진을 자동 탐색한다 | 참가팀 멤버 |
| `verify-alpha-identity-attest.mjs` | 기록 연결 **승인(attest) 전 구간 릴레이**(#774): 팀원 신청 → 확인자 승인함 노출 → 인앱 알림 도착(딥링크는 목록 응답의 `target.route`) → 알림 딥링크 착지(리그 대진은 `/team-matches/:id` 가 리그 상세로 redirect — 브라우저 최종 URL로 판정) → 승인 카드 3폭 캡처 → **거절로 종결**(approve 는 실제 연결을 만들므로 실측 잔여물을 남기지 않는다). 승인 자격은 참가자 사이드 팀 리더에게만 있는데 사이드↔팀 매핑을 공개 API 로 알 수 없어, **양 팀 리더를 받아** 요청을 1건만 만들고 그 요청이 보이는 쪽을 확인자로 삼는다(pending 은 취소 수단이 없어 자격 밖 사이드에 만들면 24h 잔여물이 된다). 캡처 컨텍스트에 로컬 세션 힌트(`teameet.v1.session`)를 심어야 승인함이 조회된다 | 팀원 + 양 팀 리더 3계정 |
| `verify-alpha-motion.mjs` | 모션 변경(탭바·탭 크로스페이드·시트 퇴장·토스트 퇴장)이 alpha 에 **실제로 실렸는지** computed 값으로 판정. 스크린샷으로는 확인되지 않는다 — 움직임은 프레임 *사이*에 있고 끝난 상태는 변경 전과 픽셀 단위로 같다. 진입/퇴장 **방향**(normal vs reverse)까지 본다 | 불필요 |
| `verify-alpha-tablet-blue.mjs` | 태블릿 2열 레이아웃과 브랜드 파랑 단일화를 값으로 판정. 열 수는 카드의 **실제 좌표**로 세고(뷰포트 폭으로 세면 격자 폭과 어긋나 1열인데 2열로 읽는다), 색은 유틸·토큰·투명도 변형이 모두 같은 값인지 본다 — 두 파랑은 육안으로 구분되지 않는다 | 불필요 |
| `wait-alpha-serves-commit.mjs` | alpha 의 `x-teameet-commit` 이 지정 커밋을 **조상으로 포함**할 때까지 대기 — 배포 창(502·구 에셋)에서 측정해 멀쩡한 화면을 결함으로 오진하는 것을 막는 실측 전 게이트. `node scripts/wait-alpha-serves-commit.mjs <commit> [maxPolls] [intervalMs]` | 불필요 |

```bash
# 공개 화면 (기본 대상 대회는 스크립트 상단 TID 상수, 환경변수로 교체 가능)
node scripts/verify_alpha_penalty_video_group.mjs

# 스태프 동선. TARGET_TITLE 로 어느 대회 카드를 밟을지 고른다 —
# 셸 역할이 섞인 대회는 운영 보드로 가는 게 정상이라, 필드 담당자만 있는 대회를 지정해야
# 그 경로가 검증된다.
ALPHA_SESSION_TOKEN="$ALPHA_SESSION_TOKEN" TARGET_TITLE='이승민 test' \
  node scripts/verify_alpha_staff_full_walk.mjs
```

```bash
# 정규 리그 캡처 — 계정은 환경변수로만 넘긴다(스크립트에 리터럴로 적지 않는다).
ALPHA_PASSWORD="$ALPHA_PASSWORD" ALPHA_CAPTAIN_EMAIL='<팀장 계정>' \
  TARGET_SET=main node scripts/capture_alpha_league_audit.mjs

# 다크 캡처. v1_web 은 OS 다크모드를 무시하므로 스크립트가 localStorage 'tm-theme' 를 심는다.
LEAGUE_IDS='{"tier":"<리그 id>"}' TARGET_SET=dark \
  node scripts/capture_alpha_league_audit.mjs

# 리그 운영 전 구간. STRICT_PICKER=1 은 우회 없이 실패시키는 모드다.
ALPHA_PASSWORD="$ALPHA_PASSWORD" ALPHA_ADMIN_EMAIL='<운영자 계정>' \
  STRICT_PICKER=1 node scripts/verify_alpha_league_e2e.mjs

# 알림 3종. 두 번째부터는 SERIES_ID 로 같은 시리즈를 재사용한다.
ALPHA_PASSWORD="$ALPHA_PASSWORD" ALPHA_ADMIN_EMAIL='<운영자>' ALPHA_CAPTAIN_EMAIL='<팀장>' \
  SERIES_ID='<앞서 만든 시리즈 id>' node scripts/verify_alpha_league_notifications_full.mjs
```

> 위 세 개(`capture-record-consent-*`, `capture-claim-*`, `capture-public-profile`)는 Task 154
> 에서 만든 것이고, 셋 다 **각 캡처의 `httpStatus` 를 찍는다.** alpha 는 짧은 시간에 캡처를
> 몰면 전면 403(약 1분)을 거는데, 상태코드를 안 남기면 403 페이지를 정상 화면으로 착각해
> 저장하고 그걸로 "검증 완료" 라고 보고하게 된다(실제로 41장을 통째로 날린 적이 있다).

### mutation 을 보내는가

**읽기 전용** — `verify_alpha_penalty_video_group.mjs`, `verify_alpha_staff_full_walk.mjs`,
`capture_alpha_league_audit.mjs`, `verify_alpha_league_theme_badges.mjs`.
클릭·캡처만 하므로 몇 번을 돌려도 alpha 데이터가 변하지 않는다.

**쓰기 있음** — `verify_alpha_league_e2e.mjs`, `verify_alpha_league_notifications*.mjs`.
alpha 에 `(테스트) …` 로 시작하는 리그 체계·시즌·대진을 **실제로 만든다.** 리그 상태 전이는
운영자 경로를 그대로 밟아야만 재현되기 때문에 읽기만으로는 검증이 불가능하다. 대신:

- 만드는 것은 전부 `(테스트)` 접두사를 달아 실제 운영 데이터와 구분한다.
- 알림 스크립트는 `SERIES_ID` 를 받아 **이미 만든 시리즈를 재사용**한다 — 재실행이 데이터를
  계속 불리지 않게 하려는 것이니, 재현 시엔 새로 만들지 말고 이 환경변수를 쓴다.
- 지우지는 않는다. 정리는 운영자 판단이라 스크립트가 임의로 삭제하지 않는다.

스크린샷은 `OUT_DIR`(기본값은 각 스크립트 상단) 에 남는다.

## 배포 창을 피할 것

alpha 배포 중에는 502 가 뜬다 — 배포 창 안에서 측정하면 멀쩡한 화면을 결함으로 오진한다
(2026-08-13 실사고). 측정 전에 배포가 끝났는지 확인한다.

```bash
gh run list --workflow deploy-alpha.yml --limit 1 \
  --json headSha,status,conclusion --jq '.[0]'
# 그리고 그 SHA 가 내 머지를 포함하는지:
git merge-base --is-ancestor <내 머지 커밋> <배포 SHA> && echo "포함됨"
```
