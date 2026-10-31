# 운영 메일(SES) 발송 권한

운영 API 는 비밀번호 재설정 인증번호와 로그인 추가 확인(step-up) 코드를 SES 로 보낸다.

- **자격 증명**: 컨테이너에 키를 넣지 않는다. 운영 EC2 인스턴스 역할의 자격을 IMDS 로 받는다
  (`SES_REGION`·`EMAIL_FROM` 만 환경변수로 둔다).
- **권한**: 인스턴스 역할의 인라인 정책 `TeameetProdSesSend` 가 맡는다. 검증된 도메인 identity
  `teameet.co.kr` 에 대한 `ses:SendEmail` 만 허용하고, `ses:FromAddress` 는 운영 `EMAIL_FROM`
  (`no-reply@teameet.co.kr`) 하나로 고정한다. **`EMAIL_FROM` 을 바꾸면 이 정책도 같이 바꿔야 한다.**
  바꾸지 않으면 발송이 거부된다.
- **다시 만들기**:
  ```bash
  PROD_EC2_INSTANCE_ID=<운영 인스턴스> PROD_EXPECTED_ACCOUNT_ID=<계정> \
    scripts/infra/provision-prod-ses-send.sh
  ```
  멱등이다. 스크립트는 다음을 확인한 뒤에만 적용한다.
  - 대상 인스턴스가 `Name=matchup-production`·`Environment=production` 이고 running 이다(alpha 와 계정이 같다).
  - 그 인스턴스 프로파일을 다른 인스턴스가 쓰지 않는다.
  - 적용 뒤 `simulate-principal-policy` 로 발신 주소는 허용, 다른 주소는 거부되는지 본다.

  SES 리전이 EC2 리전과 다르면 `PROD_SES_REGION` 을 준다.
- **실발송 확인**: `simulate-principal-policy` 는 IAM 정책만 평가하므로 이 확인이 필수다.
  운영 API 컨테이너 안에서 `@aws-sdk/client-sesv2` 로 `success@simulator.amazonses.com` 에 한 통 보낸다.
  SES 메일박스 시뮬레이터라서 실제 수신자가 없다.
  실패하면 오류 이름이 원인을 말해 준다(`AccessDeniedException` 은 권한, `MessageRejected` 는 identity 문제다).
- **알림**: 발송 실패는 API 가 `EMAIL_DELIVERY_FAILED` outbox 이벤트로 Slack 에 시간 창당 1건 알린다(Task 20261124).
- alpha 인스턴스 역할에는 SES 권한을 주지 않는다. alpha 의 메일 흐름은 테스트 주소의 dev-echo 로 확인한다.
