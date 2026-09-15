---
name: agy-3d-graphic
description: Use when a Teameet screen needs an illustration or 3D graphic — landing/intro sections, empty states, action or result cards, onboarding, campaign banners — and the image will be generated with the `agy` (alias `ag`) CLI. Also use when someone asks for a "토스 같은 3D 그래픽", "빈 상태 그림", "히어로 이미지", or wants to regenerate/restyle an existing asset under apps/v1_web/public/illustrations.
---

# agy 3D 그래픽

## 개요

그래픽은 **단어가 아니라 메시지를 그린다.** "매치 없음"을 빈 표로 그리지 않고, 그 화면이 전하려는 감정(곧 경기가 열린다)을 상징 오브젝트로 그린다.
이미지는 `agy` CLI(`generate_image`)로 만들고, 이 스킬의 스크립트로 검증·변환해 레포에 넣는다. 이 절차 밖에서 만든 이미지는 레포에 넣지 않는다.

## 언제 쓰나

- 빈 상태·완료 상태·안내 카드에 아이콘 대신 그래픽을 넣을 때
- 랜딩·소개·온보딩·캠페인 섹션의 그래픽 영역을 채울 때 (레이아웃은 `landing-rhythm` 스킬)
- 기존 `public/illustrations/*` 를 다시 만들거나 톤을 맞출 때

쓰지 않는 곳: 사용자 업로드 이미지, 팀 로고, 종목 아이콘(`v1-ui/icons.tsx` SVG 유지), OG 이미지(satori 경로).

## 절차 (순서 고정)

> `Skill` 도구에 이 스킬이 안 뜨면(worktree 안에서 실행 중일 때) 이 파일과 `references/`, `scripts/` 를 직접 읽고 그대로 따른다. 절차는 같다.

1. **메시지 한 문장** — 이 화면이 사용자에게 주려는 감정을 한 문장으로 쓴다. 화면 문구를 옮겨 적는 것은 메시지가 아니다. `prompt-template.md` 의 예시와 **같은 화면**이면 그 메시지·SUBJECT 를 그대로 써도 된다. 다른 화면이면 새로 쓴다 — 예시를 "비슷하니까" 재사용하면 여러 화면이 같은 그림을 갖게 된다.
2. **오브젝트 선택** — `references/prompt-template.md` 의 상징표에서 **메인 1개 + 서브 0~2개**를 고른다. 메시지와 무관한 소품·스파클·바닥은 넣지 않는다.
3. **프롬프트 조립** — 템플릿의 *style lock* 블록을 그대로 두고 `SUBJECT` 만 바꾼다. 팔레트·조명·구도 문장은 수정하지 않는다.
4. **생성** — 스크래치패드에 1024×1024 투명 PNG 로 만든다.
   ```bash
   agy --dangerously-skip-permissions --print-timeout 6m -p "<프롬프트> Save as <절대경로>.png"
   # 타임아웃으로 끝나면 생성은 계속 진행 중이다. 같은 대화를 이어서 완료를 확인한다.
   agy --dangerously-skip-permissions -c -p "Did the image finish? Print the absolute path only."
   ```
5. **검증·변환** — 스크립트가 투명도·여백·크기를 검사하고 webp 와 매니페스트를 만든다. 실패하면 이미지를 고치지 말고 프롬프트를 고쳐 다시 생성한다.
   ```bash
   python3 .claude/skills/agy-3d-graphic/scripts/postprocess.py <src.png> <name> \
     --message "<1단계 문장>" --prompt-file <prompt.txt>
   ```
   결과: `apps/v1_web/public/illustrations/<name>-{320,640}.webp` + `manifest.json` 항목.
6. **화면에 배치** — `references/integration.md` 의 패턴으로 넣는다(빈 상태는 `EmptyState illustration` prop). 라이트·다크 두 배경에서 실제 화면을 캡처해 확인한다.
7. **육안 판정** — 아래 체크리스트를 통과해야 완료다.

## 판정 체크리스트

- [ ] 메인 오브젝트가 하나로 읽히고, 서브는 더 작고 뒤에 있다(Z축 깊이). 서브가 메인과
      비슷한 크기·거리면 공간감이 죽는다 — 면적비 2배 이상이 기준이다
- [ ] **삼각 구도는 큰 자리에만.** 빈 상태·히어로처럼 176px 이상으로 그려지는 그래픽은
      메인 1 + 서브 2 로 삼각을 만든다. 목록 썸네일(76~132px)에 쓰이는 그래픽은 오브젝트
      둘로 끝낸다 — 그 크기에서 세 개는 뭉개져 오히려 안 읽힌다
- [ ] 두께가 실제보다 도톰하다(코인은 실린더, 우산은 두툼한 패널)
- [ ] 빛 방향이 한 곳(좌상단)이고 밝은 면·어두운 면이 갈린다. 전면이 다 밝으면 실패
- [ ] 얼굴·눈·입·캐릭터·텍스트·UI 화면·바닥면이 없다
- [ ] 색은 토큰 팔레트 안이다(blue500 계열 + gold + neutral). 코랄·민트 등 새 색 없음
- [ ] 투명 배경, 다크 모드 위에서도 테두리 후광이 없다
- [ ] webp 640 이 60KB 이하

## 흔한 실수

| 실수 | 고치는 법 |
|---|---|
| 화면 문구를 그대로 그림(빈 표 + 돋보기) | 메시지 문장부터 다시 쓰고 상징표에서 고른다 |
| 오브젝트 3~4개가 같은 크기로 경쟁 | 메인 1개만 남기고 서브는 60% 이하 크기로 뒤에 |
| 모델이 얼굴·스파클·바닥을 덧붙임 | style lock 의 금지 문장이 빠졌는지 확인, 재생성 |
| 2048px 요청 | 1024 로 충분하다. 시간만 3배 든다 |
| PNG 를 그대로 커밋 | 스크립트 산출물(webp)만 커밋. 원본 PNG 는 스크래치패드 |
| 프롬프트를 남기지 않음 | 매니페스트에 자동 기록된다. 스크립트를 건너뛰지 않는다 |

## 배경

### 기존 자산 감사 (2026-09-06)

`public/illustrations` 10장을 이 체크리스트로 다시 봤다.

| 항목 | 결과 |
|---|---|
| 빛·색·실루엣·두께 (영상 06장) | **10/10 통과** — 좌상단 단일 광원, blue500+gold+neutral 안, 부드러운 그림자 |
| Z축 깊이 (영상 05장) | 분리 측정 가능한 8장 모두 면적비 2.6~10.4 배로 통과 |
| 삼각 구도 (영상 04장) | **4/10** — `auth-welcome` · `chat-empty` · `matches-empty` · `landing-hero` 가 오브젝트 3개 |

삼각이 없는 6장 중 **2장은 규칙대로고, 4장은 미결이다** (2026-09-07 재확인):

| 자산 | 오브젝트 | 렌더 크기 (실측) | 판정 |
|---|---|---|---|
| `sport-*` 4장 | 2 | 76 · 112 · 128 · 132 · **176 · 208**px | **미결** — 아래 참조 |
| `auth-notice` | 2 (나침반+콘) | `.tm-auth-illustration` **160px** (≤360px 136px) | 규칙대로 — 176px 미만 |
| `journey-done` | 2 (트로피+코인) | `.tm-empty-illustration` **160px** (≤360px 136px) | 규칙대로 — 176px 미만 |

**`sport-*` 4장이 미결인 이유** — 이 표의 앞 판(2026-09-07)은 렌더 크기를 `76~132px 썸네일`
로 적고 "작은 자리는 둘" 이라 닫았다. **그 측정이 틀렸다.** `sport-*` 는 자리가 여섯이고,
그중 둘이 삼각 기준선 176px 위다:

| 자리 | 크기 | 정의 |
|---|---|---|
| 목록 행 썸네일 | 76px | `apps/v1_web/src/app/globals.css:2757` |
| 홈 추천 스택 | 112px (≥1024 128px) | `apps/v1_web/src/app/globals.css:3077` |
| 기본 슬롯 | 132px | `apps/v1_web/src/app/globals.css:3031` |
| **매치 상세 히어로** | **176px (≥1024 208px)** | `apps/v1_web/src/app/globals.css:3136`·`3185` — 사진 없는 매치의 히어로. `apps/v1_web/src/components/matches/matches-page.tsx:319` 가 `sizes="(min-width: 1024px) 208px, 176px"` 로 그대로 요청한다 |

즉 `sport-*` 는 이 스킬이 "삼각을 만들라"고 정한 크기(176px 이상)로 **실제로 그려진다.**
다만 같은 파일이 76px 썸네일로도 쓰이므로, 삼각으로 다시 만들면 작은 자리에서 뭉갠다 —
한 파일로 두 요구를 동시에 만족시킬 수 없다. **선택지는 셋이고 어느 것도 공짜가 아니다:**

| 안 | 하는 일 | 얻는 것 | 잃는 것 |
|---|---|---|---|
| A. 현행 유지 | 아무것도 안 한다 | 작업 0, 작은 자리 가독성 유지 | 히어로에서 176/208px 을 오브젝트 둘로 채워 허전하다 |
| B. 히어로 전용 3오브젝트 판을 따로 만든다 | `sport-*-hero` 4장 추가 | 양쪽 크기 모두 규칙대로 | 자산 4장 추가 생성·검증, 소비처 분기 |
| C. 히어로에서 sport 그래픽을 안 쓴다 | 사진 없는 매치 히어로를 다른 것으로 | 규칙 충돌 자체가 사라짐 | 히어로 디자인 재설계(A·B·C 3안 필요) |

**이건 사용자 결정 사항이다** — 에이전트가 임의로 자산을 다시 만들지 않는다.

### 앞선 감사들이 틀렸던 세 가지

0. **`sport-*` 의 렌더 크기는 `76~132px` 이 아니다** (2026-09-07 판의 오류, 여기서 정정).
   `.tm-match-hero-graphic` 안에서 176px·208px 로도 그려진다 — 바로 아래 "교훈" 이 경고하는
   실수를, 그 교훈을 쓴 판이 같은 표에서 저질렀다. CSS 를 `.tm-match-sport-illustration` 하나만
   보고 파생 선택자(`.tm-match-hero-graphic .tm-match-sport-illustration`)를 안 읽은 것이 원인이다.

1. **`landing-hero` 는 원래 오브젝트 3개다.** 스톱워치 + 공 + 콘 — 매니페스트의 SUBJECT 가
   셋을 명시하고 렌더에도 셋이 있다. 공이 스톱워치 뒤에 절반쯤 가려져 있어 놓쳤다.
2. **`auth-notice` · `journey-done` 은 "큰 자리"가 아니다.** 둘 다 160px(≤360px 136px)로
   그려진다 — 이 스킬이 정한 삼각 기준선 176px 아래다. 그래서 둘로 끝내는 게 맞다.

교훈: **자산을 다시 만들기 전에 그 자산이 실제로 몇 px 로 그려지는지 CSS 에서 확인한다(이 저장소엔 `globals.css` 가 둘이다 — 배포되는 것은 `apps/v1_web/src/app/globals.css` 이고 `apps/web/` 쪽은 배포되지 않는다. 인용할 때 경로를 붙인다).**
"큰 자리 전용"은 파일 이름이나 용도 이름으로 정할 수 없다 — `apps/v1_web/src/app/globals.css` 의
`.tm-auth-illustration` · `.tm-empty-illustration` 의 `width` 를 읽어야 알 수 있다. **그리고 클래스 하나의 `width` 로
끝나지 않는다** — 같은 클래스를 감싸는 파생 선택자가 크기를 덮어쓴다. `git grep -n
'<클래스명>' apps/v1_web/src/app/globals.css` 로 **전부** 훑어 가장 큰 값을 기준으로 판정한다.

측정 한계: 알파 채널 덩어리 수는 **겹친 오브젝트를 하나로 센다** — `landing-hero` 를
2개로 잘못 센 원인이 이것이다. 개수는 육안으로 세고, 자동 측정은 면적비(깊이)에만 쓴다.

이 스킬의 원칙은 마디아 디자이너의 "토스처럼 깔끔한 상세페이지 만드는 법"(그래픽 개념·삼각 구도·공간감·빛 3요소)을 Teameet 토큰에 맞춰 고정한 것이다. 레이아웃·카피 쪽 원칙은 `landing-rhythm` 스킬에 있다.
