---
'v1_api': major
---

리그 경기 결과 이의 테이블·enum 을 제거한다 (Task 166 contract).

정본 §4 가 "결과는 보내기 → 어드민 확인 한 단계, 이의 없음" 으로 확정하면서 이의 경로 자체가
사라졌고, expand 단계(#999)가 API·서비스·화면·알림을 이미 걷어냈다. 여기서 `v1_league_match_disputes`
테이블과 `V1LeagueMatchDisputeStatus`·`V1LeagueMatchDisputeResolution` enum 을 지운다.

읽거나 쓰는 코드는 0 이므로 런타임 동작은 달라지지 않는다. **alpha 의 기존 이의 행은 복원할 수
없으므로 사용자 직접 승인 뒤에만 머지한다.**
