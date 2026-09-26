---
"v1_api": patch
"v1_web": patch
---

어드민 감시 4화면(에러 로그·웹 푸시 실패·SMS/인증 실패·감사 로그)을 모니터링 허브
`/admin/monitoring` 한 화면으로 합친다 (어드민 다이어트 3단계 · B안 사용자 확정).

- **신호 스트립**: 상단에 미확인 신호 4카드 — 에러(최근 24시간 그룹 수)·웹 푸시 실패(미확인
  누적)·SMS/인증 실패(미확인 누적)·운영 활동(오늘, KST 자정 기준). 카드를 누르면 해당 탭이
  열려요. 집계는 신설 `GET /admin/monitoring/summary`(AdminGuard 동급 getActiveAdmin 게이트)가
  `Promise.all` 로 한 번에 내려줘요. 푸시·SMS ack 시 스트립 수치도 즉시 갱신돼요.
- **탭 4개**: 본문은 기존 화면의 컴포넌트(ErrorLogsClient·PushFailureTable·SmsFailureTable·
  감사 로그 뷰)를 그대로 이식 — 기능·필터·모달 동작은 변하지 않아요. 활성 탭만 마운트해
  첫 진입에 4화면 조회가 동시에 뜨지 않게 했어요.
- **구 URL 보존**: `/admin/ops/errors`·`/admin/ops/push-failures`·`/admin/ops/sms-failures`·
  `/admin/audit` 은 `?tab=` 리다이렉트로 남아 북마크·딥링크가 죽지 않아요.
- **사이드바 다이어트**: 운영 구획 7→4 (대회 현장 운영 · 모니터링 · 웹 푸시 발송 · 경기 운영
  플래그). 개요 페이지의 실패 카드·최근 활동 링크도 허브 탭으로 연결해요.
