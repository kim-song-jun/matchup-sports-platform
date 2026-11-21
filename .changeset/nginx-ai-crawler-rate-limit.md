---
"v1_web": patch
---

AI 수집기(GPTBot · ChatGPT-User · OAI-SearchBot · ClaudeBot · meta-externalagent · Bytespider · CCBot · PerplexityBot · Amazonbot)가 서버 렌더 화면과 이미지 변환을 한꺼번에 때려 웹 한 개가 그대로 받던 것을, nginx 에서 수집기 종류별로 제한해요. 화면은 분당 120건(순간 60건 더), 이미지는 분당 300건(순간 100건 더)을 넘으면 429 를 돌려줘요. 사람과 검색 엔진(Googlebot · bingbot · Yeti · Daumoa · Applebot)은 제한 대상이 아니고, 운영과 alpha 설정에 같이 들어가요.
