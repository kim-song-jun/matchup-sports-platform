# 경기 기록 기본 공개 — 2026-10-23

Status: 구현 및 로컬 계약 검증 완료, alpha 미검증

[Task 20261106](../../.github/tasks/20261106-default-public-player-records.md)

## 정책
신규 회원은 이메일·카카오·Apple 가입 완료 및 소셜 프로필 입력 미루기에서 기본 공개로 초기화한다. 기존 회원은 활성·미삭제·가입 완료이고 공개 설정 행이 없는 경우만 migration으로 초기화한다. 기존 REVOKED, 실명 설정, 개별 참가 기록 숨김은 유지한다.

## 검증 결과
- API unit 114/114, Web unit 106/106 PASS. 신규 안내 위치와 표시 대상 RED→GREEN 확인.
- 임시 PostgreSQL migration 218개 재생 PASS. 미설정 전환/기존 설정 원형 보존/제외 계정/재실행 후 OFF 유지 통합 1/1 PASS.
- API/Web 타입 검사 각 1회 및 surface/pattern PASS. migration gate exact-statement/범위 확대 거부 self-test PASS.
- 공개 기록 서비스의 기본 공개→설정에서 OFF→재초기화해도 OFF 유지→ON→개별 숨김 실제 DB 검증 PASS. 최종 DB통합 2/2. 초기 canonical config fixture 누락은 테스트 내부 초기화로 수정.
- 데이터는 임시 DB만 사용했고, 소유 PostgreSQL은 종료·정리. 실제 사용자 계정 변경 없음.

## Alpha 수동 검증 대기 — 0/6
1. 비로그인 이메일 신규 가입 약관: 하단 버튼 위 안내 확인, 별도 체크박스 없음.
2. 신규 카카오·Apple: 공통 소셜 약관 안내와 가입 완료/프로필 미루기 후 설정 공개 ON 확인.
3. 기존 미설정 회원: migration 후 공개 ON, 연결된 확정 경기와 해당 순위 표시.
4. 기존 명시적 비공개 회원: migration 후 OFF, 다시 로그인하거나 프로필을 완성해도 유지.
5. 설정 공개 OFF→ON 및 개별 경기 숨김: 본인/타인 조회 차이와 기존 숨김 계약 유지.
6. 재동의/공개 약관: 신규 가입 안내 없음. 390/768/1440px에서 CTA·스크롤 겹침, console/network 오류 확인.

변경분이 alpha에 배포되지 않았고 사용 가능한 브라우저 도구가 없어 실제 화면 evidence는 수집하지 않았다. 변경 전/후 viewport verdict는 0/3이며 스크린샷을 대체하는 로컬 Next 서버는 실행하지 않았다.

## Production 읽기 전용 사전 집계

2026-10-23 15:56:25 KST: 전체896/활성가입완료834, 기존공개90·비공개10 유지, 미설정734명 전환 예상(적용 후 공개824). 기록/수상 노출 변화229명, 현재 콘텐츠 없음505명. 전환 대상의 기존 실명ON41명 중 현재 기록 보유5명. 정확한 적용 순서·제외·SQL·실패 시 DB 상태는 [Task 영향 보고](../../.github/tasks/20261106-default-public-player-records.md#production-impact-snapshot--2026-10-23-155625-kst) 참고. 실제 데이터 변경 없음.
