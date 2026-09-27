---
"v1_api": patch
---

Task168 프로덕션 전환 러너(`deploy/prod-task168.sh`)가 실제 Postgres·실제 도커 이미지·실제
prisma CLI 와 맞물려 동작하는지 처음으로 증명하는 통합 테스트를 추가했다
(`scripts/qa/test-prod-task168-real-db.sh`) — 지금까지의 테스트는 docker/psql fake 기반이라
러너의 SQL 이 실제 스키마에서 파싱·동작하는지, pinned 전환 도구가 실제 옛 대회 fixture 를
정말 변환하는지는 검증하지 못했다. 이 과정에서 M11 적용 후 Stage B 재실행이 항상 크래시하는
진짜 버그를 발견해 러너 쪽에서 별도로 고쳤다(`prod_assert_legacy_tables_retired` 도입).
CI 에는 이미지 빌드 없이 그 수정의 SQL 만 실제 Postgres 로 검증하는 가벼운 스텝
(`scripts/qa/test-task168-legacy-retirement-real-db.sh`)을 "V1 migration replay + drift gate"
바로 뒤에 추가했다. 사용자에게 보이는 동작 변화는 없다.
