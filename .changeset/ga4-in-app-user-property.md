---
"v1_web": patch
---

인앱 브라우저 종류(`in_app_browser`)가 GA 에 전혀 실리지 않던 문제를 고쳤어요. `gtag('set', {...})` 로 넣은 임의 키는 gtag.js 가 전송하지 않아요(alpha 실측: `traffic_type` 은 `tt=internal` 로 나갔지만 `in_app_browser` 는 어떤 전송에도 없었음). 이제 사용자 속성(`user_properties`)으로 넣어 자동 페이지 조회를 포함한 모든 전송에 `up.in_app_browser` 로 실립니다.
