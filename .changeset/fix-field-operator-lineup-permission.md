---
"v1_api": patch
"v1_web": patch
---

현장 기록 담당자(`field_operator`)가 대회 경기를 시작할 권한(`tournament_command`)은 있는데
그 전제 조건인 라인업을 만들 권한(`lineup_mutate`)이 없어 스태프 혼자서는 대회를 굴릴 수 없던
모순을 고쳤다(2026-08-11 알파 실측). `tournament-staff-policy.ts`의 `field_operator` 역할에
`lineup_mutate`를 추가했다 — `platform_ops`·`tournament_director`는 여전히 전체 허용, `team_manager`는
`read`+`lineup_mutate`, `support_readonly`·`public`은 여전히 `read` 전용으로 그대로 남는다.

같은 라인업 화면의 접근성 버그도 함께 고쳤다: 골키퍼 지정 버튼의 `aria-label`이 받침 유무를
무시하고 항상 "을"을 붙여 "김알파을 골키퍼로 지정"·"레드2을 골키퍼로 지정"처럼 어색하게 읽혔다.
기존 `josa()` 유틸(`apps/v1_web/src/lib/korean.ts`)을 재사용하도록 고쳤고, 이 유틸이 숫자로
끝나는 이름의 받침을 발음 기준(예: 2→받침없음, 1→받침있음)으로 판정하지 못하던 부분도 함께
보강했다. 같은 화면의 종목명 조사("이 종목은 ...")도 동적 값에 고정 조사를 붙이던 동일 계열
버그라 같이 고쳤다.
