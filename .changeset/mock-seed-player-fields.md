---
"v1_api": patch
"v1_web": patch
---

목업 대회 생성이 명단 단계에서 500 으로 실패하던 문제 수정. `V1TournamentPlayer` 에 없는
`jerseyNumber` 를 넘기고 있었다 — 로컬 generated Prisma client 가 stale 이라 tsc 가 통과했고,
mock prisma 는 payload 를 검증하지 않아 유닛테스트도 통과해 alpha 에서야 드러났다.
실 시드와 같은 `eligibilityStatus: 'non_pro'` 로 교체하고, `schema.prisma` 원문을 권위로 삼아
payload 필드가 모델에 실재하는지 대조하는 테스트를 추가했다.

생성 결과에 참가 팀·테스트 계정(이메일·닉네임·역할) 목록을 함께 반환해 어드민 패널에서
어떤 계정으로 로그인해 검증할지 바로 볼 수 있게 했다. 비밀번호는 저장소가 공개돼 있어
응답·화면 어디에도 싣지 않는다.
