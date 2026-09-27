# Task 40 — Restrained Mobile Chrome Realignment

> Historical implementation record. Canonical rules live in `DESIGN.md`, document navigation lives in `docs/DESIGN_DOCUMENT_MAP.md`, and this file remains execution history only.

Owner: codex -> frontend-dev -> review/design/qa/docs
Date drafted: 2026-04-11
Status: Implemented with cross-breakpoint audit
Baseline commit: `9ba813a25a349f4d60a1b5412ed8c90a455beb68` (`2026-04-06 14:27:18 +0900`)

## Execution Result

Executed on: 2026-04-11

Implemented files:

- `apps/web/src/app/globals.css`
- `apps/web/src/app/(main)/layout.tsx`
- `apps/web/src/components/landing/landing-nav.tsx`
- `apps/web/src/components/layout/bottom-nav.tsx`
- `apps/web/src/app/(main)/home/home-client.tsx`
- `apps/web/src/app/(main)/matches/matches-client.tsx`
- `apps/web/src/app/(main)/teams/teams-client.tsx`
- `apps/web/src/app/(main)/marketplace/page.tsx`
- `apps/web/src/app/(main)/mercenary/page.tsx`
- `apps/web/src/app/(main)/lessons/page.tsx`
- `apps/web/src/app/(main)/venues/page.tsx`
- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/settings/page.tsx`
- `apps/web/src/app/(main)/settings/settings-client.tsx`

What changed:

- mobile shell background, glass token, bottom nav pill, landing nav tone를 baseline 쪽으로 되돌렸다.
- root pages는 `solid-first top section + solid search/filter/content` 리듬으로 재정렬했다.
- `/home`은 top glass chip/panel을 걷어내고 plain greeting, solid schedule panel, restrained quick chips로 정리했다.
- `/profile`, `/settings`는 header chrome만 남기고 body card를 다시 solid card language로 맞췄다.
- `profile`는 추가 2차 패스로 utility page density를 재조정했다.
  - `MobilePageTopZone` 대신 `MobileGlassHeader`로 교체
  - summary card를 더 compact하게 축소
  - sport profile row를 two-line compact row로 재배치
  - upcoming schedule의 중복 mobile horizontal inset 제거
  - chat / notification entry를 segmented utility strip으로 정리
  - grouped menu surface를 lighter container로 완화

Validation:

- `pnpm --filter web exec tsc --noEmit` ✅
- `pnpm --filter web test` ✅ `33 files / 282 tests`
- `pnpm --filter web lint` ✅ 현재 설정상 `tsc --noEmit` 위임 메시지 확인
- `pnpm --filter web build` ⚠️ Next compile/static generation은 완료됐지만 마지막 trace 단계에서 `ENOENT: .next/server/app/_not-found/page.js.nft.json` 로컬 artifact race가 재발
- visual smoke ✅ 아래 breakpoints/route 캡처 확인
  - mobile `390x844`: `/landing`, `/home`, `/matches`, `/profile`, `/settings`
  - tablet `820~834w`: `/home`, `/profile`
  - desktop `1440w`: `/profile`, `/settings`, `/matches`

Remaining follow-up:

- detail/media overlay 계열의 one-off `backdrop-blur-sm`는 이번 task 범위에서 전면 정리하지 않았다.
- build caveat은 이번 UI 변경보다는 기존 로컬 `.next` artifact race 성격으로 기록한다.
- `notifications`, `chat`, `reviews`는 현재 utility contract와 충돌하는 blocker는 없지만, 후속 task에서 section density를 더 미세 조정할 여지는 있다.

## 2026-04-11 Audit Extension

사용자 피드백 이후 추가로 `1주일 전 baseline vs 현재`를 다시 대조했고, 기준선은 계속 `9ba813a`로 유지했다.

재감사 결론:

- `/home`, `/matches`, `landing shell`은 현재 restrained chrome 방향이 baseline보다 과하지 않고 유지 가치가 높다.
- 가장 크게 드리프트했던 화면은 `/profile`이었다.
- 문제의 본질은 glass 양보다 `카드 크기`, `중첩 radius`, `utility page에 맞지 않는 hero-like top zone`, `다가오는 일정의 중복 패딩`이었다.
- `settings`는 utility reference로 쓸 만했고, `profile`을 이 언어에 더 가깝게 끌어오는 쪽이 맞았다.

이번 확장 패스는 root/discovery 전체를 다시 뒤엎지 않고, `profile` 중심으로 utility rhythm을 재정렬하는 것으로 마감했다.

## Why This Task Exists

사용자 의도는 "모바일 전체를 glass처럼 보이게" 하는 것이 아니었다.

원한 방향은 다음에 더 가깝다:

- 5일 전 GitHub에 올라간 더 깔끔하고 평평한 기본 테마
- Apple처럼 restraint가 있는 frosted chrome
- glass는 `navbar`, `sticky header`, 일부 `panel frame` 정도에만 제한
- 본문 카드와 화면 구조는 Toss처럼 정돈되고 읽기 쉬운 상태 유지

이번 task는 직전 glass rollout을 그대로 확장하는 작업이 아니다.
오히려 과하게 올라간 glass 강도와 적용 범위를 다시 줄여, baseline design language를 회복하는 정렬 작업이다.

## Baseline Reference

기준선은 `2026-04-06 14:27:18 +0900`의 commit `9ba813a`다.

그 시점의 특징:

- `main` mobile shell은 flat white base 위에 가벼운 shadow만 있었다.
- `bottom nav`는 floating capsule이지만 내부 item은 단순했다.
- `landing nav`는 scroll/open 상태에서만 blur가 있었고, 평소에는 가벼웠다.
- `/home` 상단은 plain header + solid section 흐름이었다.
- glass가 theme language 전체를 잡아먹지 않았다.

## Current Drift

현재 상태에서 baseline 대비 과하게 이동한 축은 아래와 같다.

1. `apps/web/src/app/globals.css`
   - shell atmosphere, glass panel, glass chip, heavy shadow, radial glow가 강하다.
   - glass가 component accent가 아니라 theme base처럼 읽힌다.

2. `apps/web/src/app/(main)/layout.tsx`
   - 모바일 shell 자체가 떠 있는 유리 앱처럼 보인다.
   - 본문이 아니라 container 전체가 스타일 statement가 되었다.

3. `apps/web/src/components/layout/mobile-page-top-zone.tsx`
   - root page 상단을 광범위하게 glass card로 통일했다.
   - 결과적으로 `/home`, `/matches`, `/teams`, `/lessons`, `/marketplace`, `/mercenary`, `/venues`, `/profile`이 모두 같은 “floating card intro”를 갖게 됐다.

4. `apps/web/src/app/(main)/home/home-client.tsx`
   - 홈 상단이 정보 구조보다 card styling이 먼저 읽힌다.
   - quick explore strip과 top zone까지 glass가 퍼지면서 baseline의 clean density가 약해졌다.

5. `apps/web/src/components/landing/landing-nav.tsx`
   - 모바일 nav와 mobile menu가 baseline보다 더 frosted하고 무겁다.

## Core Design Decision

이번 task의 방향은 아래 한 줄로 고정한다.

`solid canvas + restrained frosted chrome`

설명:

- canvas: 평평하고 밝은 본문 배경
- chrome: bottom nav, sticky header, 일부 얇은 frame
- restrained: blur/opacity/shadow를 모두 낮춘다

## Non-Negotiable Rules

1. glass는 모바일 고정 chrome에만 우선 적용한다.
2. dense content card, feed/list row, 폼 본문, 거래형 카드에는 glass를 넣지 않는다.
3. root page 상단을 모두 glass hero card로 통일하지 않는다.
4. shadow는 깊이감 보조 수준만 허용한다. 스타일의 주인공이 되면 안 된다.
5. gradient와 radial glow는 shell 전체 분위기를 바꾸지 않을 정도로만 사용하거나 제거한다.
6. dark mode에서도 대비를 유지해야 한다.
7. baseline commit보다 더 “화려해진” 요소가 보이면 이번 task 방향과 충돌로 본다.

## Visual North Star

### Keep

- floating bottom nav capsule
- sticky mobile header의 얇은 frosted 처리
- 일부 CTA panel의 subtle glass frame
- active state의 blue accent

### Reduce

- shell 배경 글로우
- glass card 남발
- rounded panel의 과한 그림자
- glass chip 과다 사용
- 상단 page intro card 일괄 도입

### Restore

- flat white / gray base
- plain section rhythm
- clear information hierarchy
- text-first layout

## Scope

### Core system

- `apps/web/src/app/globals.css`
- `apps/web/src/components/layout/mobile-glass-header.tsx`
- `apps/web/src/components/layout/mobile-page-top-zone.tsx`
- `apps/web/src/components/layout/bottom-nav.tsx`
- `apps/web/src/app/(main)/layout.tsx`
- `apps/web/src/components/landing/landing-nav.tsx`

### Reference pages

- `apps/web/src/app/(main)/home/home-client.tsx`
- `apps/web/src/app/(main)/matches/matches-client.tsx`
- `apps/web/src/app/(main)/teams/teams-client.tsx`
- `apps/web/src/app/(main)/marketplace/page.tsx`
- `apps/web/src/app/(main)/mercenary/page.tsx`
- `apps/web/src/app/(main)/lessons/page.tsx`
- `apps/web/src/app/(main)/venues/page.tsx`
- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/settings/page.tsx`
- `apps/web/src/app/(main)/notifications/page.tsx`
- `apps/web/src/app/(main)/chat/page.tsx`
- `apps/web/src/app/(main)/reviews/page.tsx`

### Optional second sweep if needed

- detail / edit pages already migrated to `MobileGlassHeader`
- shared chips or section wrappers that still read as over-glassed

## Out Of Scope

- desktop redesign
- admin redesign
- content card redesign unrelated to chrome
- route information architecture change
- backend / API contract changes
- modal/sheet system overhaul

## File Ownership And Intent

### 1. `apps/web/src/app/globals.css`

Purpose:

- glass token 강도 낮추기
- shell base를 다시 flat하게 만들기
- bottom nav / header만 남기고 panel/chip glass의 존재감을 줄이기

Required changes:

- `mobile-shell-atmosphere`를 flat base 중심으로 재설계
- radial glow 약화 또는 제거
- `glass-mobile-panel`을 거의 neutral frame 수준으로 낮추기
- `glass-mobile-chip`의 존재감 축소 또는 사용처 최소화
- `bottom-nav` active pill은 유지하되 외곽/그림자 강도 축소
- invalid selector `.@container`는 `.\@container`로 유지

Success condition:

- CSS만 읽어도 “앱 전체 glass”가 아니라 “few frosted chrome surfaces”라는 의도가 보여야 한다.

### 2. `apps/web/src/components/layout/bottom-nav.tsx`

Purpose:

- 이번 task에서 glass를 가장 적극적으로 허용할 surface

Required changes:

- 외곽 capsule은 frosted 유지
- 내부 item은 더 평평하고 조용하게
- inactive는 icon 중심
- active만 짧은 label reveal
- unread badge는 유지
- `/teams`가 `/team-matches`, `/mercenary` cluster를 대표하는지 재검토 가능

Success condition:

- nav는 modern해야 하지만 화면 하단에서 떠들지 않아야 한다.

### 3. `apps/web/src/components/layout/mobile-glass-header.tsx`

Purpose:

- sticky header 공용 abstraction 유지

Required changes:

- blur / shadow / border를 얇게 줄이기
- “유리 패널”보다 “반투명 header strip”처럼 보이게 조정
- title/subtitle rhythm 유지

Success condition:

- detail / utility page header는 통일되지만, header 때문에 화면이 과하게 고급스러워 보이지 않는다.

### 4. `apps/web/src/components/layout/mobile-page-top-zone.tsx`

Purpose:

- root page 상단의 공용 abstraction 재정의

Required changes:

- 현재 glass hero card 성격 제거
- 아래 두 옵션 중 하나로 재설계
  - option A: plain top section component로 축소
  - option B: glass variant / solid variant를 분리하고 기본값을 solid로 변경
- default는 반드시 solid

Success condition:

- root pages가 다시 baseline처럼 더 단정해진다.

### 5. `apps/web/src/app/(main)/layout.tsx`

Purpose:

- 모바일 shell의 기본 인상 되돌리기

Required changes:

- `mobile-shell-atmosphere`를 약화
- top glow 감소
- outer container shadow 감소
- app body가 유리 패널처럼 떠 보이지 않도록 조정

Success condition:

- 화면 전체 first impression이 다시 “깨끗한 앱”이어야 한다.

### 6. `apps/web/src/components/landing/landing-nav.tsx`

Purpose:

- landing의 clean identity 회복

Required changes:

- scroll/open 상태에만 얕은 frosted background 허용
- 기본 상태는 transparent + clean button language
- mobile dropdown도 solid에 가깝게 복귀

Success condition:

- landing은 product marketing page로 읽히고, iOS glass demo처럼 보이지 않는다.

## Page-by-Page Execution Plan

### Phase 1 — Re-anchor The System

Targets:

- `globals.css`
- `layout.tsx`
- `mobile-glass-header.tsx`
- `mobile-page-top-zone.tsx`
- `bottom-nav.tsx`
- `landing-nav.tsx`

Detailed tasks:

- [x] shell background를 baseline 수준으로 낮춘다.
- [x] glass token shadow depth를 한 단계 이상 줄인다.
- [x] panel/chip glass 기본 스타일을 neutral frame 수준으로 낮춘다.
- [x] bottom nav capsule은 유지하되 item affordance를 더 조용하게 만든다.
- [x] sticky header를 얇은 frosted strip로 조정한다.
- [x] top-zone abstraction을 solid-first로 재설계한다.
- [x] landing nav와 mobile menu를 clean marketing tone으로 복귀시킨다.

### Phase 2 — Home Reversion

Target:

- `apps/web/src/app/(main)/home/home-client.tsx`

Detailed tasks:

- [x] 현재 상단 glass card zone을 baseline 구조로 되돌린다.
- [x] greeting + CTA는 plain top header 구조로 복귀한다.
- [x] upcoming schedule panel은 solid 또는 매우 약한 frosted frame만 허용한다.
- [x] 비로그인 promo banner는 현재처럼 dark solid 유지 가능
- [x] quick explore strip에서 glass chip 남발 제거
- [x] section header, filter chips, list blocks는 baseline처럼 flat/solid 중심

Home-specific rule:

- 홈에서 glass는 “하단 nav + 필요시 상단 얇은 패널 1개” 정도여야 한다.

### Phase 3 — Root List Pages Simplification

Targets:

- `matches/matches-client.tsx`
- `teams/teams-client.tsx`
- `marketplace/page.tsx`
- `mercenary/page.tsx`
- `lessons/page.tsx`
- `venues/page.tsx`

Detailed tasks:

- [x] 각 route의 `MobilePageTopZone` 적용 방식 재검토
- [x] root page intro card를 plain title row로 전환
- [x] action button만 accent 유지
- [x] search/filter strip은 solid white input + flat chip language로 유지
- [x] 결과 카드는 solid 유지

Page rule:

- root discovery pages는 `title + action + filter bar + results` 리듬으로 통일한다.

### Phase 4 — Account / Utility Pages

Targets:

- `profile/page.tsx`
- `settings/page.tsx`
- `notifications/page.tsx`
- `chat/page.tsx`
- `reviews/page.tsx`

Detailed tasks:

- [x] `profile` top zone card를 plain 또는 약한 panel로 축소
- [x] summary card, menu card는 solid 유지
- [x] `settings`, `notifications`, `chat`, `reviews`는 header만 frosted 허용
- [x] body cards는 white solid language 유지

Utility rule:

- utility pages는 “정리된 도구 화면”처럼 보여야지 “featured cards 화면”처럼 보이면 안 된다.

### Phase 5 — Detail Header Sanity Sweep

Targets:

- `MobileGlassHeader`를 사용하는 detail / edit pages 전반

Detailed tasks:

- [x] header surface 강도만 줄이고 구조는 유지
- [x] detail hero/media panel에는 새로운 glass를 추가하지 않는다.
- [ ] one-off `bg-white/95 backdrop-blur-sm`가 남아 있으면 shared rule로 통일

## Design Acceptance Criteria

- [x] 모바일 first impression이 다시 clean하고 flat하다.
- [x] bottom nav는 glass지만 전체 테마를 지배하지 않는다.
- [x] sticky header는 존재감이 낮고 기능적이다.
- [x] `/home` 상단이 “glass showcase”가 아니라 “정보 우선”으로 보인다.
- [x] discovery pages가 card-heavy intro screen이 아니라 usable list/search screen처럼 읽힌다.
- [x] landing은 product marketing tone을 유지한다.
- [x] baseline commit `9ba813a`보다 더 정리된 느낌은 허용되지만, 더 화려해지는 것은 허용하지 않는다.

## Validation Plan

### Code validation

- `pnpm --filter web build`
- `pnpm --filter web test`
- `pnpm --filter web exec tsc --noEmit`

### Visual validation routes

- `/landing`
- `/home`
- `/matches`
- `/teams`
- `/lessons`
- `/marketplace`
- `/profile`
- `/settings`
- `/notifications`

### Visual validation questions

- 하단 nav가 제일 먼저 보이는가, 아니면 화면 전체 theme이 먼저 보이는가
- 상단 zone이 컨텐츠보다 스타일을 먼저 주장하는가
- glass가 적용된 surface 수가 2~3개 이상으로 느껴지는가
- section/chip/panel이 모두 frosted처럼 보이는가
- baseline보다 더 Apple demo처럼 보이는가

하나라도 `yes`면 이번 task 방향과 충돌한다.

Actual visual validation executed:

- `/landing`
- `/home`
- `/matches`
- `/profile`
- `/settings`

## Review Checklist

- [ ] `globals.css` token 변화가 과한가
- [ ] `bottom-nav` active/inactive hierarchy가 명확한가
- [ ] `mobile-page-top-zone`가 여전히 over-designed component인가
- [ ] `/home`이 baseline보다 화려한가
- [ ] list pages가 intro card 때문에 정보 density를 잃었는가
- [ ] `landing-nav`가 marketing page tone과 충돌하는가

## Risks

1. 이미 여러 페이지가 `MobilePageTopZone`에 맞춰져 있어, component만 바꿔도 예상보다 많은 시각 변화가 발생할 수 있다.
2. `bottom nav`를 지나치게 단순화하면 active affordance가 약해질 수 있다.
3. `home`을 baseline 쪽으로 되돌리는 과정에서 “현대적 개선”까지 같이 잃을 수 있다.

## Risk Handling

- `glass 유지`가 아니라 `baseline 회복`을 우선한다.
- modernity는 blur보다 spacing, radius, typography, accent discipline으로 만든다.
- page별 one-off 보정 대신 shared component defaults를 먼저 고친다.

## Deliverables

- restrained mobile chrome system
- rewritten root page top sections
- restored clean mobile shell
- updated task doc with final implementation notes

Current caveat:

- build artifact race가 남아 있어 `pnpm --filter web build`는 trace stage에서 로컬 환경 의존 실패를 재현한다.

## Final Definition Of Done

아래 문장을 자연스럽게 말할 수 있으면 완료다.

"지금 앱은 2026년 4월 6일 기준의 깔끔한 Teameet 디자인을 유지하면서, 하단 nav와 일부 sticky chrome만 더 세련되게 frosted 처리한 상태다."
