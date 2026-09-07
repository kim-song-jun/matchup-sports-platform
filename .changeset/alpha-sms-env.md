---
'v1_api': patch
---

alpha 호스트 런타임 env 에 문자 인증 시크릿을 넣는 배포 스텝을 추가한다. 값이 없어
`issueChallenge` 가 503 을 돌려주고 있었고, 그 때문에 alpha 에서 신규 가입이 막혀 있었다.
