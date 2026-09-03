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

- [ ] 메인 오브젝트가 하나로 읽히고, 서브는 더 작고 뒤에 있다(삼각 구도, Z축 깊이)
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

이 스킬의 원칙은 마디아 디자이너의 "토스처럼 깔끔한 상세페이지 만드는 법"(그래픽 개념·삼각 구도·공간감·빛 3요소)을 Teameet 토큰에 맞춰 고정한 것이다. 레이아웃·카피 쪽 원칙은 `landing-rhythm` 스킬에 있다.
