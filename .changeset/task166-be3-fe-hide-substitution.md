---
'v1_web': minor
---

롤링 교체 종목의 콘솔에서 교체 UI를 숨긴다 (Task 166 BE-3 FE).

서버가 422 `SUBSTITUTION_NOT_TRACKED` 로 거부하므로(정본 §3), 버튼을 남기면 누를 수 있는데
항상 실패하는 액션이 된다. 종목을 화면에 하드코딩하지 않고 서버가 이미 내려주는
`substitutionPolicy.mode` 로만 가른다.

롤링 전용이던 "빠른 교체 모드" 패널은 도달 불가가 되어 삭제한다. `'limited'` 종목의 교체
버튼은 그대로다.
