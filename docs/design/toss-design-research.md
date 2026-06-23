# Toss / Figma Design System — Web Research Synthesis (v1 Application)

> 목적: 5개 facet 의 토스·피그마 디자인 시스템 웹 리서치를 종합하여, **공개 자료로 검증된 토스-특유의 원칙**을 v1(`apps/v1_web`) 현황과 대조하고 우선순위 델타를 도출한다.
>
> 이 문서는 `docs/design/toss-reference-rubric.md`(측정 가능 위반 기준)를 **보강**한다. rubric 이 이미 다루는 규칙(R-C1~R-A3, 토큰 위반 등)은 중복 기술하지 않고 **참조**로 연결하며, 여기서는 웹 리서치로 **새로 확인된 토스-특유 패턴·원칙**과 그에 따른 v1 gap 만 다룬다.
>
> 검증 기준: 모든 원칙·델타는 (1) 출처 URL, (2) v1 코드 실측(`apps/v1_web/src/app/globals.css` 등) 두 축으로 적대 검증함. 근거 없는 일반론은 제외.

---

## 0. v1 현황 실측 요약 (적대 검증 결과)

리서치 델타 중 일부는 **v1 에서 이미 해결됨**이 코드 실측으로 확인되어 본 문서에서 제외했다. 이는 리서치가 구앱(`apps/web`) 또는 일반 베스트프랙티스 기준으로 작성되어 v1 실태와 어긋난 부분이다.

| 리서치 주장 | v1 실측 | 판정 |
|---|---|---|
| `transition-all` 제거 필요 | `apps/v1_web/src` 전수 grep → **0건** | 이미 clean, 제외 |
| glass 가 카드·콘텐츠로 확산 | `backdrop-filter` 3건 전부 chrome(`.tm-bottom-nav` 등) | 이미 chrome-only, 제외 |
| `.tm-card` 가 border+shadow 중복 | `.tm-card` = `border 1px` only, shadow 없음 (globals.css:1016) | 이미 compliant, 제외 |
| weight 가 컴포넌트에 산재 | `.tm-text-*` 클래스가 weight+lh+color 바인딩 (globals.css:968~) | semantic 타입 레이어 이미 존재 |
| line-height 토큰 전무 | `.tm-text-*` 에 inline lh 존재 (단 4pt 미스냅) | 부분 존재 — 4pt 정렬이 진짜 gap |

→ 따라서 본 문서의 v1 델타는 **위 제외분을 뺀, 진짜로 토스 기준 대비 부족한 net-new 항목**에 집중한다.

**v1 의 강점 (이미 토스에 근접):** 단일 블루 액센트, glass chrome-only, tm-card border-first, 11단계 grey ramp(`#f9fafb`~`#191f28`), tm-text 시맨틱 타입 레이어, prefers-reduced-motion 전역 처리, 44px 터치 타겟.

---

## 1. 웹 리서치로 검증된 토스-특유 원칙 (출처 명시)

기존 rubric 이 다루지 않거나 얕게만 다룬, **토스의 차별적 원칙**만 정리한다.

### P1. OKLCH 지각 균일 컬러 스케일 (2024 TDS 컬러 전면 개편)

**출처:** [toss.tech/article/tds-color-system-update](https://toss.tech/article/tds-color-system-update)

TDS 가 7년 만에 컬러 시스템을 전면 개편한 핵심 동기: HSL 기반 팔레트에서 동일 brightness step(예: 100)이 색상(hue)마다 **인지 밝기가 달라** UI 가 얼룩진 느낌을 줬다. 해결책은 **OKLCH**(인지적으로 균일한 색공간)로 전환하여 Gray·Blue·Red·Green·Orange 의 동일 스케일 번호가 **동일한 인지 밝기**를 갖게 한 것. 부수 효과로 WCAG AA 대비가 스케일 설계 단계에서 시스템적으로 보장된다.

**기존 rubric 과의 차이:** rubric R-C1~R-C3 은 "단일 액센트/의미색/컬러+텍스트"를 다루지만, **스케일 자체의 지각 균일성**과 **대비를 스케일에 내장**하는 개념은 없다. 이것이 토스 2024 개편의 핵심이며 v1 의 `--grey*` 가 hex 직접 지정(HSL 파생 추정)이라 동일 step 의 인지 밝기 정합성이 보장되지 않는다.

### P2. 3계층 토큰 (Base → Semantic → Component) + System-of-System 테마

**출처:** [toss.tech/article/tds-color-system-update](https://toss.tech/article/tds-color-system-update) · [W3C DTCG 2025.10 draft](https://www.designtokens.org/tr/drafts/format/) · [Figma — Design Systems 102](https://www.figma.com/blog/design-systems-102-how-to-build-your-design-system/) · [tasteprofile.io DTCG guide](https://tasteprofile.io/blog/w3c-dtcg-design-tokens-practical-guide)

TDS 토큰 계층: **Base**(원시값 `blue-500`) → **Semantic**(역할 `fill-brand`, `text-primary`, `surface`) → **Component**(`button-fill-primary`). 컴포넌트는 절대 Base 를 직접 참조하지 않는다. 이 구조 덕에 **System-of-System** — 파운데이션을 공유하면서 Semantic/Component 토큰만 오버라이드하여 브랜드(앱인토스 파트너 컬러)·제품(WTS 에서는 Red 가 Primary)·다크모드 테마를 파생한다.

**v1 현황:** Base(`--blue500`)·Semantic(`--text-strong`, `--surface`, `--border`) 2계층은 있으나 **Component 계층 부재**. 컴포넌트가 Semantic 을 직접 소비하거나 Tailwind primitive(`bg-blue-500`)를 직접 참조 → 테마 파생 불가.

### P3. 화면당 하나의 목적 (One Page — One Thing)

**출처:** [teqnoid.com — Korean UI/UX logic](https://teqnoid.com/the-logic-behind-korean-ui-ux-design/) · [toss.tech/article/rethinking-design-system](https://toss.tech/article/rethinking-design-system) · [phenomenonstudio fintech patterns](https://phenomenonstudio.com/article/fintech-design-breakdown-the-most-common-design-patterns/)

한국 앱의 일반 경향("더 많이 = 더 많은 기능 노출")과 **반대로**, 토스는 화면당 목적을 하나로 줄여 복잡성을 제거한다. 서구 앱의 발견형(discovery) 탐색이 아니라 **작업 완료(task-completion) 중심** 설계. 한 화면에서 경쟁하는 Primary CTA 를 두지 않고, 작업을 단계로 쪼개되 각 단계는 단순하게 유지한다.

**기존 rubric R-K5/§14 와의 차이:** rubric 은 "주요 CTA ≤ 1개"를 다루나, **화면 전체의 목적 단일화**(정보 과부하 자체 감축)라는 상위 원칙은 없다.

### P4. 다크패턴 방지 7개 정책 (앱인토스 공식)

**출처:** [developers-apps-in-toss.toss.im/design/consumer-ux-guide.md](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide.md)

토스 미니앱 공식 UI/UX 가이드의 7개 강제 정책: ① **진입 즉시 바텀시트 금지**, ② **뒤로가기 막는 바텀시트 금지**, ③ 탈퇴·구독취소 방해 금지, ④ 오해 유발 UI 금지, ⑤ 강제 권한 요청 금지, ⑥ 자동결제 미공지 금지, ⑦ 숨겨진 정보 금지.

**기존 rubric 과의 차이:** rubric 에 **다크패턴 차원 자체가 없음**. ①②⑤ 는 v1 의 진입 플로우(로그인 후 첫 화면, 권한/알림 동의)에 직접 적용되는 신규 검사 축이다.

### P5. 숫자 : 단위 2:1 비율 + tabular-nums

**출처:** [github.com/bitjaru/styleseed](https://github.com/bitjaru/styleseed) (Toss 판단 규칙 역공학) · [webstacks.com fintech-ux-design](https://www.webstacks.com/blog/fintech-ux-design)

토스 스킨 규칙: 숫자와 단위의 크기 비율은 **2:1**(예: 금액 숫자 48px, "원" 단위 24px). 통화/점수 입력은 우정렬 + 대형 폰트(28–32px) + 단위 명시. 데이터 숫자는 **tabular-nums** + weight 600+.

**기존 rubric R-D1/§11 과의 차이:** rubric 은 "큰 숫자는 KPI/통계에만 허용"으로 **억제**만 다룬다. 토스의 **숫자:단위 2:1 비율** 자체는 없다 — 허용된 위치(ELO·매너점수·참가비·멤버수)에서 숫자를 어떻게 조판할지의 규칙이 빠져 있다.

### P6. 가드레일 vs 울타리 — 확장 가능한 컴포넌트 API

**출처:** [toss.tech/article/rethinking-design-system](https://toss.tech/article/rethinking-design-system) · [toss.tech/article/toss-design-system](https://toss.tech/article/toss-design-system) · [thesigma.co component variants](https://www.thesigma.co/journal/component-variants-design-system)

"팀을 지키는 가드레일인가, 팀을 멈추는 울타리인가?" — 디자인 시스템은 권장 규칙을 제공하되 **예외도 지원**해야 한다. 수요 없는 시스템은 팀들이 밖에서 자체 해결하므로 일관성을 못 지킨다. 컴포넌트는 "레고 블록"으로, 메이커가 컬러·스페이싱·타이포 재결정 없이 조립한다. 단, **브랜드·다크모드 분기는 variant 추가가 아니라 token layer 의 Semantic 값 교체로만** 처리(variant 폭발 방지).

### P7. UX 라이팅 — 해요체 + 능동형 + 불안 상황만 수동형

**출처:** [developers-apps-in-toss.toss.im/design/consumer-ux-guide.md](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide.md) · [medium — Toss 10y UX evolution](https://medium.com/@posinity/how-toss-became-a-design-powerhouse-10-years-of-ux-evolution-e9fc0c51d180)

모든 문구 **해요체**, **능동형** 필수. 짧고 직접적으로. 단, **개인정보 수집 등 불안 상황에서만 수동형**으로 사용자 안심. (프로젝트 CLAUDE.md 의 "fallback 메시지 해요체" 규칙과 일치하나, "불안 상황 수동형" 예외와 능동형 강제는 신규.)

### P8. Pretendard — 한글 최적화 폰트

**출처:** [github.com/orioncactus/pretendard README](https://github.com/orioncactus/pretendard/blob/main/packages/pretendard/docs/en/README.md) · [medium — fintech typography](https://medium.com/@tamannasamantaray00/typography-selection-for-fintech-product-design-system-series-62ba0ba7c4bf)

Pretendard = Inter + Source Han Sans 기반 Neo-grotesque, 9 weights + variable font. **한글 자모 간격 최적화로 본문 letter-spacing 수동 조정 불필요**. 크로스플랫폼 일관성이 설계 목표. 한국어 환경 권장 line-height 1.5~1.6(영문 대비 자간·행간 여유). Geometric sans-serif 가 fintech 신뢰도를 높인다는 연구 인용.

---

## 2. 타이포·간격 수치 기준 (모바일 핀테크 표준)

기존 rubric R-T1~R-S3 의 **수치 근거**를 보강한다 (출처: [Material 3 type-scale](https://m3.material.io/styles/typography/type-scale-tokens), [Apple HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Spec.fm 8-pt grid](https://spec.fm/specifics/8-pt-grid), [imperavi modular scale](https://imperavi.com/books/ui-typography/principles/modular-scale/)):

- **모듈러 스케일:** 모바일 UI 는 Minor Third(×1.2), 랜딩은 Major Third(×1.25). 인접 단계 비율이 1.06~1.12 면 위계 미성립. → v1 의 `caption(12)→label(13)→body-sm(14)→body(15)→body-lg(17)` 5단계가 6px 범위에 몰려 비율 1.07~1.18(COMPRESS). (단, 이는 **토큰 위반 감사**에서 측정 중 → 본 문서 델타에서 제외, P-수치만 보강.)
- **line-height 4pt 스냅:** body(≤18px)=`ceil(size×1.5/4)×4`, heading(>18px)=`ceil(size×1.25/4)×4`. 한국어는 +0.1 여유. → v1 `.tm-text-*` 의 lh 가 **26/22/19/18/15** 로 4pt 미스냅(24/24/20/16/16 이 정답).
- **4pt/8pt 병행:** 컴포넌트·컨테이너=8pt(8/16/24/32/40/48), 밀집요소(배지·칩·아이콘)=4pt 하프스텝.
- **weight 3종 제한:** Display/Heading 700, Body 400-500, Label 500. → v1 `.tm-text-*` 는 700/600/500/400 4종으로 양호.

---

## 3. v1 우선순위 델타 (토스-특유 net-new 항목)

> **제외:** 측정 가능 토큰 위반(font-size 압축, 누락 spacing/radius/lh 토큰 자체)은 **별도 토큰 감사**에서 진행 중이므로 여기서 중복하지 않는다. 아래는 웹 리서치로 **새로 발견한 토스-특유 패턴·원칙**에 집중한 적용 델타다.

### [P0] 접근성 — text-caption / blue-as-text 대비 미달 (P1 OKLCH 원칙의 실질 효과)

토스 2024 개편의 핵심은 "스케일에 AA 대비 내장"이다. v1 은 그 효과가 빠져 있어 실측 미달이 존재:

- **`--text-caption`(=`--grey500`=`#8b95a1`)는 흰 배경에서 3.04:1 → WCAG AA(4.5:1) 불통과.** 이 토큰이 보조 텍스트로 **335곳**에서 사용 중(`var(--text-caption)`/`.tm-text-caption` grep). AA-safe 대체 `--grey600`(`#6b7684`, 4.62:1)이 이미 존재 → `--text-caption` 의 값을 grey600 으로 상향하면 단일 변경으로 전파.
- **`--blue500`(#3182f6)을 텍스트로 쓰면 3.71:1 → AA 불통과.** 텍스트용은 `--blue600`(#2272eb)/`--blue700`(#1b64da, 6.60:1) 사용. blue500 은 fill/아이콘 전용.
- **status 컬러 텍스트 직접 사용 불가:** `--green500`(2.22:1)·`--orange500`(2.20:1)은 흰 배경 텍스트로 AA 불통과 → tint 배경(`--green50`/`--orange50`) 위 어두운 변형(green-700/orange-700) 필요.

근거: WebAIM contrast, css-tricks contrast guide, 본문 §1 P1.
출처: [webaim.org/articles/contrast](https://webaim.org/articles/contrast/) · [css-tricks contrast ratios](https://css-tricks.com/understanding-web-accessibility-color-contrast-guidelines-and-ratios/)

### [P0] 다크패턴 차원 신설 — 진입 즉시 인터럽트 금지 (P4)

rubric 에 없는 신규 검사 축. v1 의 **로그인 후 첫 화면 / 페이지 진입 시 자동 노출되는 바텀시트·모달·권한 요청**(알림 동의 등)을 감사하고, 사용자가 의도한 화면을 먼저 보여준 뒤 컨텍스트에 맞는 시점에 안내하도록 전환. **뒤로가기를 막는 바텀시트**도 금지.
출처: [앱인토스 consumer-ux-guide](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide.md)

### [P1] Component 토큰 레이어 도입 (P2)

`--button-fill-primary: var(--blue500)`, `--card-border: var(--border)`, `--list-row-bg: var(--surface)` 등 **Component 계층**을 globals.css `:root` 에 추가하고 핵심 컴포넌트(`.tm-btn`/`.tm-card`/`.tm-input`)가 Semantic→Component 토큰을 참조하도록 전환. 이것이 다크모드/브랜드 테마 파생(System-of-System)의 전제.
출처: [toss tds-color-system-update](https://toss.tech/article/tds-color-system-update) · [W3C DTCG](https://www.designtokens.org/tr/drafts/format/)

### [P1] 숫자 : 단위 2:1 조판 (P5)

ELO 점수·매너 점수·참가비·팀 멤버 수 등 수치 표시 컴포넌트에서 숫자(`var(--font-size-subhead)`/`heading`)와 단위("점/원/명", `var(--font-size-body)`)를 **2:1 비율**로 조판 + `font-variant-numeric: tabular-nums`. rubric §11 의 "큰 숫자 억제"와 보완 관계.
출처: [styleseed](https://github.com/bitjaru/styleseed) · [webstacks fintech-ux](https://www.webstacks.com/blog/fintech-ux-design)

### [P1] Pretendard 폰트 도입 + dangling 참조 정리 (P8)

`--font` 이 `-apple-system / Noto Sans KR` 시스템 스택. Pretendard(CDN 또는 self-host)로 교체하면 한글 가독성·크로스플랫폼 일관성 향상. **현재 `tournament-roster-client.tsx:246` 에 `var(--font-pretendard, inherit)` 참조가 있으나 토큰 미정의**(기술부채) — Pretendard 도입 시 `--font-pretendard` 정식 정의하거나 dangling 참조 제거.
출처: [Pretendard README](https://github.com/orioncactus/pretendard/blob/main/packages/pretendard/docs/en/README.md)

### [P1] line-height 4pt 베이스라인 정렬 (§2 수치)

`.tm-text-*` 의 lh 가 4pt 미스냅(body-lg 26 / body 22 / label 19 / caption 18 / micro 15). 4pt 그리드로 정렬: body-lg→26 유지가 아니라 **24 또는 28**, body→**24**, label→**20**, caption→**16**, micro→**16**. 한국어 +0.1 여유 고려해 body 15px 는 24px(×1.6) 권장.
출처: [Spec.fm 8-pt grid](https://spec.fm/specifics/8-pt-grid) · [Material 3 type-scale](https://m3.material.io/styles/typography/type-scale-tokens)

### [P2] 능동형 + 불안상황 수동형 UX 라이팅 (P7)

해요체는 프로젝트 규칙으로 이미 적용 중. 추가로 **능동형 강제**("취소되었어요"→"취소했어요" 류)와 **개인정보·결제 등 불안 상황에서만 수동형**으로 안심시키는 패턴을 카피 가이드에 명문화.
출처: [앱인토스 consumer-ux-guide](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide.md) · [Toss 10y UX evolution](https://medium.com/@posinity/how-toss-became-a-design-powerhouse-10-years-of-ux-evolution-e9fc0c51d180)

### [P2] 의미 있는 마이크로인터랙션 (대기→즐거움)

토스는 송금/결제 처리 중 로딩(rotating face), 완료 시 체크 애니메이션으로 대기를 즐거운 경험으로 전환. v1 의 **결제·매칭확정·팀배정 등 비동기 완료 지점**에 의미 있는 완료 모션(스켈레톤→체크) 도입. 단 장식용 모션은 금지(rubric R-M1 유지), prefers-reduced-motion 대응.
출처: [Toss 10y UX evolution](https://medium.com/@posinity/how-toss-became-a-design-powerhouse-10-years-of-ux-evolution-e9fc0c51d180)

### [P2] elevation 0–5 그라데이션 스케일 명문화

v1 은 named shadow 4종(`--shadow-1/2/modal/sidebar`)만 있고 0–5 단계 의미 매핑이 없다. Material 3 패턴(0=flat, 1=card, 2=dropdown, 3=dialog, 4=overlay, 5=toast)으로 **역할 매핑**을 문서화하면 컴포넌트별 elevation 선택이 결정 가능해진다. (토큰 추가 자체는 토큰 감사 소관 — 여기서는 **역할 매핑 규칙**만.)
출처: [Material 3](https://seenode.com/blog/what-is-material-3-and-why-it-matters-in-2025) · [stan.vision card patterns](https://www.stan.vision/journal/ui-card-design-examples-best-practices-and-common-patterns)

---

## 4. rubric 보강 — 신규 검사 축 (R-X 시리즈 제안)

기존 rubric 빠른 체크리스트에 추가 권장하는 축(중복 없이 신규만):

| # | 규칙 | 기준 | 위반 등급 | 출처 |
|---|------|------|-----------|------|
| R-X1 | 다크패턴 — 진입 즉시 인터럽트 금지 | 페이지/로그인 진입 시 자동 바텀시트·모달·권한요청 | Critical | 앱인토스 가이드 ①②⑤ |
| R-X2 | text 대비 토큰 | 보조텍스트=grey600+, 링크텍스트=blue600+ (grey500/blue500 텍스트 금지) | Critical | WebAIM AA |
| R-X3 | 숫자:단위 2:1 + tabular-nums | 수치 컴포넌트에서 단위가 숫자와 동일 크기 | Warning | StyleSeed |
| R-X4 | Component 토큰 참조 | 컴포넌트가 Base(`--blue500`) 직접 참조 | Warning | TDS 3계층 |
| R-X5 | 능동형 카피 | 완료/액션 문구가 수동형(불안상황 외) | Warning | 앱인토스 UX writing |
| R-X6 | line-height 4pt 스냅 | tm-text lh 가 4pt 미배수 | Warning | Spec.fm |

---

## 5. 참조 관계

- **측정 가능 위반(색/타입/간격/radius/lh 토큰 자체):** → `docs/design/toss-reference-rubric.md` (R-C1~R-A3) + 진행 중인 토큰 감사
- **시각 규칙 정의(surface policy, glass 범위, 카드 시스템):** → `DESIGN.md` (canonical)
- **본 문서:** 위 두 문서가 다루지 않는 **토스-특유 net-new 원칙**(OKLCH, 3계층 토큰, One-Page-One-Thing, 다크패턴, 숫자:단위, Pretendard, 능동형 카피) + 그에 따른 v1 gap

---

## 부록 A. 전체 출처 목록

**Facet 1 — Toss Design System:**
- toss.tech/article/tds-color-system-update (OKLCH, 3계층, System-of-System)
- toss.tech/article/toss-design-system (레고 블록 철학)
- toss.tech/article/toss-design-system-guide (가이드 제작 방법론)
- toss.tech/article/rethinking-design-system (가드레일 vs 울타리)
- developers-apps-in-toss.toss.im/design/consumer-ux-guide.md (다크패턴 7정책, 해요체)
- medium @posinity — Toss 10년 UX 진화
- github.com/bitjaru/styleseed (Toss 판단 규칙 역공학, 숫자:단위 2:1)
- teqnoid.com — Korean UI/UX logic (One-Page-One-Thing)

**Facet 2 — Design System Anatomy:**
- figma.com/blog/design-systems-102 · tasteprofile.io DTCG guide · contentful.com design-token-system · designtokens.org DTCG 2025.10 · medium 대규모 Figma 분리 · seenode Material 3 · m3.material.io type-scale-tokens · thesigma.co component variants

**Facet 3 — Typography & Spacing:**
- m3.material.io applying-type · developer.apple.com HIG typography · spec.fm 8-pt grid · uxplanet 8pt grid · webupon type scale mobile · imperavi modular scale · uxdesign.cc semantic tokens · github pretendard README · medium fintech typography

**Facet 4 — Fintech Color & A11y:**
- eleken.co fintech design guide · backbase semantic colors · webaim.org contrast · hopper.workleap semantic color · aufaitux color tokens · patrickhuijs fintech brand colors · css-tricks contrast ratios · fourzerothree semantic colour

**Facet 5 — Mobile Fintech Components:**
- phenomenonstudio fintech patterns · uxdworld bottom tab bar · uxplanet bottom tab bar · eleken fintech guide · webstacks fintech-ux · designlibrary.sebgroup sticky button bar · toss.tech toss-design-system · toss.tech tds-component-making · designstudiouiux CTA best practices · stan.vision card patterns
