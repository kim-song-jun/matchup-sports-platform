---
'v1_api': patch
---

REST 경기 lifecycle 명령 뒤 승인된 각 콘솔이 권한을 다시 확인한 전체 최신 경기 스냅샷을 받도록 하고, 미완료된 snapshot refresh가 있을 때 committed event를 그 뒤로 전달해요. socket별 bounded FIFO와 transport 종료 후 전체 backfill 복구를 추가하고 HTTP/Socket.IO 통합 회귀를 보강해요. API 전용 테스트 의존성도 추가했어요. CI의 실제 통과 여부와 회수·만료 경계 검증은 아직 남아 있어요.
