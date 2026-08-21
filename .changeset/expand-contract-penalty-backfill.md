---
"v1_api": patch
---

승부차기 백필 마이그레이션의 세 문장을 expand/contract 게이트의 reviewed 목록에 올려 alpha
배포 차단을 푼다.

`20260818160000_v1_team_record_facts_penalty_result`가 append-only 트리거를 트랜잭션 동안만
끄고 잘못 기록된 DRAWN 행을 정정하는데, 게이트가 `ALTER TABLE ... DISABLE TRIGGER`와 `UPDATE`를
non-additive로 판정해 `deploy` job이 실패했다(alpha 배포 전면 중단). 세 문장 각각에 롤링 배포·
롤백 양방향 안전성 근거를 적어 등록했다 — 구 인스턴스는 이 테이블에 INSERT만 하고, 정정된
값은 되돌아가도 사실에 부합하며, WHERE 조건상 재실행은 no-op이다.
