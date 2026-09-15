---
'v1_web': patch
---

홈 추천 카드의 종목 그래픽이 미디어 밴드를 밀어 올리던 것을 고칩니다.

`.tm-match-hero-graphic .tm-match-sport-illustration`(176px / ≥1024 208px)이 같은 특이도로
파일 뒤쪽에 선언돼 있어, 홈 전용 112/128px 규칙을 선언 순서로 이기고 있었습니다.
그래픽이 208px 로 그려지면서 `aspect-ratio: 2 / 1` 밴드가 내용에 밀려 208px 까지 자랐고
(aspect-ratio 는 내용이 넘치면 양보합니다), 같은 행의 사진 카드 밴드 152px 과 다시 벌어졌습니다.

선택자를 `.tm-home-featured-stack .tm-match-hero-graphic .tm-match-sport-illustration` 로
한 단계 좁혀 선언 순서에 기대지 않게 했습니다.
