---
'v1_web': patch
---

확정된 리그 경기의 "결과 정정" 이 검토 대기 목록으로 떨어지던 데드엔드를 고친다.

`resultStage === 'official'` 이면 `records/corrections?fixtureId=` 로 보낸다. `result-review` 는
*검토 대기* 목록이라 확정된 경기가 거기 없어서, 라벨은 "결과 정정" 인데 열리는 화면은
"검토할 결과가 없어요" 였다(alpha 실측).
