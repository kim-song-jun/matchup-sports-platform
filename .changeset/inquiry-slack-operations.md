---
"v1_api": patch
---

문의 접수 시 개인정보를 제외한 운영 알림을 환경별 Slack 채널로 전달하고, 실패한 알림은 durable outbox 재시도 정책으로 추적합니다. Alpha 배포 역할과 EC2 역할은 해당 Slack SecureString Parameter 한 개에만 쓰기·읽기 권한을 가집니다.
