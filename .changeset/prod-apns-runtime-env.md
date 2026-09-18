---
"v1_api": patch
---

프로덕션 배포가 iOS 푸시(APNs) 설정을 함께 주입할 수 있게 준비한다.

- **무엇이 달라지나**: prod 배포의 런타임 env 동기화에 `APNS_KEY_ID`·`APNS_TEAM_ID`·
  `APNS_PRIVATE_KEY`(alpha 와 같은 GitHub secret)와 `APNS_BUNDLE_ID=kr.co.teameet`(고정값)이
  들어간다. main 에 APNs 어댑터가 올라오기 전까지는 구 API 가 이 값을 무시하므로 지금 당장
  바뀌는 동작은 없고, 승격 뒤 첫 배포부터 iOS 푸시가 켜진다.
- **안전장치**: private key 는 원본 PEM·`\n` 한 줄·base64 어느 모양으로 저장돼 있어도 한 줄로
  정규화해 쓴다(prod `.env` 는 compose 원형이라 실제 개행이 들어가면 배포가 죽는다). OpenSSL 이
  못 읽는 키는 그 그룹(APNs 4개 / Firebase 3개) 전부를 쓰지 않고 경고만 남긴다 — 일부만 쓰면
  API 가 "partially configured" 로 기동을 거부하기 때문이다. alpha 의 동기화 스크립트도 같은
  라이브러리를 쓴다.
