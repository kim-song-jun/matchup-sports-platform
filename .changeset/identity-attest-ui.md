---
"v1_api": minor
"v1_web": minor
---

내 기록 연결(claim)의 반대쪽 절반인 승인(attest) 동선을 만듭니다. 서버는 `GET /games/:gameId/identity-link-requests/pending`(내가 승인할 수 있는 대기 요청 목록)을 신설하고, 신청이 들어오면 승인 자격자(팀매치·리그: 사이드 팀 리더 / 대회: 등록팀 리더)에게 인앱 알림을 남깁니다(businessKey 멱등, 신청 tx와 원자 커밋). 프론트는 대회·리그 경기 상세에 "기록 연결 승인 요청" 카드를 실어 승인/거절을 처리합니다 — 요청이 있을 때만 보입니다.
