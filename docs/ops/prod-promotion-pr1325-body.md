# dev → main 프로덕션 승격 — NO-GO

2026-10-01 후속 점검. main 승격·production 승인은 사용자 전용입니다.

## 배포 범위

- head/dev `3aac46ec17f5b0646ca6a47f1e20a06771fd5fc6`, base/main `f49742f4522d99eb6c0f25791904ba04278666f3`.
- main-only0/dev-only4,322커밋, rename 미탐지7,262경로(명시 탐지6,796), SQL65개 추가/main123→dev188개 체인.
- Task168 canonical 경기/DB 전환, 대회·리그 신청/명단/기록, 매치 승인, 채팅·파일·경기 공유,
  공개/운영 화면, 네이티브 셸 및 배포·권한 가드를 포함하는 전체 dev 승격입니다.
- package1.0.4, **미소비 Changeset77개**. 이전 3,818커밋·릴리스 gate 통과 설명은 무효입니다.
- 과거 c4467dab1의 75개를 소비한 로컬1.1.0 후보는 예시입니다. 준비 수정 dev 반영 후 최신 SHA의
  모든 Changeset을 다시 소비하고 CI/alpha를 확인해야 합니다.

## 검증과 차단

- 70a8e2c5a [dev CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36866816889)·
  [alpha 배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36866816901) 성공.
  [승격 PR CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36866829467) API/Web PASS,
  Gates unreleased Changesets FAIL. **최신 3aac46ec1 CI/alpha 완료는 별도 확인 대상**입니다.
- 리뷰26개 중 unresolved4→**1(.dockerignore)**. 제외 복원은 준비 수정이며 dev 반영 전 unresolved 유지.
- High6개(#13/#44–48)를 최신 SARIF/실제 multipart 경로 probe/콜백6tests로 검토해 오탐 처리.
  open0, [CodeQL 체크](https://github.com/kim-song-jun/matchup-sports-platform/runs/110384554009) SUCCESS.
  [명시적 보안 근거](https://github.com/kim-song-jun/matchup-sports-platform/pull/1325#issuecomment-5932370957).
- 실제22:29KST alpha웹/API70a8e2c5a, prod웹/APIf49742f45; /landing·health200/DBtrue,
  매치·팀·대회 목록200. 배포 중 alpha502도 보존했고 완료 후 회복 확인. **현재 dev와 alpha의 마지막
  관측 SHA는 다릅니다.** 초기 production공개경기32/32상세200. 인증 사용자/운영/실제 OAuth는 미검증.
- 최신188개 체인 리허설 원본/DBledger/checksum/PITR/복원권한/권장snapshot/공지/연속운영자/동일SHA동결
  조건은 미확인·미확정. 과거123→178 리허설을 최신 완료로 표시하지 않습니다.
- 로컬 준비: 안전한 `--prepare-only`(clean feature만, stage/commit/push/dispatch없음), 고정 업로드
  확장자, Docker 제외, PITR/완료쿼리 런북 정정. promote8/upload16/callback6, surface 정상·거부,
  multer3요청 및 Task168/security계약 PASS. 원격CI/실제DB를 대체하지 않습니다.

## 사용자 운영 순서

1. 준비 수정 devPR 검토/CI → dev반영/alpha확인 → 최신dev release-only재생성/PR →
   최종SHA CI·실제 사용자QA·최신DB리허설/PITR/공지/동일운영자/동결조건 완료 → GO재판정.
2. **사용자만 main 머지**. 자동 main push `deploy.yml` **Stage none 승인 없이 취소**, 취소 완료 확인.
3. merge SHA고정·main동결. `--ref main`, `task168_stage=stageA`, 실제 리허설 한 줄 증거로 dispatch,
   run.head_sha=고정SHA 확인 → 사용자/운영자 production승인 → A영수증/seal/M9 확인.
4. **동일 main SHA로 Stage B, 동일 운영자 연속 승인** → M11/남은migration → ledger/backfill/
   health/header/digest/공개경기/영수증/사용자시나리오 확인 → 종료 공지.
5. A~B 사이 API/워커 중단. 일반배포/main변경 금지. **M11 이후 단순 이전 이미지 롤백은 안전하지 않습니다.**
   실패 시 재시도/Stage A 첫 DB변경 전의 검증된 PITR/백업복원은 런북과 사용자 결정에 따릅니다.

정본: `docs/ops/prod-task168-transition-runbook.md`. 점검: `docs/ops/prod-readiness-2026-10-01.md`.
