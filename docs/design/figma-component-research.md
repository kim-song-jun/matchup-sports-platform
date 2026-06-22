# Figma Design System — 컴포넌트 단위 심층 리서치 종합 (v1 적용)

> 목적: 실제 프로덕션 Figma 디자인 시스템(Material 3 / Ant Design v6 / Carbon / Untitled UI / TDS Mobile / 당근 Seed / Banksalad BPL)의 **컴포넌트 토큰·상태·anatomy 실측 스펙**을 v1(`apps/v1_web`)의 `.tm-*` 컴포넌트 실측과 대조해 **컴포넌트 단위 정밀 델타**를 도출한다.
>
> **1차 리서치와의 관계:** `docs/design/toss-design-research.md`(토스-특유 원칙: OKLCH·3계층 토큰·One-Page·다크패턴·숫자단위 2:1·Pretendard·능동형 카피)는 **파운데이션·원칙** 레이어를 다룬다. 본 문서는 그 위의 **컴포넌트 레이어**(.tm-btn/.tm-card/.tm-input/.tm-badge/.tm-list-row 의 size 토큰·state matrix·anatomy slot)에 집중한다. 1차에서 이미 다룬 항목은 **참조**로 연결하고 중복 기술하지 않는다.
>
> 검증 기준: 모든 델타는 (1) 출처 URL 명시 컴포넌트 스펙, (2) v1 코드 실측(`globals.css`/`primitives.tsx` 라인 번호) 두 축으로 적대 검증. 근거 없는 일반론 제외.

---

## 0. v1 컴포넌트 실측 요약 (적대 검증 결과)

리서치 v1Gaps 중 **일부는 1차 리서치 후속 작업으로 이미 해결됨**이 코드 실측으로 확인되어 본 문서 델타에서 제외한다. (리서치 입력의 v1Gaps 일부는 구앱 `apps/web` 또는 작성 시점 기준이라 현 v1 실태와 어긋남.)

| 리서치 v1Gap 주장 | v1 실측 (라인) | 판정 |
|---|---|---|
| Component 토큰 레이어 부재 | `--button-fill-*`/`--card-*`/`--input-*`/`--list-row-*` 존재 (globals.css:144-163), 컴포넌트가 참조 | **이미 해결** (1차 P2 후속) — 제외 |
| Pretendard 미도입 | `--font` 스택 1순위 `Pretendard Variable` (globals.css:130), `--font-pretendard` 정식 정의 (globals.css:128) | **이미 해결** (1차 P8 후속) — 제외 |
| line-height 4pt 미스냅 | `.tm-text-*` lh = 32/28/28/24/20/16/16 전부 4의 배수 (globals.css:1010-1056) | **이미 해결** (1차 §2 후속) — 제외 |
| shadow elevation 역할 매핑 부재 | `--shadow-1/2/modal/sidebar` + elevation-1~4 주석 역할 매핑 (globals.css:66-111) | **이미 해결** (1차 P2-elevation 후속) — 제외 |
| 완료 마이크로인터랙션 부재 | `tm-complete-check` keyframe + reduced-motion 분기 (globals.css 후반) | **이미 해결** (1차 P2-micro 후속) — 제외 |
| Button block(full-width) prop 부재 | `.tm-btn-block { width: 100% }` (globals.css:1107) | **이미 해결** — 제외 |
| Button icon-only 미형식화 | `.tm-btn-icon { 44×44 }` (globals.css:1082) | **이미 해결** — 제외 |
| Button disabled가 opacity-only | `.tm-btn:disabled` = bg/color 토큰 override + cursor (globals.css:1149) | **이미 해결**(가짜 활성 방지) — 제외 |
| Skeleton aria/loading 부재 | `.tm-skeleton` + pulse + reduced-motion (globals.css:4155) | 부분 해결 — input-level skeleton만 net gap |

**v1 컴포넌트의 강점 (이미 프로덕션 DS 근접):** 전 인터랙티브 요소 44px 터치 타깃(WCAG 2.5.5 AAA), `:focus-visible` 2px+2px 링(btn/chip/pressable/shell), 3계층 토큰 완성, disabled 토큰 override(가짜 활성 방지), tm-text 시맨틱 타입 레이어, 5-color 시맨틱 badge, complete-check 모션.

→ 본 문서 델타는 위 제외분을 뺀 **진짜 net-new 컴포넌트 gap**에 집중한다.

---

## 1. 산업 표준 size 토큰 벤치마크 (출처 명시)

각 컴포넌트의 size 토큰을 프로덕션 DS 4종과 v1 으로 정렬한 **실측 대조표**. (v1 강점/델타 판정의 수치 근거)

### Button height (control-height)

| DS | XS | SM | MD(default) | LG | XL | 2XL | 출처 |
|---|---|---|---|---|---|---|---|
| Material 3 | — | — | **40dp (단일, 5 variant 공통)** | — | — | — | [_md-comp-filled-button.scss v0_192](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-filled-button.scss) |
| Ant Design v6 | — | 24 | **32** | 40 | — | — | [ant.design/components/button](https://ant.design/components/button/) |
| Carbon | 24 | 32 | **40** | 48 | 64 | 80 | [carbondesignsystem.com/components/button/style](https://carbondesignsystem.com/components/button/style/) |
| Untitled UI | — | sm | **md** | lg | xl | 2xl | [untitledui.com/components/buttons](https://www.untitledui.com/components/buttons) |
| **v1 .tm-btn** | — | **44** | **44** | **50** | — | — | globals.css:1089-1105 |

→ **v1 의 의도적 차이:** SM/MD 모두 44px(터치 최소). 산업 표준(24/32px)을 **a11y 이유로 상향**한 것 — 이는 모바일 우선 프로젝트에서 정당(WCAG 2.5.5). 단, **데스크톱 밀집 UI(admin 테이블 등)용 32px tier 부재**가 net gap.

### Badge height

| DS | dot | small | default | large | 출처 |
|---|---|---|---|---|---|
| Material 3 | **6** | — | — | 16 | [_md-comp-badge.scss v0_192](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-badge.scss) |
| Ant Design v6 | 6 | 14 | **20** | 20 | [ant.design/components/badge](https://ant.design/components/badge/) |
| Carbon (Tag) | — | 18 | **24** | 32 | [carbondesignsystem.com/components/tag/style](https://carbondesignsystem.com/components/tag/style/) |
| **v1 .tm-badge** | — | — | **24** | — | globals.css:1179 |

→ v1 24px = Carbon MD 와 동일(양호). 단 **dot(6px) variant 부재**, **count overflow(99+) 부재**.

### Input height

| DS | SM | MD(default) | LG | 출처 |
|---|---|---|---|---|
| Ant Design v6 | 24 | **32** | 40 | [ant.design/customize-theme](https://ant.design/docs/react/customize-theme/) |
| Carbon | 32 | **40** | 48 | [carbondesignsystem.com/components/text-input/style](https://carbondesignsystem.com/components/text-input/style/) |
| Material 3 | — | **~56 (floating label, 단일)** | — | (M3 text field 토큰) |
| **v1 .tm-input** | — | **50 (단일)** | — | globals.css:1219 |

→ v1 단일 50px = 터치 충족. **size tier 부재**(밀도 제어 불가)가 net gap.

### List item height

| DS | one-line | two-line | three-line | 출처 |
|---|---|---|---|---|
| Material 3 | **56** | 72 | 88 | [_md-comp-list.scss v0_192](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-list.scss) |
| **v1 .tm-list-row** | **58 (단일 min)** | — | — | globals.css:1602 |

→ v1 58px ≈ M3 one-line(56). **two/three-line tier 토큰 부재**.

---

## 2. 컴포넌트별 정밀 델타

각 컴포넌트의 **상태 매트릭스(state matrix)**와 **anatomy slot**을 산업 표준 대비 실측. (state matrix 일반론은 입력 facet3 의 표준; 여기서는 v1 실측 누락만 명시)

### 2.1 `.tm-btn` (globals.css:1072-1177)

**v1 보유:** size(sm/md/lg), variant(ghost/primary/neutral/outline/danger/warning/success 7종), block, icon(44×44), `:disabled`(토큰 override), `:focus-visible`(2px+2px). 트랜지션은 `.tm-pressable` 래퍼로 scale(0.985).

| 상태/슬롯 | 산업 표준 | v1 실측 | gap |
|---|---|---|---|
| `:hover` | M3 elevation+1 / AntD 한 톤 시프트(blue-600) / Carbon hover-fill | **`.tm-btn`에 `:hover` 규칙 0건** (grep 확인). `--button-fill-primary-hover` 토큰만 정의(globals.css:146), **미사용** | **P1** — 데스크톱 hover 피드백 전무 + 정의된 토큰 dead |
| `:active`/pressed | 두 톤 시프트(blue-700) + scale(0.98) | **`.tm-btn:active` 0건**. `.tm-pressable:active`만 scale(globals.css:1068) — `.tm-pressable` 미래핑 btn 은 press 피드백 없음 | **P1** |
| loading | M3/AntD/Carbon/UUI 전부 1급 변형: spinner + `aria-busy` + pointer-events 잠금 | **`.tm-btn` loading 클래스/spinner/aria-busy 0건**. 콜사이트는 라벨 텍스트("…중")만 변경, double-submit 방지 미흡 | **P0** — 결제/매칭확정 등 비동기 액션 double-submit 리스크 |
| link variant | AntD/Carbon: text vs link 구분(밑줄, bg 절대 없음) | `.tm-btn-ghost`만 존재, link-type 없음 | **P2** |
| XL/2XL | Carbon 64/80, UUI xl/2xl | lg(50)에서 멈춤 | **P2** — hero CTA 없으면 불필요 |
| size×color 매트릭스 | AntD v6: variant(solid/outlined/dashed/filled/text/link) × color(primary/default/danger/...) 2D | v1 은 color+visual-style 를 단일 'variant' 차원에 융합(7종) | **P2** — 현 규모엔 과설계, 문서화만 |

**출처:** [_md-comp-filled-button.scss](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-filled-button.scss) · [ant.design/button](https://ant.design/components/button/) · [carbondesignsystem.com/button](https://carbondesignsystem.com/components/button/style/) · [figma.com/resource-library/button-states](https://www.figma.com/resource-library/button-states/)

### 2.2 `.tm-input` (globals.css:1217-1261)

**v1 보유:** 단일 50px, `:focus`(border-color), `::placeholder`, select chevron, `.tm-auth-input-error`/`success`(border-color). `--input-*` 토큰 참조.

| 상태/슬롯 | 산업 표준 | v1 실측 | gap |
|---|---|---|---|
| `:focus` 가시성 | AntD/Carbon: border + 2-3px focus ring(box-shadow glow). WCAG 1.4.11 비텍스트 대비 3:1 | **border-color 변경만** (globals.css:1234), ring 없음. 다크/저대비 표면에서 3:1 미달 위험 | **P1** |
| `:focus` vs `:focus-visible` | 모던 표준: `:focus-visible`(마우스 클릭 시 링 숨김) | `.tm-input:focus` 사용 — 마우스에도 표시 | **P2** |
| `:disabled` | Carbon/AntD: 명시 muted bg/text + cursor:not-allowed | **`.tm-input:disabled`/`[disabled]` 규칙 0건** — 브라우저 기본 스타일 의존 | **P1** |
| warning 상태 | AntD/Carbon: error(red)와 별도 warning(amber) | error/success(green)만 존재, **warning(amber) 부재** | **P2** |
| prefix/suffix/addon | AntD `addonBefore/After`+`prefix/suffix`, UUI 4슬롯 | **anatomy 슬롯 0개** — 검색 input·금액 input 마다 wrapper div ad-hoc | **P1** — 검색/금액/단위 input 일관성 |
| char count | AntD `showCount`, UUI inline count | 부재 | **P2** — 한줄소개 등 maxLength 필드에 유효 |
| skeleton | UUI input skeleton variant | page-level `.tm-skeleton`만, input 전용 없음 | **P2** |
| `aria-invalid`/`aria-describedby` | WCAG 2.1 AA: 에러 시 필수 배선 | **2개 파일만 적용**(admin/tournaments/new, roster). auth signup 은 클래스 토글만 → SR 에러 미공지 | **P0** — 핵심 가입 플로우 SR 접근성 결손 |

**출처:** [carbondesignsystem.com/text-input](https://carbondesignsystem.com/components/text-input/style/) · [ant.design/customize-theme](https://ant.design/docs/react/customize-theme/) · [untitledui.com/inputs](https://www.untitledui.com/components/inputs) · [smashingmagazine accessible form validation](https://www.smashingmagazine.com/2023/02/guide-accessible-form-validation/) · [webaim.org/contrast](https://webaim.org/articles/contrast/)

### 2.3 `.tm-card` (globals.css:1058-1062)

**v1 보유:** border-1px only(shadow 없음 — surface-policy 준수), `--card-*` 토큰, radius 16px. 인터랙티브는 `.tm-pressable` 래퍼.

| 상태/슬롯 | 산업 표준 | v1 실측 | gap |
|---|---|---|---|
| `:hover`(interactive) | M3: elevation 1→8dp + shadow lift / Atlassian: surface.raised→overlay | **`.tm-card:hover` 0건**. 리스트형 카드(match/team/mercenary) 데스크톱 클릭 전 affordance 없음 | **P1** |
| `:focus-visible` | btn 과 동일 2px+2px(키보드 링크 카드) | `.tm-card` base 에 없음. `.tm-team-card:focus-visible`/`.tm-invitation-card:focus-visible` 1회성 패치만 | **P1** |
| disabled | reduced opacity + cursor:not-allowed(매치 마감/품절) | `.tm-card-disabled` 패턴 부재 | **P2** |
| media/cover slot | AntD `cover`, UUI media header | 슬롯 없음, 카드별 cover 수동 합성 | **P2** — 도메인 컴포넌트(`tm-match-list-card`)가 개별 해결 중 |
| header/footer 서브컴포넌트 | AntD title/extra/actions | `Card` primitive 는 flat wrapper(primitives.tsx:53) | **P2** |
| loading(skeleton) | AntD `loading` prop co-located | 별도 `.tm-skeleton` 분리 | **P2** |

**출처:** [_md-comp-elevated-card.scss](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-elevated-card.scss) · [atlassian.design/foundations/elevation](https://atlassian.design/foundations/elevation) · [ant.design/components/card](https://ant.design/components/card/)

### 2.4 `.tm-badge` (globals.css:1179-1215)

**v1 보유:** 단일 24px, radius 999px(pill), 5 color(blue/grey/orange/green/red — 시맨틱 색), weight 700.

| 상태/슬롯 | 산업 표준 | v1 실측 | gap |
|---|---|---|---|
| size tier | M3 dot 6/large 16 · Carbon 18/24/32 · AntD 14/20 | **단일 24px** | **P2** |
| dot variant | M3 6px dot(라벨 없는 상태 점) | **dot 부재** — 상태 점은 ad-hoc(`.tm-unread-dot` 7px 별도) | **P2** |
| count overflow | AntD/UUI `99+` | 부재 — `.tm-match-count-badge` 가 개별 처리 | **P2** |
| 컬러+아이콘 동반 | CLAUDE.md a11y: 색만으로 의미 전달 금지 | tm-badge 는 **색만**(아이콘 슬롯 없음). 색맹 시 blue/grey 구분 난해 | **P1** — a11y 규칙 위반 소지(컬러-only) |

**출처:** [_md-comp-badge.scss](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-badge.scss) · [ant.design/components/badge](https://ant.design/components/badge/) · [carbondesignsystem.com/tag](https://carbondesignsystem.com/components/tag/style/)

### 2.5 `.tm-list-row` (globals.css:1602-1613) + `ListItem`(primitives.tsx:155)

**v1 보유:** 단일 58px min, padding 12/14, leading(아이콘)·center(title+sub)·trailing(value+chevron) 슬롯을 `ListItem` JSX 로 구현(primitives.tsx). `.tm-pressable` 래퍼로 press.

| 상태/슬롯 | 산업 표준 | v1 실측 | gap |
|---|---|---|---|
| line-tier height | M3 56/72/88(one/two/three-line) | **단일 58px min**(콘텐츠 따라 가변) — 명시 tier 토큰 없음 | **P2** — min-height 라 실해 적으나 일관성 약함 |
| `:hover` | M3 state-layer overlay(hover 8%) | **`.tm-list-row:hover` 0건** | **P1**(.tm-btn hover 와 동반 해결) |
| `:focus-visible` | 키보드 네비 링 | base 에 없음(`.tm-pressable:focus-visible` 래퍼 의존) | **P2** — Link 래핑 시 `.tm-pressable` 동반되면 OK, 전수 확인 필요 |
| selectable state | M3 container-color swap / Carbon Structured List selectable | 부재 | **P2** |

**출처:** [_md-comp-list.scss](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-list.scss) · [tossmini-docs TableRow/ListRow](https://tossmini-docs.toss.im/tds-mobile/) · [carbondesignsystem Structured List](https://carbondesignsystem.com/components/structured-list/style/)

---

## 3. 공통 패턴 델타 (state-layer / Figma 변수 / 한국 앱)

### 3.1 통합 state-layer 부재 — **P1**
M3 는 hover 8% / focus 12% / pressed 12% opacity overlay 를 **단일 상호작용 모델**로 쓴다. v1 은 컴포넌트마다 hover/active 가 **제각각(혹은 부재)** — `.tm-pressable`(scale), `.tm-chip-active`(bg swap), btn(없음), card(없음). → `--state-hover-opacity`/`--state-pressed-opacity` 토큰 + 공용 `.tm-interactive` overlay 패턴 도입으로 §2.1·2.3·2.5 의 hover/active gap 을 일괄 해결.
출처: [M3 state-layers](https://m3.material.io/foundations/interaction/states/overview) · facet1 입력

### 3.2 Figma Variable Collections 미존재 — **P2**
v1 토큰은 globals.css `:root` 평면 CSS 변수로만 존재. 3계층(Primitives/Semantic/Component)은 **코드에는 구현**(globals.css:144-163)됐으나 **Figma Variable Collection 으로는 미동기화**. 디자인↔코드 sync 파이프라인(Tokens Studio + W3C DTCG `tokens.json` + Style Dictionary)이 없어 변경이 수동. → 현 단계는 코드가 source-of-truth 라 운영 가능하나, 디자이너 합류 시 정식 Figma 컬렉션 + DTCG export 필요.
출처: [help.figma.com/variables-collections-modes](https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes) · [docs.tokens.studio/token-format](https://docs.tokens.studio/manage-settings/token-format) · facet2 입력

### 3.3 ActionSheet/BottomSheet 컴포넌트 규격 — **P2**
당근 Seed ActionSheet 실측: container H-pad 16pt / V-pad 14pt / corner-top 20pt, action label V-pad 12pt, destructive=danger 토큰(red), divider 0.5pt. TDS BottomSheet: 트랜지션 0.1s ease-in-out, X버튼+드래그핸들 병행(NNg), 진입 즉시 노출 금지(1차 P4 다크패턴 참조). v1 의 모달류(AutoBalanceModal/FileDisputeModal 등)가 이 규격 충족 여부 + `role=dialog`+`aria-modal`+ESC+focus-trap 전수 미검증. → 공용 ActionSheet 컴포넌트 부재로 인라인 ad-hoc. (Dialog vs BottomSheet 선택 기준은 1차 P4 와 연결)
출처: [seed-design action-sheet/style.mdx](https://raw.githubusercontent.com/daangn/seed-design/main/docs/content/component/action-sheet/style.mdx) · [tossmini-docs bottom-sheet](https://tossmini-docs.toss.im/tds-mobile/components/bottom-sheet/) · [nngroup.com/bottom-sheet](https://www.nngroup.com/articles/bottom-sheet/)

### 3.4 word-break: keep-all 한국어 줄바꿈 — **P2**
TDS 공식 CSS 는 ListRow 등에 `word-break: keep-all; overflow-wrap: anywhere; hyphens: auto` 전역 적용(한국어 음절 단위 끊김 방지). v1 은 Tailwind 기반 기본값 `normal` 가능 — 카드 제목·배지·버튼 라벨 음절 단위 깨짐 체크 필요.
출처: [tossmini-docs TDS Mobile](https://tossmini-docs.toss.im/tds-mobile/)

---

## 4. 우선순위 델타 종합 (componentDeltas 매핑)

> P0 = a11y/안전 결손(즉시), P1 = 일관성·상호작용 핵심, P2 = 확장·미래.

| # | component | gap | change(구체 토큰/상태) | priority |
|---|---|---|---|---|
| 1 | `.tm-btn` | loading 상태 전무 → double-submit 리스크 | `.tm-btn.is-loading`: spinner slot + `aria-busy=true` + `pointer-events:none` + opacity 0.75. 결제/매칭확정/팀배정 콜사이트 적용 | **P0** |
| 2 | `.tm-input` | auth signup `aria-invalid`/`aria-describedby` 미배선 | error 시 `aria-invalid=true` + `aria-describedby={errId}` + 에러 노드 `role=alert`. 2파일→전 폼 확대 | **P0** |
| 3 | `.tm-btn` | `:hover`/`:active` 0건 + `--button-fill-primary-hover` dead token | `.tm-btn-primary:hover{background:var(--button-fill-primary-hover)}` + `.tm-btn:active{transform:scale(0.98)}`. 정의된 hover 토큰 활성화 | **P1** |
| 4 | `.tm-input` | `:focus` ring 없음(border-color만) | `.tm-input:focus{box-shadow:0 0 0 3px var(--blue50)}` 추가 → WCAG 1.4.11 3:1 확보. `:focus`→`:focus-visible` 전환 | **P1** |
| 5 | `.tm-input` | `:disabled` 규칙 0건(브라우저 기본 의존) | `.tm-input:disabled{background:var(--grey100);color:var(--text-caption);cursor:not-allowed}` | **P1** |
| 6 | `.tm-input` | prefix/suffix/addon anatomy 슬롯 0개 | `.tm-input-group`(leading/trailing icon + prefix/suffix text) wrapper 표준화 — 검색/금액/단위 input | **P1** |
| 7 | `.tm-card` | interactive `:hover` 0건 | `.tm-card.tm-interactive:hover{box-shadow:var(--shadow-1)}` 또는 state-layer overlay. match/team/mercenary 카드 | **P1** |
| 8 | `.tm-card` | `:focus-visible` base 부재(1회성 패치만) | `.tm-card:focus-visible{outline:2px solid var(--blue500);outline-offset:2px}` base 승격 | **P1** |
| 9 | `.tm-badge` | 색만으로 상태 전달(아이콘 슬롯 없음) | tm-badge 에 leading-icon slot(gap-4) 추가 또는 상태 텍스트 병행 — CLAUDE.md 컬러-only 금지 준수 | **P1** |
| 10 | 공통 | 통합 state-layer 부재(컴포넌트마다 제각각) | `--state-hover-opacity:0.04`/`--state-pressed-opacity:0.08` 토큰 + `.tm-interactive` overlay 패턴 → #3·#7·hover gap 일괄 | **P1** |
| 11 | `.tm-list-row` | `:hover` 0건 | state-layer overlay(hover) 적용 — #10 과 동반 | **P1** |
| 12 | `.tm-btn` | 데스크톱 밀집 UI(admin)용 32px tier 부재 | `.tm-btn-xs{min-height:32px;font-size:13px}` (데스크톱 전용, 모바일 미사용) | **P2** |
| 13 | `.tm-input` | warning(amber) 상태 부재 | `.tm-input-warning{border-color:var(--orange500)}` + warning msg | **P2** |
| 14 | `.tm-input` | char count 부재 | maxLength 필드(`showCount`) inline count 슬롯 | **P2** |
| 15 | `.tm-badge` | size tier(dot/sm/lg) + count overflow 부재 | `.tm-badge-dot`(6px) + `.tm-badge-sm`(18px) + `99+` 헬퍼 | **P2** |
| 16 | `.tm-list-row` | one/two/three-line height tier 토큰 부재 | `.tm-list-row-2line{min-height:72px}` 등 M3 tier 매핑(필요 시) | **P2** |
| 17 | `.tm-btn` | link-style variant 부재 | `.tm-btn-link`(밑줄, bg 절대 없음) — text vs link 구분 | **P2** |
| 18 | 공통 | ActionSheet 공용 컴포넌트 부재(인라인 ad-hoc) | 당근 Seed 규격(H16/V14pt, action V12pt, destructive=danger token, divider 0.5pt) 공용 컴포넌트 | **P2** |
| 19 | 공통 | Figma Variable Collection 미동기화 | `tokens/{primitive,semantic,component}.json`(W3C DTCG) + Style Dictionary → globals.css 생성 파이프라인 | **P2** |
| 20 | 공통 | `word-break:keep-all` 한국어 줄바꿈 미보장 | 카드 제목/배지/버튼 라벨에 `word-break:keep-all` 적용(TDS 패턴) | **P2** |

---

## 5. 참조 관계

- **토스-특유 파운데이션 원칙**(OKLCH·3계층 토큰 개념·One-Page·다크패턴·숫자단위 2:1·Pretendard·능동형 카피·elevation 역할): → `docs/design/toss-design-research.md` (1차)
- **측정 가능 토큰 위반**(font-size 압축, spacing/radius 토큰 자체): → `docs/design/toss-reference-rubric.md` + 토큰 감사
- **시각 규칙 정의**(surface policy, glass 범위, 카드 시스템): → `DESIGN.md` (canonical)
- **본 문서:** 위가 다루지 않는 **컴포넌트 레이어**(.tm-* size 토큰·state matrix·anatomy slot)의 프로덕션 DS 실측 대조 + 정밀 델타

## 부록. 컴포넌트 스펙 출처 (Figma DS 실측)

- **Button:** [M3 _md-comp-filled-button.scss](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-filled-button.scss) · [AntD v6](https://ant.design/components/button/) · [Carbon](https://carbondesignsystem.com/components/button/style/) · [Untitled UI](https://www.untitledui.com/components/buttons) · [Figma button-states](https://www.figma.com/resource-library/button-states/)
- **Input:** [Carbon text-input](https://carbondesignsystem.com/components/text-input/style/) · [AntD customize-theme](https://ant.design/docs/react/customize-theme/) · [UUI inputs](https://www.untitledui.com/components/inputs) · [Smashing form validation](https://www.smashingmagazine.com/2023/02/guide-accessible-form-validation/)
- **Card:** [M3 _md-comp-elevated-card.scss](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-elevated-card.scss) · [Atlassian elevation](https://atlassian.design/foundations/elevation) · [AntD card](https://ant.design/components/card/)
- **Badge:** [M3 _md-comp-badge.scss](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-badge.scss) · [AntD badge](https://ant.design/components/badge/) · [Carbon tag](https://carbondesignsystem.com/components/tag/style/)
- **List:** [M3 _md-comp-list.scss](https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-list.scss) · [TDS Mobile](https://tossmini-docs.toss.im/tds-mobile/) · [Carbon Structured List](https://carbondesignsystem.com/components/structured-list/style/)
- **Tokens/Figma Variables:** [Figma collections-modes](https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes) · [Figma design-tokens](https://www.figma.com/resource-library/design-tokens/) · [martinfowler token-architecture](https://martinfowler.com/articles/design-token-based-ui-architecture.html) · [Tokens Studio DTCG](https://docs.tokens.studio/manage-settings/token-format)
- **한국 앱(TDS/당근/Banksalad):** [tossmini-docs](https://tossmini-docs.toss.im/tds-mobile/) · [toss.tech tds-component-making](https://toss.tech/article/tds-component-making) · [seed-design action-sheet](https://raw.githubusercontent.com/daangn/seed-design/main/docs/content/component/action-sheet/style.mdx) · [banksalad BPL iOS](https://blog.banksalad.com/tech/banksalad-product-language-ios/) · [nngroup bottom-sheet](https://www.nngroup.com/articles/bottom-sheet/)
