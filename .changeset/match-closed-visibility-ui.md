---
v1_api: minor
v1_web: minor
---

목록에서 신청 마감된 매치를 흐린 카드 + '신청 마감' 배지로 구분해 보여주고, 개인 매치에도 호스트용 모집 마감/다시 열기를 추가합니다. `GET /me/team-matches` 가 목록·상세와 같은 `displayState`/`deadlineAt` 을 싣도록 맞춰 목록과 상세의 마감 표시가 어긋나던 문제를 없앱니다.
