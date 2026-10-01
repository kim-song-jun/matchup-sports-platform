# dev → main 프로덕션 승격 — NO-GO

2026-10-01 23:40 KST 재점검. main 승격·production 승인은 사용자 전용입니다.

- head/dev `16a8c301fd8b9e08c7b3c959c2c974480b6d431d`, base/main `f49742f4522d99eb6c0f25791904ba04278666f3`.
- main-only 0 / dev-only 4,328커밋, rename 미탐지 7,269경로 / 명시 탐지 6,803항목, SQL 65개 추가, main 123 → dev 188개 체인.
- Task168 canonical 경기/DB전환, 대회·리그 신청/명단/기록, 매치승인, 채팅/파일/공유, 공개·운영 UI, 네이티브 셸 및 배포/권한 가드 전체 승격입니다.
- 앱 1.0.4, **미소비 Changeset 79개**. 현재 [승격CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874366476) API/Web PASS, Gates FAIL.
- 최신 [dev CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874358056), [alpha배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874357956), [CodeQL](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874365478) SUCCESS.
- 실제 23:31 KST alpha 웹/API 16a8c301·prod 웹/API f49742f45, health 200 / DB true. 전체 공개 경기 alpha 44/44·prod 32/32 상세 200, 익명 auth/me 401.
- 리뷰 26개 / 미해결 1개(.dockerignore). [준비 PR #1476](https://github.com/kim-song-jun/matchup-sports-platform/pull/1476)에 제외 복원·안전한 로컬 릴리스·업로드 확장자·런북 보강이 있습니다.
- High 6건(#13/#44–48) [명시적 오탐 근거](https://github.com/kim-song-jun/matchup-sports-platform/pull/1325#issuecomment-5932370957).
  현재 dev/승격 ref의 open은 0이며 저장소 전체 0은 아닙니다. main 잔존 High 9/Medium 2는 브랜치별로 구분했고 일괄 dismiss하지 않았습니다.
- AWS 직접 확인: 실제 API와 RDS 바인딩, available/encrypted/자동 백업 active/retention 7일, 완료 ledger 123의 checksum exact/unresolved 0.
  active 매니페스트와 API/Web/worker digest/source 일치, legacy fixtures 32/seal 0으로 전환 전 상태입니다.
- PITR창 2026-09-24 14:02:29Z ~ 10-01 14:02:29Z(확인14:11:45Z). 대상manualsnapshot은08-14의오래된available자료입니다.
  IAM restore 시뮬레이션 allowed는 실제 clone 복원 성공이 아닙니다. 현재 188개 체인의 리허설·인증 QA·공지·연속 운영자·동일 SHA 동결은 차단입니다.
- #1476 최초CI통과와후속head검증을구분합니다. Copilot최신clean미확인, 별도AI findings검사모델지원오류도미통과입니다.

운영 순서:

1. 준비 dev PR CI/리뷰·반영 → 최신 Changeset release-only dev PR → 최종 SHA의 CI·alpha·인증 QA·clone A/B 실증·PITR/백업·공지·연속 운영자·동결 → GO 재판정.
2. **사용자만 main 머지** → 자동 main push **Stage none 승인 없이 취소**, cancelled 확인.
3. merge SHA M 동결 → deploy.yml ref main/stageA/실제 rehearsal.evidence → run.head_sha=M 확인 → 사람이 production 승인 → A 영수증/seal/ledger 확인.
4. **동일 M Stage B, 동일 운영자 연속 승인** → M11/남은 migration/기동 → health/header/digest/전체 공개 경기/원장·영수증/인증 QA → 종료 공지.
5. A~B 사이 API·worker 중단, 일반 배포·main 변경 금지. **M11 뒤 단순 이미지 롤백은 안전하지 않습니다.** 실패는 런북 표와 사람 판단을 따릅니다.

정본 `docs/ops/prod-task168-transition-runbook.md`; 상세근거 `docs/ops/prod-readiness-2026-10-01.md`.
main merge/push·production 승인·운영 DB 변경·RDS 생성은 실행하지 않았습니다.
