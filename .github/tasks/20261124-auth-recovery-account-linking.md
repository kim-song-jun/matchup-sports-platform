# Task 20261124: 로그인 복구와 소셜 계정 연결을 근본적으로 고치기

Status: In Progress
**Owner**: 오케스트레이터(Opus) → 레인 L0~L5(Sonnet)
**Created**: 2026-10-31

## Context
운영 1.12.4 읽기 전용 실측(2026-10-31, 집계만):
- 운영 인스턴스 역할에 `ses:SendEmail` 이 없어 메일이 한 통도 나가지 않았다(9/1 이후 SES 발송 0).
  비밀번호 재설정 메일 503 `EMAIL_SEND_FAILED` 가 10/17부터 매일 났다. 휴대폰 비밀번호 재설정은 #133(#1888) 이후 항상 409 이므로,
  이메일 가입자가 비밀번호를 잊으면 복구할 수단이 없었다.
- 이메일 가입자 220명 전원 `email_verified_at` 이 없다. 카카오·애플 연결은 그 값을 요구해 영구 불가였다.
  `SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL` 34회, `SOCIAL_LINK_CONTACT_CONFLICT` 18회, 10/13 이후 연결 0건.
- 소셜 가입 중 `PHONE_CONFLICT` 13명. 이메일 가입은 마지막 제출에서 `PHONE_CONFLICT` 49회(SMS 인증을 다 마친 뒤에 알게 된다).
- 탈퇴 신청 계정의 로그인 시도 39회. 스스로 철회할 길이 없다.
- SMS 발송·인증번호 완료율은 정상이다(실패 0, 완료 ~100%).

## Goal
기존 회원이 어떤 로그인 수단으로 들어와도 자기 계정에 닿을 수 있는 길이 하나 이상 있고, 그 길이 휴대폰 단독 소유로 남의 계정을 여는 일(#133)을 다시 허용하지 않는다.

## Original Conditions (must all be satisfied)
- [ ] "기존 카카오 이용자랑 email 가입한 사람 … 전화번호 인증 이슈랑 로그인 이슈" 를 전부 근본적으로 해결한다
- [ ] 모두 병렬로 진행한다
- [ ] 화면 변경은 A·B·C 3안 → 사용자 선택 뒤 구현(저장소 규칙)

## User Scenarios
### 이메일 가입자가 카카오로 들어온다
기존 이메일 계정으로 로그인 → 설정에서 카카오 연결 → 이후 카카오로 바로 로그인.
### 카카오로 새 계정이 먼저 생겨 번호 중복에 막혔다
원래 계정으로 로그인 → 카카오 연결 → 빈 가입 계정은 정리되고 카카오 신원이 원래 계정으로 옮겨진다.
### 비밀번호를 잊은 이메일 가입자
비밀번호 재설정 메일을 받아 재설정한다.
### 탈퇴 신청을 되돌리고 싶다
올바른 자격으로 로그인 → 철회 확인 → 다시 이용(빠진 팀·명단은 돌아오지 않음).

## Test Scenarios
### Happy path
- [ ] 연결: 신원 없음 → 생성 / 빈 가입 계정의 신원 → 이동 + 정리 / 같은 계정 → 멱등
- [ ] 가입 인증 성공 응답 `registered` true·false
- [ ] 철회 토큰 → active + 세션
### Edge cases
- [ ] 같은 신원을 두 계정이 동시에 연결 → 한쪽만 성공
- [ ] 옛 형식 카카오 OAuth state 도 로그인 모드로 동작
### Error paths
- [ ] 실사용 계정에 붙은 신원 409 `SOCIAL_LINK_PROVIDER_IN_USE`, 다른 카카오 이미 있음 409 `SOCIAL_LINK_PROVIDER_EXISTS`
- [ ] 비밀번호가 틀린 탈퇴 신청 계정은 철회 토큰 없이 일반 실패
- [ ] SES 실패 → `EMAIL_DELIVERY_FAILED` 알림이 시간 창당 1건
### Mock data updates needed
- [ ] `apps/v1_web/src/test/msw/` 새 엔드포인트·409 details·`registered`

## Parallel Work Breakdown
### Infra
- [x] L0 운영 역할에 `TeameetProdSesSend`(도메인 한정 `ses:SendEmail`) — `scripts/infra/provision-prod-ses-send.sh`, SES 시뮬레이터 발송 성공 확인
### Backend
- [ ] L1 로그인 상태 소셜 연결 API, 충돌 409 `details.next`, 항상 실패하던 `/auth/social-link*` 삭제
- [ ] L2 `registered`, 탈퇴 철회, 메일 실패 Slack 알림, 계정 찾기 안내 문구
### Frontend
- [ ] L4 훅·타입·MSW·카카오 OAuth 연결 모드 배관
- [ ] L5 계정 찾기 버튼·step-up 안내·`/my/phone-verify` 충돌 안내(기존 컴포넌트 안 버그 수정)
- [ ] L3 새 화면 4곳 A·B·C 결정 페이지 → 사용자 선택 → 2차 UI 레인
### Sequential
- [ ] 레인 PR 리뷰·dev 머지 → alpha 실측(390/768/1440 갤러리)

## Acceptance Criteria
- [ ] Original conditions 전부 충족, 새 화면은 사용자 선택안대로
- [ ] 레인별 타깃 테스트 green, 통합 스펙 CI green
- [ ] 범위 내 tech debt 0(죽은 엔드포인트 삭제 포함)
- [ ] Code review: Critical=0, Warning=0

## Tech Debt Resolved
- 항상 409 를 던지던 `/auth/social-link`·`/preview` 와 DTO·허용 목록
- 실행할 수 없는 행동("이메일 인증을 마치라")을 지시하던 409 문구

## Security Notes
- 연결의 소유 증명은 기존 계정 세션 + 제공자 토큰 검증이다. 휴대폰 단독 증명은 계속 거부한다(#133).
- 오래된 세션으로는 연결할 수 없다(세션 발급 시각 기준). 연결은 계정 알림·상태 로그로 남긴다.
- 철회 토큰은 자격 검증 뒤에만 발급한다(계정 상태 노출 없음). 사용자 ID·sessionEpoch 에 묶이고 10분 뒤 만료된다.
- SES 권한은 검증된 도메인 identity 와 `ses:FromAddress` 조건으로 한정한다.

## Risks & Dependencies
- 네이티브 앱의 카카오·애플 연결 모드는 기존 브리지 계약 안에서만 동작해야 한다(앱 업데이트 없이).
- 이메일 플로우의 alpha 실측은 테스트 주소 dev-echo 경로로만 한다(alpha 인스턴스 역할에는 SES 권한을 주지 않음).

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-31 | 오케스트레이터 | 탈퇴 철회 허용 여부 | 계약 체크리스트가 withdrawal_pending 을 "복구 가능"으로 정의 → 서버는 구현, 화면·정책 최종 선택은 L3 결정 페이지 |
