---
"v1_web": patch
---

약관 재동의(`/terms?mode=renewal`)에서 "동의하고 계속하기"를 첫 클릭했을 때, 서버에는 동의가 정상 반영됐는데도 화면이 목적지로 이동하지 못하고 `redirect` 쿼리만 자기 자신에게 붙인 채 멈춰 있던 문제를 고쳤다.

원인은 `PendingSocialSignupGate`가 라우트 진입을 막을지 판단할 때 쓰는 `authMe` 캐시의 `termsCompliance`가, 동의 제출(`useV1AcceptSignupTerms`)이 성공한 직후 `invalidateQueries`로만 갱신되고 있었다는 것이다. `invalidateQueries`는 백그라운드 refetch를 예약할 뿐 즉시 끝나지 않기 때문에, 곧바로 이어지는 `router.replace('/home')`이 refetch 완료보다 먼저 실행돼 게이트가 갱신 전 `compliant:false` 스냅샷을 읽고 사용자를 `/terms?mode=renewal&redirect=%2Fhome`로 다시 튕겨보냈다(첫 클릭이 반응 없어 보이는 원인). 두 번째 클릭이 통했던 건 그 사이에 백그라운드 refetch가 우연히 끝났기 때문일 뿐이었다.

동의 제출 응답에 이미 서버가 재계산한 최신 `compliance`가 들어 있으므로, 이를 `authMe` 캐시에 동기적으로 반영해 레이스를 없앴다. `invalidateQueries` 호출은 다른 `authMe` 필드까지 최신화하기 위해 그대로 유지한다.
