# 화면에 넣는 법

산출물은 `apps/v1_web/public/illustrations/<name>-320.webp` / `-640.webp` 다. 같은 origin 이라 `next/image` 에 remotePatterns 없이 쓸 수 있다.

## 빈 상태 (`EmptyState`)

`components/v1-ui/primitives.tsx` 의 `EmptyState` 에 `illustration` prop 을 넘긴다. 아이콘 원(`.tm-empty-icon`)은 그래픽이 있을 때 렌더하지 않는다 — 두 개를 겹치지 않는다.

```tsx
<EmptyState
  fill
  illustration={{ name: 'matches-empty' }}
  title="조건에 맞는 매치가 없어요"
  sub="다른 종목을 선택하거나 전체 매치로 돌아가면 모집 중인 매치를 볼 수 있어요."
/>
```

- 표시 크기는 `.tm-empty-illustration` 이 정한다(160px, 360 이하 136px). 화면마다 크기를 바꾸지 않는다.
- `alt=""` + `aria-hidden` — 의미는 제목·본문이 전달한다. 그래픽은 장식이다.
- `priority` 를 켜지 않는다. 빈 상태는 LCP 후보가 아니다.

## 랜딩·소개 섹션의 그래픽 영역

`landing-rhythm` 스킬의 섹션 모듈(키워드 → 타이틀 → 본문 → 그래픽) 네 번째 자리에 넣는다. 그래픽 영역은 `--tint-blue` 또는 `--grey50` 배경의 카드(`--radius-hero`)이고, 이미지는 그 안에서 `object-fit: contain`, 카드 폭의 60~70% 만 차지한다(여백이 디자인이다).

```tsx
<div className="tm-graphic-well">
  <Image src="/illustrations/team-jersey-640.webp" alt="" aria-hidden width={640} height={640} sizes="(max-width: 480px) 60vw, 280px" />
</div>
```

## 다크 모드

투명 배경이라 별도 다크 변형은 만들지 않는다. 대신 다크 화면 위에서 **테두리 후광(밝은 fringe)** 이 없는지 실제 캡처로 본다. 후광이 보이면 프롬프트에 `no light halo around edges` 를 붙여 다시 만든다. CSS 로 감추지 않는다.

## 검증

- 라이트·다크 두 상태에서 390 폭 캡처(`.dark` 클래스는 `<html>` 에 붙는다).
- 이미지가 실제로 로드됐는지 `naturalWidth > 0` 으로 확인한다. 200 응답만 보고 통과로 읽지 않는다.
- vitest: 그래픽이 있을 때 `.tm-empty-icon` 이 없고 `img[src*="<name>-640"]` 이 있는지, 없을 때 예전 아이콘 경로가 그대로인지 두 방향 다 단언한다.
