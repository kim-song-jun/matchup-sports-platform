---
'v1_web': patch
---

인라인 style 의 borderRadius 를 radius 토큰으로 옮기고, 게이트가 CSS 만 보던
사각지대(마크업 쪽 리터럴)를 막았습니다. 토큰과 값이 같던 곳만 무손실로
치환했고, 스케일에 없는 값은 모양이 바뀌는 변경이라 baseline 으로 잠가만
두었습니다.
