# App Icon Prompt Pack

## 프로젝트 요약

- 서비스 성격: AI 기반 멀티스포츠 소셜 매칭 플랫폼
- 핵심 기능: 개인 매치, 팀 매칭, 용병, 레슨, 장터, 채팅, 결제, 신뢰 시스템
- 브랜드 톤: 활발, 스마트, 친근
- 제품 인상: 토스 계열의 신뢰감 + 생활체육 커뮤니티의 따뜻함 + 절제된 스포츠 에너지
- 기본 원칙: 앱 아이콘은 UI의 단일 블루를 그대로 복제하지 않고, 블루를 중심으로 보조색을 정교하게 섞어 멀티스포츠성과 기억점을 만든다

## 브랜드 네이밍 메모

- 현재 저장소 문서와 PWA manifest는 `MatchUp`을 사용한다
- 실제 웹 메타데이터와 UI 표기는 `TeamMeet`를 사용한다
- 그래서 아이콘은 당분간 텍스트 없는 심볼형을 우선하고, 모노그램이 필요할 때만 `T` 또는 `M`을 선택한다

## 공통 컬러 전략

- 블루는 브랜드의 주축으로 유지한다
- teal은 진한 jade보다 밝고 깨끗한 aqua 쪽으로 두어 의료 앱처럼 보이지 않게 한다
- warm accent는 brass나 copper보다 coral 계열의 작은 점형 강조가 더 잘 맞는다
- 배경은 누런 ivory보다 차가운 off-white 또는 deep navy를 우선한다
- 권장 비율: 중립 배경 55~65 / 브랜드 블루 20~25 / aqua support 10~15 / micro coral 2~4

## 개선된 공통 팔레트

- Cloud White: `#F5F7FB`
- Mist Gray: `#E9EEF5`
- Ink Navy: `#172033`
- Royal Blue: `#316CFF`
- Aqua Signal: `#59C3D8`
- Coral Spark: `#FF7A59`

## 색감 수정 메모

- 이전 조합의 문제는 warm ivory, dark jade, brass가 함께 들어가며 인상이 약간 탁하고 무거워졌다는 점이다
- 이 프로젝트는 토스 계열의 신뢰감과 스포츠 앱의 기동성이 함께 보여야 하므로, 더 차갑고 맑은 베이스가 맞다
- 그래서 이번 버전은 `clean cool neutral + royal blue + aqua + micro coral` 구조로 정리한다
- coral은 넓게 쓰지 않고 action point처럼 1개 요소에만 넣는다

## 공통 Negative Prompt

```text
full monochrome blue, rainbow palette, generic soccer ball, trophy, shield badge cliché, esports logo, mascot, cartoon character, aggressive flames, glossy gradient, glassmorphism, chrome, bevel, 3D extrusion, thin fragile strokes, tiny interior details, text, wordmark, phone mockup, presentation board, multiple icons in one image, stock logo sheet, cluttered composition
```

## 공통 Suffix

```text
single centered icon only, plain background, export-ready vector mark, no mockup, no wordmark, no texture, no lighting, no shadow, no multiple options sheet
```

---

## Case 01. Match Node

### 컨셉

- 가장 이 프로젝트다운 방향
- AI 매칭, 공정한 밸런스, 사람 간 연결, 멀티스포츠 확장성을 가장 자연스럽게 담는다
- 브랜드명이 바뀌어도 심볼 자체가 유지되기 쉽다

### 추천 팔레트

- Background: `#F5F7FB`
- Anchor/detail: `#172033`
- Primary path: `#316CFF`
- Secondary path: `#59C3D8`
- Micro accent node: `#FF7A59`

### 메인 프롬프트

```text
Use case: logo-brand
Asset type: mobile app icon, favicon, PWA icon

Primary request:
Design a premium app icon for an AI-powered multi-sport social matching platform used by amateur sports communities. Create an abstract meeting-node symbol made from two thick curved paths flowing toward one small central node, expressing smart matching, fair balance, and human connection.

Scene/background:
Plain cool off-white rounded-square background.

Subject:
Two asymmetric but balanced geometric paths, one royal blue and one bright aqua, converging into one tiny coral node. Add a subtle ink-navy anchor shape or inner contour so the symbol feels grounded, crisp, and trustworthy.

Style/medium:
Flat vector logo, premium Korean tech-startup aesthetic, clean geometry, no texture, no lighting effects.

Composition/framing:
Centered icon, strong silhouette, 12-14% safe margin, slightly dynamic diagonal energy, readable at 16px and 32px, no tiny cut lines.

Lighting/mood:
None; flat, crisp, cool, modern, friendly but intelligent.

Color palette:
Background #F5F7FB
Anchor/detail #172033
Primary path #316CFF
Secondary path #59C3D8
Micro accent node #FF7A59

Color balance:
Cool neutral dominant, blue as hero, aqua clearly visible but secondary, coral under 4%.

Constraints:
No literal ball.
No literal map pin.
No text.
No gradients.
Must feel like connection, trust, and active movement.
Should work equally well as a website favicon and mobile app icon.
Avoid muddy beige, dark jade, metallic gold, or retro cream tones.

Avoid:
full monochrome blue, rainbow palette, generic sports collage, trophy icon, esports aggression, glossy effects, clutter
```

### SVG 시안 방향

- `192x192` rounded square, `rx 40`
- cool off-white 배경 위에 royal blue curve 1개와 aqua curve 1개가 중앙으로 모이는 구조
- 중앙에는 tiny coral node만 둔다
- navy는 바깥 윤곽이나 안정축으로 최소한만 사용한다
- 내부 요소는 최대 3개만 유지한다

---

## Case 02. Shield Orbit

### 컨셉

- 신뢰 시스템, 검증, 운영 안정성이 강하게 느껴지는 방향
- 스포츠 플랫폼이지만 게임 배지나 보험 앱처럼 보이지 않게 조절하는 것이 핵심
- 관리자 기능, 결제, 분쟁 처리까지 있는 제품 성격과도 잘 맞는다

### 추천 팔레트

- Background: `#121826`
- Shield/base contrast: `#F3F6FB`
- Primary orbit: `#4A78FF`
- Secondary arc: `#6CC9BC`
- Micro highlight: `#FF8A68`

### 메인 프롬프트

```text
Use case: logo-brand
Asset type: mobile app icon, favicon, trust-centric brand mark

Primary request:
Create a refined app icon for a verified multi-sport matchmaking platform. Build a geometric shield-orbit symbol that represents fair play, identity verification, reliable scheduling, and trusted competition.

Scene/background:
Deep slate rounded-square background.

Subject:
A simplified shield silhouette integrated with one orbital ring and one central match point. The outer frame is clean light contrast, the main orbital shape is royal blue, a secondary stabilizing arc is soft aqua-teal, and a very small coral highlight marks the center.

Style/medium:
Minimal vector logo, premium fintech-meets-sports branding, clean edges, no decorative effects.

Composition/framing:
Centered, symmetrical base with one subtle asymmetry for motion, thick strokes, compact silhouette, icon-first not badge-first.

Lighting/mood:
Serious, calm, trustworthy, lightly energetic.

Color palette:
Background #121826
Shield/base #F3F6FB
Primary orbit #4A78FF
Secondary arc #6CC9BC
Micro highlight #FF8A68

Color balance:
Dark base dominant, blue primary, aqua-teal support, coral tiny accent only.

Constraints:
Must not feel military or gaming.
Must not look like an insurance app.
Must still imply sport and movement through orbit and geometry.
No text, no trophy, no chevrons, no heavy crest styling.
Avoid muddy metals, bronze gradients, emerald-heavy tones, or thick heraldic framing.

Avoid:
badge cliché, esports crest, metallic shield, hyper masculine aggression, 3D chrome, gradient glow
```

### SVG 시안 방향

- navy rounded square 배경
- 안쪽에는 둥근 하단을 가진 추상 shield outline
- shield 내부에 orbit line 1개와 support arc 1개를 넣는다
- coral dot은 중앙 또는 약간 치우친 위치에 아주 작게 둔다
- 문장형 메시지보다 `보호 + 연결 + 움직임`이 먼저 보여야 한다

---

## Case 03. Monogram Pulse

### 컨셉

- 브랜드 아이콘으로 빠르게 각인시키기 좋은 방향
- 텍스트 로고 없이도 `T` 또는 `M`의 인상을 은근하게 심을 수 있다
- 단, 너무 문자처럼 보이면 일반 스타트업 모노그램처럼 약해지므로 추상성과 균형이 중요하다

### 추천 팔레트

- Background: `#FAFBFD`
- Base: `#1B2430`
- Primary cut/path: `#356BFF`
- Secondary cut/path: `#8ED8E8`
- Micro accent: `#FF7F5F`

### 메인 프롬프트

```text
Use case: logo-brand
Asset type: app icon, favicon, monogram-based brand symbol

Primary request:
Design a monogram-style icon for a premium AI sports matching platform. Create a bold geometric symbol that subtly reads as T or M through negative space, while also suggesting motion, pairing, and rhythm.

Scene/background:
Clean snow-gray rounded-square background.

Subject:
A monolithic graphite base shape cut by one vivid blue motion channel and one pale aqua balancing channel. Add a very restrained coral micro accent at the meeting point or turn point to suggest activation and successful match.

Style/medium:
Flat vector, geometric, sophisticated, minimal, highly branded.

Composition/framing:
Centered, compact, heavy enough for favicon readability, one-piece silhouette with controlled negative space, no thin linework.

Lighting/mood:
Modern, premium, calm confidence, not playful-cute, not corporate-generic.

Color palette:
Background #FAFBFD
Base #1B2430
Primary cut/path #356BFF
Secondary cut/path #8ED8E8
Micro accent #FF7F5F

Constraints:
The monogram must be subtle, not a literal typography logo.
It should still work if the viewer reads it only as an abstract symbol.
No text, no serif, no sporty swoosh cliché, no speed lines.
Avoid muddy warm tones, dirty off-white, overly saturated teal, and thick corporate geometry.

Avoid:
generic startup monogram, all-blue fill, rainbow accenting, clip-art geometry, over-detailed negative space
```

### SVG 시안 방향

- graphite 덩어리형 심볼 1개를 중심으로 둔다
- 내부 negative space로 `T` 또는 `M`의 리듬만 암시한다
- blue와 pale aqua는 채널처럼 흐르게 하고 면적은 과하지 않게 유지한다
- coral은 교차점이나 회전점에 점 하나 수준으로만 사용한다

---

## 보조 팔레트 케이스

### Palette A. Stadium Dawn

- Cloud White: `#F5F7FB`
- Ink Navy: `#172033`
- Royal Blue: `#316CFF`
- Aqua Signal: `#59C3D8`
- Coral Spark: `#FF7A59`

### Palette B. Court Night

- Night Slate: `#121826`
- Mist White: `#F3F6FB`
- Signal Blue: `#4A78FF`
- Soft Aqua: `#6CC9BC`
- Coral Point: `#FF8A68`

### Palette C. Clean Ice

- Snow Gray: `#FAFBFD`
- Graphite: `#1B2430`
- Arctic Blue: `#356BFF`
- Ice Cyan: `#8ED8E8`
- Coral Accent: `#FF7F5F`

---

## 추천 우선순위

1. Match Node
2. Monogram Pulse
3. Shield Orbit

### 추천 이유

- `Match Node`: 서비스 본질과 가장 가깝고 브랜드명 변경에도 유연하다
- `Monogram Pulse`: 브랜드화가 강하지만 이름 체계가 정리되면 더 좋아진다
- `Shield Orbit`: 신뢰감은 강하지만 다소 딱딱해질 수 있다
