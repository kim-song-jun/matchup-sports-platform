# 경기 기록 기본 공개 — 2026-10-23

Status: 기능 dev/alpha 배포 및 변경 계약 검증 완료, main 승격 준비 중

[Task 20261106](../../.github/tasks/20261106-default-public-player-records.md)

## 정책
신규 회원은 이메일·카카오·Apple 가입 완료 및 소셜 프로필 입력 미루기에서 기본 공개로 초기화한다. 기존 회원은 활성·미삭제·가입 완료이고 공개 설정 행이 없는 경우만 migration으로 초기화한다. 기존 REVOKED, 실명 설정, 개별 참가 기록 숨김은 유지한다.

## 검증 결과
- API unit 114/114, Web unit 106/106 PASS. 신규 안내 위치와 표시 대상 RED→GREEN 확인.
- 임시 PostgreSQL migration 218개 재생 PASS. 미설정 전환/기존 설정 원형 보존/제외 계정/재실행 후 OFF 유지 통합 1/1 PASS.
- API/Web 타입 검사 각 1회 및 surface/pattern PASS. migration gate exact-statement/범위 확대 거부 self-test PASS.
- 공개 기록 서비스의 기본 공개→설정에서 OFF→재초기화해도 OFF 유지→ON→개별 숨김 실제 DB 검증 PASS. 최종 DB통합 2/2. 초기 canonical config fixture 누락은 테스트 내부 초기화로 수정.
- 데이터는 임시 DB만 사용했고, 소유 PostgreSQL은 종료·정리. 실제 사용자 계정 변경 없음.

## Alpha 실행 결과
- [x] 실제 이메일 약관→가입 UI→공식 테스트 OTP→서버 기본 공개 저장. 임시 계정 정리201.
- [x] 제공받은 선수 QA 계정의 실제 로그인·설정 OFF/ON·새로고침·원래 공개 상태 복구.
- [x] 익명 공개 조회의 출전40/수상1 → 0/0 → 40/1, 첫 페이지20 → 0 → 20.
- [x] 기존 미설정629명 전환·잔여0, 기존 비공개6명 전체의 상태/정책/시간 보존.
- [x] 390/768/1440px before/after·가로 넘침0·console/network 오류0. 모바일 고정 CTA/desktop 흐름 CTA 접근 확인.
- [x] 가입/소셜 공통 약관 및 재동의 제외 계약은 unit 28건 PASS. 외부 OAuth 공급자의 신규 인증 자체는 이번 수정에 포함되지 않아 재실행하지 않았다.

[실제 alpha 증거](../screenshots/default-public-player-records/README.md). 브라우저 PID/launcher PID는 증거에 기록했고 소유 브라우저를 모두 종료했다. 자격증명·세션·OTP·계정 식별자는 기록하지 않았다. dev CI39924007213와 alpha39924007216 성공, 서빙 SHA `df42407a1` 확인. main/production은 별도 승격 절차를 진행한다.

## Production 읽기 전용 사전 집계

2026-10-23 15:56:25 KST: 전체896/활성가입완료834, 기존공개90·비공개10 유지, 미설정734명 전환 예상(적용 후 공개824). 기록/수상 노출 변화229명, 현재 콘텐츠 없음505명. 전환 대상의 기존 실명ON41명 중 현재 기록 보유5명. 정확한 적용 순서·제외·SQL·실패 시 DB 상태는 [Task 영향 보고](../../.github/tasks/20261106-default-public-player-records.md#production-impact-snapshot--2026-10-23-155625-kst) 참고. 실제 데이터 변경 없음.
