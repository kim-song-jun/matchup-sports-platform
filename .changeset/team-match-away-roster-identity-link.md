---
'v1_api': patch
---

친선 팀 매치에서 결과가 OFFICIAL로 확정돼도 특정 참가자의 개인 기록(`GET /users/:id/records`)이 항상 비어 있던 것을 고친다.

팀 매치가 생성될 때(호스트 측)와 상대팀 신청이 승인될 때(어웨이 측) 각각 초기 라인업 참가자 스냅샷이 자동으로 만들어지는데, 이 두 경로 모두 `V1GameParticipant.userId`를 싣지 않았고 신원 연결(`V1ParticipantIdentityLinkCurrent`)도 만들지 않았다. 팀장이 이후 `saveLineup`으로 라인업을 명시적으로 재저장하면 그 재저장 경로가 연결을 만들어 문제가 가려지지만, 로스터가 이미 맞아 보여 재저장할 필요가 없으면 이 스냅샷이 그대로 최신 리비전으로 남는다 — 개인 기록 공개 자격 판정은 `participant.userId` 컬럼이 아니라 신원 연결 행을 요구하므로, 그 참가자의 골·카드는 팀 전적에는 반영되면서 개인 기록에는 영원히 나타나지 않았다.

두 스냅샷 생성 경로 모두에 실제 계정(`userId`)을 싣고, 대회/리그가 이미 쓰는 `createSourceRosterIdentityLinks`로 신원 연결을 함께 만들도록 고쳤다.
