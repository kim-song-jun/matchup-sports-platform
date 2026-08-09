---
"v1_web": patch
---

쿼리 없는 `/terms` 로 들어오면 이용약관 본문을 보여준다 — 가입 동의 단계는 `?mode=signup`
으로 명시한다.

## 무엇이 문제였나

`/terms` 는 **가입 약관 동의 단계**로 쓰이고 있었다(`signup-client.tsx` 가 `router.push('/terms')`,
`auth.view-model.ts` 의 `signupHref` 도 `/terms`). 그래서 북마크·검색엔진·공유 링크로 들어온
사람은 이용약관 대신 가입 동의 체크박스 화면을 봤다. alpha 실측: `/terms` 290자(제1조 없음) vs
`/terms?document=terms` 1910자("제1조 목적…").

앱 안의 공개 약관 링크는 이미 전부 `?document=` 로 올바르게 걸려 있어(랜딩 푸터 5개, 로그인
화면 등) 실사용 경로는 멀쩡했다 — 외부 유입만 어긋나 있었다.

## 어떻게 갈랐나

`mode` 는 이미 `social` / `renewal` 로 쓰이는 1급 파라미터다. 여기에 `signup` 을 추가해
가입 진입을 명시하고, **document 도 mode 도 없으면 읽으러 온 방문자**로 본다.

| 진입 | 결과 |
|---|---|
| `/terms` | 이용약관 본문 |
| `/terms?mode=signup` | 가입 동의 게이트 |
| `/terms?mode=social` · `?mode=renewal` | 기존 그대로 |
| `/terms?document=...` | 기존 그대로 |

**재동의 경로는 보존했다.** `pending-social-signup-gate` 는 무한 루프를 피하려고 `/terms` 에서는
리다이렉트를 걸지 않는다(`pathname !== '/terms'`). 그래서 재동의 대상(compliance=false)은 이
화면이 직접 막아야 하고, 그 예외를 명시적으로 남겼다. 로딩 중에는 compliant 가 undefined 라
본문을 먼저 보여주고 비준수로 확인되면 게이트로 넘어간다 — 흔한 쪽(읽으러 온 방문자)을
기다리게 하지 않기 위해서다.

`usePathname()` 은 쿼리를 포함하지 않으므로 `pathname === '/terms'` 로 판정하는 기존 분기
3곳(social-signup-access, pending-social-signup-gate ×2)은 영향받지 않는다.

테스트는 세 갈래가 서로를 침범하지 않는지 본다. 게이트 존재 판정에는 '전체 동의' 버튼을 쓴다
— 하단 CTA 라벨은 '필수 약관에 동의해 주세요' ↔ '동의하고 회원가입하기'로 바뀌어 기준이 못 된다.
