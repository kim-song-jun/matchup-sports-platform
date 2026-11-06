# 경기 기록 기본 공개 — alpha 실측

2026-10-23. 실제 alpha, Windows Chrome **headed**, 390/768/1440×900. 소유 browser PID·launcher PID는 evidence JSON에 기록했고 전부 종료했다. 로컬 Next 서버·인증 헤더 우회·mock API는 사용하지 않았다. 자격증명·쿠키·OTP·계정 식별자는 보관하지 않는다.

| Viewport | Before | After | Verdict |
|---|---|---|---|
| 390 | [화면](before/signup-390.png) | [화면](after/signup-390.png) | PASS: 안내 노출·고정 CTA viewport 내·가로 넘침0 |
| 768 | [화면](before/signup-768.png) | [화면](after/signup-768.png) | PASS: 안내 노출·고정 CTA viewport 내·가로 넘침0 |
| 1440 | [화면](before/signup-1440.png) | [화면](after/signup-1440.png) | PASS: 문서 흐름 CTA가 스크롤로 도달 가능·가로 넘침0 |

After commit `df42407a1e4264d8a81932f213c39bc48c5d2e0e`, release `1.11.6-alpha.20261023.gdf42407a1e42`. 이미지 로드 완료 후 캡처했다. 데스크톱 CTA는 공유 AuthFrame의 문서 흐름이고 모바일/태블릿은 고정 CTA다. 초기 측정에서 데스크톱에도 고정 CTA의 viewport 한계를 적용한 검증 오류를 실제 계약에 맞춰 고쳤으며, 제품 레이아웃을 우회 수정하지 않았다. console/pageerror/network 실패0.

실제 이메일 가입·공식 alpha 예약 번호 OTP 경로에서 `recordConsent`를 보내지 않고 공개 ON 저장을 확인했다. 생성한 테스트 계정은 본인 탈퇴 요청201로 정리했다. 기존 선수 계정도 실제 로그인했으며 공개→비공개→공개를 저장해 익명 조회가 출전40/수상1 → 0/0 → 40/1로 바뀌는 것을 확인했다(목록 첫 페이지20 → 0 → 20). 원래 공개 상태로 복구하고 새로고침까지 확인했다.

기존 미설정629명 전환, 미설정 잔여0, 기존 비공개6명의 상태·정책·시간 지문 원형 보존. 신규/기존 사용자 설정의 실제 저장 및 공개 projection 검증과 소셜 공통 화면·서비스 단위 계약 검증을 구분한다. 외부 Kakao/Apple OAuth 공급자의 신규 인증 자체는 이번 변경 대상이 아니며 재실행하지 않았다.
