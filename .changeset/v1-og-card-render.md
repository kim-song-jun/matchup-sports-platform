---
'v1_web': patch
---

선수 카드 OG 이미지가 모든 사용자에게 같은 폴백을 주던 것을 고친다. 폰트를 `readFile`
로 읽고(Node fetch 는 `file:` 미지원), satori 가 받지 못하는 숫자 자식을 문자열로 감싼다.
