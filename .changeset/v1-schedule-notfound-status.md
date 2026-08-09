---
"v1_web": patch
---

없는 대회의 `/tournaments/:id/schedule` 가 여전히 HTTP 200 을 반환하던 것을 실제로 고친다(#298·#302 후속·근본 해소).

**근본 원인(2026-08-09 alpha 실측으로 규명)**: 이 라우트는 없는 대회에서 not-found UI 를 정상 렌더하고
robots `noindex` 까지 걸리는데 **HTTP 상태코드만 200** 이었다. 엔드포인트 문제가 아니라 **Next.js 스트리밍
status-commit 타이밍** 문제였다 — 페이지 컴포넌트에서만 `notFound()` 를 부르면(형제 라우트 패턴) 이
라우트는 `loading.tsx` Suspense 경계 밖 셸이 200 으로 먼저 flush 된 뒤 `notFound` 가 도달해, not-found
UI 는 렌더되지만 상태가 200 에 박힌다. 형제(bracket/results/awards/reviews)는 타이밍상 우연히 flush 전에
`notFound` 가 도달해 404 였을 뿐, 같은 페이지-레벨 게이트를 공유한다. #298(페이지 게이트 정렬)·#302
(generateMetadata 를 형제와 같은 엔드포인트로)로도 안 고쳐진 이유가 이것.

**수정**: `generateMetadata` 에서 없는 대회일 때 `notFound()` 를 던진다. `generateMetadata` 는 스트리밍
셸보다 먼저 await 되므로, 여기서 던지면 200 셸이 flush 되기 전에 404 가 확정된다(타이밍 무관·결정적).
not-found UI 는 `schedule/not-found.tsx` 가 자체 `noindex` 메타와 함께 렌더한다. 페이지 컴포넌트의
`notFound()` 게이트는 방어로 유지한다.

계약 테스트(`public-subroute-not-found.test.ts`)에 `generateMetadata` 가 없는 대회에서 `notFound()` 를
던지는지 검증하는 케이스를 추가해, 이 fix 를 되돌리면(다시 `buildNoIndexMetadata` 반환) 회귀를 잡는다.
