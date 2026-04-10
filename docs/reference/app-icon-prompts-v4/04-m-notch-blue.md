# 04-m-notch-blue

기준 시안: [04-m-notch-blue.png](/Users/kimsungjun/Documents/05_기타프로젝트_EtcProjects/sub-project/sports-platform/docs/reference/app-icons-v4/04-m-notch-blue.png)

## 포지션

- `M`형 패밀리 중 가장 또렷하고 공격적인 정체성을 가진 버전
- 홈 화면에서 즉시 읽히는 강한 notch가 핵심
- 친근함보다는 브랜드 개성을 조금 더 밀어주는 타입

## 디자인 의도

- 일반적인 `M`에서 notch만 키운 것이 아니라, notch 자체가 아이덴티티가 되어야 한다
- 과하게 날카롭거나 스포츠 팀 로고처럼 공격적이면 안 된다
- `브랜드 심볼`과 `앱 아이콘` 사이의 균형점을 찾는 케이스

## 추천 생성 세팅

- 출력 포맷: `PNG`
- 사이즈: `1024x1024`
- 배경: `opaque`
- 스타일: `flat vector`, `single-color app icon`, `strong center notch`

## 메인 프롬프트

```text
Use case: logo-brand
Asset type: blue-background mobile app icon concept

Brand context:
A smart sports matching platform for real-world users, combining trust, speed, and modern product design.

Primary request:
Create a monochrome app icon concept on a clear blue rounded-square background with one white symbol only.
Build a custom monogram-like mark that loosely suggests M, but with a much stronger and more distinctive center notch than a normal letterform.
The center notch should carry the identity.
The result should feel bold, modern, slightly athletic, and highly recognizable.

Background:
Vivid blue rounded square.
Simple, flat, premium.

Symbol:
Single-piece white mark.
Rounded ends.
Stable outer legs.
A sharper, more intentional center notch.
No extra graphics.

Shape language:
Clean, iconic, slightly energetic.
Not playful.
Not aggressive like a sports team badge.
Must feel like a digital product mark, not a font glyph.

Brand reference discipline:
Use only the abstract lessons of memorability, reduction, and silhouette from Apple, Nike, Adidas, Samsung, and Toss.
Stay clearly original.

Constraints:
No ball.
No shield.
No wing.
No orbit.
No mascot.
No gradient.
No shine.
No bevel.
No text.
No wordmark.

Output intent:
Centered 1024x1024 PNG app icon concept with immediate small-size readability.
```

## 네거티브 프롬프트

```text
default letter M, logo font, gaming badge, esports icon, school emblem, gradient, metallic chrome, sports equipment, over-thin shape, harsh spikes, corporate template, copied nike, copied apple, copied adidas, copied samsung, copied toss
```

## 후속 수정 프롬프트 1

```text
Push the identity further through the center notch and outer leg proportion.
Keep the blue background and white single-shape mark.
Make it feel more branded and less like a font glyph.
```

## 후속 수정 프롬프트 2

```text
Increase memorability at app-icon scale.
Preserve the stronger center notch.
Do not add detail or extra shapes.
Improve only silhouette and visual tension.
```
