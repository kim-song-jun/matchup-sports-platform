---
"v1_web": patch
---

필드 담당자 경기 콘솔의 뒤로가기가 404로 떨어지던 것을 고친다.

`FieldOperatorConsoleFrame`의 뒤로가기 링크가 `/tournament-ops`를 가리켰는데, 그 경로에는 `layout.tsx`만 있고 `page.tsx`가 없어 **404**였다. 이 프레임의 주석은 "누르면 막히는 링크를 만들지 않는 것이 이 저장소의 원칙(D-16)"이라고 선언해 놓고, 정작 자기 뒤로가기가 그 원칙을 어기고 있었다.

alpha 실측에서 필드 담당자 동선을 끝까지 걸었을 때, 앞선 수정(#416)으로 진입은 뚫렸지만 콘솔 화면의 RSC prefetch에서 `404 /tournament-ops`가 계속 관측됐다 — 이 링크가 남은 원인이었다.

`tournamentId`를 프레임에 넘겨 **왔던 담당 경기 목록**(`/my/tournament-staff/:tournamentId`)으로 돌린다. `tournamentId`가 없으면 대회 목록(`/my/tournament-staff`)으로 한 단계 물러선다. aria-label도 실제 목적지에 맞춰 "담당 경기 목록으로 돌아가기"로 바꿨다.

`_gate.test.tsx`가 이 죽은 링크(`href='/tournament-ops'`)를 계약으로 못박고 있어 함께 뒤집었다 — #416에서 같은 파일의 AccessDenied CTA 계약을 뒤집을 때 이 두 번째 단언을 놓쳤다.
