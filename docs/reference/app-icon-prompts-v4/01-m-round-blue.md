# 01-m-round-blue

기준 시안: [01-m-round-blue.png](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/docs/reference/app-icons-v4/01-m-round-blue.png)

## 포지션

- 홈 화면 인지성이 가장 좋은 기본형
- 서비스명이 `MatchUp`이든 `TeamMeet`이든 버틸 수 있는 추상 모노그램
- 가장 먼저 시도할 기본 스타팅 포인트

## 디자인 의도

- 블루 배경 위에 흰 심볼 하나만 남기는 매우 절제된 아이콘
- 심볼은 `M`을 은근히 암시하지만 폰트처럼 보이면 실패
- 둥글고 부드럽지만 유치하지 않게, 앱 아이콘답게 묵직해야 한다
- 레퍼런스는 `Toss의 절제`, `Apple의 실루엣 우선`, `Nike의 한 번에 읽히는 덩어리감`, `Samsung의 정제감`, `Adidas의 모듈성`
- 중요한 점: 절대 특정 브랜드처럼 보여서는 안 된다

## 추천 생성 세팅

- 출력 포맷: `PNG`
- 사이즈: `1024x1024`
- 배경: `opaque`
- 개수: 한 번에 1개씩 생성
- 스타일: `flat vector`, `single-color mark`, `app icon concept`

## 메인 프롬프트

```text
Use case: logo-brand
Asset type: premium mobile app icon concept

Brand context:
An AI-powered multi-sport social matching platform for amateur sports communities.
The product must feel trustworthy, fast, friendly, and clean.

Primary request:
Design a monochrome app icon concept with a vivid blue rounded-square background and one solid white symbol only.
Create a custom monogram-like mark that subtly suggests the letter M, but does not look like a normal font glyph.
The mark should feel iconic, proprietary, and immediately recognizable on a mobile home screen.

Background:
Bright trustworthy blue rounded square, smooth corners, no texture, no lighting effect.

Symbol:
One single-piece white silhouette.
Rounded terminals.
Strong vertical legs.
A smooth but distinctive top-center notch.
The top dip should create identity, not just spell a letter.

Shape language:
Soft and product-friendly, but not childish.
Heavy enough to survive small-size rendering.
Balanced left and right weight.
Calm, stable, and slightly athletic.

Brand reference discipline:
Take only the silhouette-first reduction and confidence of global product identities such as Apple, Nike, Adidas, Samsung, and Toss.
Do not imitate, echo, or approximate any real logo.

Constraints:
No sports ball.
No shield.
No mascot.
No gradient.
No gloss.
No bevel.
No texture.
No outline.
No text or wordmark.
No extra symbol around the mark.

Output intent:
Centered 1024x1024 PNG app icon concept.
The icon must feel native to a premium mobile app.
```

## 네거티브 프롬프트

```text
generic letter M, default font, sans-serif glyph, logo template, football icon, basketball icon, esports badge, gaming logo, mascot, glossy plastic, 3d bevel, chrome, gradient mesh, serif monogram, thin strokes, sharp spikes, stock startup logo, copied nike, copied apple, copied adidas, copied samsung, copied toss
```

## 후속 수정 프롬프트 1

```text
Make the symbol less typographic and more iconic.
Keep the same blue background and single white symbol.
Increase uniqueness through the top center notch and overall silhouette tension only.
Do not add extra elements.
```

## 후속 수정 프롬프트 2

```text
Push the mark toward a world-class mobile app icon.
Keep it minimal and single-color.
Preserve the soft rounded feel, but make the silhouette more memorable at 16px.
No extra detail, no ornament, no secondary graphics.
```
