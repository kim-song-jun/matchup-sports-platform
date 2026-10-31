# 운영 메일(SES) 발송 권한

운영 API 는 비밀번호 재설정 인증번호와 로그인 추가 확인(step-up) 코드를 SES 로 보낸다.

- **자격 증명**: 컨테이너에 키를 넣지 않는다. 운영 EC2 인스턴스 역할의 자격을 IMDS 로 받는다
  (`SES_REGION`·`EMAIL_FROM` 만 환경변수로 둔다).
- **권한**: 인스턴스 역할의 인라인 정책 `TeameetProdSesSend` 가 맡는다. 검증된 도메인 identity
  `teameet.co.kr` 에 대한 `ses:SendEmail` 만 허용하고, `ses:FromAddress` 를 `*@teameet.co.kr` 로 묶는다.
- **다시 만들기**: `PROD_EXPECTED_ACCOUNT_ID=<계정> scripts/infra/provision-prod-ses-send.sh` 를 실행한다.
  멱등이며, 끝에 `simulate-principal-policy` 로 허용 여부를 확인한다.
- **실발송 확인**: 운영 API 컨테이너 안에서 `@aws-sdk/client-sesv2` 로 `success@simulator.amazonses.com` 에
  한 통 보낸다. SES 메일박스 시뮬레이터라서 실제 수신자가 없다. 실패하면 오류 이름이 원인을 말해 준다
  (`AccessDenied` 는 권한, `MessageRejected` 는 identity 문제다).
- **알림**: 발송 실패는 `EMAIL_DELIVERY_FAILED` outbox 이벤트로 Slack 에 시간당 1건 알린다.
  이 알림이 생기기 전에는 정책이 없어서 메일이 9월부터 한 통도 나가지 않았는데, 이를 아무도 몰랐다.
- alpha 인스턴스 역할에는 SES 권한을 주지 않는다. alpha 의 메일 흐름은 테스트 주소의 dev-echo 로 확인한다.
