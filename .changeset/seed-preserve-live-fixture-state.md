---
'@teameet/v1-api': patch
---

alpha QA 시드가 라이브 운영이 확정한 픽스처 상태·스코어를 재배포 때 덮어쓰지 않게 한다.

픽스처 upsert 의 `update` 절에 `status` 가 실려 있어, 운영자가 경기를 종료·결과 확정해
`fixture.status = completed` 가 된 뒤에도 다음 배포에서 시드 값(`in_progress`)으로 되돌아갔다.
순위 재계산은 `status: 'completed'` 픽스처만 읽으므로 그 경기가 순위에서 통째로 빠졌다
(알파 실측: 2:0 으로 이긴 팀이 0승 0-0 으로 표시). 결과 스코어도 같은 이유로 `create` 에만 쓴다.
