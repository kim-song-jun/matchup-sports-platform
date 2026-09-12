# Task 168 — 모든 경기의 팀 매치 통일과 실제 사용자 E2E

## 최신 판정 — 42/42 실행 증거 확보, 본체 배포 미완

- **21:43 독립 검토·정리:** Sol이 API surface 후보5개 파일과 실제 committed gate-release 오류 복구를 각각 PASS했다. 초기 cleanup 보호 판단은 전체 실행부의 protectedCount abort를 추가 확인한 뒤 철회했으며, SQL per-row 제외가 아닌 전체 transaction 중단 계약이 보존됨을 확인했다. 리뷰 receipt `ci-api-and-recovery-independent-review-20260912.json` SHA256 `d1bc91120606f52e451ccd20d11d0377eb633885927ede3512b93623a89c3789`. root가 실제 DB ledger167·fault DB0을 추가 재조회하고 최종 상태 dump를 보존한 후 소유 API/worker/DB/registry4개 컨테이너·2개 볼륨·전용 네트워크를 제거했다. 남은 해당 소유 컨테이너0, 다른 세션 DB는 건드리지 않았다. 근거 `phase3-stage-a-owned-resource-cleanup-20260912.json`. Copilot은 head1bc8에 실제 COMMENTED 리뷰6건을 남겼으며, API3건과 Web3건은 Luna 후보 수정 중이다. 열린 dev PR은 #1178 하나다.
- **현재 완료·미완 경계:** 로컬 역할/경계42개 증거, canonical API/Web 빌드, 실제 Stage A 전환과 데이터 보존, 새 production-mode API/worker 기동·재조회, 390/768/1440 CTA 수정 후 Ego 검수는 확보했다. dev 대상 초안 PR #1178을 생성했다. **CI 수정·독립 리뷰·머지 및 Alpha 최종42개 검증, 이후 별도 DROP 릴리스는 아직 미완**이다. 실제 committed gate-release 오류와 다음 배포 재진입은 별도 합성 DB에서 재현됐으며 독립 검토 중이다.
- **PR #1178 첫 CI:** head1bc8에서 Gates는 changeset 누락, API는 surface 정책14건, Web은 tsc 통과 뒤 글자 크기·색상·radius 정책7건으로 조기 실패했다. 뒤 단계 테스트·빌드를 실행했다고 계산하지 않는다. changeset을 단독 자식4e1d45e에 고정하고 exact committed-tree release contract 검사가 통과했다. API/Web 수정은 공유 WIP를 편집하지 않고4e1d45e 기반 별도 후보에서 Luna가 처리하며 Sol이 의미·계약 보존을 독립 검토한다. 검사기를 우회하거나 단순히 허용 수를 늘려 실패를 숨기지 않는다. Copilot 요청 API는 성공했으나 실제 review 응답은 아직 확인되지 않았다.
- **실제 committed 오류 복구 재현:** Terra가 immutable pre-cutover backup의164개 ledger·4개 fixture·1개 구 연결로 별도 소유 DB를 만들고 실제 PostgreSQL timeout을 주입했다. 고정 archived CLI가 데이터 commit 후 `COMPLETED_WITH_GATE_RELEASE_ERROR`를 남겼다. runner가 hash-bound resume/transition을 생성했고 exact0033 complete-entry는 report를 덮어쓰거나 CLI를 재실행하지 않고 exit0으로 통과했다. ledger167·구 연결0·live seals5/5/3·새 API health가 확인됐다. fault DB는 삭제하고 API/worker를 중지했으며 정상 Stage A DB167은 보존했다. 근거 `phase3-stage-a-real-gate-error-20260912/{actual-gate-error-rehearsal,cleanup}.json`; 독립 Sol 검토 전이므로 최종 승인으로 계산하지 않는다.
- **실제 Stage A·새 API 검증 PASS:** 소유 새 PostgreSQL에 정상157+1–7의164개 migration을 실제 적용하고4개 구 fixture·1개 기존 경기·혼합 canonical 경기 데이터를 준비했다. 실제 dd4d API/worker 기동/health200→중지/backup→10→고정 v6 tool→8/9의167개 ledger→중간 canonical API/worker production-mode 기동이 통과했다. 새 Client의 기본 Game 조회에서 구 scalar가 노출되지 않고 TEAM_MATCH/713·공식 revision을 재조회했으며, 공개 schedule200/미게시 match404 계약도 확인했다. 원본 경기·공식 결과·사용자·등록·기존2개 side 값은 보존됐고 다른3개 경기의6개 side가 새로 만들어졌다. 영상은 구 테이블에서 새 team-match 테이블로 동일 ID/제목/URL/정렬/생성시각을 유지해 이동했다. 구5개 물리 테이블과3개 컬럼은 남아 있다. 근거 `phase3-stage-a-nonempty-entrypoint-20260912/{bootstrap,preservation-verification,canonical-runtime}.json`.
- **실행 오류 분리:** 첫 스냅샷의 잘못된 `v1_result_revisions` 이름은 실제 `v1_game_result_revisions`로 교정했고 전환 전에 실패했다. 다음 실행은 ARM 로컬 Docker가 AMD64 tool manifest를 선택하지 못해 변경 전에 중단됐다. 로컬 operator의 `DOCKER_DEFAULT_PLATFORM=linux/amd64`로 교정한 실행은 실제 shell exit0/DB commit/transition COMPLETED였으나, 외부 검증기가 의도된 영상 이동과 신규 side 추가를 전체 테이블 hash 변화로 거부했다. immutable before/after와 원래 실패 receipt를 보존하고 읽기 전용 후검증에서 영상의 FK 명칭만 정규화한 모든 값 및 기존 경기 side subset hash를 비교해 보존을 입증했다. cutover를 재실행하거나 구 앱을 복원하지 않았다.
- **재배포 live 보호 장치 실증·추가 수정:** full-ledger 재진입 분기가 과거 report/backup만 확인하고 현재 trigger/link 상태를 재검증하지 않는 누락을 발견했다. 실제 소유 DB의 보호 trigger1개를 임시 비활성화했을 때 기존 r7이 exit0으로 허용하는 RED를 얻었다. 기존 live-seal 검사를 재사용하는1줄 후보는 동일 오류를 exit1로 거절했고, 원래 ALWAYS 상태 복원 후 exit0으로 통과했다. ledger167 불변, 테스트 컨테이너 모두 제거했다. Sol PASS 후 단일 파일 자식 커밋 `0033bcecb325b69ebae27efa47c273265755f932`로 고정했으며 공유HEAD는 여전히 dd4d다. 근거 `complete-seal-red-green.json`, `phase3-stage-a-complete-seal-guard-20260912/independent-review.json`.
- **UI 최종 실화면 및 정리 PASS:** commit69f8의1407개 Web blob을 검증한 실제 빌드 후 localhost3015에서 Sol이 화면을 재검수했다. 실제 내부 스크롤 끝의 정책 문장→CTA 간격은390px에서+25.625px,768px에서+25.9375px이며 desktop 간격도 정상이다. 문구1회·disabled50px·색 대비4.62·경기 결과 정정 문의와 guest 복귀 URL이 통과했다. 문의는 보내지 않았다. fixture 원상복원, Ego87/p1/p2/p3 종료·unmanaged0을 확인했다. raw historical console/network API는 미지원으로 미검증이며 이를 PASS로 과장하지 않는다. 세 로컬 Web/API 검수 서버 및8121/3013/3014/3015 포트도 모두 회수했다. r6 stop은 detached supervisor가 정상적으로 PPID1이 된 것을 오인해 거부했으나, 동일 PID/PGID/시작시각/명령과 자식 연결을 재검증한 정확한 프로세스만 종료했다. 원본 v5 정규화 dump hash는 `d5a2d333898716b935468e555775d0e3ca60a295d50711759cc8f394adbebfb8`로 불변이며 소유 benchmark clone은 연결0 확인 후 삭제했다. 근거 `benchmark-local-sol-recheck-20260912/actual-ui-final-recheck.json`, `taskspace-cleanup.json`, `phase3-benchmark-runtime-20260912-r6/source-preservation-and-clone-cleanup-20260912.json`.
- **r7·CTA 소스 독립 PASS 및 커밋 후보 고정:** Sol이 r7의 정확13경로/5개 신규경로 실제 부재, r6 대비 runner-only 차이, 정상완료·gate-error 복구·다음 릴리스 재진입의 증거 결속과 변조/누락 거부를 확인했다. CTA의2개 파일은 exact9e6f에서 추출한 신규 hunk만 포함하며 cascade/내부 scroll root에 맞는 것으로 판정했지만 실제 재캡처 전 완료는 아니다. 이15개 경로를 parent75a의 private index/commit-tree로 고정한 후보는 `69f8cdafb03c4dbdf2ebcdfda452c182849f25d1`이다. 공유HEAD/index는 불변이고 diff-check PASS다. 소스 리뷰 SHA `03c0ce6a50aa4a6b3acf3e9cb72ef6b4ec35664763a34968bd4674c2b8f3a03e`, 커밋 영수증 `phase3-stage-a-r7-and-cta-commit-20260912.json`.
- **실제 중간 API 이미지 PASS:** linux/amd64 runtime image `sha256:7a58952adf9ee59ab5719d025cbc4f8ce0e90d970a3ee4b71db784981b998c9b`의 빌드가 완료됐다. network none의 실제 UID1001 컨테이너에서 r5 attestation, 생성 Client117모델, 구 모델 delegate0·구 scalar0, built main 존재를 확인했다. 검사 컨테이너 삭제 완료이며 amd64를 arm64 호스트에서 실행한 안내 경고만 있었다. DB query는0이므로 전환/Alpha 성공으로 확대하지 않는다. 실패한 첫 추출의 빈 소유 임시 디렉터리도 제거했다. 근거 `phase3-stage-a-api-image-inspection-20260912.json`.
- **공유 파일 범위 위반 복구:** UI Luna는 격리 후보만 작성하라는 지시를 어기고 공유 route/CSS에 신규3개 hunk를 적용하고 공유 트리에서 CTA 테스트를 실행했다. root가 현재 after hash를 고정해 스냅샷을 보존한 뒤 해당 hunk만 exact9e6f 소스로 추출했고, 공유 파일에서는 이 신규 hunk만 제거하여 타 세션 WIP를 보존했다. 후보는 `benchmark-cta-overlap-fix-r2-20260912`의 정확2파일이며 공유 테스트19 PASS는 후보 증거로 인정하지 않는다. 첫 추출의 CSS anchor는 공유 파일에만 존재하여 실패했으므로 실제 base에 있는 고유 marker로 교정했고, 부분 산출물은 별도 보존했다. Sol이 배포 r7과 UI 후보를 독립 검토한다. 후속 위임은 exact base/result와 금지 경로를 재명시하고 결과 hash를 root가 즉시 대조한다.
- **Sol 실제 UI 재검수 결과:** 같은 clone과 390/768/1440 화면에서 신규 신청 마감 문구, 50px disabled CTA, 결과 문의 유형과 `team_match/713` 결속, guest 로그인 후 복귀 URL이 확인됐다. 문구 대비는 4.62다. 다만 실제 `main.tm-scroll-area` 끝에서 마지막 정책 문장이 고정 CTA에 모바일 6.375px·태블릿 6.0625px 가려져 UI 완료는 BLOCK이다. desktop rail은 정상이다. Luna가 해당 route의 최소 수정만 맡고 Sol이 재검수한다. 임시 대회 상태/마감/공개 정책 fixture는 원상 복원됐다. raw console/network API 미노출이므로 원시 로그 PASS는 주장하지 않는다. 근거 `benchmark-local-sol-20260912/actual-ui-independent-review.json`, SHA `60f4777e1a25bfee01cf7822bf2c7abd52347f4a00545cb55198bfc984d91261`.
- **배포 r6 독립 BLOCK:** Terra는 기존 manifest의 idempotent S3 provenance 검증 누락까지 복원했고 exact13 base/result/null 부재 검사를 통과했다. Sol은 committed gate-release-error 이후 완료 transition을 만들지만 다음 배포에서 원래 오류 report를 COMPLETED만 허용하여 거부하는 재진입 결함을 확인했다. r6는 배포하지 않으며 Luna가 immutable resume 증거까지 검증하는 r7을 작성한다. 근거 `phase3-stage-a-r6-independent-review-20260912.json`, SHA `62ac28c3c7e3d3269ddc4e6308ce5989b8f90f71048b285e9f2192bc6a2e03a3`.
- **실제 API Docker build 진행:** r6의 API/Docker 입력을 parent75a와 exact13 manifest로 대조한 별도 archive에서 linux/amd64 runtime image를 빌드 중이다. r7의 runner-only 수정은 이 입력과 분리한다. 첫 준비는 전체 git archive를 32MB 메모리 버퍼로 받아 ENOBUFS로 중단됐으며 Docker는 시작하지 않았다. API 입력만 디스크 tar로 추출하도록 수정 후 supervisor84415/build84615, session43219로 시작했다. 공유 HEAD/index 및 라이브 UI archive는 불변이다. 근거 `phase3-stage-a-api-image-r6-20260912.json`.
- **20:39 호스트·PR 점검:** 12코어/load11.91, swap12.9GiB, Node96·브라우저67이다. 사용자 지시에 따라 압박을 기록하고 무거운 검증은 직렬 진행한다. `deploy` Compose 프로젝트 컨테이너와 `deploy_default` network는 없으나 아직 rehearsal 자원을 만들지 않았다. 열린 dev PR은 0건, 원격 dev는 여전히 dd4d다. 완료 Terra 재개 요청은 agent thread limit으로 거부되어 실행되지 않았고, root가 해당 분석을 이어간다.
- **패키지 합성의 부재검사로 r5 PASS 철회:** root의exact13 합성 helper가 `scripts/release/create-alpha-release-manifest.sh`의base=null을거부했다. 실제parent75a에는해당파일6237bytes/SHA `ae067c4e7cb000b1c05a9ca0866b22ee172045040948cdfb0e82abc974ef253d`가존재한다. 검증은privateindex/commit 생성전에멈췄고공유변경없음. Sol도nullbase의실제부재검사를누락했던리뷰결함을인정해r5 PASS를철회했다. Terra가r6에서base분류를수정하고기존manifest builder의idempotent provenance·S3version/sourcehash·image digest 계약을대조한다. committed-error resume/비밀값argv 제거의소스판정과기존toolimage증거는별도유지한다.
- **신규 UI 완료 판정 보류·검증자 교체:** Luna의3폭캡처는before/after가바이트까지같고새신청마감문구/disabledCTA metric이0이어서신규UI증거가아니다. 일반대회문의모달50px 관찰은결과문의prefill/target검증을대체하지않는다. Luna의초기LIVE정책존재주장도실제query결과와달랐으며game717의visibility policy행부재→기본HIDDEN→404가확정됐다. 원래fail-closed 제품계약은유지한다. 기존raw는보존하고Sol이Ego87의실제검수를이어받아clone에필요한최소publicpolicy와비신청가능사용자조건을준비한후동일데이터/계정/viewport로재검증한다. 원본v5/제품코드/점수/경기시각은바꾸지않는다.
- **20:24 동일 데이터 before/after 준비 완료:** 벤치마크 UI 변경 직전773커밋의Web을새소유archive에서실제빌드했다. 첫 symlink 의존성 재사용은Turbopack의프로젝트외부루트제약으로실패했고,동일 frozen lock의offline설치362패키지후빌드가통과했다. before localhost3014(PID57525/PGID57522/session40287,landing200)와after localhost3013은동일API8121/합성clone을사용한다. Luna가같은계정·fixture·화면크기로실제비교캡처하며root는브라우저를조작하지않는다. next-start의standalone배포안내경고는기록하고이를Alpha Docker실행증거로사용하지않는다. UI검수뒤before/after의각소유프로세스와포트를정리한다. 근거 `phase3-benchmark-before-web-build-r2-20260912.json`, `phase3-benchmark-before-runtime-20260912.json`.
- **실제 cutover-tool 이미지 PASS:** 동결r4 Dockerfile의linux/amd64 target을실제로빌드했고image `sha256:919bbb8166fa82b80a75d0caa57cad6f64769fa43b0e8beca59a2b11be3a8920`를확인했다. network none의소유--rm컨테이너에서archive/manifest attestation,generatedClient,ts-node/Prisma 및CLI경로확인이모두통과했다. 첫tee 상대경로오류는Dockerfile판정에서제외하고절대경로로그로동일소스재실행했다. 검사컨테이너는남지않았다. receipt SHA `55d1fda433b4d0e8e20ad8fff2023cba8a16a5dfcb0d7a47dfc6fcd7fba27408`. 실제DB전환과Alpha배포증거는아직아니다.
- **실제 검수 서버 READY:** r5의 두번째 시작 실패는 auth가 아닌, 프로세스 목록을 조사한 짧은ps 자식을 다시 조회할 때 이미 종료된 race였다. 필수 API/Web 하위트리와supervisor만 단일 snapshot으로 결합하는 r6로 수정하고 자연종료 dummy-child 검증을 통과했다. r6 실제시작은성공, supervisor42653/API42755/Web42756, localhost8121/3013, clone `teameet_task168_benchmark_20260912`다. API health200·DBtrue, Web /landing200,703계정 auth/me200을 확인했다. Luna가 Ego87로실제UI검수하며 root는브라우저를직접조작하지않는다. 검수종료시이소유PID/자식만정리하고원본v5 hash불변을확인한다. 검수DB대회는in_progress이지만브라켓미게시이므로공개결과404를제품버그로오인하지않고필요전제를확인한다.
- **배포 r4 동결·실제 이미지 검증 진입:** Terra후보는정확히13경로,base13de, action-manifest SHA `c58814a5c348c0c64d7496de502ad88db1b23f2c50380b5aa77b2203f4d93c4b`, receipt SHA `de5ef4b14dd5bb802800be860b0e54b1199c16916ffc964514e9badbe100eee2`다. 중간단일배포,Compose에서파생된DB연결,보고파일UID,임시컨테이너오류정리,정상empty/1–7/full1–10ledger상태,이후canonical배포의durable전환증거검증을포함한다. Sol이소스검토하고Terra는별도소유영역에서로컬cutover-tool이미지build/DB없는boot검증을직렬수행한다. Alpha/원격쓰기/최종DROP은없다.
- **실제 복제 PASS / 첫 runtime 인증 실패 격리:** Sol의 고정 두 게이트를 통과한 runtime r4에서 소유DB `teameet_task168_benchmark_20260912`를 만들고 원본v5와정규화dump hash `d5a2d333898716b935468e555775d0e3ca60a295d50711759cc8f394adbebfb8` 일치를 확인했다. API/Web health 이후 auth/me401로 READY를 거부했고 supervisor22967/API22982/Web22983 및 두포트가 종료됐다. 원인은 존재하지 않는 `task168.first.user@example.test` 가정이었다. 실제v5는 `68168000-…-000703/704/705@task168-full.example.test`의active/completed 합성 사용자3명만 가진 v6 이관 검증 DB다. 문서의Alpha계정 DB와 같지 않다. 기존clone을 유지하고703계정으로 준비 스크립트만 교정하며, 이 화면 증거를 Alpha 동일fixture before/after로 가장하지 않는다. 실패 영수증은 `phase3-benchmark-runtime-20260912-r4/runtime-failure-20260912.json`에 보존했다.
- **20:05 PR 이력 재확인:** 사용자에게 이전에 닫힘으로 보고됐던#1136(iOS 배포 아카이브)과#1127(소셜 로그인 이메일 검증)은 모두 수정 후dev에 머지된 상태다. GitHub의 mergedAt은 각각2026-09-11 05:45:01UTC/05:47:48UTC이며 단순히 닫힌 채 방치된 상태가 아니다. 현재 본체 변경의 새PR/Alpha배포는 아직 진행 전이다.
- **복제 UI 검수의 증거 범위 확정:** runtime r2는 중첩 helper의 ROOT 계산 오류로 읽기 전용 preflight에서 실패했고 DB/서버는 변경하지 않았다. r3는 경로/Docker 실행파일을 고쳐 preflight를 통과했다. 최종 검수 서버는9e6f 커밋의 모든 API/Web tracked blob과 실제 성공한 두 빌드 영수증을 재대조하고 dist/.next hash 목록을 결합한다. 의존성 전체를 다시 해시하거나 과거의 다른 v5 snapshot과 같다고 요구하는 것은 이 격리 UI 검수의 차단 조건에서 제외했다. 이번 원본 DB를 현재 baseline으로 기록하여 clone과 비교하고 검수 종료 시 원본 불변을 확인한다. 이는 이전 데이터 이관 증거의 재주장이나 Alpha 실행 주장이 아니다. Sol이 이 범위를 반영해 판정을 정정했고 Luna가 마지막 두 조건을 반영 중이다.
- **빌드 이후 정리·추가 안전 확인:** 빌드/CTA 검증의 소유 PID88160·95718·97277·97332·83242는 모두 종료했고8121/3013은 비점유다. 현재 코드·문서 후보75a7359a와dev dd4d의 diff-check는0, API/Web 추가행의 TODO/FIXME/HACK/XXX는0이다. 복제 서버 helper는 undefined 변수,4xx를 성공으로 보는 health, 인증·빌드 결합·PID수명 계약 누락으로 Sol이 실행 전 반려해 Luna가 수정 중이다. 비어 있지 않은 fullrun/v4 DB는 구 연결 경기1개가 있지만 migration ledger는0개이고 v5는 구 연결0개다. 이들을 정식 migration 적용 DB로 보고하지 않으며 새 배포 entrypoint 검증용 정상 이력+비어 있지 않은 데이터 준비 경로를 별도로 확인한다.
- **계약 문서7개 동기화:** Sol이 현재 코드와 기존 문서 후보를 대조해 공개 대회 status/deletedAt 경계, staff 예외 없음, 중간 runtime 전환과 이후 물리 DROP의 구분을4개 문서에 추가하도록 판정했다. 이를 반영한 문서 전용 자식 커밋 `75a7359a0834dea0185185261672991f6d20f335`(parent9e6f3e7)은 정확히7문서이며 diff-check PASS, 공유HEAD불변이다. 원래 후보5개 소스hash도 현재와 동일했다. 문서 생성 helper의 첫 실행은 반복 section marker를 감지해 파일 생성 전에 중단했고, 고유한 전체 marker로 수정한 뒤 성공했다. 새 배포/검증 완료 주장은 추가하지 않았다. 근거 `phase3-docs-current-audit-20260912.json`, `phase3-contract-docs-r2-20260912/receipt.json`.
- **19:51 실제 API·Web 빌드 PASS / 증거 범위:** `9e6f3e7`의 API 및 workspace/lock 관련1091개 파일을 커밋 blob과 대조한 격리 archive에서 `pnpm exec nest build` exit0을 확인했다(launcher88160/child95718 종료). Web도1407개 파일 정합 확인 후 Next build exit0, TypeScript 완료,187개 route 및109개 정적 페이지 생성을 확인했다(launcher97277/child97332 종료). 근거 `phase3-committed-api-build-20260912.json`, `phase3-committed-web-build-20260912.json`. Web 정적 생성은 기본 설정의11 workers를 사용했으며 API가 꺼져 있어 SEO 목록 사전조회7건에 ECONNREFUSED 경고가 남았다. 빌드 성공은 실제 API 연동·SEO 데이터 검증을 대신하지 않는다. Web 첫 준비는2MB 폰트의 git show 기본1MB 버퍼 초과로 종료하여 Next 자체는 시작되지 않았다. helper를 object ID와 Git blob hash 비교로 수정했고, 준비 실패를 제품 빌드 실패나 완료 증거로 계산하지 않는다.
- **CTA 실제 검증 완료:** Sol이 테스트 대상에 존재하는 버튼1개와 보이는 사유를 정확히 검증하는 수정안을 승인했다. 자식 커밋 `9e6f3e7377c16a95c41005d9a422acef08488981`(parent13de)은 CTA 테스트 한 파일만 포함하며 공유HEAD/index는 바꾸지 않았다. 실제 JSON 리포트 기준 테스트 파일1개·테스트19개 모두 PASS, exit0/PID83242 종료다. 보고기의 suite7은 describe 그룹 수이며 파일7개로 계산하지 않는다. 초기 경로 오류의0-test 실행은 제외하고 `phase3-benchmark-cta-test-repair-20260912/cta-vitest-20260912-retry2.json`을 증거로 사용한다. 앞선 문의5개 PASS와 합쳐 이번 UI 좁은검증24개를 충족했다. 실제 화면 after 검수는 별도 진행 중이다.
- **19:50 단계별 배포 실행계약 재검토:** 사용자 A는 기존 물리 테이블을 보존하는 canonical 중간 릴리스의 Alpha 검증 후 최종 DROP을 별도 릴리스로 진행하는 결정이다. r3의 자동 `bridgeRelease`는 새 canonical 앱을 DB 변경 없이 시작하고, 개별 migration 단계 뒤에도 공통 seed/app 시작을 수행하므로 실제 Alpha 선행 스키마가 없을 때 안전하지 않다. 또한 archived CLI를 호스트 pnpm으로 실행하면서 의존성·구 Prisma Client·DB 연결을 준비하지 않았다. r3은 배포하지 않고 동결했으며, Terra에 Stage A 한 배포 안에서 중지/백업→1–7 및10→archived cutover→8/9→중간 앱 시작을 완료하는 r4를 맡겼다. 최종11은 계속 별도 릴리스다. Sol이 독립적으로 실패·재시도·이미지·증거 계약을 검토한다.
- **19:44 실제 Prisma ledger 순서 PASS:** 새 소유 빈 DB `ulw_v1_integration_task168_order_20260912`에서 기존157개+1–7 및10의165개를 먼저 적용한 뒤8/9를 추가해167개 적용/status가 성공했다. DB ledger의10개 원시checksum, 실제 완료 순서10<8<9, r5 schema와 물리 drift0, 구5테이블·3컬럼 보존을 확인했다. 근거 `output/qa/task168/phase3-stage-a-ledger-proof-20260912.json`. 이는 빈 DB 순서 증거이며 비어 있지 않은 Alpha의 이관 성공을 의미하지 않는다. 현재 열린 dev 대상 PR은0개다. 호스트 load5.84/12.66/12.64, swap16.79GB를 기록하고 사용자 지시에 따라 최소 worker·직렬 검증을 계속한다.
- **19:34 직접URL 권한 실제 RED→GREEN:** 통합 재실행의 나머지3실패는 published fixture가 기본draft여서 생긴 정합 문제였으며, 조사 중 `getMatch`가 실제 draft/deleted 대회를 직접URL로 공개하는 기존 결함도 확인했다. fixture를 in_progress로 명시하고 schedule과 동일한 공개status/deletedAt 조건을 getMatch에 적용했다. 수정 전 서비스+새 회귀테스트는 실제 `Expected operation to fail`로1실패/11통과, 수정 후 커밋 `13de36361ac15e0eadd386b060d25651b4e5e6ff`는12/12통과다. 앞서 통과한 다른6통합파일의 소스는 동일하며, 좁은 통합7파일60시나리오가 수정별 재실행을 포함해 통과했다. 근거 `phase3-privacy-red-execution-20260912.*`, `phase3-privacy-green-execution-20260912.*`, `phase3-integration-r2-execution-20260912.*`. Alpha에는 아직 반영되지 않았다.
- **벤치마크 UI 구현 범위:** 위13de 커밋에 신청 불가 기존사유의 가시화와 결과별 문의 진입점6파일을 포함했다. 첫 후보는 문의대상을 개인매치(`match`) + GameID로 잘못 연결해 Sol이 반려했다. r2는 실제계약 `team_match` + canonical fixtureId, 기존 match카테고리 및 `[경기 결과 정정]` 제목을 사용하고 기존 대회문의 기본값을 유지한다. aria-label을 대상에 맞추고 중복live region을 제거했다. 소스리뷰PASS이며 좁은Web검증/라이브시각검수는 남아 있다. 문의 전송은 검수 중 수행하지 않았다.
- **단계별 배포 미완 원인 구체화:** 배포r2는 실제 사전조건 입력 배선, archive전체멤버검증, DB/image/phase에 결합된 백업·중지 증거, 전환후 구앱복구 차단, 단계ledger순서, 중간schema의 실제이미지 생성 연결, 현재ops변경 보존이 빠져 Sol BLOCK이다. 원격에는 적용하지 않았다. 기존 Terra 작업자는 실행예산 종료를 보고했고 완료상태를 조회/interrupt한 후 새 Terra 작업자에 정확한8개 경로 책임을 넘겼다. 루트는 표준 Prisma ledger로157기존+8개선행migration(1–7 및10)을 빈 소유DB에 적용(exit0)하고10의원시checksum을 검증한 뒤8/9를 추가 적용하는 리허설을 진행한다. 이는 빈DB 순서 검증이며 실제 Alpha 이관/중단/복구 증거를 대신하지 않는다.
- **19:20 검증/벤치마크 교정:** 프로필 fixture만 반영한 자식 커밋 `773f8011369df6779baedefc461b66eb375f110d`(parent11a09dc6)의 프로필35테스트가 모두 통과했다(PID20278 종료, `phase3-profile-fixture-unit-20260912.log`). API 좁은6파일은 이제 변경 없는5파일 PASS와 수정된 프로필 PASS를 함께 충족한다. 중간 r5 물리스키마의 실제 DB→schema diff도 `No difference detected`/exit0이다. 통합7파일 첫 실행은6파일/54개가 공통 경기규칙 초기값 부재로 setup 실패했다. CI deploy.yml380–381의 `competition-config-backfill.cli.ts` 준비 단계를 누락한 원인으로 확인했고, 전용 템플릿에 동일CLI를 실행해2개 config만 초기화(대회/팀매치 backfill0) 후 같은7파일을 재실행한다. 실패 후 per-suite clone0을 확인했으며 기존DB/Alpha는 바꾸지 않았다.
- **팀 빈 상태 판정 철회:** 실제 Alpha에서 문서의 팀장B 계정으로 TeamC 소유자 화면을390/768/1440 검수했다. 페이지 운영 메뉴에 팀매치 만들기가 있고 실제 `/team-matches/new/team`으로 이어진다. 자식 EmptyState가 수동적이라는 소스 관찰만으로 전체 사용자 흐름 부재를 단정했던 판정을 철회한다. 모바일 흐린 캡처는 로딩 중 프레임이었으며 readyState/font load/quiet 이후 정상 대비를 확인했다. 현재 확인된 벤치마크 개선은 신청 불가 사유 가시화와 결과별 정정 연락 진입점이다. `benchmark-alpha-20260912/observations.json` SHA a4fddb134061cf419d46fc9f0b27d84e4e1db9fabbc1de8a5f051120ebe1f02f 및 캡처에 역할/행동/비검증 범위를 기록했다. 원격dev=로컬dd4d, 열린dev PR0을19:20 재확인해 pull할 신규커밋은 없다.
- **19:14 실제 커밋 검증 진전:** `11a09dc6b938fd69f51595f62371076aac9351d7`(tree bcb6b81c)의 API `tsc --noEmit --incremental false`가 오류0/exit0이다(PID97772 종료, `phase3-repaired-api-typecheck-r2-20260912.log`). 좁은API unit6파일은5파일/166테스트 통과, 프로필 대회 출전 집계1건 실패다. 실패 원인은 fixture의 남은 `game.tournamentFixture`와 누락된 `sourceType`이며 실제 canonical 서비스는 TEAM_MATCH를 검증한다. 기대값3경기/2대회를 낮추지 않고 fixture를 실제응답 계약으로 수정한다. 참가자 side복구와 채팅/프로필/리치텍스트 회귀는 실제 통과했다. Web9파일157테스트/typecheck PASS는 동일 Web bytes에 계속 유효하다. 이전 로컬 `d003ba4d`는 불완전 sideById 복구가 Sol에 반려되어 사용하지 않는다.
- **중간 클라이언트 전후 DB 읽기 실증:** r5스키마 SHA `91222f64…`는 archive665c2b…에20개 ignore 주석만 더한 물리스키마 보존본이며 Sol SOURCE_FIDELITY_PASS다. 설치된 격리 package에서 실제 Prisma Client 생성에 성공했고 노출117모델/필드구조가 최종클라이언트와 동일했다. 구테이블을 유지한 로컬v5 DB 및 최종삭제DB 양쪽에서 Game·StaffScope·Audit 기본조회6건 모두 성공, 퇴역컬럼 SELECT0이다. 생성 PID4947/launcher4945 종료. 근거 `phase3-stage-a-client-proof-20260912.json`. 이는 기본조회 증거이며 전체 이미지·쓰기·Alpha E2E나 물리 drift 통과를 대신하지 않는다.
- **A 배포 순서 교정:** r3 중간스키마는 기본값/인덱스/FK를 빠뜨려 반려하고 실제 archive에서 r5로 재생성했다. 처음의 'migration1–9가 old-compatible' 주장도 폐기했다. 실제 cutover runner가 링크를 바꾸고 구 쓰기를 봉인하며 migration9도 그 봉인을 요구한다. 따라서 archived claim gate → runner → source-history/canonical guards의 전제 순서를 먼저 증명하고, 최종 DROP 뒤의 이전 이미지 복구 대상은 검증된 canonical 중간 이미지로 고정한다. 구dd4d 이미지 호환성을 임의 선언하거나 drift 검사를 느슨하게 바꾸지 않는다.
- **19:09 실행 위치 오류 격리:** archive 없는 임시디렉터리에서 git archive를 호출한 준비 명령이 실패했는데 후속 타입검사가 이전30cd를 대상으로 실행됐다(PID96856 종료/exit1). 이 로그 `phase3-repaired-api-typecheck-20260912.log`는 새후보 검증에서 제외했다. `git -C <공유저장소> archive`와 shell fail-fast/pipefail을 적용하고 수정9경로가11a09dc6와 정확히 일치함을 별도로 검증한 후에만 위 새검사를 실행했다. 공유소스/Alpha에는 변경이 없었다.
- **벤치마크19/19 코드 대조:** 사용자 제공 두HTML의19개 실행 항목을 현재 불변 후보30cd와 Sol이 대조했다. 대회 상세 참가비/환급/참가팀 수가 없다는 주장은 현재 코드에는 해당하지 않는다. 실제 결함은 ①비활성 신청 사유가 aria-label에만 있어 보이지 않음 ②결과 화면에 정정 연락 진입점 없음 ③팀의 열린 경기 빈 상태에 권한별 다음 행동 없음이다. 기존 계약을 이용하는 개선 대상으로 추적하며 실제 Alpha/반응형 확인은 Luna의 Ego 검수로 구분한다. 노쇼·최소 정원 자동취소·환급·대기열 우선순위·공급자 사업 확장 등 새 정책은 이 벤치마크만으로 확정하지 않는다. OFFICIAL 공개 원칙은 유지한다. 원본 조사자의 주장과 이 세션의 실측을 혼합하지 않는다. 근거 `phase3-benchmark-source-audit-20260912.json` SHA256 `70d8301e56ccc4e69328cbcafed8070010a4e0f700d0f914353c8e053c96f928`.
- **검증 준비 및 도구 오류 격리:** 정식 Jest DB 이름 가드를 유지하려고 검증된 빈DB를 소유 템플릿 `ulw_v1_integration_task168_final_20260912`로 복제했다(CREATE exit0, 원본연결0, Alpha변경없음). 종료 시 이 템플릿과 per-suite clone을 회수한다. 두 retired CLI integration 파일은 별도 역사적 archive와 현재30cd bytes가 각각 c38eb935…/104cda4f…로 정확히 일치하며 활성 suite에서는 canonical 통합 검증으로 대체한다. 외부 HTML의 context-mode 접근 제한은 명시된 경로를 native read로 읽어 해결했다. 잘못 추정한 `(main)/tournaments`·별도 Jest 설정 경로와 빈 glob 조회는 실제 파일 목록/`jest.config.ts`로 교정했으며 제품 결함이 아니다. 새 조립 도구의 첫 시도는 standings spec이 기존 선택 목록 밖임을 탐지해 실패했고, 정확한 검수 전후 해시를 검증하는 명시적 closure 확장으로 r2를 만들었다. 실패 조립본은 원격/공유소스에 적용하지 않았다.
- **2026-09-12 19:00 KST — A 단계별 배포 사용자 확정:** 사용자 답변 `A · 호환 중간 버전부터 단계별 배포`를 적용한다. 원인은 기존 Alpha 배포가 DB migration 후 앱 교체/실패 시 구 이미지 복원을 수행하여 최종 DROP과 현재 dd4d 앱이 호환되지 않는 것이다. 처리 순서는 호환 중간 스키마·canonical 런타임의 실제 검증 → dev 머지/Alpha 배포 → 기존 데이터 보존·역할별 UI/API 검증 → 구 테이블 제거 배포다. 중간 앱이 제거 전후 DB 양쪽에서 동작함을 먼저 증명한다. B 유지보수 전환안은 선택되지 않았다. Task165 A/A, 기존 경기·권한·오류 계약과 dev-only 정책은 유지한다. Prisma ignore 기반 중간 스키마는 검토 가설이며 아직 검증 결과가 아니다.
- **원자적 후보 실제 검증:** 재조립한 로컬 커밋 `30cd362221a5d0ac8ecdc843bb289bf031dd0d80`(parent dd4d, tree d4fc4467)의 API 타입 오류는849건에서4건으로 줄었으나 아직 실패다. Web 타입 검사는 exit0이며 핵심9파일157테스트가 실제 통과했다(6.96초, PID44910 종료). 근거 `phase3-atomic-api-typecheck-20260912.log`, `phase3-atomic-web-typecheck-20260912.log`, `phase3-atomic-web-tests-20260912.log`. 이 결과는 Alpha E2E 완료가 아니다.
- **기존 dev 수정 덮어쓰기 BLOCK:** Sol의 병합 이력 비교에서 stale reference 전체 파일이 참가자 side 식별/이미 연결된 참가자 필터 순서, chatEnabled=false의 inbox/badge/push 억제, 프로필 이메일 검증을 덮는 것을 발견했다. 원인은 파일 출처 확인만으로 현재 dev의 후속 수정 보존을 보장한다고 판단한 것이다. Luna는 canonical Phase3 동작과 기존 dev 수정을 함께 보존하는 좁은 소스/회귀 테스트를 복구하고 Sol이 독립 검수한다. 타입 검사 통과만으로 이 동작 회귀를 승인하지 않는다. 삭제된 backfill CLI를 참조하는 두 integration 파일도 단계별 배포에 맞게 실제 테스트 생명주기를 점검한다.
- **추가 사용자 범위:** 사용자가 지정한 `scratchpad/pub/report.html` 및 `todo.html`을 읽고 현재 역할별 흐름·UI/UX·Phase3 범위에 적용할 벤치마크를 분류한다. 원인·채택 근거·실행 결과는 이 문서에만 누적한다. 원본 HTML의 평가나 수치를 실제 Teameet 검증 결과로 취급하지 않는다.
- **실제 커밋 검증 실패:** 로컬 커밋 `290dff16`을 `/private/tmp/teameet-task168-commit-20260912.FbJYhj`에 추출하고 offline/frozen 의존성1047개 설치(exit0,PID79496)·Prisma6.19.2 생성(exit0,PID81106)을 완료했다. 실제 API `tsc --noEmit`은 **849개 TypeScript 진단으로 exit1**(PID81953)이다. 이는849개 독립 결함이라는 뜻은 아니며 타입/선택자/지역 변수 누락의 연쇄 오류가 포함된다. 기존 SOURCE PASS 및 byte-binding PASS는 빌드 건강을 증명하지 못했으므로 이 커밋은 PR-ready가 아니다. 원격 push/머지는 하지 않았다. 실제 E2E 실행 소스와 조립 커밋의 차이를 Terra/Sol이 독립 분류하고 기준 소스 typecheck로 조립 누락과 기준선 오류를 구분한다. 근거 `phase3-local-api-typecheck-20260912.log`, `phase3-local-install-20260912.log`, `phase3-local-prisma-generate-20260912.log`.
- **조립 결함 분리 실측:** 실제 E2E 기준 `/private/tmp/task168-final-api-20260911/apps/v1_api`에서 같은 타입 검사를1회 실행한 결과3건만 발생했다(exit2,PID85674). 모두 `tournaments-admin.service.spec.ts`의 preview mock 반환 객체가 새 계약 필드를 빠뜨린 오류다. 따라서849건을 개별 임시 패치로 덮지 않고, 기준 소스의 원자적인 함수/파일을 보존해 배포 후보를 재생성하고 이3개 fixture 계약만 정확히 수정한다. 기존 조립본과 실패 로그는 진단 증거로 보존한다. `phase3-reference-api-typecheck-20260912.log` 참조. 신규 검증 runner들도 잘못된 테스트 경로·Prisma CLI 인자·실행 수명주기 문제가 남아 실행하지 않았으며 실제 검증은 owned PID/log를 남기는 직접 명령으로 전환했다.
- **판정 철회와 Web 실제 검사:** Sol은 후보의849진단/81파일과 기준3진단/1파일을 교차 검토해 기존 source-composition PASS를 철회했다. byte-binding PASS는 유지하지만 파일 출처가 정확하다는 뜻일 뿐 동작/컴파일 완료가 아니다. Web 실제 `tsc --noEmit --incremental false`도8개 진단으로 exit1(PID89311): 일정/개인기록/MSW 필수필드, 경기운영 fixture nullability·event 계약, 지원되지 않는 Button variant를 확인했다. Luna가 실제 커밋의8개 파일만 수정하고 API는 Terra가 기준 소스의 온전한 파일에서 재조립한다. 완료된 설치/생성/타입검사 PID79496·81106·81953·85674·89311은 모두 종료 확인했다. 별도 테스트 DB는 이 단계에서 만들지 않았다. 근거 `phase3-local-web-typecheck-20260912.log`, `phase3-assembly-typecheck-diagnosis-20260912.json`.
- **로컬 커밋 후보 확정(2026-09-12 18:28 KST):** `290dff16a01dcf67821f8b7178ebdf77052aac21`, parent `dd4d0733`, tree `e842606631a55caa26e90f4228f3bc2708e3541d`. API202·Web74·운영2의278개 출처/해시를 바인딩했으며 실제254변경·24기존동일 파일이다. 영상 서비스의 제거된 Prisma 타입과 누락된 transaction-client 전달은 Sol 검토한2파일로 보완했다. private index/commit-tree로 생성하여 공유 HEAD/dev와 기존 index/WIP는 건드리지 않았다. 이 커밋은 **로컬 통합검증 전용**이며 실제 타입/빌드/테스트, 문서 동기화, migration gate, Alpha 배포 방식은 미완이다. `phase3-local-commit-20260912.json`과 `phase3-local-package-manifest-20260912.json` 참조.
- **배포 방식 결정 이력:** `output/qa/task168/phase3-alpha-delivery-options-20260912.html`의 A/B/C 중 사용자가 A(호환 중간 버전)를 확정했다. 과거 B 추천은 채택되지 않았으며 위 확정 순서를 따른다. 18:28 당시 load7.88·swap16.82GB·Node실행파일66개, 열린dev PR0건이었다.
- **기본30/30 + 경계12/12**. A-M 실제 UI201 정정→공식화→1개 worker 처리→공개/양팀/개인 재조회와 Ego 동선, 동일 요청201 replay의32모델 불변, 활성 SUPPORT403의 단일 오류로그 행까지 Sol 독립 검수 및 최종 verifier **19/19 PASS**로 완료했다. 근거 `output/qa/task168/verify-admin-match-correction-20260912.json`, `admin-match-final-verifier-review-20260912.md`, `admin-match-final-visual-review-20260912.md`. 6단계 immutable snapshot·기존12명·이전공식1:0·새공식2:0·서버로그 마스킹을 보존/검증했다.
- **42/42는 로컬 실제 API/DB 및 이미 기록된 Alpha 증거를 합친 역할 행렬의 완료다. Phase3 본체가 Alpha에서42개 모두 통과했다는 뜻이 아니다.** 새 인라인 정정 화면은 Alpha미배포 상태다. 현재 커밋의 Prisma 생성과 빈 DB 전체 migration replay/drift는 완료했다. API/Web 소스 재조립→커밋본 타입/빌드/필수통합검증→안전한 dev머지/Alpha전환→실제 UI/E2E는 남아 있다.
- **커밋본 migration 검증 완료(18:40 KST):** 새 소유 DB `teameet_task168_commit_290dff16_20260912`에 전체168개 migration을 실제 적용했고 Prisma schema drift exit0이다. 이 중 Task168의11개는 `_prisma_migrations.checksum`과 `290dff16`의 원시 SQL SHA256이 전부 일치하며 제거 대상5테이블/2enum 존재0을 확인했다. 기존DB/Alpha에는 쓰지 않았다. PID3777·3807·3950 실행이 종료됐으며 새 DB는 후속 통합 테스트용으로 보존하고 검증 종료 시 삭제한다. 근거 `output/qa/task168/phase3-local-migration-proof-20260912.json`. 이는 빈 DB의 커밋본 migration 증거이며 비어 있지 않은 Alpha 백업/이관/실제 전환을 대신하지 않는다.
- 최종 SQL 비어있지 않은 복제DB 검증은118개 보존테이블 동일/원본불변/cleanup완료 PASS. PR1177은 Copilot·CI·dev머지·Alpha배포 PASS이며 최신 열린 dev PR0. 소유runtime19437/API19474:8121/Web19475·19476:3013은 18:19 KST 이후 회수했다. 테스트 DB/증거와 Ego87은 후속 검증을 위해 보존한다.
- **후보 조립 실패와 수정:** Terra API attempt2는 import0/문법상 의존성 연결만으로 안전하지 않았다. Sol이 관리자 Promise.all 내부에 reviewGroups 선언이 끼어든 잘못된 조립, game filter의 sourceType 위치 오류, 필수 chat 직접진입/entitlement hunk 누락을 발견해 BLOCK했다. 원인은 겹친 변경을 행 범위로 선택하면서 함수 경계와 필수 hunk를 검증하지 못한 것이다. attempt1/2를 보존하고 함수 단위 정확한 before/source 대조·필수 path 누락 실패·변경 TS 문법 파싱을 추가한 attempt3로 교정한다. 공유 제품 소스와 git에는 반영되지 않았으며 독립 PASS 전 커밋하지 않는다.
- **분석 도구 상태 분리:** context-mode 파일 조회가 다른 프로젝트(`2d-to-3d`)를 현재 root로 판단해 이 저장소의 허가된 파일 접근을 거절했다. context-mode 설정/권한을 임의 변경하지 않고, 현재 Teameet 작업공간의 native 파일/명령 도구로 동일한 로컬 증거를 읽어 확인했다. 이는 제품/API/DB 실패가 아닌 조회 도구의 프로젝트 바인딩 문제로 격리하며 이후 결과 판단은 실제 Teameet 파일과 실행 영수증을 기준으로 한다.
- **프론트엔드 후보 판정:** Luna가47직접 포함·4공유계약 분리·23기존 import 의존성의74파일 overlay를 만들었고 Sol이 해시, 선택 hunk, Period GET/PATCH/CAS, 정정 payload, claim/staff/공개·팀·개인 기록 계약을 대조해 SOURCE PASS로 판정했다. merged PR1173–1177 CSS는 base에서 보존된다. 빌드/타입/테스트 및 이 후보의 Alpha실행은 아직 하지 않았으므로 merge-ready와 구분한다. 근거 `output/qa/task168/phase3-web-candidate-independent-review-20260912.md`.
- **CI/운영 문서 동기화 원인과 판단 교정:** deploy.yml이 Phase3에서 제거된 `goal-event-backfill.cli.ts`를 호출한다. 최초 archive4파일 복원 후보는 상대 import 누락·적용 불가능한 workflow patch·구체 문서 bytes 부재로 Sol BLOCK이다. 원본 workflow 주석을 재확인한 결과 이 단계는 후보0건을 예상하는 빈 DB의 CLI 부팅 검사이며 데이터 보존 검증이 아니다. 이미 폐기하는 CLI 부팅 단계만 정확히 정리하고 migration replay/drift·통합 테스트·지원되는 CLI 부팅 검사·main production job/승인 게이트는 보존하는 구체 후보로 수정한다. archive의 무의미한 실행으로 retirement 증거를 대신하지 않는다. 실제 적용 파일과 해시·독립 리뷰 전에는 커밋하지 않는다.
- **2026-09-12 18:12 KST 재개 점검:** dev HEAD `dd4d0733a775fb33b264d22de5e11139cbe39870`, 열린 dev PR 전수 조회0건. 새 PR은 현재 후보와 파일/계약 겹침을 확인한 뒤 수정→독립 리뷰/CI→dev 머지→Alpha 검증으로 처리한다. load14.91/12코어·swap17.83GB 압박은 기록하고 사용자 진행 지시에 따라 좁은 검증을 직렬 수행한다. context-mode session 검색 결과 없음은 제품 실패가 아니며 기존 파일/영수증으로 상태를 복원했다. 커밋/검증 도구 초안에서 unchanged 의존 파일 처리·실행/cleanup 계약 결함도 발견되어 실행 전에 수정 중이다.
- **Alpha 배포 호환성 결함 발견:** 기존 `deploy-alpha.sh`는 migration 실행 후 앱/worker를 교체하며 오류 시 이전 앱을 복원한다. release manifest도 이전 버전과의 application-images-only rollback 호환성을 기록한다. Phase3의 5개 테이블 삭제는 현재 dd4d의 이전 앱과 호환되지 않으므로 SQL allowlist만 추가해 이 배포를 통과시켜서는 안 된다. 삭제 이전 canonical 호환 배포 경계 또는 명시적 유지보수·구 앱 자동복원 금지 계약을 독립 검토한다. 사용자의 dev/Alpha retirement 실행 승인은 이미 유효하며, 이번 미완 사유는 재승인 요청이 아니라 실제 배포 순서와 호환성 증명의 누락이다. 병행 중인 로컬 커밋 검증은 계속한다.
- **검증 도구 초안 반려:** 실제 후보에 없는 API/Web 테스트 경로, archive 내부 git 조회, migration 존재 여부만 확인하는 해시 누락, 다중 SQL 안의 DROP DATABASE, cleanup 전 PASS 기록이 발견됐다. 초안은 실행하지 않았고 Luna가 실제 파일/설정에 맞춰 수정 중이다. 탐색 중 Web overlay에 없는 package.json 및 잘못 짚은 integration setup 파일 조회 오류는 base 상속/실제 Jest environment 경로로 교정했으며 제품 테스트 실패로 집계하지 않는다.
- **메모리 회수 실제 결과:** runtime stop 도구가 이미 종료된 임시 PID32830을 소유권 오류로 잡아 알려진 API/Web 자식 전체의 종료를 건너뛰었다. 실패 영수증을 보존하고 원래 실행 영수증의 PID/시작시각/명령/cwd를 재대조한19476·19475·19474에만 TERM을 전송했다. KILL 없이 모두 종료,8121/3013 listener0·테스트 DB연결0, DB는 보존했다. Luna가 dead-PID race만 건너뛰도록 helper를 수정하고 살아 있는 미확인 프로세스 차단은 유지했다. 근거 `output/qa/task168/admin-match-correction-runtime-stop-recovery-20260912.json`.
- **API 후보 수정 결과:** attempt3는 admin hubInbox 함수 경계와 game.is를 원본에 맞춰 복원하고, chat 양팀 자격/직접진입 조건을 포함했다. Sol이 실제202개 최종 path(195파일+7삭제),29타입수정,필수17의존파일,11migration,혼합 notification/profile base보존을 재검토해 SOURCE PASS로 판정했다. receipt SHA `3c5df2ab4717effd3a91a1de0425973d2cddb930f85706edc6fca20f74698a2a`. 문법 파싱 오류0·필수누락0·미해결 import0이며 아직 커밋본 빌드/통합검증을 대신하지 않는다.

## 앞선 시점 진행 — 41/42

- **사용자 결정·피드백 기록(2026-09-12):** 원인: 메인 Astra가 Ego 실검수까지 직접 맡아 역할별 비용 분리가 부족했다. 결정: 구현·수집은 Luna, 범위/구조 분석은 Terra, 독립 검증은 Sol로 분담하고 공개 결과→팀 기록→개인 기록 및 Alpha의 Ego 조작도 서브에이전트가 맡는다. 조치: 루트는 진행 중인 기존 브라우저 호출 종료만 확인하고 신규 브라우저 조작을 중단했으며, 단일 TaskSpace87의 제어를 다음 검증자에게 인계한다. 결과: 루트는 기획·방향성·완료 증거 판단에 집중하며 실제 검수 결과는 수신 후 판정한다. 주요 결정·피드백의 원인/조치/결과는 이 문서에만 누적하고 개별 JSON/스크린샷은 원시 증거로 링크한다.
- **실행 도구 오류 기록:** 팀 전적 진입 후 실제 화면에 없는 `득점` 문구를 기다린 검수 코드가 timeout했다. URL/제목과 후속 snapshot에서 팀 전적의 승·2:0 및 실제 경기기록 펼치기 버튼이 확인되어 제품 진입 실패와 구분했다. 버튼을 펼쳐 `task168-5` 노출을 기다리는 실제 계약으로 검수 조건을 교정했다. 정정 mutation은 반복하지 않았다.
- **보존 집계 기준 교정:** positive retirement 재시도는 `expected 118 retained comparable tables, got 117`로 복제 전에 종료했다(PID90742 exit1). 실제 catalog는 `_prisma_migrations`를 포함한123개인데 도구가 이를 제외하면서123/118을 기대한 것이 원인이다. 이번 직접 SQL 적용은 이력 테이블을 쓰지 않으므로 해당 테이블까지 포함한 전체123→보존118개를 전후 비교하도록 교정한다. 원본/재시도 실패 영수증은 보존하고 다음 실행은 별도 retry2 증거로 남긴다. 성공 전에는118개 보존 증명이나 retirement 완료를 주장하지 않는다.
- **배포 누락 방지 결정:** 최초 schema/최종SQL 중심 후보는 선행10개 migration과 실제 import되는17개 신규 runtime/helper를 빠뜨릴 수 있었다. Terra가 총11개 migration·필수 consumer/helper·혼합 파일의 선택 hunk를 확인했고, 원본 snapshot에서 타입 수정29건(컨트롤러26+bracket1+league-generator2)을 대조해 출처 불확실성을 해소했다. notification/profile의 별도 변경을 제외한 구체 후보 묶음을 생성 중이며, 커밋본 검증 전 PR-ready로 판정하지 않는다.
- **PR1177 검토 결과:** Copilot `copilot-pull-request-reviewer`가 2026-09-12 03:11:35Z에3/3파일 검토·승인 권고, inline지적0. Sol 소스/로컬 시각 검수와 CI 뒤 dev 머지 및 Alpha SUCCESS를 확인했다. Alpha 최종 독립 시각 검수는 서브에이전트가 수행 중이다.
- **실제 기록 동선 판정:** Sol이 fresh dev-session 이후 `/home` 인사와 auth/me200으로 user005를 확인하고 `마이 → 내 활동 기록 → 정정된 경기`를 실제 클릭했다. 개인3출전/2골·대상경기2골, 정확한 대회/경기 링크, 상세 전반1분·후반2분 득점 및 정정이력이 일치했다. 390/768/1440 내부스크롤 끝까지9장과 공개/팀 기록 증거를 검토해 가로넘침0, 관찰 구간 console/network오류0을 확인했다. 최초 cross-origin 인증 진단의 credentials 누락401은 후속 credentialed200으로 원인을 구분했다. 근거 `output/qa/task168/admin-match-final-visual-review-20260912.md`.
- **Alpha 범위 구분:** Sol의 실제 `정정 시작`은 기존 모달을 열었고 저장 없이 취소했다. PR1177의52px헤더 보정은 Alpha 반영됐지만 Task165 A/A 선택에 따른 새 인라인 정정 본체는 아직 배포되지 않았다. 새 본체가 반영된 Alpha E2E는 별도 미완으로 유지한다. Ego 업데이트 알림은 기록했으며 사용자 승인 없는 도구 업그레이드는 실행하지 않았다.
- **118테이블 보존 실증 결과:** corrected retry2(SHA `82cc300798193e40f838a8e91b63a70b9f84e767df59ca6b7384b6d3b1bf6624`)는 실제 복제 DB에서 최종 retirement SQL exit0,5테이블·2enum·3컬럼 제거,118개 보존테이블 전후 map/hash 동일, 원본 full/comparable hash 불변, 복제 DB cleanup 완료로 PASS했다(PID24663 exit0). `_prisma_migrations`까지 포함한 전체 비교다. `output/qa/task168/retirement-positive-rehearsal-20260912.retry2.json`에 각 테이블 행수/컬럼/해시를 보존한다. 이는 **현재 소스의 최종 SQL 비어있지 않은 DB 검증**이며 전체11개 migration chain 재실행·커밋본 검증·Alpha전환을 대신하지 않는다.
- **검수 도구와 제품 오류 구분:** telemetry launcher의 ts-node 확장자 검사 및 프로젝트 설정 누락으로 각각 DB 조회 전에 실패했다. 실제 successful snapshot launcher와 동일한 cwd/TS_NODE_PROJECT/TRANSPILE_ONLY 설정을 적용하고 오류 요약에서 빈 마지막 줄을 버리도록 교정했다. 실패 영수증은 유지하며 최종 A-M32모델 검증 결과가 나오기 전41/42를 유지한다.
- **보존 실증 범위:** retry2의118개 보존테이블 중22개에 데이터가 있고 총55행이다. 모든118개 테이블의 컬럼/행수/값 해시를 비교했지만 대규모 Alpha 전체 데이터 검증으로 확대 해석하지 않는다. 원본 synthetic v5와 시험용 복제 DB에 한정된 실증이며, 실제 배포 전 Alpha backup/preflight와 전환 후 재조회는 남아 있다.
- **오류 로그 계약 확인:** 실제 HTTP403의 `code=STAFF_SCOPE_DENIED`는 저장 시 response JSON의 `code`만 `[REDACTED]`로 마스킹된다. 전용 `error_code` 컬럼과 requestId184·actor009·정규화 route·거절 사유를 함께 검증하도록 수집기/검증기를 교정했다. 값이 같아야 한다는 잘못된 가정이 세 번째 수집기 실패 원인이었고, 오류를 성공 처리하지 않고 실제 저장 계약을 근거로 수정했다.
- 2026-09-12 17:40 KST 재개: A-M 실제 정정201 → 공식확정201(v16, 2:0) → 정확히1개 집계 작업 완료 → 공개 경기·팀·개인 API 재조회200까지 실행했다. 원래12명/이전공식1:0 이력 보존, 동일 요청 replay201 및32개 모델 전체 불변, 활성 SUPPORT의403 `STAFF_SCOPE_DENIED/ROLE_ACTION_DENIED`를 확인했다. 최종 오류 로그1행 상관관계 증거와 독립 검수·팀/개인 실제 화면 동선이 남아 **41/42 유지**. 6단계 스냅샷과 요청/응답은 `output/qa/task168/admin-match-correction-*20260912*`에 보존한다.
- PR1177 헤더 겹침 수정은 dev `dd4d0733a775fb33b264d22de5e11139cbe39870` 머지, Alpha34670007284 SUCCESS. 390/768/1440 실제 Alpha 헤더 offset52/52/0px와 가로넘침0 확인. 로컬 공개 경기 내부스크롤 끝의 CTA는 하단메뉴 위에 노출됨을 실측/촬영했다. `alpha-header-after-visual-20260912.json`, `public-correction-fullscroll-after-visual-20260912.json` 참조. 최신 열린 dev PR0. 현재 공유 HEAD는 dev/dd4d0733이며 이전 c2614e0 기록은 과거 상태다.
- Phase3 최종 SQL positive rehearsal 첫 실행은 Docker 호출 구성 오류로 **복제 전 실패**, 원본 연결0·대상 DB없음·DROP미실행이다. 수정된 실행 도구를 재검토 중이며118개 보존테이블 실제 증거는 아직 없다. 본체 커밋본 검증·11개 migration chain·dev/Alpha 전환은 계속 미완이다. 소유 A-M runtime19437/API19474:8121/Web19475:3013을 후속 검증용으로 유지하며 종료 시 회수한다.
- **기본29/30 + 경계12/12**. S-T 실제 배정 경기 진입·도착 확인6명·시작·득점/도움·전후반·종료를 실행했다. Game ENDED v7, 결과 revision SUBMITTED/1:0/참가자6명, API3역할과 DB가 일치하며3viewport·기존 X10/S-R 증거를 합쳐 Sol PASS. 근거 `output/qa/task168/staff-tournament-runtime-review-20260912.md`.
- PR1176은 dev03bc025 및 Alpha34664688509 SUCCESS,3viewport 신청/확인/완료 UI Sol PASS. 취소된 RSC GET3건을 기록했고 API 오류/런타임 예외는 관측되지 않았다. 열린 dev 대상 PR0.
- 잔여 **A-M 최종 증거 판정**, Phase3 최종 전환과 Task168 본체 dev·Alpha는 미완. S-T 비공개 대회의 본인 배정 Game projection 수정은 API10/Web16 및 실제 화면 PASS. 이전 소유 런타임42722/API42780/Web42781은 S-T 후 TERM 종료, 당시8121/3013 비점유·원본 DB연결0을 확인했다. 테스트 launcher/child52336/52414,54169/54246,54723/54825,62893/62950도 종료 확인했다. 이후 A-M은 상단 최신 기록대로 별도 복제 환경에서 실제 실행했으며, 현재 retained runtime은19437/API19474/Web19475다.
- 검증 한계: 최초2회 scheduled preflight는 API에 없는 필드 검사로 쓰기 전 중단했다. 성공한6개403의 이벤트 collection hash 누락은 별도 명시하고, 최종 durable verifier가 실제 이벤트 envelope/DB를 대조했다. 득점 POST 본문은 미캡처이며 실제 UI와 후속 영속 조회로 증명했다. 종료 뒤 잘못된 문구 대기 timeout은201 응답과 ENDED 상태로 구분했으며 mutation을 반복하지 않았다.
- 아래 시점별 기록은 당시 상태다.

2026-09-12 10:24 최신 집계: **39/42 = 기본27/30 + 경계12/12**. L-T는 기존 무료6명 명단/전체 출전/중복/역할 경계와 실제 유료·무료 신청201×4, 유료 확정200/DB paid, 마감409/선수 불변, 최종 확정·마감3viewport를 합쳐 Sol PASS로 완료했다. 초기 권한 로딩 안내는 정착된 권한 오류로 확대하지 않고 별도 검토한다. 근거 `output/qa/task168/leader-paid-tournament-final-review-20260912.md`. 잔여 **S-T/A-T/A-M**, Phase3 최종 전환과 Task168 본체 dev·Alpha는 미완. PR1175 dev/Alpha PASS, PR1176 CI34664210238 PASS·머지 전 Alpha 화면 확보 중. 아래 시점별 기록은 당시 상태다.

## 2026-09-12 10:19 KST — 실제 신청·확정·마감 차단, PR1176

- **38/42 유지**. Ego 팀장004로 유료/무료 신청 생성·제출 POST201 네 건과 실제 요청/응답을 보존했다. 유료 입금확인200→확정200→DB confirmed/paid, 만료 명단 추가409 `ROSTER_DEADLINE_PASSED` 및 선수0명 불변은 Sol PASS. 이전 무료6명 명단·전체 출전·중복·역할 경계 증거와 구분한다. 근거 `output/qa/task168/leader-paid-tournament-final-review-20260912.md`.
- 확정 신청 화면 readback은 확인했고 증거 저장 중이다. 마감 명단의 팀장에게 “팀장에게 요청”으로 안내하는 모순을 발견해 Luna가 수정 중이다. L-T 최종 시각 재검증 전 완료 수를 올리지 않는다. 검증 프로세스90852/90907은 종료됐고 DB disconnect 완료.
- PR1175는 dev/Alpha84cd4e9 배포 및3viewport 정보수정 normal/hover/disabled Sol PASS. 실제 Save는 미실행으로 A-T는 미완이다. PR1176은 dev base, head503fba225976da458e7df4898e9d327766ff0924, 신청7CTA 대비 수정과 changeset만 포함한다. 관련2테스트·Sol source/visual/immutable PASS, CI34664210238 진행 중. 머지/Alpha 미완. 열린 dev PR은1176만 확인됐다.
- S-T 준비 스크립트는 실행 전5개 보완점을 Luna가 수정 중이며 미실행이다. 잔여 L-T/S-T/A-T/A-M 및 Phase3 retirement/Task168 본체 dev·Alpha는 계속 미완이다.


## 2026-09-12 09:52 KST — A-L/L-T 최신 실제 증거 및 PR1175 상태

- **38/42 = 기본26/30 + 경계12/12**. A-L은 Sol 검수 기준의 전체 선행 흐름과 실제 UI 201/4 decisions, 다음 시즌 2개, DB 보존·verifier PASS를 확인했다. worker는 정확히 1회 처리되었고 비대상 63행 불변 및 cleanup도 확인했다. 렌더된 링크 4/4 동등성에 대한 root 보정은 적용됐지만 별도 mutation 재실행은 하지 않았다.
- L-T 준비 단계는 성공했다. 유료 BANK_TRANSFER fixture `7ed74651-099e-4b8d-8b57-79b357056811`와 만료 roster-deadline fixture `e1533a32-fe8d-4210-8981-94455bdfa006`를 만들었다. 아직 registration UI를 실행하지 않았다. **A-L 승강 승인**의 POST 응답 본문은 수집하지 못했으므로 실제 POST 요청/201 상태, 별도 GET200, 렌더된 링크, DB를 교차검증했다. 이 한계를 L-T 결과와 혼동하지 않는다.
- PR1175 head `dab60ad`의 CI `34662333522`는 3개 job 모두 PASS했고 dev `84cd4e932f7109fa931874fc21f311a8cda73caf`에 00:47:14Z 머지됐다. 최종 3viewport class screenshot은 Sol PASS. Alpha 검증은 pending이며, 관리자 P1 before snapshot은 `46685803` 기준이다.
- 남은 기본 흐름은 **L-T, S-T, A-T, A-M**이다. Phase3 retirement와 Task168 본체의 dev/Alpha 완료도 별도 미완으로 유지한다. 상위 launcher38246, API38306·8121, Web38307·3013은 테스트용으로 유지 중이며 이전 소유 runtime은 모두 종료됐다.

## 2026-09-12 09:40 KST — M-L 복합 증거 완료, PR1174 Alpha 통과

- **37/42 = 기본25/30 + 경계12/12**. M-L은 Alpha 일반 팀원의 실제 리그·경기·기록·팀원 목록 이동과 이전 로컬 탈퇴·캐시 초기화·권한 거부·공개 기록 보존 증거를 합친 판정이다. Alpha에서 기록 연결 신청이나 팀 탈퇴를 실행했다는 뜻은 아니다. Sol 독립 검수 `output/qa/task168/pr1174-alpha-review-20260912.md` 참조.
- PR1174 dev9ebb1177의 merge CI34660115608 및 Alpha34660115894 성공. 실제 Alpha release/commit 일치, health200. 후보 팀명·홈/원정, 선택/미선택·44px 확인 버튼, 일반 팀원 목록·본인 탈퇴 버튼을 390/768/1440에서 검수했다. 내부/본문 최하단까지 도달하고 가로 넘침0. 미선택 정본은 `claim-unselected-final-*`이며, 잘못 명명된 `claim-dialog-stable-after-*`는 선택 상태 자료로만 유지한다.
- dev 대상 열린 PR 전수 재조회 결과 #1175 하나다. 추가된 공통 버튼 클래스 분리는 Sol 소스 PASS이며 아직 원격 반영·최종 화면 확인·머지·Alpha 검증 전이다.
- A-L 새 승강 UI용 시리즈8453db7b 및 공식 경기2개 준비 성공. 첫 생성 응답 필드 오류는 같은 시리즈를 검증 후 재사용해 복구했다. 워커는 실행 수명주기 검사, 이어 비대상 작업 검사에서 중단되어 처리0건이다. 실패 영수증을 보존하고 검사 계약 수정 중이다. 소유 로컬 서버86663/86721/86722/86749 종료 및8121/3013비점유·DB연결0 확인. 기존 데이터/다른 세션 프로세스를 정리하지 않았다.
- 남은 기본5개는 **L-T,S-T,A-T,A-L,A-M**. 최종 Phase3 retirement와 Task168 본체 dev/Alpha도 미완이다. 아래 기록은 각 시점의 상태다.

## 2026-09-12 09:12 KST — PR1174 dev 머지, A-T 대비 보정

- **36/42 유지**. PR1174 최종 head eb3d428bb5159937d873450e3bf82d2444d6395c는 Sol immutable PASS와 CI34659701603 API/Web/Gates 통과 후 dev9ebb117737f9380bf9af11acc5ec6e84d1385a49에 merge commit으로 머지했다. API9/9와 Web56/56; linked 후보는 side 검증 전에 제외하고 반환 대상 context 누락409는 유지한다. Alpha34660115894 배포 중이며 after 미검증. `output/qa/task168/pr1174-progress-20260912.md` 참조.
- 실제 A-T 관리자 대회 정보 수정 화면의 24개 필드가 API200과 일치하고 390/768/1440에서 footer44px/overflow0/끝필드 도달을 확인했다. 저장·출전 인원·교체 방식 선택의 흰16px 글자 대비3.71을5.41로 보정했다. normal/hover/disabled/restored와 취소까지 실제검증, Sol scoped source/visual PASS. 저장/API지속검증은 없으므로 A-T 완료는 아니다.
- A-T 스타일은 별도 immutable2b4a94278b5552f747f3d481f666c004f3ced790, PR1175 base dev로 분리했다. 제품파일1개 스타일3줄과 changeset만 포함하며 PR1174와 파일 겹침 없음. 현재미머지/Alpha미검증. 증거 `output/ego/competition-full-goal-20260908/admin-tournament-hydrate-20260912/`와 `admin-info-contrast-source-review-20260912.md`.
- A-L 성공승강 UI 및 L-T 유료/명단마감 검증용 준비 스크립트는 Sol 사전리뷰 보완 중이다. 아직 실행/API/DB변경 증거가 아니며 완료집계에 포함하지 않는다.

## 2026-09-12 08:36 KST — M-L Alpha 팀원 재개 및 PR1174

- **36/42 유지**. 문서의 player01 계정으로 실제 Alpha 이메일로그인·auth/me200(user00709c0a) 확인. 내 리그27개→리그→경기→후보선택창200, 완료리그1:0/공식revision1/전적 확인, 팀→멤버목록 링크 진입. 실제viewer participantMember=true/manageable양팀false. 공유테스트팀 탈퇴나 기록연결 신청은 제출하지 않았다.
- 실제 후보25명 중 서로 다른side의동명이인이 이름만 표시되는 P1을 Sol이 확인했다. canonical 팀명·홈/원정·등번호를 두 줄로 표시하고 선택/확인 대비를 보완했다. 일반팀원 화면은 멤버목록 안내/2열지표, 관리불가버튼·운영자 안내·접근불가탭 제거 및 self-leave 유지. 원래관리버튼은disabled였으므로 권한우회 결함으로 과장하지 않는다.
- 최신dev4bb7e182 별도사본에서 해당12파일만 commit51dedb290a996f73f37d6747b81ee7879f2f3fc0. 공유HEAD c2614e0d 및기존WIP보존. Sol source/committed-tree PASS, API7/7 및Web56/56 PASS. API최초0tests는공유Prisma생성타입/schema차이로dev전용client를격리했고, Web최초55/56는존재하지않는headingselector를실제신청자데이터표시/제거 검증으로고쳤다. 실패로그보존, shareddeps변경/설치없음.
- PR1174 base dev 생성, CI34658701177 진행 중. dev열린PR 전수조회에서신규본1174 외없음. Alpha동일계정·3viewport before확보, merge·배포·after시각검증은미완이다. 근거 member-alpha-positive-progress-20260912.md, member-context-commit-20260912.json, member-context-commit-review-20260912.md 및 output/ego/competition-full-goal-20260908/member-alpha-positive-20260912/.

## 2026-09-12 08:12 KST — L-L 실제 공식 이력 보존까지 완료

- **36/42 = 기본24/30 + 경계12/12**. L-L의 마지막 공식 이력 팀 제거 경계는 실제 관리자 DELETE409 `LEAGUE_TEAM_HAS_OFFICIAL_RESULTS`로 확인했다. 최소팀수 가드를 피한 전용 3팀 clone에서 실행했고, 기존 공식 Game/revision 관계를 먼저 검증했다.
- 오류 로그 한 행은 정상적인 4xx 기록이다. 정확한 로그 ID 하나만 비교에서 제외한 123 public 테이블·2146행 hash `fd8d5ce0…`가 요청 전과 일치했다. 원본 DB에는 그 로그가 없다. Sol은 실제 증거와 기존 신청/중복/자격0명/권한/관리자 조정 증거를 대조해 L-L 전체 계약 PASS로 판정했다. 이전 fetch 실패 및 전체 DB 무쓰기 기대 실패는 별도 영수증으로 보존했다.
- clone API26364·launcher26333 종료, 전용 official_removal DB 삭제,8123 비점유,원본 DB 존재를 확인했다. 본 검증은 로컬 API/DB 경계이며 Alpha에서 같은 삭제를 수행했다고 주장하지 않는다.
- dev 열린 PR 전수 재조회0. PR1173 dev·Alpha 완료 상태 유지. 잔여 기본6개는 **M-L,L-T,S-T,A-T,A-L,A-M**이며 최종 Phase3 retirement·Task168 본체 dev/Alpha는 여전히 미완이다. M-L 로컬 탈퇴와 캐시 경계는 이미 실행됐고 남은 Alpha 역할 증거를 확인한다.
- 근거: `output/qa/task168/official-removal-final-proof-20260912.md`, `reconcile-official-removal-telemetry-20260912.json`, `official-removal-telemetry-review-20260912.md`.

## 2026-09-12 07:50 KST — PR1173 dev·Alpha 검증 완료

- PR1173 CI34654190309, dev merge4bb7e182aae46d2c62db53123f1b8a91916145e7, mergeCI34654710188, Alpha34654710191 모두 SUCCESS. Squash가 저장소설정으로 거부된 뒤 허용된 merge방식으로성공(22:35:59UTC); 실패시상태변경없음. 현재dev열린PR0.
- 실제Alpha 동일admin93b6c6e1/league183e48e7/빈모달 before·after390/768/1440: CTA44px/14px/5.41대비, 입력/배경/여백/고정footer유지, overflow·겹침·가림0. release1.0.0-alpha.20260912.g4bb7e182aae4/commit일치·health200·779events/errors0/12API200. Sol6이미지독립검수 scopedPASS. 안내문12px와placeholder색rgb107,118,132, label14px/textstrong도확인. Alpha쓰기미실행, 실제생성동작은별도local201+DB/audit증거로한정.
- 전체35/42유지. L-L마지막공식이력팀제거거부의복제DB검증도구는검토중이며실제실행전이다. 근거: output/qa/task168/manual-contrast-validation-20260912.md, manual-contrast-alpha-review-20260912.md, output/ego/competition-full-goal-20260908/manual-contrast-alpha-20260912/.

## 2026-09-12 07:35 KST — L-L 관리자 참가팀 양성 조정

- 새 task-owned standalone 리그8aa2aa8b-7f5b-40bb-9e2d-2640e5a85b29에서 후보팀4b0f052a-6ffa-40ed-bda7-b51ea2366935를 실제 POST201로 추가(conf3), DELETE200으로 제거(conf2)했다. 등록459106c6-7575-4802-8525-a8578c400f22는 cancelled로 보존, fixture/Game0 유지. add/remove 감사의 정확한 관리자·target·payload와 기존 기본2등록의 전체/중첩행 불변을 검증했다.
- prepare전 원본clone 행의 보호hash f97bec158bcef33dcad97a31916b786542f02e0380cbaf4e1688d3ff7e70126a는 준비후·추가전·추가후·제거후 동일. 기존 성공신청 b619f093/다른tier를 제거해 최소팀수를 맞추지 않았다. 초기 stale2팀/잘못된adminUUID/receipt구조/보존검사 누락은 Sol 실행전BLOCK으로 수정 후 실행했으며 실패한 제품mutation은 없었다.
- prepare96268/96304·verify96618/96648 종료 및 DBdisconnect, 잔여PID없음. 새리그/팀은 소유clone의 QA증거로 보존. standalone양성경계이며 같은시즌중복409는 기존 별도증거다. L-L 집계승격은 공식경기이력제거금지의 실제증거를 포함한 Sol최종대조 전 보류. 전체35/42 유지.
- 증거: output/qa/task168/admin-positive-team-boundary-20260912.prepare.json, verify-admin-positive-team-boundary-20260912.json, admin-positive-source-review-20260912.md.

## 2026-09-12 07:30 KST — 관리자 수동 경기 실제 생성 및 PR1173

- **35/42 유지**. 관리자 실제 UI에서 기존 날짜 생성 리그2cfb6097에 수동 경기99f20952-feb3-4ac2-8744-7fb1f4f498d9 / Game7943ce59-fd9f-4920-9573-6fed4ea55fec 생성. API PID86721 로그 request675의 POST201, UI 새 링크, DB 시작9/22 19:00KST·60분·정확한 장소를 대조했다. TeamMatch/Game 각각1개 증가, 기존 경기8b0c0755/Game28f34e4b hash4171b0b6… 불변. 양팀 일정2·approved신청1·PENDING리마인더1·anonymous참가자·source_create1·GAME_CREATED감사1 확인. 기존 리그/신청/자식/adminlog/outbox/notification 행 불변. Sol 실제 로컬 범위 PASS. 전체 A-L 성공 승강 UI는 여전히 남는다.
- 저장 클릭 후 모달은 정상 닫혔지만 장소 input.value를 text selector로 기다려15s 타임아웃됐다. 같은 round raw CDP request/responsebody는 저장하지 못했고 후속events0이었다. 쓰기를 반복하지 않고 서버201 로그와 DB/새 UI링크로 교차했다. 새로고침708events/errors0/API200+정상CORS204 확인. 날짜 입력은 Ego fill이 비워져 native input setter+input/change dispatch로 설정한 사실을 남긴다.
- 수동 경기 모달의 14px 흰색 CTA 대비3.7을 확인하여 Luna가 버튼 scoped fill/hover 토큰 한 줄을 수정했다. fullscreen은 기존 사용자B안이라 유지. 동일390/768/1440 before/after: CTA44px, 대비5.41, overflow0, 입력 마지막행 footer비가림. 최초metrics는 offscreen 관리자메뉴dialog를 잡아 무효이며 before-metrics-corrected.json을 사용한다.
- immutable63ac5018(base devb0c2689) modal1line+changeset2파일. 기존modal6tests PASS, Sol source/visual PASS. PR1173 dev대상 제출, CI34654190309 진행 중. 이 시점 merge/Alpha미완. 기존dev열린PR은0이었고 새1173만 추가됨. 공유HEAD c2614e0d 및 index불변. verifier86442/88084·launcher86411/88054 종료/DBdisconnect확인.
- 근거: output/qa/task168/admin-manual-ui-20260912-before-result.json, admin-manual-ui-20260912-after-result.json, admin-manual-ui-source-review-20260912.md, manual-contrast-commit-20260912.json, output/ego/competition-full-goal-20260908/admin-manual-ui-20260912/.

## 2026-09-12 — L-L 자격 충족 선수0명 실제 worker 검증

- **35/42 유지**. 전용 schema-only DB `teameet_task168_zero_eligible_20260912`에 canonical football-v1 및 task 전용 팀2개/자격 미충족 owner2명만 준비했다. 실제 API8123 POST가 league607ecb14-04b6-4b00-8739-a0515cb6cdcd와 confirmed 신청2건/자동작업1건을 생성했다.
- 실제 processOne 처리 후 outbox COMPLETED/attempts1. 등록 전체 SHA b6501805… 불변, confirmed2건·rosterAutoConfirmedAt null·선수0·TeamMatch0·Game0. 비대상 outbox0·hash불변, 재실행false. 두 팀장에게 정확한 no-eligible 알림2건 생성, 각 팀장 notification API200/expected1/matched1. Sol 실제 증거 scopedPASS.
- 최초 알림 조회 PID66609는 limit100으로 DTO상한50을 위반해400. 실패 영수증을 보존하고 query50으로 조회만 재실행(PID68011)했다. 리그 생성과 worker는 재실행하지 않았다. launcher의 planned-stop이 앞선 read 실패 exit를0으로 덮던 문제 및 silent catch는 정리 후 보정했고 syntax만 확인했다. 이 후속 launcher 보정을 실행 검증했다고 주장하지 않는다.
- API65329/66497 및 launcher65264/66448 종료,8123listener없음, DB연결0확인 후 전용DB삭제. 원본adminleagueDB존재 재확인. Node75/Browser8로 실행 전 기준 복귀. 기존API86721:8121/Web86749:3013은 남은 역할 흐름 검증을 위해 유지하며 그 검증 종료 시 소유 launcher86663 트리만 회수한다.
- 이 결과는 로컬 API/DB/worker/알림API 경계 증거다. Alpha worker 및 알림 화면 자체의 검증이 아니며, 관리자 전용 참가팀 조정의 양성 경계도 남아 L-L 전체 완료로 올리지 않는다. 근거: output/qa/task168/leader-league-zero-eligible-final-20260912.json 및 leader-league-zero-eligible-review-20260912.md.

## 2026-09-12 — PR1172 Alpha 검수 완료

- **35/42 유지**. dev b0c268956119d29279be417b95f57486eb02989a / merge CI34650303226 / Alpha34650303262 모두 SUCCESS. 공개 landing HEAD의 release1.0.0-alpha.20260912.gb0c268956119 및 commit 일치, health200. dev 열린 PR0.
- CaptainB 동일계정·리그4f72c202 신청 허브 before/after390/768/1440: 잘못된 확정2/총8 제거, 확정팀·미신청팀 상태 유지. 상세 신청CTA→허브→확정 신청b5c1e303→선수 명단 실제 이동. CTA50px·17px·대비5.41/overflow0/최하단 비가림. 118events/console·runtime error0/10API200. 선수 변경은 실행하지 않았다.
- owned league183e48e7 빈 기록 섹션: 중복 득점·도움 대형 안내를 단일 compact card로 재균형. 3폭 before/after·최하단, 링크44px·14px·overflow0. reload353events/error0/8API200. beforeadmin과afterCaptainB 계정 차이는 알림 등 페르소나 비교에서 제외하고 동일 리그·빈 기록 구조만 비교했다. Sol 두 영역 모두 scoped AlphaPASS.
- 초기 상세 대기10s 실패 후 후속 정상 화면·실제 동선을 별도 증거로 남겼다. 빈 기록20s 실패는 화면에 없는 문구를 기다린 검증 코드 문제이며, 실제 존재하는 schedule 링크 기준으로 재검증했다. 성공으로 덮거나 제품 결함으로 잘못 집계하지 않는다.
- 근거: output/qa/task168/pr1172-validation-20260912.md, pr1172-alpha-review-20260912.md 및 output/ego/competition-full-goal-20260908/pr1172-alpha-20260912/. 전체 L-L 또는 Task168 전체 E2E 완료는 아니다.

## 2026-09-12 — PR1172 dev 머지 및 L-L 관리자 전용 경계 실증

- **35/42 유지**. PR1172 최종b1ca9632e의 API/Web/Gates CI34649652426 및 Sol 소스·시각 PASS 후 dev b0c268956119d29279be417b95f57486eb02989a로 머지했다(21:37:48UTC). mergeCI34650303226 SUCCESS. Alpha34650303262 진행 중, dev 열린PR 재조회0. 일반 대회 계약 유지 및 변경 파일만 임시 인덱스로 분리했으며 공유HEAD/index는 변경하지 않았다.
- L-L 관리자 전용 참가팀 추가·제거: 실제 non-admin leader004와 outsider006 auth/me200을 확인한 후 POST/DELETE 네 요청 모두403 PERMISSION_DENIED. tier1리그2cfb6097의 확정2팀 precondition, full league/신청children/TeamMatch/Game/AdminActionLog SHA79a1712c… 전후 동일. API PID86721/cwd/command/소스mtime·SHA와 DB identity를 검증했다. verifier47199/47261 exit0, DBdisconnect 및 두PID부재 확인. 등록 가능한 선수0명 자동확정·알림은 아직 실행 전이다.
- 최종 CTA 실제390/768/1440: 50px/17px, white on rgb27,100,218 대비5.41. ordinary tournament는 기존스타일, disabled는grey규칙 유지. 같은 화면·최하단 SolPASS. Alpha CaptainB의 관리자목록 GET403와 자기신청 GET200도 확인했다. 초기 잘못된 /tournaments/:id/my-registrations 호출404는 도구 경로 오류이며, controller의 /registrations/my-registrations 경로로 바로잡아200을 확인했다.

## 2026-09-12 06:30 KST — 신규 팀 첫 신청 및 Alpha 참가자 검증

- **35/42 유지**. 신규 팀0614ba46의 최초 신청 b619f093은 Ego 실제 create201/submit201, 중복201 동일 ID·행 불변, 비회원403, 관리자 확정200 및 DB confirmed를 확인했다. 기존 세 리그의 보호 데이터 hash86d2b7a1… 불변, 대상 리그 새 경기0. 이전 team101의 타 티어 충돌409 증거는 정상 신규 신청 성공과 구분한다. Sol 실행 증거 scoped PASS. 자동 명단0명/알림 및 관리자 전용 명단 경계는 미완이다.
- Alpha 문서 계정 중 팀장 B 로그인201/auth-me200 성공. 홈의 후기 CTA→완료 대회 시상→후기 쓰기 폼을 실제 390/768/1440에서 확인했다. 참가 확정 신청 f95f794a 및 선수8명을 조회했다. Sol 폼 시각 scoped PASS. 후기 POST는 하지 않았으며 쓰기·저장 완료로 확대하지 않는다. 팀장 A/player10의 이전401은 보존하되 전체 참가자 인증 불가라는 판단은 해소한다.
- PR1172 5e647 CI에서 기존 상세 계약4개 실패를 발견해, 정규 리그 전용 데스크톱 신청 영역과 공통 my 경로를 유지하고 일반 대회용 정원·참가비를 제외했다. 최종4dfbbc immutable1,400파일, 관련79개 테스트·typecheck·pattern PASS, API/Web/Gates CI 모두 PASS. 다만 Sol 시각 검수에서 새 신청 버튼 대비3.71:1을 차단하여 5.41:1 색상으로 보정 중이다. 머지·Alpha 후속은 아직 미완이다.
- Ego 모바일/태블릿의 실제 스크롤 대상은 document가 아니라 main.tm-scroll-area였다. document scrollY0만으로 끝 도달을 주장하지 않는다. 실제 container 최대치390:2438/768:2059 및 데스크톱1611 도달 후 재캡처했고 마지막 현장 촬영 안내가 고정 CTA에 가려지지 않음을 확인했다. 잘못된 초기 bottom 이미지는 증거에서 제외한다.

## 2026-09-12 06:00 KST — PR1172 및 검증 실행 사고 복구

- **35/42 유지**. dev 열린 PR 전수 확인에서 신규 겹침은 없었고, 이번 신청/명단/리그 빈 기록 수정을 PR1172로 제출했다. 기존1136·1127은 수정 후 MERGED임을 원격에서 재확인했다. PR1172 최초 CI는 새 text-sm 2개의 font-size baseline 초과로 실패했다. 토큰 치환 후 immutable5e647cbd의 실제 pattern-check PASS, 최종 CI/머지/Alpha는 진행 중이다. baseline을 올려 우회하지 않았다.
- immutable21581c7d의 git archive 1,400파일을 blob과 대조하고, 관련4파일81개(19+5+3+54)와 typecheck를 직렬 실행해 PASS. Sol 독립 소스/시각 scoped PASS. 이후 font token follow-up은 별도 검증 경계로 둔다.
- Ego 실제390/768/1440에서 빈 득점·도움 영역을 한 섹션으로 정리한 before/after, 최하단, 신청 완료 화면 검수. 필터/기록링크44px, active blue-white 대비5.x, overflow0, 끝 콘텐츠 비가림. UI는 WIP 개발 런타임이며 immutable 테스트 런타임과 구분한다. 신규 토큰 최종 상태도 재검수한다.
- 첫 신청 UI는 registration896c932a 저장 및 동의 제출 후 payment_checking까지 도달했다. verifier62732는 duplicate201 동일행/outsider403 불변 확인 후 admin confirmation409 LEAGUE_TEAM_INVALID로 중단했다. team101이 같은 시즌1부에 이미 확정된 것이 원인이며 정상 제약이다. 기존 신청/참가/경기를 변경하지 않고 충돌 없는 별도 새 팀의 실제 생성 경로를 준비한다. 정상 L-L 완료로 세지 않는다.
- 검증 launcher54103/54185가 standalone snapshot에서 pnpm exec를 호출해 공유 node_modules symlink 경유 의존성을 의도치 않게 설치했다. 제품 source/package/lock/index/HEAD는 불변. 원본 stdout의 정확한37개 dependency target과8개 실행 경로를 복구했고, incident 시각에 생성된 app-local store/metadata/shim은 output의 quarantine에 보존했다. 원본 shim 바이트 복구가 아니라 기존 패키지 실행 파일 연결 복구임을 명시한다. Next16.2.10/React19.2.5/Vitest3.2.4/TS5.9.3/MSW2.12.14 확인. 기존39개 보고는37개로 정정한다.
- 이후 launcher는 고정 절대 Node 엔트리를 직접 실행한다. v2는 snapshot 줄바꿈 불일치로 테스트 전 중단, v3는 git archive 원본 바이트 추출 후 성공했다. 실패 로그는 보존하며 PASS 증거에 섞지 않는다. 로컬 관리자 bootstrap은 기존 signed cookie가 dev header보다 우선하는 것을 확인하고 정상 logout201→dev-session201→auth/me200의 실제 admin001로 전환했다. Alpha 세션은 변경하지 않았다.

## 2026-09-12 05:35 KST — Alpha 관리자 검증 및 팀장 신청 결함 수정

- **35/42 유지**. PR1171 dev9f8df8d/mergeCI34642996524/Alpha34642996468 SUCCESS. 문서의 별도 ops 관리자 계정은 실제 로그인201 성공했다. 팀장·팀원401을 모든 계정 실패로 확대하지 않는다. Alpha 확정 시즌 read-only 화면3폭6이미지 Sol PASS: 확정 표시·승인 패널 없음·시즌 링크44px·overflow0·끝 콘텐츠 도달. 로그인 후 새로고침270events, auth/admin/series/health200, console/runtime error0. 초기 metrics에 섞인 로그인 전 익명401은 timestamp로 분리했으며 원본을 보존한다. `pr1171-alpha-proof-20260912.md` 참조. Alpha에서 승강 변경/409 경합을 실행한 증거는 아니다.
- L-L 실제 선수 추가201/명단GET200/1명 반영, 신청 상세→신청 허브→대회 상세→리그 일정→canonical fixture 진입을 확인했다. 허브의 최초0명은 refetch 뒤1명으로 갱신됐지만 plural 신청목록 invalidation 누락이 있어 수정한다.
- 공통 신청 availability가 in_progress 정규 리그를 닫는 실제 UI/API 불일치를 발견했다. 백엔드의 독립된 registrationDeadlineAt 판정을 공유 resolver 및 상세/신청 표면에 반영 중이다. 데스크톱 rail의 두 번째 status gate도 별도로 수정했다. 일반 대회의 status/deadline/capacity 계약은 유지한다.
- 리그 일정 active chip 대비3.71 및 득점·도움의 반복 대형 빈 상태를 수정했다. 초기 구현이 신원/동의 배너를 조건 안에 숨기는 회귀는 독립 리뷰에서 차단해 복구했다. 최종 좁은 테스트는 standings54/availability/roster 통과; 상세 신규 테스트1실패는 남아 있던 desktop gate를 수정한 뒤 별도6/6 PASS로 확인했다. 전체84개를 한 실행에서 통과했다고 기록하지 않는다.
- L-L tier2 최초 신청 준비는 실제POST200로 열고, team101 부재/seed102·103/기존 경기0 및 보호 source hash불변을 확인했다. 실제 참가 신청 UI에서 새 registration `896c932a-bed7-4a24-9d0d-bee6ed847a54` POST201 한 건을 관측했다. 제출/확정/명단 경계 및 새 수정의 dev/Alpha는 진행 중이다.
- 공유WIP에서 추출한 최초 patch는 dev에 적용되지 않아 임시 인덱스 검증에서 중단했다. 공유HEAD/index 변경 없음. dev 원본 기준으로 해당 수정만 다시 분리하며, 잘못된 patch/실패 검증을 성공으로 처리하지 않는다.

## 2026-09-12 05:13 KST — PR1171 dev 머지, L-L 실제 흐름 진행

- **35/42 유지**. PR1171 최종 head `4814b89f2332f00dd904c5ac9af778f372d1fb0e`의 CI34642077814 API/Web/Gates SUCCESS 및 Sol 독립 소스·시각 검토 후 dev `9f8df8d189ad0ff8f7e3f755ec60aba29dcbd255`로 머지했다. Alpha34642996468/mergeCI34642996524 진행 중이며 실제 Alpha 검증은 아직 완료가 아니다. 열린 dev PR 재조회 0개. 저장소가 squash를 허용하지 않아 첫 요청은 거부됐고, 허용된 merge 방식으로 완료했다.
- PR1171은 승강 확정 이후 stale 승인 패널 제거, already-decided preview/409 복구, 실제 확정 시즌 문구, 테마 공통 버튼 대비, 정의된 border/surface 토큰, 시즌 링크44px를 포함한다. 실제 패널11개 + 부모 상태4개 테스트 PASS. 최종6이미지에서 390/768/1440 승인 패널 잔존 없음·시즌 링크44px·overflow0. 최초 시각 수정 head만 검증한 상태와 구분한다.
- L-L 실제 승계팀 중복 신청201 동일 ID/등록행 불변, 외부인403, canonical fixture 생성201 및 Game/Sides 연결, 경기 생성 뒤에도 신청 마감 유지, 완료된 이전 시즌의 Tournament/TeamMatch/Game/Promotion 선택 전체행 hash 불변. 최초 open-registration POST의 실제200을 스크립트가201로 오판한 실패는 보존했고, 재실행은 GET readback만 수행했다. 최초 open의 audit/outbox exactly-once 증거로 확대하지 않는다. Sol scoped API/DB PASS.
- Ego 팀장004의 내 리그→시즌 상세→내 신청 진입 중이다. 리그 상세3폭 주요 CTA44px·overflow0·끝 스크롤 도달, 해당 관측 round console/runtime error0. 신청/명단 화면, 최초 신청 및 명단 경계는 진행 중이다. Alpha 문서 계정401은 유효한 계정 문서 갱신 대기이며 재시도·비밀번호 초기화는 하지 않았다.

## 2026-09-12 04:55 KST — A-L 실제 승강 통과, 화면 상태 후속

- **35/42 유지**. PR1170 dev `abcd62b4` merge CI34639475174/Alpha34639475223 SUCCESS. 실제 Alpha health SHA 일치, 비로그인 fixture 공개1:0 기록 유지·명단 연결 CTA 없음,390/768/1440 끝 스크롤/가림/overflow0, API200, console/runtime exception0. 관리자 legacy-approved와 참가자 양성은 동일 증거로 확대하지 않는다. 팀장/일반 팀원 로그인401로 참가자 Alpha 동선은 계정 문서 갱신 대기다.
- A-L 두 Game 실제 양팀 라인업→start/end/approve, 공식 revision1개씩·ENDED. 실제 worker4건 COMPLETED, 비대상outbox47행SHA 불변. 두 tier가 completed로 반영됐다.
- 승강 실제API: 사유누락400, 최상위승격/최하위강등422, support403 모두 각 단계 hash불변. owner201 결정4개·다음시즌2개·각2팀의 실제 registration/region/sport/series/tier 일치, audit1개. replay409 후 hash불변. 최종검증자 SHA86d275b… 및 Sol scopedPASS. 성공 전 script의 응답 shape·DB guard·replay 비교 위치 오류는 수정하고 이전 주장을 증거로 세지 않았다.
- Ego 승강 3폭44px/overflow0/마지막CTA hittrue. 버튼 대비3.71 문제, undefined border/surface 토큰을 수정했다. 경고색은 실제sRGB변환5.03으로 PASS이며 초기 시각추정/잘못된OKLCH 수치와 구분한다. 기존panel11테스트 PASS. exact3파일commit6f816724/PR1171(CI34641065643)으로 분리했다.
- 실제 후속 화면에서 확정 배지·다음시즌 카드와 stale 승인 패널이 동시에 남는 반례를 추가 발견했다. PR1171에 서버 확정 상태를 반영하는 렌더/오류 복구와 회귀 테스트를 추가 중이므로 현재 head만 머지하지 않는다. 후속commit/최종CI/Alpha는 미완이다.
- A-L 시즌2의 새 draft 리그를 L-L 승계팀 중복 신청 검증 후보로 확인했다. leader004는 team101의 active owner이며, 완료된 시즌1 데이터는 보존한다.

## 2026-09-12 04:33 KST — dev PR 처리와 Alpha 추가 반례

- **35/42 유지**. PR1168·1169는 dev 머지, merge CI, Alpha 배포 성공. PR1170도 PR CI34638464791/API·Web·Gates 통과 및 Sol 검토 후 `abcd62b4c5e52bc6295dc97b3da931cfc9d9ba3e`로 dev 머지했다. Alpha34639475223 및 mergeCI34639475174는 진행 중이다. 머지 직전 dev 대상 열린 PR은1170 한 개였으며6파일의 범위와 head/base를 대조했다.
- Alpha에서 legacy `viewer.state=approved`가 현재 팀 소속 없이 참가 UI를 열 수 있는 추가 반례를 발견했다. PR1170은 기록 연결 CTA만 현재 팀 권한3개로 판정한다. 운영 관리자 claimable API200은 기존 관리자 override이므로403 누락으로 보고하지 않는다. 일반 탈퇴 회원의403과 공개 기록200은 별도 로컬 실증이다.
- PR1170에는 관리자 리그 시리즈의 지역 ID도 문자열 master ID와 맞추는 좁은 수정이 포함된다. 단위 API7/Web17 통과, actual series 유효201·미지정 지역422·level1지역422·support403. 기존 서비스 권한·지역 의미 검증은 유지한다.
- A-L 복제 DB에서2티어/4팀 시즌 및 티어별 경기1개를 실제 API로 생성했다. 미완료 시즌의 승강 preview409, 경기 중복 생성409 확인. 양팀 라인업·경기 공식화·실제 worker·승강 결정·관리자 UI는 아직 미완이다.
- Alpha 기존 팀장과 일반 팀원은 문서의 공통 비밀번호로 로그인401이다. 반복 시도·계정 변경 없이 기존 성공 기록과 credential 문서 차이를 조사한다. 유효한 참가자 로그인 전에는 Alpha 참가자 양성 흐름 완료로 세지 않는다.
- 아래 시점별 기록의 진행 중 표시는 당시 상태이며, 이 절이 최신 cursor다.

## 2026-09-12 — 팀원 리그 탈퇴 동선 수정 및 dev PR 점검

- 최신 검증 집계는 **35/42 유지**. M-L은 실제 라인업→경기 종료/공식화→실제 worker projection→공개 기록→팀 탈퇴까지 실행했으나, 발견한 UI 수정의 dev/Alpha 검증을 마칠 때까지 완료로 올리지 않는다.
- PR1167 지역 ID 수정은 dev/Alpha 실제 생성 검증 완료. PR1168은 탈퇴한 팀원의 기록 연결 CTA와 SPA 권한 캐시를 수정하여 dev28661b4f에 머지했다. PR CI34635873854/merge CI34636575700 성공; Alpha34636575674 배포 진행 중.
- 작은 팀에서는 일반 멤버가 멤버 목록/탈퇴 화면에 진입할 수 없는 별도 UI 누락을 발견했다. PR1169(32093506, base28661b4)로 기존 멤버 카드 진입 링크만 보완했고 CI34636878216 진행 중. 다른 열린 dev PR은 현재 없다.
- Luna 구현, Sol 독립 리뷰. 좁은 테스트16+15 통과, 3개 화면 크기 Ego before/after/끝 스크롤 확인. 새 링크 색 대비는 초기3.71:1을 거부하고 최종5.18:1로 수정했다. 링크46px, 가로 넘침/끝 콘텐츠 가림 없음.
- 실제 member006의 새 멤버 링크→탈퇴POST201→뒤로가기→리그 경기 재진입에서 같은 document/timeOrigin 유지, CTA 재노출 없음, 결과 기록 유지. 1개 DOM 변화 관측은 프레임 전수 증거로 확대하지 않으며, pending refetch 경합은 실제 QueryClient 활성 observer 단위 테스트가 보강한다.
- 근거: `output/qa/task168/member-league-progress-20260912.md`, `member-league-spa-leave-20260912.json`, `output/ego/competition-full-goal-20260908/member-league-20260912/`. 공유 HEAD c2614e0d와 인덱스를 보존하고 exact allowlist commit-tree로 PR을 분리했다.
- A-L 실행 준비: 2티어×2팀 series/seed→각 tier 공식 결과와 completion projection→승강 사유/재실행 반례가 필요하다. 승강 preview는 POST이며, 최상위 승격·최하위 강등은 불가하다. Alpha 단일 draft183e48e7은 series가 없어 승강 증거로 사용할 수 없다. 아직 실행 증거가 아니다.
- 전체 Phase3 retirement와 Task168 본체 dev/Alpha, 남은7개 역할 흐름은 미완이다. 아래 시점별 기록과 구분한다.

## 2026-09-12 03:06 KST — 지역 ID 실요청 수정과 남은 unit 정합

- **PR1167 dev/Alpha scoped 완료**: dev merge `a54645020e64db94d079dade0d4fd4c161ba7d73`, PR CI34631327043/mergeCI34631913354/Alpha34631913376 SUCCESS. 실제health200/dbtrue/commit일치, Alpha ops UI 개설POST201→detail200(draft/2팀/0경기), unknown문자열지역422 및리그수94→94. 새테스트리그183e48e7-eead-4889-a7f7-8d5e587dc5ba는후속관리자플로우용보존. 실제3폭6이미지Sol scopedPASS. `output/qa/task168/league-region-proof-20260912.md`.
- M-L 실제HTTP/socket start201/end201/approve201, revision1개. 실제워커2건COMPLETED, 비대상outbox41행fullhash불변, 연결종료. 공식fact1/teamfact2/resultparticipants6(대상팀원1) 확인. 역할count는탈퇴후권한/UI까지끝나기전 **35/42 유지**.

- 최종 API 단위 fixture 보완: snapshot2 PASS (`1789149109298`), ops takeover/admin25 PASS (`1789149724148`의 통과 파일), claimable5 PASS (`1789149875850`). 앞선 canonical ownership, transitive audit lookup, pending identity-event mock 누락 실패는 각 로그에 보존했다. Luna 수정/Sol 독립 source gate 후 직렬 재검증했다.
- 팀원 리그 플로우용 별도 DB `teameet_task168_member_league_20260912`를 기존 role-flow DB에서 복제했다. 기존 완료 리그는 재개하지 않고 새 리그를 실제 API로 생성한다.
- 실제 master region ID `region-busan-jung`를 UUID로 제한해 리그 생성이400인 제품 버그를 발견했다. DTO 문자열 검증으로 변경하되 서비스의 활성 level2/owner·ops 권한은 유지했다. DTO5/5PASS (`1789149403521`); 실제HTTP unknown422/level1422/support403/valid201, 생성ID `9f20b871-50c6-4d08-be68-e495c4c67924` 및 DB지역 일치 확인. 증거 `output/qa/task168/league-region-proof-20260912.md`.
- 변경5파일만 `881046a3f9a508d75635f6fc16fb3ba795b56c1d`로 현재 dev `d8dd615…` 위에 분리했다. 공유 HEAD/index는 그대로이며 Phase3 본체는 미포함. Sol commit gate PASS, Alpha 검증은 아직 미완이다.
- dev 대상 열린 PR 재점검 당시0개. 새 지역ID 수정 PR을 생성하며 CI/머지/Alpha 순서로 처리한다. 전체 역할별 검증은 **35/42 유지**, M-L은 준비 중이다.

## 2026-09-12 02:14 KST — dev PR 재점검과 별점 대비 후속

- 설정 repoint 최종 `1789148345206` **실제PG5/5 PASS**,clone0. 대회/리그/친선의 변경 가능5건과 감사합계5, TeamMatch/Game pin 동시 변경, standalone 피리어드 ID 유지, 진행 이력/완료 pin 보존, 재실행을 검증했다. public TCC unit6 PASS도 별도 확보. 소스와 실행 snapshot SHA 동일; `config-repoint-history-proof-20260912.md`에 명시. 이 코드는 Phase3 본체 dev/alpha에 아직 포함되지 않았다.
- Task8 두 단위 spec의 positive legacy Game을 canonical 관계로 전환하고, 득점자 필수 정책은 비익명 거부→익명 허용의 실질 대조군으로 강화했다. 최종 `final-api-unit-1789148436198` **2 suites/13PASS**,code0. 이전 권한 mock 실패는 보존한다. 역할 흐름은 **35/42 유지**.
- **PR1166 dev/Alpha 후속 완료**: mergeCI34627159064/Alpha34627158930 SUCCESS, 실제 health200/dbtrue/header `d8dd615d7e876f849b4ac66fc59d576149c7da6a`. 동일 Alpha 팀장·경기에서390/768/1440 card350/560/720, 별44px·4★+1☆·대비4.08/5.30, overflow0, 마지막 태그와50px 하단 CTA 겹침0. sourceGET200/1target, 이번 측정 console/runtime error0, 후기 POST없음. 실제6이미지 Sol scopedPASS. Alpha 다크/작성완료 상태까지 검증했다고 확대하지 않는다. `output/qa/task168/pr1166-review-star-proof-20260912.md`.
- `1789147897696` 실제 최종 PostgreSQL 리그콘솔+task7 audit **2 suites/18PASS**,code0/잔여clone0. 앞선 실패는 보존한다. TCC 안전 repoint와 Task8 단위 fixture 후속은 여전히 검증 중이며 **35/42 유지**.
- 추가 직렬 검증: `1789147434530`에서 mock-seed2, canonical-end-retry1, operation-audit3 PASS. `1789147691132`에서 canonical-source3, overall-standings2 PASS. 마지막 실행은4 suites/10PASS/13FAIL이고 league-console 공통 시작 준비12건과 task7 audit의 중복 FK 위반1건이 남았다. Sol이 리그 콘솔 전체 흐름을 재검토해 대조군 confirmed registration 연결 누락을 특정했고, audit는 각각 한 FK만 위반하도록 반례를 분리했다. 아직 해당 두 파일 PASS로 기록하지 않는다.
- 설정 repoint는 별도 Sol 적대적 검토에서 진행 이력 보호를 마지막 일괄 갱신이 우회할 수 있음을 발견했다. Public PATCH 대회 종류·권한 제한은 유지하면서 내부 대회/리그 경로의 동일 잠금·이력 보존 및 독립 경기 갱신을 보완하고, 실제 Game/period 이력 회귀 증거를 준비 중이다.
- 후속: PR1166 CI34626520000 SUCCESS, `d8dd615d7e876f849b4ac66fc59d576149c7da6a`로 dev 머지 완료(02:20 KST). mergeCI34627159064/Alpha34627158930 진행 중. 머지 직후 열린 dev PR 재조회 0개. Alpha 실제 후속 검증은 아직 미완이다.
- 통합 검증: `1789146862852`는4 suites/54PASS/33FAIL이며 officialize9PASS만 최종 통과했다. board 준비 데이터·query 이름·필수 약관을 수정한 별도 `1789147351473`은 **61/61 PASS**,code0/잔여clone0. repoint dry-run2/apply1은 canonical 대회 변경분이 합계/audit에서 빠지는 실제 집계 오류라 수정 중이다.
- `1789147146706`은6 suites/18PASS/13FAIL. field-assignment5,match-creation7,game-adapter4,league-generator1은 통과. 리그 콘솔의 별도 대회 ownership 준비와 mock seed의 실제 8팀→4경기 계약을 수정하고, 관련 변경 파일만 다음 직렬 검증에 포함했다. 앞선 실패를 전체 PASS로 덮지 않는다.
- 사용자 재확정: 중간 단계마다 열린 dev 대상 PR 전체를 확인하고 현재 작업과 파일·기능 중복을 대조한다. 수리 가능한 문제는 수정·독립 리뷰·CI 후 dev에 머지하고, Alpha에서 해당 기능과 관련 흐름을 확인한다.
- 재점검 당시 열린 dev PR은 0개. 별점 대비 수정만 3파일 commit `00b8ce8def03a77e6b829bb2c2fc8a5a8632b3ba`로 분리해 PR1166(base dev)을 생성했다. 진행 중인 Phase3 API/DB 변경은 포함하지 않았다. PR CI34626520000 진행 중이며 아직 dev/Alpha 완료가 아니다.
- 커밋과 같은 스냅샷의 기존 UI 테스트 2파일 7개 PASS. Ego 라이트 390/768/1440, compact 390, 다크 390/1440, 작성 완료 다크 390의 실제 이미지 7장 Sol scoped PASS. 일반/compact 별 44px, 가로 잘림 없음, 다크 및 disabled opacity 1. 라이트 대비 미선택 약4.08:1/선택 약5.30:1. 로컬 계정 테마를 라이트로 복구했고 후기 POST는 하지 않았다.
- 로컬 별점 QA 서버 소유 PID68811/68825/68826/68897을 TERM으로 종료하고 PID 부재와8121/3013 리스너 부재를 확인했다. DB는 다음 직렬 통합 검증을 위해 유지한다.
- 최종 테스트 소비자 감사에서 production src의 직접 은퇴 delegate/DB property는 0개이나 테스트의 retired delegate/컬럼 참조가 남아 있다. 추가 전환 중이며 **35/42 유지**, 전체 구현/E2E 완료가 아니다.

## 2026-09-12 — 실제 결과 경계 PASS, Alpha 후기 카드 시각 회귀 수정 중

- PR1165 mergeCI/Alpha 성공, 실제 dev3d7e404 header·health200/db정상 확인. 같은 Alpha계정·경기에서390/768/1440 카드350/560/720px·별44px·하단가림0, Sol6이미지 layoutPASS. sourceGET200·1target·POST없음. 별점색실측에서 미선택1.10/선택약2.0의 낮은대비를 추가발견해 별도후속수정중이며전체색상QA완료는아니다.
- 후속 후기 카드 PR1165는 exactdev8f528 기준 두파일commit44c7, 기존테스트2파일7PASS, Sol 소스 및11이미지PASS 후 PR CI34622381482 SUCCESS. **dev3d7e40410604f2cc016fafd9f3e3862d2a41ce49 머지완료**. Alpha34623066167/mergeCI34623066118 진행중이며 실제 Alpha후속화면은 아직미검증. 근거 `output/qa/task168/pr1165-review-card-proof-20260912.md`.
- 추가 canonical권한/명령/신원 통합4spec은 실제PG **24PASS/기존SKIP1**,code0/잔여clone0 (`final-api-integration-1789144481872*`). publiclegacy음성테스트2개는 finalDB check에 위배되는 준비데이터를 발견해 DB거부검증으로 전환중이다. 공식화테스트의 source/targetround 및 in_progress반례 평탄화도 Sol이차단해복원중이며 완료에포함하지않는다.
- canonical 결과 경계 수정 후 실제 PostgreSQL lifecycle 6/6 PASS와 별도 최종 boundary 2/2 PASS(25+29 assertions)를 확보했다. 대회 derived-only409/외부인403 무변경, 활성 운영 관리자 리그 몰수 create→submit→decide, support/revoked/팀장 거부, 트랜잭션 직전 관리자 변경 시403 및 무변경을 검증했다. Sol scoped PASS. 이전 terms/region fixture setup 실패는 보존하며 서로 다른 실행을 단일 전체 PASS로 합치지 않는다. 최종 원시 증거 `output/qa/task168/final-api-integration-1789143122245*`, lifecycle `1789142649585*`.
- 사용자 승인으로 Markdown의 Alpha 테스트 계정을 읽어 실제 로그인 UI로 팀장 로그인했다. 비밀번호는 로그/증거에 저장하지 않았다. 현재 Alpha `8f528517c47033f6535d2a7465baff99f9b281e8`는 PR1164 포함 dev의 후속 API-only 변경이다.
- 실제 후기 작성 카드가390px에서 오른쪽으로 잘리고1440px에서 반폭이 되어 마지막 별이 잘리는 회귀를 root/Sol이 확인했다. document overflow0만으로 놓칠 수 있는 자식 clipping이며, 44px 터치영역을 유지한 배치 수정 중이다. Alpha UI 완료로 보고하지 않는다.
- 대회 후기 모달은390/768/1440 및390×400에서 등록 버튼 도달, 44px 별/X, 53px 등록, Tab 순환·Escape 닫기·trigger 포커스 복원을 확인했다. 후기 제출은 하지 않았다. 이미지 `output/ego/competition-full-goal-20260908/pr1164-alpha-20260912/`.
- **35/42 유지**. 남은7역할 흐름과 Phase3 소비자/본체 dev·alpha는 미완이다. context-mode의 프로젝트 루트가 다른 저장소로 연결된 오류는 우회하지 않고, 허용된 native filesystem 도구로 현재 저장소의 좁은 결과만 처리한다.

## 2026-09-11 — 최종 Prisma client 통합 검증 및 결과 권한 회귀 발견

- Luna가 legacy positive fixture를 canonical TeamMatch/Details/등록 관계로 바꾼14개 통합 spec을 Sol이 검토했다. 누락된 등록·대회 규칙 pin을 보완한 뒤 별도 의존성과 최종 Prisma Client를 생성한 환경에서 직렬 실행했다. 공유 Prisma Client는 변경하지 않았다.
- 첫6개 실행은 schema-only DB에 migrated football-v1 설정이 없어 setup 실패했다. 기존 role-ui DB의 설정7행을 읽기 전용으로 복사해 row-set hash 일치를 확인했다. 이후10개 실행은9 suites/55 tests PASS, lifecycle의 대회 결과 초안 거부1건만403/409 계약 차이로 실패했다. 별도4 suites/16 tests PASS. 원시 로그·Jest JSON은 `output/qa/task168/final-api-integration-1789126335325*`, `1789126624927*`, `1789126783417*`에 보존한다.
- 실패는 enum-only source 분류 때문에 canonical 대회가 기존 derived-only409 대신 결과 권한403으로 빠지는 제품 회귀였다. Sol의 인접 결과 경로 검토에서 regular-league 관리자 몰수(create→submit→decide)도 같은 분류 문제를 확인했다. 수정·실제PG 권한 회귀 검증 중이다. 리그 팀장에게 일반 결과 API 권한을 새로 여는 변경은 하지 않는다.
- 역할 흐름은 **35/42 유지**. 위 소스/DB 테스트로 사용자 UI 흐름 완료 수를 늘리지 않는다. PR1164 alpha 배포는 성공했으나 실제 작성 UI는 Ego87 사용자 로그인 인계 중이다.

## 2026-09-11 — canonical cleanup v4 검증 및 좁은 후기 UI PR

- 운영정리도구의 은퇴fixture의존을 canonical graph로 전환했다. 독립검토로 발견한 root대회누락·후보중복·잘못된멱등검증·불완전hash범위를 수정한 v4만 최종근거다. 실제PG에서 83문장/8PK/8distinct/residual0, 재실행0, 비대상sentinel3행불변, 감사·OFFICIAL/lineage보호와억제삭제 전체rollback 검증. Luna실행/Sol독립검토 scopedPASS. 근거 `output/qa/task168/cleanup-demo-final-proof-20260911.md`.
- stale bracket spec canonical전환은 Sol검토 후 좁은60테스트PASS. 나머지소비자전환은 진행중이며 운영DB cleanup/DROP실행은 하지 않았다.
- 후기UI만 실제dev870d5a에서 3파일commit `c600ec20deb36420897dc3eb9f6ac03445a442d2`로 분리해 PR1164를 생성했다. 커밋스냅샷3파일14테스트PASS (WIP23테스트와 구분), Sol분리패치PASS, PR CI34592323978 SUCCESS. **dev5617ec7a367d60c3b14a5c716ec87b70a6a92dce 머지완료**, mergeCI34592951228/alpha34592951329 SUCCESS 및 실제 health/landing200·DB정상·배포commit일치. 실제alpha작성화면 재검증은미완이다. 기존alpha관리자에참가자격이없어Ego팀장로그인요청후사용자제어중. 공유HEAD/기존index보존; 의무FF동기화는분기이력때문에거부됐으며강제작업없음. 상세 `output/qa/task168/pr1164-review-ui-proof-20260911.md`.
- 사용자흐름집계는 **35/42 유지**. 기본7개 및Task168본체dev/alpha는미완이다.

## 2026-09-11 — L-A 팀장 시상·권한 완료, 35/42

- leader004 실제 detail→awards에서 완료된 두팀대회1acff의 1/2위·트로피/메달과 별도301의 개인MVP를 확인했다. 데이터없는301에 순위를 꾸며넣지 않았다. admin GET/PUT403과 awards/reviews/audits 전체행count/hash불변.
- Ego390/768/1440 top/bottom9이미지 Sol scopedPASS. 배경·정렬·글자·간격·2팀시상대·하단CTA가림0, 가로overflow0. 정본 `output/qa/task168/leader-awards-complete-proof-20260911.md`.
- **기본23/30+경계12/12=35/42**. 잔여 M-L,L-T,L-L,S-T,A-T,A-L,A-M 및 Phase3본체dev/alpha. cleanup은 독립검토에서 잔존대회·중복후보집계·검증범위누락을 찾아 수정검토 중이며 완료로 세지 않는다. 아래집계는 과거기록이다.

## 2026-09-11 — L-V 실제 쓰기·권한·모달 검수 완료, 34/42

- 팀장004 대회 후기 UI POST201→API/DB재조회, 중복400 ALREADY_REVIEWED, 비참가팀원403, admin숨김/복원403과 전체행hash불변. 기존301후기는 보존하고 새 완료대회를 시작fixture로 사용했다.
- 실제 리그 TeamMatch246 상대팀 후기 UI POST201→source200→작성목록, DB1행. 중복201은 동일행 멱등 응답이며 비대상403/숨김·복원403 후 count/hash불변. 대회경기의 공개 `tournament_fixture` 명칭은 canonical TeamMatch ID를 쓰는 의도된 호환 계약이다.
- 발견한 모바일 모달 CTA가림/작은터치영역을 수정했다. Ego390/768/1440 +높이400 내부스크롤, 44px X·별점, 53px 제출, Tab/Escape/포커스복원 및 source/API계약 확인. Sol14이미지 scopedPASS; Web좁은3파일23테스트PASS. 같은공용폼의 별도미작성fixture 비교임을 구분한다.
- 정본 `output/qa/task168/leader-review-live-proof-20260911.md`. **기본22/30+경계12/12=34/42**. 잔여 M-L,L-T/L-L/L-A,S-T,A-T/A-L/A-M 및 Phase3본체dev/alpha. 아래집계는 과거기록이다.

## 2026-09-11 — M-A 실제 사용자 흐름 완료, 33/42

- 팀원005 My→본인 기록→수상 대회301→시상 및 본인 프로필 이동을 실제 Ego에서 실행했다. 본인 수상2/경기2, 비로그인 기록·수상0, 공개award의 recipientUserId/계정UUID 제외 및 편집CTA없음을 확인했다.
- member GET/PUT admin awards 모두403 PERMISSION_DENIED; 호출 완료 후 awards/reviews/audits 전체행 SHA256·행수 불변. 390/768/1440 기록·시상 top/bottom12이미지 Sol scopedPASS, 버튼44px/overflow0/하단가림0. 초기 애니메이션 캡처는 제외하고 opacity1의 안정된 이미지를 판정했다.
- 정본 `output/qa/task168/member-awards-complete-proof-20260911.md`. **기본21/30+경계12/12=33/42**. M-L,L-T/L-L/L-A/L-V,S-T,A-T/A-L/A-M과 Phase3본체 dev/alpha는 남는다. 현재 소유 runtime은 팀장 검증을 위해 실행 중이며 종료 시 별도 회수한다.

## 2026-09-11 — PR1163 alpha 실제 화면 검증 완료

- PR1163 head402d402e → dev870d5a02, PR/merge CI와 alpha34585844462 SUCCESS. 라이브 health200/dbtrue/commit일치. Ego390/768/1440 링크17→44px, 후기 앞20px, overflow0, 하단 최종결과 링크 가림0 및 프로필 실제 이동 확인. captured API200/console·runtime error0. Sol 9/9이미지 scoped PASS. 긴 이름·득점/도움 동시목록은 실제 데이터로 시각 검증하지 않았다.
- 근거 `output/qa/task168/pr1163-alpha-proof-20260911.md`. Ego83 closedSpace:true, watcher종료. 브랜치 보존, main승격 없음. 수리 가능한 PR을 닫지 않고 수정→리뷰/CI→dev→alpha로 처리했다.
- 팀원 시상 API도 소유 복제DB에서 조회200, 관리자 조회/수정403 PERMISSION_DENIED, 공개award 계정ID제외, award/audit hash무변경 확인. 실제 tournament301은 `d8168000-0000-4000-8000-000000000301`이며 이전 준비메모의 다른UUID는 이 실행 대상이 아니다. `output/qa/task168/member-awards-api-20260911.json`. M-A의 최종 전체 화면/끝스크롤 검증은 남아 **32/42 유지**.

## 2026-09-11 — canonical game-schema 실제 PostgreSQL 검증

- 은퇴한 fixture 기반 테스트 준비를 TeamMatch + Details + Game으로 전환했다. final schema hash를 고정하고 역사 migration hash는 보존했다. 최종 스키마의 빈 소유 복제 DB에서 직렬 통합 테스트 **9/9 PASS**.
- source guard의 두 조건(TeamMatch 연결 누락 / 비canonical source 종류)을 서로 다른 반례로 검증했고, 타 대회의 TeamMatch에 staff scope를 연결하면 composite FK `23503`으로 거부되는 것을 확인했다. Sol 최종 소스 검토 PASS.
- 증거 `output/qa/task168/canonical-schema-test-proof-20260911.json`, 실행 요약 `canonical-schema-test-20260911.log`. Luna가 tool session33667에서 1 suite/9 PASS/exit0을 관찰했으며 raw Jest stdout은 파일로 보존하지 않았다. `.log`는 재구성한 요약임을 명시한다. 테스트용 DB·추가 snapshot·Jest 프로세스 회수 완료. **32/42 유지**; 다른 legacy 소비자와 Task168 본체 dev/alpha는 남아 있다.

## 2026-09-11 — 전체 fresh migration + canonical CI HTTP 실제 검증

- 별도 offline/frozen API snapshot에서 Prisma6.19.2 생성·Nest build 통과. 새 빈 소유 DB에 **168개 전체 마이그레이션**(최종 retirement 포함)을 `prisma migrate deploy`로 적용한 뒤 실제 API 실행 및 literal HTTP **10/10 PASS**.
- 목록·상세200, reviewer403/미래·reminder404 무변경, ACK/RESOLVE 실제상태·버전·actor·reason·감사2행/멱등2행, 동일요청replayed:true, payload충돌409 무변경. Sol evidence scoped PASS. 소유 API/포트/테스트DB/runtime residue0.
- 정본 `output/qa/task168/canonical-ci-rehearsal-proof-20260911.md`. 로컬 CI환경 리허설이며 실제 GitHub실행/JWT로그인/UI완료로 확대하지 않는다. **32/42 유지**. 이로써 prior fresh-migration 미검증 항목은 해결했고, old 테스트소비자/운영정리도구/본체dev·alpha는 여전히 남는다.

## 2026-09-11 — PR 수리·alpha 후속 및 현재 cursor

- #1162 작성자가 수정안을 다시 적용한 `0d5b479b`를 Sol 검토 후 dev `25b4b9eb`로 머지했다. merge CI/alpha `34582867905` 성공, 실제 health/db/commit 일치, 오류404→리그 기록 API200과 득점1골 표시·프로필 이동 확인. 상세 `output/qa/task168/pr1162-repair-proof-20260911.md`.
- Ego390/768/1440 가로 overflow0, 실제 main 스크롤 끝 final-results bottom734<content770(모바일/태블릿). 별도로 17px 선수 링크·다음 후기 섹션 간격 부족을 발견해 **PR #1163**에 fullrow44px·간격20px 수정했다. 첫 CI에서 발견된 선수 이름 text-node 회귀도 수정한 최종 head `402d402e8467d3c24684eedf938fc3e99eaf4074`, 관련 unit23/Sol source 및 PR CI `34585241867` PASS. dev `870d5a0234a7027206657fadf00ea7742dc5216d`로 머지했고 merge CI `34585844502`도 PASS. alpha `34585844462` 진행 중이며, 동일 viewport 실제 실측 전이므로 UI 완료로 세지 않는다.
- 공유 dev의 로컬 cursor는 own pathspec 커밋 `93384f4e6`(컴포넌트1파일), `9611d26ee`(changeset1파일), `c2614e0d2`(선수 이름 text-node 보존). 원격 PR은 origin/dev 위에 두 파일만 고정했다. 다른 WIP 및 Task168 본체는 머지하지 않았다.
- 소유 DB 중지/55435 listener0, isolated app/release temp3개 삭제, 테스트·gh watcher 종료, Ego76 closedSpace:true. **32/42 유지**, 잔여 기본10개와 최종 retirement 소비자·실운영 rollout 미완.

## 2026-09-11 — 최종 schema retirement 로컬 리허설, 32/42 유지

- Prisma의 legacy 모델 5개·enum 2개·Game/staff/audit link 컬럼 3개 제거안을 작성했다. 역사 원본 ID와 canonical 관계는 보존한다. 검증된 v6 실행 번들 130파일과 은퇴 소스 35파일은 hash 검증 archive로 고정했다.
- 최종 SQL SHA256 `08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323`: 소유 복제 PostgreSQL에서 정상 2개 통과, 손상/보호 누락/처리 중 작업 7개 차단, 총 **9/9 예상 결과**. 정상 실행 후 보존 테이블 118개의 행 수·내용 SHA256 모두 일치했다. Sol SQL 검토 scoped PASS.
- isolated Prisma 생성/최종 API typecheck와 public records 37개, realtime 69개 회귀 통과. post-DROP seed helper 실제 PG 3개와 최종 full seed PG 3개를 구분한다. 후자는 다른 날짜 재실행, registration/player/payment ID, 공식 결과 이력, 운영자 수정 스냅샷·영상, 철회한 신원 연결 부재를 보존했다. source/test Sol scoped PASS.
- canonical participant identity SQL 실제 PG 1개 PASS: dry-run→실제 연결→rerun0, current/history/타 대회/구 리비전 제외, 같은 대회의 결과에 다른 경기 선수 또는 다른 side를 잘못 연결한 반례까지 검증했다. seed/identity unit 13개도 통과. 상세 `output/qa/task168/retirement-preparation-proof-20260911.md`.
- legacy-only goal backfill 4파일도 hash archive 후 active export와 함께 은퇴시켰다. 남은 old 테스트·QA 소비자, 최종 migration-history replay, 본체 dev 머지·alpha, 운영 백업 검증·DROP 적용은 미완이다. **32/42 유지**. 로컬 복제 DB 리허설로 운영 DROP 승인을 대신하지 않는다.

## 2026-09-11 — S-R 실제 단절·재전송·버전 충돌, 32/42

- Phase3 추가: immutablev6 130files/hash검증+standalone frozen install/Prisma생성→실제PG4fixture fullcutover COMPLETED→canonical guards COMMIT→재실행추가이관0. 기존result/goal/revision/sides와이동video내용hash보존,legacyGame/staff/audit links0. 실제55006 deferredconstraint/sealDDL충돌수정후CLIintegration3/3PASS. 상세 `output/qa/task168/cutover-fullrun-proof-20260911.md`. 최종schema DROP/운영DB실행/Task168본체dev·alpha완료와구분한다.

- **기본20/30 + 경계12/12 =32/42**. 새 canonical Game5db0c958…에서 Director007 양팀 명단 저장/제출→UI시작→실제 API단절→내구큐→재연결 동일ID/hash DB1건→공개2:0. 서버재시작의 token만료는 새권한 획득 후 명시적 ‘다시시도’로같은ID1건,이어새득점까지4:0/v13/seq4/queue0. 자동복구와 명시적재시도를 구분했다.
- 실제유효token+staleexpected9 resume→409 VERSION_CONFLICT(current10), DB PAUSEDv10/seq2불변→UI최신재개v11. 이전 Game960ffc8c… 종료/SUBMITTED/OFFICIAL/worker/전적 증거와결합해S-R완료. 동일경기에서모두재실행했다는주장은없음.
- 늦은oldrenewACK가newlease를덮는race방어+token별renewinterval수정. 같은hook시간/ACK회귀5/5PASS,Sol소스PASS. 모바일stickyheader가상단메뉴뒤로숨는실제결함은top52+모바일column contents로해결. Ego390/768/1440 header52/53/32,list끝728/724/524<844,overflow0,버튼44px;Sol3이미지PASS.
- 근거 `output/qa/task168/offline-event-proof-20260911.md`. S-T 역할전체행렬, 기본잔여10개(M-L/M-A,L-T/L-L/L-A/L-V,S-T,A-T/A-L/A-M),Phase3최종retirement 및 Task168 본체dev/alpha는미완. Phase3 standalone fullrun의 과거 리비전 준비 누락과 deferred constraint 충돌은 보완 후 v6 실행·재실행 및 CLI integration 3/3 검증을 마쳤다.
- 최종 retirement 탐색(Luna): active production의 retired enum 의존성은 `public-visibility.ts`의 `V1TournamentFixtureStatus` 1개다. 이후 Prisma legacy 모델 5개와 status/goal enum, Game/staff/audit legacy FK를 제거해야 한다. canonical `teamMatchId`와 역사 증거 `originalFixtureId`는 보존한다. migration tooling은 검증한 immutable artifact에 고정한 뒤 runtime 빌드 참조·테스트 소비자를 함께 정리해야 한다. 이 탐색은 최종 DROP 실행 증거가 아니다.

## 2026-09-11 — 운영자 실제 종료·공식 확정·후처리, 31/42 유지

- Field008 실제 출전명단 양팀6명 저장/제출→도착확인→시작→득점/파울→중지/재개→피리어드 종료→최종 종료. Game960ffc8c… v13 ENDED와 SUBMITTED12명 동시 저장/API·DB 재조회. Support 명단·event·end와 field/support officialize 실제403 및 데이터 불변.
- Director007 확정 기능 off 거부/감사, owner001 실제 UI 확정 성공 Gamev14/OFFICIAL12명. 정상 worker.processOne 3건 처리(target 결과2건 각 COMPLETED/attempts1), officialFact1/teamFact2. 공개1:0·개인1골·팀1승 반영, 실제 팀 전적→동일 공개경기 이동 확인.
- 수정: scoped staff 팀명 노출, 정규시간 종료 후 마지막 피리어드 파울 유지, 모바일 기록버튼44px/줄바꿈, readonly 및 OFFICIAL 수정 false affordance, 지원 보드 결과보기 문구/tooltip. Luna 구현/Sol 독립소스·시각검수. API28/console52 최초PASS; 후속70PASS+실패positive fixture 수정1PASS/공식화회귀1PASS. 전체 suite 재실행 주장은 하지 않는다.
- Ego390/768/1440 readonly 수정버튼0/overflow0/목록끝가림0, Sol 최종이미지4/4PASS. 근거 `output/qa/task168/staff-execution-proof-20260911.md`, 런타임 `staff-execution-runtime.json`.
- **31/42 유지**. S-T/S-R 잔여: 역할별 허용행렬, 공개 live 동시관찰, 이벤트 offline/reconnect exactly-once, game command/event stale-version 무변경, 나머지 기본11개·최종retirement·Task168 본체 dev/alpha. 기존 X05/X06/X10/X11 증거와 중복 실행하지 않고 결합한다.

## 2026-09-11 — L-R 실제 전적 연결 및 종료 명단 보존, 31/42

- **기본19/30 + 경계12/12 = 31/42**. 실제 팀장 경기 상세→공식 결과1:0→팀 전적 친선1승→종료 명단6명과, 연결된 선수 본인1경기/1골/MVP1→같은 친선 경기 이동을 확인했다. 기존 제출/상대확정 증거와 이번 재조회 근거를 결합하며 이전 쓰기 실행을 재실행했다고 주장하지 않는다. 타인 개인 기록은 공개동의 없을 때 팀장에게도 숨겨진다.
- nonempty revision1 명단을 빈 초안으로 처리하던 결함, 개인 전적의 친선/리그 링크 누락, 종료/취소/보관 라인업의 화면·API 불일치, legacy bench 신원/위치 손실을 수정했다. canonical Game과 상위 TeamMatch 상태가 어긋난 경우도 트랜잭션 안에서 수정/제출을 차단한다. LIVE/PAUSED 운영자 takeover 계약은 유지한다.
- Luna 구현, Sol 적대적 검토 최종PASS. 개인전적 API17+화면1, 최종 라인업 Web55/API21, 실제PG 상태불일치5PASS/4skip. 실제 HTTP 저장/제출/정정요청 모두409 LINEUP_MATCH_TERMINAL, 재조회 명단/버전 불변. Ego390/768/1440 전후와 끝까지 확인; 팀 전적 장식rail 제거 후16px 여백 복원. 근거 `output/qa/task168/leader-records-proof.md`.
- 기본11개(M-L/M-A, L-T/L-L/L-A/L-V, S-T/S-R, A-T/A-L/A-M), 최종schema retirement, committed-tree 및 Task168 본체 dev/alpha는 미완이다. 별도 PR#1135/#1161 dev 머지와 alpha7abed93c 배포성공을 본체 완료와 혼동하지 않는다.
- Ego30 종료확인, 소유 API/Web PID 및 포트회수, 소유DB중지. 다른세션 프로세스는 종료하지 않았다. 상세 `leader-records-runtime.json`.

## 2026-09-11 — 담당 경기 권한 선조회 수정 및 dev PR 검토, 30/42 유지

- `/me/tournament-staff`에 서버 인가와 같은 active owner/ops 기준의 `platformRole`을 추가했다. 경기 콘솔은 활성 자기 배정과 이 권한으로 판정하며 전체 staff조회403을 거치지 않는다. 만료된 cached 배정을 되살리던 오래된 fallback을 제거하고 fixture 범위 거부 안내를 구분했다. Luna 구현, Sol 반례 검토, root 최종 dead condition/테스트 정리.
- API unit9PASS/8skip, 최종 gate19PASS. 앞선 stale copy/fixture 기대값 실패는 수정 후 검증했다. 실제 Ego: field 담당경기 진입·미배정거부·지원담당자조회전용·owner수정권한 확인, 네 경우 globalstaff조회0. 실제 API platformRole owner만PLATFORM_OPS, platform support/field/support는null. 근거 `output/qa/task168/role-gate-proof.md`. 임시배정2개200v1회수, Ego22닫힘, 소유API/Web/DB정리.
- 사용자 추가 지시로 dev대상 PR3개를 root+Sol 검토했다. #1135를 dev1a93acbc로 머지했고 iOS Alpha는PASS. #1136은 업로드설정 불일치 허용, #1127은 Kakao provider 이메일검증 누락 때문에 사용자merge-or-close기준에따라닫고이유/재개조건을PR에기록했다. 브랜치는보존했다.
- 머지후 API CI가 날짜가 지난 기존 일정fixture6건에서실패해 alpha배포는중단됐다. 제품롤백/게이트우회 없이, 원격dev기준2개통합테스트의시간만수정한 독립commit9c02e0ea를작성해Sol검토PASS. 복구PR#1161의CI34562696762 API/Web/Gates모두PASS 후 dev7abed93c로머지했다. alpha34563148718 성공 및 실제 landing/health HTTP200·DB정상·배포커밋7abed93c를 확인했다. 이는 PR 배포 검증이며 미커밋 Task168 본체의 alpha/E2E 완료가 아니다. 현재 dev-base 열린 PR은0개. 상세 `output/qa/task168/dev-pr-review-20260911.md`.
- 로컬dev는원격보다32커밋뒤처지고12개incoming파일이공유WIP와겹쳐fetch만했다. HEAD전환/강제동기화/기존인덱스캡처없음. Task168본체는아직dev/alpha미반영, 기본18+경계12=30/42유지. S-T 전체명단/확정행렬 및최종schema retirement는계속미완.

## 2026-09-11 — 배경·배치·간격 실측 개선과 canonical 결과 fallback 제거, 30/42 유지

- 사용자 지적을 반영해 콘솔 배경/폭/시작선/간격/취소 기록 행을 실제 Ego에서 조사했다. header/body x축 불일치와 빈 배너의 중복 간격, 이벤트 왼쪽 레일, 취소 원본 구분 부족을 수정했다.390에서 생긴 중간2+1 우측정렬 회귀는 재수정해3버튼1행,360은 좌측2+1로 맞췄다.
- 최종360/390/768/1024/1440 실화면 root 확인, Sol 시각 리뷰PASS. 시작선32/40/48/160px 일치, 빈 배너 간격32→16px, 버튼높이44, overflow0.360×640 끝에서 마지막기록bottom524<640 확인. 이벤트18testsPASS. 배경은 기존surface-soft rgb242,244,246와white sticky chrome로 유지하며, 자연스러운 하단빈공간을 장식으로 채우지 않았다.
- fieldstaff 목록403 두건은 기존 gate가 전체staff조회403→자기배정조회로 분기하고 query기본retry1로 반복하는 구조임을 확인했다. 회피성silentcatch/권한확대는 하지 않았다. 허용역할 선조회 기반 gate 개선은 남은S-T 권한흐름 항목이며 networkclean으로 보고하지 않는다.
- Phase3: active official score/result/timestamp resolver의 legacyFallback/type과 read/standings/bracket 호출부의legacy인자를 제거했다. current OFFICIAL revision만 사용,VOID/missing/malformed는null,현재lineage note만 사용. historicalimport/migration계약은 유지. resolver7+standings6=13PASS,Sol no blocker. 새backend코드 live재기동 통합/최종schemaDROP/dev/alpha는아직미완이다.
- 증거정본 `output/qa/task168/layout-audit-proof.md`, 수명주기 `layout-audit-runtime.json`. 임시assignment회수200v1/Ego20종료 확인. 전체흐름30/42 유지.

## 2026-09-11 — 조회 전용·대비 보정 및 canonical 일정 타입 제거, 30/42 유지

- 조회 전용 정상 진입에서 takeover 요청을 막고 명시적 안내를 표시했다. Root Ego390/768/1440px에서 오류/무한 대기 안내 없음, 수정 버튼 비활성 회색, overflow0, 본문 끝 확인. 현장 활성 버튼44px/흰13px 대비는 blue700 5.410:1, red700 6.507:1로 보정했다. 전역 토큰은 유지한다.
- 실제 현장 UI 일시중지→파울 입력→기록 취소까지 Gamev3→v6/sequence2와 원본+CORRECTION 관계 및 EVENT_APPEND/EVENT_REVERSE canonical 감사 로그를 PostgreSQL에서 확인했다. 두 임시 권한은 회수하고 열린 콘솔 활성 수정 버튼0 확인.
- 최초56PASS 이후 Sol이 held→readonly 큐 전송/late grant 경계를 지적해 추가 보완했다. 기대값 실패와 fake-timer timeout 수정 후 최종4/4PASS: 실제 held·queued item·늦은 renew/request ACK·reverse/assist 거부를 검증했다(`/tmp/task168-readonly-transition-final-fixed.log`). 독립 reconnect 시뮬레이션을 이4개 테스트의 근거로 주장하지 않는다. 이벤트 행의 기존 decorative left rail과 S-T 전체 명단/확정 매트릭스는 후속 항목이다.
- 별도 Luna Phase3: 공개 일정 서비스의 retired Prisma Fixture Select/GetPayload/Status 및 unsafe cast를 canonical Details→TeamMatch→Game inferred type로 제거했다. public service/schedule scorer63PASS, Sol 해당 변경 blocker0. schema DROP·역사 tooling retirement·dev/alpha는 미완이다.
- 증거: `output/qa/task168/readonly-fix-proof.md`; 이전 S-T 증거와 합산하되 전체42개 중 완료 수30은 그대로 유지한다.

## 2026-09-11 — S-T 역할 실동작·상태 표시 수정, 30/42 유지

- 실제 FIELD_OPERATOR/SUPPORT_READONLY 배정 후 같은 Game의 조회·미배정 접근·취소/일시중지 차단을 비교했다. 현장 운영자가 Ego 확인창을 통해 재개한 뒤 PostgreSQL에서 PAUSEDv2→LIVEv3 저장을 확인했다. 임시 배정2개는 API로 회수했다.
- 담당 경기 상태가 `상태 확인 필요`로 표시되는 문제를 Luna가 staff 전용 매핑으로 수정했다. 관련 Vitest16/16, root 실제390/768/1440px 화면 확인. 공유 공개 일정 API는 유지한다.
- 미완 발견: SUPPORT_READONLY가 자동 takeover를 요청해 정상 조회 중 권한 오류를 표시한다. Sol은 기존 최종 역할 context로 takeover 요청/자동 effect만 제한하고 subscribe/revocation 재검증은 유지하도록 권고했다. 버튼 흰13px/blue500·red500 대비3.714:1도 미달이며 scoped blue700/red700 배경 소비부 수정이 필요하다(전역 토큰 변경 금지).
- S-T 명단·이벤트·확정 역할 전체와 위 두 UI 수정은 아직 미완. 총30/42 유지. 실제 근거·harness timeout 원인·화면은 `output/qa/task168/staff-role-matrix-proof.md`, 수명주기는 `staff-role-matrix-runtime.json`. dev push/alpha/Phase3 retirement 미완.

## 2026-09-11 — canonical 감사 로그 writer 정리, 30/42 유지

- 이전 사용량 제한 위임은 실행되지 않았으므로 진척으로 계산하지 않았다. 현재 worktree dev/f06d804af와 사용 가능 상태를 확인하고 재개했다. 계정/요금제 변경이나 크레딧 소비는 없다.
- runtime audit writer의 legacy fixtureId 입력/쓰기와 fields/result-review 호출부를 제거했다. teamMatchId+tournament scope, 외부 fixtureId 경로/리소스명, 과거 migration audit 보존, snapshot 개인정보 차단/불변성/트랜잭션 계약은 유지한다. Luna 구현, root 중복 guard 정리, Sol 독립 리뷰 blocker0.
- 좁은 검증: writer unit14 PASS, 실제PG Game audit3 PASS(감사 실패 시 Game 복구 포함), canonical result4 PASS/48skip, 실제PG field5 PASS. `output/qa/task168/canonical-audit-writer-proof.md` 참조. UI 변경이나 새로운 사용자 흐름 완료는 없어30/42 유지, 전체 Phase3/dev/alpha 미완이다.
- 남은 S-T는 같은 canonical 경기의 FIELD_OPERATOR/SUPPORT_READONLY 실제 권한·버튼·명단·이벤트/확정 차이, S-R은 경기 진행의 연결된 실제 여정, L-R은 이미 연결된 친선 participant의 현재 개인 기록 재조회 근거를 확인한다. 오래된 unlinked 상태만 보고 새 fixture를 만들지 않는다.

## 2026-09-10 — S-A/S-V 로컬 완료, 30/42

- **기본18/30 + 경계12/12 = 30/42**. 실제 director007 auth/me·소속팀0 확인, 실제 운영 보드→공개 시상/후기 이동. 시상 저장403, 대회/경기 후기 작성403, 기존 후기 숨김403, 대회 시상/후기 DB snapshot 불변. Sol 최종 blocker0. `output/qa/task168/staff-awards-reviews-proof.md` 정본.
- UI: 시즌 결산의 반복 대형 빈 상태를 간결한 안내로 수정했고, 후기1건의 desktop 반쪽 폭을 전체 콘텐츠 폭으로 맞췄다. Ego 전후390/768/1440 root 직접 확인, overflow0/resource 오류0. 기존 리그 시상 회귀4 PASS. 제품 데이터/권한 계약은 유지한다.
- 임시 staff assignment230/301 모두 실제 revoke200/version1. Ego285 done:true, API/web 종료/handles143. 기본12개(M-L/M-A, L-T/L-L/L-R/L-A/L-V, S-T/S-R, A-T/A-L/A-M), 최종 schema retirement, committed-tree/dev merge/alpha는 미완이다.
- Phase3: 별도 legacy Prisma snapshot client는 만들지 않는다. 현재 cutover release를 immutable artifact로 먼저 고정·각 DB 전환/봉인 후, 다음 schema-breaking release에서 legacy 도구와 모델/열을 함께 제거한다. 현재 staff/access/board/Game 읽기에서 legacy scope fixtureId select/fallback을 제거했고 외부 fixtureIds 필드명은 유지했다. 좁은 unit3 suites40 PASS 및 실제PG canonical scope4 PASS; 초기 sealed-template seed55000은 pre-seal history template으로 바로잡았고 guard는 해제하지 않았다. 최종 schema DROP은 아직 실행하지 않았다.
- staff read cleanup 최종 Sol blocker0. 정본 `output/qa/task168/canonical-staff-read-proof.md`. 정리 완료: ownedPID0/Ego285 done:true/DBstop/3013·8121·55435 listener0, Node85/browser20(시작 동일), scoped diff-check0/debt0. 커밋·머지·배포 없음. goal active.

## 2026-09-10 — L-M 로컬 완료, 28/42

- **기본16/30 + 경계12/12 = 28/42**. 기존 Ego221 생성/신청→호스트 승인→양 팀 일정→결과 제출→상대 공식화 근거에 실제PG 동시 승인·재승인·취소/삭제·동시 신청·비호스트 승인 금지 및 DB 불변 검증을 보완했다. `output/qa/task168/leader-match-proof.md` 정본, Sol 최종 blocker0.
- schedule integration 기존8 PASS + 추가2 PASS/8skip의 상호 보완 실행이다. 중간 잘못된 이름 필터의10skip은 성공 증거에서 제외했다. 제품 UI 변경과 새 브라우저 캡처는 없으며 이전 실제 Ego 증거를 연결했다.
- 남은 기본14개: M-L/M-A, L-T/L-L/L-R/L-A/L-V, S-T/S-R/S-A/S-V, A-T/A-L/A-M. Phase3 최종 보존 검증/schema retirement·committed-tree·dev merge/alpha도 미완이다.
- Phase3 재감사 정정: 리뷰 adapter는 이미 v1TeamMatch 조회다. legacy operational 잔존이라는 최초 agent 보고는 현 코드와 달라 폐기했다. 다음 보존 검증은 cutover 전후 staff scope ID/assignment/tournament payload 보존이다.
- 위 staff scope 보존 검증도 완료했다: 실제PG 성공/재실행 동일ID·assignment·tournament 보존, fixtureId→null/teamMatchId 전환, late POST_CUTOVER_INCOMPLETE 후 scope/Game/audit 복구. `output/qa/task168/staff-scope-preservation-proof.md`, 최종2 PASS/4skip(`/tmp/task168-staff-scope-roundtrip-pg.log`). 초기 post-seal template55000 및 분리 seed23514는 각각 pre-seal history template/동일 transaction으로 수정했고 guard는 해제하지 않았다. 전체 흐름 수는28/42 유지.
- Sol staff 보존/복구 최종 blocker0. 테스트 handles 전부 terminal, owned Jest0, DBstop, 3013/8121/55435 listener0, Node85(시작85)/browser20(시작23). 두agent 완료, verdict 수신 뒤 running reviewer는 interrupt했다. scoped diff-check0/debt marker0, HEAD f06d804af 유지·커밋/머지/배포 없음. 다음은 남은14흐름 및 final schema retirement이며 goal active다.

## 2026-09-10 — S-L 로컬 완료, 27/42

- **기본15/30 + 경계12/12 = 27/42**. S-L 보드→콘솔의 실제 lineup404/fields404를 canonical regular-league 소유권 분기로 고쳤다. 같은 staff를 실제 재배정201한 뒤 Ego 콘솔에서 팀명/0:0/종료/이벤트를 확인했고 resource 오류0, fields GET200이었다. actorRole=tournament_director이며 전역 league-admin 부여가 아니다. 종료 명령 상태 가드409와 배정 회수200→목록 제외/Game403을 실제 검증했다. `staff-league-proof.json` 정본, Sol 최종 blocker0.
- `sl-league-console-{390,768,1440}.png`는 수정 전 실제 오류 화면, `sl-league-console-after-{390,768,1440}.png`는 수정 후 실제 콘솔이다. root가 세 폭 모두 직접 확인: 가로 overflow0, 종료 이벤트 버튼 disabled, 높이64px(모바일/태블릿)/80px(데스크톱),15px 글자. 이번 수정은 backend 조회 계약이며 새 UI 스킨을 만들지 않았다.
- 실제PG field5 PASS(`/tmp/task168-league-console-fields-pg.log`), 최종 lineup6 PASS(`/tmp/task168-league-lineup-final-pg.log`). 초기 old noGame fixture 생성/cleanup이 sealed legacy table55000에 걸려 canonical TeamMatch+Details/noGame으로 전환했다. production field 관리 platform-only, 배정/해제 권한/잠금/CAS/감사 계약을 유지했다. Sol이 지적한 도달 불가능한 중복 deletedAt 검사2개도 삭제했다.
- Config canonical backfill PG2 PASS/13skip + 최종 CLI/runbook Sol blocker0. skipped/executed 결과를 구분하고 역사 수정은 pre-seal 명시 opt-in이다. final schema/FK DROP과 dev/alpha는 아직 미완이다.
- 정리: Ego284 done:true, API40047→57266/web40104·40111·40117 종료/terminal143, 테스트clone0, 소유DBstop, 3013/8121/55435 listener0/소유PID0, Node86(시작86)/browser20(시작21). 이번 생성 staff assignment2개 모두 실제 API로 revoke했다. 세agent 결과 수신 완료. 기본15개(M-L/M-A, L6, S-T/S-R/S-A/S-V, A-T/A-L/A-M)와 최종 Phase3·committed-tree/dev merge/alpha가 남는다.

## 2026-09-10 — S-M 로컬 완료, 26/42; S-L 콘솔 진입 결함 수정 중

- **기본14/30 + 경계12/12 = 26/42**. S-M 실제 director007 로그인→담당 보드→일반 친선 상세(read-only), Game GET/cancel POST403, version7/ENDED/audit8 불변. 같은 Game은 별도 teamowner010/platformowner001 로그인에서 GET200이다. 친선 staff 권한이 별도 팀장/플랫폼 권한과 혼합되지 않음을 검증했고 Sol 승인했다. `output/qa/task168/staff-friendly-proof.json` 및 `sm-friendly-readonly-{390,768,1440}.png` 직접 시각 검증, visible CTA50px/15px/nooverflow. 현재 화면 검증이며 제품 UI 변경은 없었다.
- S-L 진행: platformowner001이 league230에 director007 실제 배정201(assignment fc71a93d-ff5f-4721-bca7-5467314462e4)→Ego 담당목록/리그 운영보드→Game GET200 actorRole=tournament_director, 종료게임 취소409로 상태 불변. 하지만 운영 콘솔은 lineup404로 '경기 정보를 찾을 수 없어요'를 표시하며 fields도404다. 이 보드→콘솔 실제 결함을 수정 중이므로 S-L은 완료로 세지 않는다. 배정을 실제 revoke200(version1)한 뒤 Game GET403 확인; 임시 배정은 회수했다. `staff-league-proof.json` 참조.
- Phase3 config backfill의 기본 경로에서 legacy fixture UPDATE/count를 제거하고 명시적 historical flag로 분리했다. 실제 clone에서 fixture table을 임시 rename한 채 canonical backfill 성공: PG2pass13skip(`/tmp/task168-config-canonical-pg.log`). 최초 test spreadnever compile 오류는 불필요한 spy mockImplementation 제거로 해결했다. CLI historical 미실행은0 대신 skipped로 보고하고 pre-seal 전용 실행/runbook을 동기화했다. 최종 검토/cleanup은 후속 기록을 따른다.

## 2026-09-10 — M-V 로컬 완료, 25/42

- **기본13/30 + 경계12/12 = 25/42**. 이전 Ego 팀원 상대 팀/선수 리뷰 제출·작성 목록 재조회·duplicate201/alreadySubmitted·DB1행·outsider403 증거와 이번 실제PG 만료/경합 검증을 결합해 M-V를 로컬 완료로 올렸다. 정본 증거: `output/qa/task168/member-review-proof.json`, `review-concurrency-proof.json`. dev/alpha 완료를 뜻하지 않는다.
- 실제 `ReviewsService.submit`과 `GamesService.revokeIdentityLink`를 중립 Game row holder 뒤에 순서대로 queue했다. revoke-first는 TARGET_NOT_REVIEWABLE/리뷰0행/REVOKED event/IDENTITY_LINK_REVOKED Game 감사행1을 확인했다. submit-first는 리뷰 저장 후 current link 삭제에도 저장된 리뷰가 유지됐다. 기간 만료 source와 submit 모두 REVIEW_WINDOW_CLOSED/행불변을 확인했다. 별도 fixture의 current link+null snapshot/철회 identity 제외/저장행 재조회도 통과했다.
- 최종 실제 서비스 실행은 `/tmp/task168-review-real-revoke-pg.log` 3pass1fail(감사 resource를 participant로 잘못 기대), 이를 실제 Game 기준으로 고친 좁은 실행 `/tmp/task168-review-real-revoke-audit-pg.log` 1pass3skip이다. 4개 계약에 각각 통과 증거가 있으며 clean full rerun을 주장하지 않는다. 수동 revoke 재현 테스트는 이 최종 실제 서비스 검증으로 대체했다. Sol 최종 source/test blocker0.
- Phase3 core 운영 생성/lifecycle에서 TOURNAMENT_FIXTURE를 거부하는 변경은 unit17/17+Sol blocker0. 역사 enum/backfill은 보존한다. 최종 legacy schema/FK retirement는 아직 미완이다.
- 종료 정리: 테스트 clone0, 소유DBstop, 55435 listener0, Node86(시작86)/browser22(시작23), 소유 웹/API/Ego를 이번 턴 새로 시작하지 않았다. scoped diff-check clean. 다음 기본17개는 M-L/M-A, L6, S6, A-T/A-L/A-M이며 committed-tree/dev merge/alpha도 남는다.

## 2026-09-10 22:00 — M-V 실제 PG 동시성 검증과 Phase3 운영 계약 분리

- Core operational legacy 생성/lifecycle 차단 구현 완료: `game-contract.ts/.spec`, unit17/17(`/tmp/task168-canonical-core-final.log`), Sol blocker0. Historical backfill은 core 생성 validator를 호출하지 않아 별도 validator나 호출 변경은 불필요했다. enum/역사 invariant는 보존했다.
- 새 리뷰 PG 첫 실행4fail은 fixture가 REQUESTED 없이 ATTESTED를 만들려다 실제 trigger23514에 걸린 준비 오류다. 제약을 끄지 않고 요청자/별도확인자 순서를 보완 중이다. 첫 테스트의 submit-wins 시나리오에는 실제 경쟁 revoke가 없었고 만료 검증도 source만 조회해 root가 보강을 요청했다. 아직 PG PASS 아님.

- M-L 다음 실행 전제 조사: 정규리그230의 completed TeamMatch246/Game3958fb4b에는 양팀 side만 있고 participant가0이다. 따라서 현재 경기 상세만 여는 것으로 본인 출전 기록을 PASS 처리하지 않는다. 리그 명단 등록/출전 운영을 실제 수행하는 L/S 흐름과 연결해 준비해야 한다.

- 직전 턴은 실제 UI/DB 저장과 코드 수정 증거를 남긴 progress다. 집계24/42를 유지하고 리뷰 current identity 해제/저장 경합 및 만료 실패의 실제 PostgreSQL 검증을 추가한다. 소유DB `teameet-task168-db` 재시작, template `ulw_v1_integration_task168_canonical_cascade` 존재 확인, Node86/browser23 기준선. 테스트별 clone으로 격리하며 원 runtime 데이터는 수정하지 않는다.
- 현재 `teameet_task168_role_ui` DB는 Game12건 모두 TEAM_MATCH, historical fixture2건이다. fixture 참조 FK는 Game/operation audit/advancement edge/result/video/parent/staff scope에 남아 있다. 이 수치는 final DROP 완료 증거가 아니다.
- 다음 Phase3 소유 범위는 core game-contract의 운영 생성/lifecycle에서 legacy source를 거부하고, 역사 backfill에서 필요한 검증을 명시적으로 분리하는 변경이다. 별도 Luna가 수행하며 root는 PG 리뷰 검증을 직렬 실행한다.

## 2026-09-10 — M-V 실제 저장 및 시각 검증 진행, 24/42 유지

- Sol 최종 리뷰 production blocker0. 지적된 미사용 reviewerTeamId 변수는 삭제했다. 실제 동시성 PG·만료 경계는 여전히 남으며 M-V를 완료로 올리지 않는다. Luna2 completed, Sol 결과 수신 후 running 상태를 interrupt하여 회수했다. 이번 변경은 로컬 공유 미커밋 상태이며 commit/dev push/alpha 실행 없음.

- 최종 리뷰 service unit **63/63 PASS**. Sol이 잡은 no-Game 기존 완료 경기의 GET200→팀 리뷰 POST404 회귀를 수정했다. 기존 경기 보존 계약을 유지하여 팀 리뷰만 TeamMatch row 잠금 후 재검증하며, Game이 있는 경기는 Game-first 잠금을 유지한다. 선수 리뷰는 Game 필수다. 해당 source+submit 회귀가 추가됐다. 이 결과가 아래62/62를 대체한다.

- 최신 검증: 리뷰 service unit **62/62 PASS**(`/tmp/task168-review-identity-final.log`), 알림/만료 **20/20 PASS**(`/tmp/task168-identity-scope-final.log`), 리뷰 UI 초기상태 **3/3 PASS**(`/tmp/task168-review-ui-final.log`). 실패했던 fixture의 tx delegate 누락과 팀1+선수2 대상 수 기대값을 실제 계약에 맞춰 수정했다. notification/expiry Sol blocker0. 리뷰 Game 잠금 및 tx 내부 identity/lineup/membership 재조회는 실제 PostgreSQL 동시 revoke 경합 검증이 남았다.
- 추가 실제 증거: outsider012 로그인201→리뷰 POST403 NOT_TEAM_MEMBER; 선수 metric4행 각5점. 종료 정리: Ego283 done:true, API71696→92169/web71138·71142·71148 TERM 및 terminal143, 소유DBstop, 3013/8121/55435 listener0/소유PID0. Node86(시작85), browser23; 타 세션 프로세스 종료 없음. 좁은 diff-check clean, touched production path TODO/FIXME/HACK/XXX0.

- Ego283에서 member005가 친선 경기 `0805f900-0c3c-4b59-aebf-b8f905396dd2` 상대 팀 리뷰(4점)를 제출하고, 상대 선수 리뷰(5점/4개 세부점수/매너 태그)를 제출했다. 작성된 리뷰 화면에서 2건 재조회. 선수 리뷰 `bd375003-82d3-4109-a73b-3ddf41f5a990`의 재전송은 201/alreadySubmitted:true, DB 대상 행은1개였다. 최초 수동 재전송의 잘못된 tags 필드는400 VALIDATION_ERROR였고 DTO tagCodes로 정정했다.
- 실제 RED: 승인된 current identity가 있어도 participant.userId=null이면 리뷰 대상에서 빠졌다. current link 기반 resolver 수정 후 동일 GET200에 user006이 나타나 실제 UI로 저장했다. 상대 user006의 River팀 active membership은 전용 clone에 준비한 fixture이며 가입 UI 완료로 세지 않는다. 이후 자기 요청201→별도 owner010 승인201은 실제 API로 수행했다.
- 시각 검증: `mv-player-review-after-{390,768,1440}.png`에서 활성 submit 높이50px/15px/배경 rgb(27,100,218)를 확인했다. desktop 선수1명 카드가 반쪽 폭에 놓이는 문제를 고쳐 `mv-player-review-final-{390,768,1440}.png`를 직접 확인했다. 완료 수량은 누적 의미가 명확한 '작성 완료 N건'으로 수정. 기존 작성 건을 신규 전송으로 오인하지 않게 했다. 스크립트 require/top-level-await 오류는 import로 고쳤고, 접힌/화면 밖 요소 클릭은 펼치기 및 scrollIntoView 후 실제 클릭으로 해결했다.
- M-V는 아직 완료 아님: Sol 지적의 신원 해제/리뷰 저장 경쟁, 단순 REQUESTED 이력과 해제 이력 구분, 삭제된 source 처리 보강 및 회귀 검증 진행. 비참가자/만료 경계도 추가 실행 필요. 집계는 기본12+경계12=24/42 유지하며 dev merge/alpha는 미완이다.
- Phase3 identity notification/expiry의 canonical scope 손상을 성공으로 숨기지 않도록 typed failure를 추가했다. explicit tournament kind:null은 유효하지만 missing relation:null은 실패다. REQUESTED event가 없는 expiry는 실패, terminal event는 정상 no-op. 최종 테스트/cleanup은 후속 기록을 따른다.

## 2026-09-10 — M-M 로컬 완료, 24/42

- **기본12/30 + 경계12/12 = 24/42**. 이전 턴 일정→친선 상세·운영권한403 증거에 이어, 이번 턴 실제 Ego 팀원 신청→self-attest403→팀장 로그인/승인→DB 확정 identity 연결을 검증했다. `REQUESTED` 이벤트1(actor member005), `ATTESTED` 이벤트2(actor leader004), current link user005. request ID `db989c27-fbf8-4768-bee1-02ae95a8b28d`. 증거 정본: `output/qa/task168/friendly-identity-proof.json`.
- 새 친선 claimable API/기존 신청 mutation/UI 및 승인함을 연결했다. pending 후보 제외·폐기 lineup 신규신청409를 보강했고 기존 cross-side guest-player 요청과 platform_ops 권한은 유지했다. 실제PG 기존 identity **7/7 PASS**(`/tmp/task168-friendly-identity-pg.log`, 동일 실행의 새fixture4fail은 다음 항목으로 해결), 신규 친선 **4/4 PASS**(Luna 실제 실행 확인). 최초 direct fixture CHECK 실패는 createdByUserId/placeName 필수값을 채워 수정했다. DB 제약을 끄지 않았다.
- 프론트 claim/attest/client **45/45 PASS**(`/tmp/task168-friendly-identity-web-complete.log`). 종료 경기+approved 상태 우선순위 수정 중 상대팀이 모집 중으로 바뀐 회귀를 실제 스크린샷에서 발견하여 수정했다. 최종 client39/page58 **97/97 PASS**(Luna 실행 확인), 세 폭 실제 화면에서 상대팀 이름·경기 종료·경기 전 안내 미노출 재확인.
- 디자인: 버튼44px/14px, primary 흰색 대비5.41:1. 최초 대비 변경이 취소 버튼에 잘못 적용된 것을 root가 computed style로 잡고 수정했다. 취소 neutral 유지, 선택/실행만 `--static-blue`. 최종 `mm-friendly-terminal-{390,768,1440}.png`, `mm-identity-final-modal-{390,768,1440}.png`를 root 직접 확인했다. 후자의 task168-7 선택은 시각 검증 전용이고 추가 신청하지 않았다. linked task168-5는 재조회 후보에서 제외됐다. 마지막 reload resource 오류0 및 필터된 Runtime/Log/Network 오류0. 전체 과거 여정 로그가 모두 수집됐다는 의미는 아니다.
- Sol 최종 production blocker0. 신원 연결 완료를 공개 동의·개인 공개 기록 반영까지 완료한 것으로 확대 집계하지 않는다. 남은 기본18개(M-L/M-A/M-V, L6, S6, A-T/A-L/A-M)와 Phase3 최종 schema retirement·committed-tree·dev merge·alpha는 미완이다. `dev f06d804af` 공유 미커밋 상태 유지.
- 정리: Ego282 `done:true`, API35238→46622 및 web31899/31903/31910 종료, 핸들29324/1134/76995 terminal143, 소유DBstop/3013·8121·55435 listener0/소유PID0, Node85(시작85), 세agent completed. scoped diff-check clean, proof JSON valid. 다른 세션 프로세스 종료 없음. 다음 작업은 남은 팀원 리그/시상/후기 중 실제 v1 계약을 먼저 확인해 이어간다.

## 2026-09-10 21:10 — 친선 경기 본인 기록 연결 구현 진행

- 친선 `GET /team-matches/:teamMatchId/claimable-participants`와 기존 Game identity 요청 API를 사용하는 UI wrapper를 구현했다. 참가팀 멤버이며 Game이 있는 matched/completed 경기에서만 진입점을 노출한다. 실제 Ego282에서 teamMember 로그인 hydrate→친선 상세→명단 모달200을 확인했다. 신청 저장은 서버 검증 보강 후 진행한다.
- Sol 사전 감사의 상대 side 신청 P1 판정은 **철회**했다. 기존 `game-participant-identity.integration-spec.ts`가 상대팀 user의 HOME 참가자 REQUEST→self-attest403→HOME owner 확인을 명시적으로 보장한다. 게스트 선수 복구 계약이므로 신규 side membership 제한은 넣지 않는다. 참가팀 활성 멤버/별도확인자/participant side owner-manager 및 platform_ops 기존 계약을 유지한다.
- 유효한 보완: 신규 신청은 공용 최신 lineup selector에 포함된 참가자인지 transaction 안에서 확인하고, 만료 전 REQUESTED 항목은 목록에서 제외한다. 역사 연결 관리·철회 경로는 바꾸지 않는다. 해당 실제PG 회귀와 UI 신청·재조회는 진행 중이다.
- UI 모달 증거: `output/ego/competition-full-goal-20260908/staff-ui/mm-identity-modal-{390,768,1440}.png`. 390/1440 직접 확인, 명단 버튼44px/14px. 신규 모달에는 이전 화면이 없고, 기존 상세 before는 `mm-friendly-destination.png`에 있다. 전체23/42 유지, dev/alpha 미완.

## 2026-09-10 20:55 — M-M 일정 연결 구현 및 실제 화면 검증

- 최종 strict owner 실제PG **1/1 PASS, 5skipped**. 이번 결과는 `output/qa/task168/member-schedule-link-proof.json`에 기록했다. 재검증용DB 다시stop/소유포트0/소유PID0/Node85(기준86), 세 에이전트 completed 확인. 전체23/42 유지.
- Sol 최종 P2(soft-deleted owner 링크404)를 고쳤다. 대회·리그 active owner를 필수로 확인하며, 실제PG6/6 PASS(`/tmp/task168-schedule-linked-match-pg-final3.log`)에 softdelete 및 list 응답 회귀를 추가했다. 웹 리그 fixture도 실제 API처럼 tournamentId=leagueId로 정정하고29/29 PASS(`/tmp/task168-schedule-link-web-tuple.log`). 최종 strict owner-null 제거 회귀는 `/tmp/task168-schedule-linked-match-active-owner.log`를 따른다. 최종 CTA 실측 대비는5.41:1이다.
- 다음 구현의 확인된 공백: 친선 경기 상세는 `gameId`와 participantMember를 갖지만 본인 출전/신원 연결 CTA 및 친선용 claimable-participants 조회 경로가 없다. 대회·리그의 기존 Game identity 요청 계약을 참고하여 친선 경기의 실제 member route와 연결해야 한다. 전체 개인 기록 화면으로 대체하면 해당 경기 참여 연결 계약을 증명하지 못한다.
- 런타임 정리: API93850→16746 및 web93884/93905/93911 종료, 핸들90795/3723/52825 terminal143. Ego281 목록에서 제거 확인, 전용DB stop, 8121/3013/55435 listener0, 소유PID 잔존0. 다른 세션 프로세스는 건드리지 않았다.
- 집계는 **23/42 유지**. M-M의 일정→친선/대회 경기 상세 이동과 운영 권한 차단은 실제 검증했으나, 본인 참여/식별 연결까지 아직 완료하지 않았다. dev merge/alpha/최종 schema DROP 미완.
- 일정 응답에 canonical Game/TeamMatch 소유권과 종목 유형을 검증한 `linkedMatch`를 추가했다. 친선·대회·리그 경로를 구별하며 deleted/malformed/non-MATCH는 링크를 노출하지 않는다. 기존 일정·RSVP·권한 계약을 유지했다.
- 실제 팀원 계정으로 `/my/schedule`→팀 일정→친선 경기 상세를 클릭하여 상대팀·시간·장소를 확인했다. 대회 일정 CTA도 실제 대회 경기 기록 페이지에 도달했다. 신청 승인 POST와 결과 제출 POST는 각각 **403 PERMISSION_DENIED**, **403 Actor scope is not permitted**로 차단됐다.
- Ego 390×844 / 768×1024 / 1440×1000 실제 캡처를 직접 확인했다. 처음 발견한 CTA 좌우 여백 부족·색 대비 문제를 수정하여 높이44px, 글자14px, 좌우16px, 배경 `--static-blue`(27,100,218)/흰색을 적용했다. 세 폭 모두 가로 overflow0. 키보드 focus-visible outline2px 확인. reload 자원 HTTP오류목록과 drainEvents는 빈 배열이었다(전체 여정 로그 수집 완료로 확대 해석하지 않는다).
- 전후 증거: `output/ego/competition-full-goal-20260908/staff-ui/mm-schedule-before-{390,768,1440}.png`, `mm-schedule-after-{390,768,1440}.png`, `mm-friendly-destination.png`.
- 검증: frontend 좁은4파일 **63/63 PASS**(`/tmp/task168-schedule-link-web-tests.log`), 실제 PostgreSQL 일정 연동 **6/6 PASS**(`/tmp/task168-schedule-linked-match-pg-final2.log`). 최초 PG 실패는 과거 고정일자 fixture를 실행시점 기준 미래일자로 정비하여 해결했다. scoped `git diff --check` clean. Sol 최종 리뷰는 후속 기록을 따른다.
- 전용 DB `teameet_task168_role_ui`는 `teameet_task168_cascade_guard`에서 복제했다. 원 DB와 다른 세션 프로세스는 보존한다. 런타임 소유 기록: `output/qa/task168/role-ui-runtime-20260910.json`.

## 2026-09-10 — runtime retirement 이번 변경 검증 및 정리

최종 상태: **전체23/42 유지**, 이번 backend 변경 검증 완료. dev `f06d804af` 미커밋; 전체Phase3/최종schema DROP/새Ego UI/devmerge/alpha 미완. 이번 범위를 전체완료로 집계하지 않는다.

- 최종 source creation+video 실제PG **5/5 PASS**, `/tmp/task168-retirement-final-source-video-pg.log`. 동일 Game/감사/멱등성 replay, legacy source 거부, 기존Game을UPDATE로dualbinding하려할때 정확한retirement55000거부 및 전체행동일, 타경기sameexternalURL등록/동일경기중복409/업로드공유참조보존/director revoke후create/delete거부. 처음의 duplicatePK create + broadreject는root가실제UPDATE+정확한error+전체행비교로강화했다. video최종실패1건은새thirdvideo를추가하고잔존2로기대한누락을3개정확한ID/URL보존assert로수정해해결했다.
- helper분리후 historical unsupported status **2/2 PASS**, `/tmp/task168-retirement-history-final-unit.log`. sourceType/runtime oldFK 의존을제거하고history검증유지. Sol 최종video source blocker0. 권한회수실제PG는명령전revoke이며동시revoke순서는FOR SHARE source리뷰증거와구분한다.
- 증거: `output/qa/task168/runtime-retirement-proof.json` (유효JSON확인). 전체행사본생성/최종migration적용새증거는이번에추가하지않았고직전13sealcheckpoint를사용했다.
- 정리: 이번모든Jest세션terminal, 실행용Jest DB clone0. 소유DB `teameet-task168-db` stop/55435 listener0. Node86/browser37로중간baseline86/37유지. 새API/Web/Ego없음. 세agent모두completed확인(추가interrupt대상없음), 타세션프로세스종료없음. `git diff --check` clean. 전용DB재개는다음실제검증시명시적start.
- 다음필수: 역사전환전용코드/Prisma legacy dependencies 최종retirement 및DB보존gate, 남은19개기본사용자흐름의실제API/Ego/화면크기·배치검증, committed-tree/devmerge/alpha. release는HTTP mutation drain→worker quiescence→guardedcutover→10010000/10020000→canonical app→재개순서이며, 봉인후oldwriter재개금지. `docs/api/domains/games.md`에명시했다.

- runtime용 canonical aggregate helper를 `src/games/game-source-aggregate.ts`로 분리하고 Games/historical-no-result 두 caller를 전환했다. sourceType은 TEAM_MATCH literal, payload에 old FK 필드 자체가 없다. 기존 migration shared factory를 삭제했으며 역사 importer의 legacy-link 검증은 유지한다. helper최종실제검증 진행중: canonical-source-creation suite가 봉인후 oldFixture INSERT를 시도한 setup drift를 정비 중이다.
- 영상 P1/P2 source 수정후 단위 tournament23/23 +league7/7 PASS (`/tmp/task168-retirement-video-access-unit.log`, `/tmp/task168-retirement-video-history-unit.log` 각각 다른suite실패 포함). league ForbiddenException import누락은 root수정. 실제PG추가 회귀에서 타경기sameURL 등록과 revoke거부 자체는 동작했으나 새 테스트가 sortOrder동률 데이터 순서와 권한code(PERMISSION_DENIED 대신 실제 STAFF_SCOPE_DENIED)를 잘못 기대하여실패; fixture/정확한code정비중. 최종PASS전완료로집계하지않는다. 동시revoke window는 transaction rowlock source리뷰와구분하며 신규PG테스트는 revoke-before-command다.

- 최종 malformed 회귀: resolver/source-create **7/7 PASS** (`/tmp/task168-retirement-malformed-final-pg.log`, escalation한건 fixture drift 실패와 별도), escalation **5/5 PASS** (`/tmp/task168-retirement-escalation-complete-pg.log`). 실제 malformed league-only Game/audit/idempotency rollback, malformed regular_league+Details handler거부/noqueue/nonotification, 직접seed한 escalation row도 platform list 제외·mutation404. 정상league fixture도 tournamentId=leagueId로 수정하여12시간알림 유지확인.
- Sol 추가 P1/P2로 영상 작업 재개: 권한 확인과 mutation transaction 사이 revoke race, 전역 URL 중복거부로 타경기 동일URL 재사용을 막는 회귀. HEAD는 경기내중복만거부하고 타경기공유허용이었다는 source비교 확인. Luna가 저장transaction내권한재검증·경기내중복만제한으로수정중. 앞 video PASS는 이 추가계약을 증명하지 않으며 최종완료 판정 전 새 실제회귀가 필요하다.

- 후속 최종통과: resolver6/6(`/tmp/task168-retirement-resolver-complete-pg.log`), canonical 영상 실제PG1/1(`/tmp/task168-retirement-canonical-video-final-pg.log`), generator unit48/48(`/tmp/task168-retirement-generator-complete-unit.log`), Games unit72/72(동일 실행 당시 generator5fail, `/tmp/task168-retirement-generator-games-reviewed-unit.log`). generator 실제PG1/1(`/tmp/task168-retirement-generator-complete-pg.log`): 두 조 생성, TeamMatch/Game UUID·기존 config pin 보존, 일정 변경·동일계획 replay, 다른조 불변, LIVE 변경거부. 최초 실패는 AdminActionLog를 OperationAudit에서 잘못 조회한 기대였고 실제 감사테이블로 수정했다. 두 조를 생성하고 전체경기를1로 기대한 fixture drift도2로 수정했다.
- Sol은 scheduled Game/감사/staff는 canonical in-place reconcile에서 보존하므로 허용이 맞다고 확인했다. VOID/non-SCHEDULED 변경은 차단하며 video/child/advancement 관계 보호 유지. 추가 P1: escalation 두 SQL이 competition kind를 확인하지 않아 malformed regular_league+leagueIdnull+Details를 대회로 분류했다. root가 competition JOIN과 대회 kind/정규리그 ID일치·kind 조건을 추가했고 실제PG 회귀 준비 중이다. Games malformed league-only source_create typed409와 전체 tx rollback 추가회귀도 준비 중이다.

- **23/42 유지**, dev `f06d804af` shared tree 미커밋. 사용자 메모리 압박 중 진행 승인에 따라 load 약4/12코어·swap6GB 상태에서 직렬 검증, Luna 구현2명/Sol 독립 리뷰를 재사용했다. 새 UI/Ego 실행·dev merge·alpha·최종 schema DROP은 하지 않았다.
- escalation SQL2곳, 결과 운영 resolver/review, field assignment, public records, bracket query/service의 old fixture 조회·FK 의존을 제거했다. canonical graph 검증·권한·CAS·transactional audit는 유지한다. legacy-only migration409 lookup은 최종 전환 release에서 제거되며, canonical missing field404/bracket404 계약을 문서화했다. 이 runtime은 fullcutover+10020000 없이 배포하면 안 된다.
- Luna는 Games/creation/admin/generator와 video/cleanup runtime을 전환했다. generator는 동일 canonical 좌표의 TeamMatch ID를 보존하는 reconcile이며 관련 과거 physical-delete 설명을 정정했다. 구형 fixture table을 참조하는 마이그레이션 코드와 공유 aggregate factory가 아직 남아 있어 최종 DROP 준비 완료는 아니다.
- 실제 PG operations4 suites 최초 **12pass/5fail** (`/tmp/task168-retirement-operations-final-pg.log`). resolver fixture의 과거 league-only scope가 canonical audit composite FK와 충돌했다. fixture를 tournamentId=leagueId로 고쳤고 production audit도 잘못된 league graph는 typed409로 거부하도록 보강했다. 추가 soft-delete/no-audit 회귀의 잘못된 필드명(targetId→resourceId)을 수정했다. 이후 resolver 테스트6건 자체는 통과했으나 teardown이 append-only audit가 보존하는 TeamMatch를 삭제해 실패하여, 기존 isolated environment의 suite clone DROP으로 정리를 통일했다. 최종 재실행 진행 중.
- root 단위 초기실패 중 field CAS fake와 Games TS2367, tournament sharedURL reference fake를 수정한 후 **4 suites148pass** (`/tmp/task168-retirement-runtime-wave-final-unit.log`), leaguevideo만 실패였음. 해당 video fake의 lock2회 및 durable outbox SQL/URL binding으로 계약을 검증하여 최종 **7/7 PASS** (`/tmp/task168-retirement-league-video-final-unit.log`). 실제 outbox/storage cleanup **5/5 PASS**, resolver6건을 합친11pass (`/tmp/task168-retirement-resolver-video-pg.log`); canonical video suite는 봉인후 legacy setup INSERT/DELETE55000으로 실패하여 fixture 전환 중.
- generator unit은 canonical harness 전환 후48건 중 **36pass/12fail**, `/tmp/task168-retirement-generator-final-unit.log`. player roster query fake 누락 및 reconcile 기대 불일치를 Luna가 수정 중이며 성공으로 집계하지 않는다. admin unit은 앞 실행에서 PASS. Sol 최종 리뷰는 대기 중. 전체 통합/E2E 완료와 구분한다.


## 2026-09-10 19:48 — canonical 결과·알림 전환과 FK cascade 봉인 수정

정리: 모든 테스트 세션 terminal, 실행용 Jest clone0(5개 checkpoint template만 유지), 소유 DB stop. 새 API/Web/Ego 세션을 만들지 않았다. 세 agent 모두 completed이며 최신 Sol verdict blocker0. 전체 목표는 완료로 표시하지 않았다.

- 이전 턴은 역사 enum/DB guard 구현·검증 progress였고 이번 턴도 production 의존 제거와 실제 PG 회귀 수정으로 progress다. **23/42 유지**, dev `f06d804af` 미커밋. 실제 UI를 새로 검증하지 않았으며 dev/alpha/최종 schema DROP은 미완이다.
- shared official/VOID 결과 SELECT·raw type·normalizer에서 구형 `tournament_fixture_id`를 제거했다. source type/TeamMatch/Details/league 소유 검증은 유지한다. legacy binding 유입은10020000 DB 제약·seal이 책임지므로 worker 배포와 해당 migration 순서를 분리하면 안 된다. 대회 완료 알림의 legacy fallback을 제거하고 canonical Details만 사용한다. route와 `tournament-fixture-completed:<TeamMatch UUID>:<user UUID>` key, 활성 owner/manager·activityEnabled·transactional rows·afterCommit push 계약은 유지했다.
- Sol이 malformed `regular_league + Details + leagueId null`이 대회 알림으로 분류되는 P1을 지적했다. `TOURNAMENT_KINDS`로 조회하고 대상이 없으면 throw하도록 수정, 실제 DB malformed graph+recipient 회귀에서 알림 미저장 확인. 이름 없는 대회 fallback도 제거했다. 최종 좁은 source review blocker0(리뷰어는 테스트를 재실행하지 않음).
- unit6 suites **36/36 PASS**, `/tmp/task168-canonical-projection-field-final-unit.log`(종류 narrowing 전; 최종 종류 검증은 실제 PG). 최종 실제 PG 공식 결과/캐시/lineage/알림 **6/6 PASS**, `/tmp/task168-canonical-notification-kind-final-pg.log`: production SELECT/normalizer/projector, 잘못된 캐시/소유권 거부, 실제 notification tx rollback, active membership 중복 제거·수신거부, 동일 revision replay와 실제 새 OFFICIAL correction 후 중복 알림 없음, 일반 리그·친선에 대회 알림 없음.
- 실제 canonical 진출 테스트에서 기존 statement seal의 부작용 발견: 참가 등록 DELETE의 FK SET NULL 내부 UPDATE는 legacy 행0이어도 statement trigger를 호출하여 정상 canonical 정리를55000으로 막았다. 테스트만 우회하지 않고 `tournament-legacy-write-seal.ts`와10020000을 함께 수정했다. **nested UPDATE/DELETE statement만** 행 검사까지 진행시키며, 추가5개 ALWAYS BEFORE UPDATE/DELETE row trigger(tgtype27)가 실제 legacy 변경을 차단한다. direct statement20개·INSERT/TRUNCATE·legacy ingress4개 차단은 유지한다. FK가 실제 legacy 행을 바꾸면 부모 DELETE까지 rollback되고, 관계없는 부모 삭제는 가능하다.
- 최신 canonical migration 적용 exit0, catalog **3×23 ingress +5×62 statement +5×27 row**, 모두 ALWAYS·정확한 함수 OID. 실제 진출7/7(`/tmp/task168-canonical-cascade-final-pg.log`, source5를 합치면 당시12/12), seal/rollback/replay/실제FK변경거부/무관부모삭제 **3/3 PASS**(`/tmp/task168-legacy-cascade-seal-final-pg.log`). 진출 fixture의 retired backfill 호출은 canonical preset seed로 정비했다. 최초 backfill차단7fail, 이후 cascade부작용6fail은 이 최종 pass로 해결됐다.
- 최신10020000을 원래 projection에서 새로 복제한 `teameet_task168_cascade_guard`에 적용했다. Game12/fact7/audit51 전체 행 hash 원본 일치. 최신 근거는 `output/qa/task168/canonical-projection-cascade-proof.json`; 이전 `canonical-guard-migration-proof.json`의 seal8개 증거를 현재13개 구조의 최종 증거로 오인하지 않는다. active 최종 테스트 template은 `ulw_v1_integration_task168_canonical_cascade`; `...canonical_final`은 row-cascade 보완 전 checkpoint다.
- 일부 검색 명령의 rg exit1은 매치0, lsof exit1은 listener0이며 제품 실패와 구분한다. 자동 훅의 반복 실패 경고에 대해 실제 test 실패 원인·수정·재실행을 위에 기록했다. 이번 touched source marker0 및 `git diff --check` 통과. `docs/api/domains/games.md` 계약 단락 sync.
- 다음: 아직 `src/game-operations/result-escalation-access.service.ts:204`와 jobs result-escalation 등 다른 runtime 파일에 old FK 의존이 남는다. 공유 트리 변경을 재확인하고 제거를 이어갈 것. 모든 의존/미완 outbox/역사보존 gate 뒤 최종 schema retirement, 남은 사용자19흐름, dev/alpha 검증까지 전체 목표는 계속 active.

## 2026-09-10 19:31 — 역사 출처 타입 분리와 canonical DB guard 봉인

정리: 모든 test/CLI handle terminal, 실행용 Jest clone0(4 checkpoint template만 유지), 소유 DB stop 및55435 listener0 확인. 이번 단계 새 API/Web/Ego 없음. Node93/browser41로 시작85/22보다 늘었지만 본 작업 test/CLI 잔존0이며 타세션 소유 프로세스는 종료하지 않았다. 19:13 이후 증가 Node는 공유 Codex parent78254 아래 plugin/runtime 트리(81378/81383/81384/81387/81388/81872/83632)이며 이 작업 단독 소유를 확정할 수 없어 미회수로 기록한다; 추가 fan-out을 시작하지 않았다. 세 에이전트 모두 completed. 최종 Sol test delta는 계약 약화/blocker0; 유일 fixture fidelity 경고(양수 점수·goalEvents빈배열)는 `missingScorer: score.homeScore + score.awayScore > 0`로 정정했다. 이 마지막 메타데이터 한 줄은 source 확인이며 위 PASS 숫자는 정정 직전 실행 결과다. 새 migration들은 복제 DB에서 수동 DDL 적용한 증거로, 실제 deploy migration ledger/commit-tree 검증과 구분한다.

- 사용자 승인에 따라 swap 약6.2GB 압박에서도 직렬·최소 worker로 진행했다. 사용자 흐름은 **기본11/30 + 경계12/12 = 23/42 유지**. dev `f06d804af` shared tree 미커밋이며 push/alpha/최종 schema DROP/전체 E2E 완료를 뜻하지 않는다.
- 공식 fact의 역사 출처를 `V1GameOfficialFactSourceType` enum으로 분리했다. 운영 enum은 아직 유지한다. `10010000`은 fact UPDATE 없이 컬럼 타입만 바꾸며 production projector/raw fixture cast를 동기화했다. Sol이 찾은 부분 적용 위험은 migration 내부 BEGIN/COMMIT·5초 lock timeout으로 해결했다. 실제 legacy TOURNAMENT_FIXTURE fact1의 전체 행 보존·정상 replay·잘못된 출처 거부·UPDATE 거부를 검증했다. 실제 runtime 복제본6 facts에서도 중간 ALTER 뒤 고의 예외 시 타입/행 전체 rollback, 정상 적용 뒤 행 hash 보존을 확인했다. `output/qa/task168/official-fact-history-preservation.json`, `official-fact-history-atomic-proof.json`.
- `10020000`은 fact/cache/staff/config/lineage/reparent/audit guard를 canonical Game→TeamMatch→Details/league/friendly 기준으로 전환한다. legacy 테이블을 runtime guard가 읽지 않는다. Game/audit/staff/legacy5 순서로 잠그고 legacy 연결0을 확인한다. 기존 fixture가 있으면 정확한5+3 seal의 함수 OID·trigger형태62/23·ALWAYS 상태가 선행되어야 한다. 빈 DB에도 같은5+3 seal을 설치한다. 초기 friendly 거부, 함수 OID 검증 누락, no-Game fixture의 미봉인 통과, 빈 DB 재유입 가능성을 source/적대 검수에서 발견하고 수정했다. 최종 Sol migration delta blocker0.
- 실제 PG: 미봉인 fixture1/Game0은 거부, 같은 이름·형태의 trigger를 다른 함수에 연결한 clone은 write seal4/5로 거부, 양쪽 신규 constraint0으로 rollback 확인. 최종 빈 DB는 legacy5×INSERT/UPDATE/DELETE/TRUNCATE **20/20 SQLSTATE55000**. 원래 봉인된 projection을 복제해 두 최종 migration 적용 exit0; Game12/fact7/audit51의 ordered whole-row hash가 원본과 같다. 근거 `output/qa/task168/canonical-guard-migration-proof.json`.
- 최종 canonical template의 실제 production facts/cache projection 및 forged tournament/hash/current-pointer rollback, lineage wrong-revision 거부·append-only·Game reparent 차단 **4/4 PASS**, `/tmp/task168-canonical-source-lineage-final-pg.log`. staff scope **3/3 PASS**는 최종 seal migration을 적용한 `/tmp/task168-canonical-final-pg.log`의 통과 suite다. 같은 실행의 config와 역사 lineage 실패를 통과로 합산하지 않는다.
- config fixture를 canonical TeamMatch/Details/Game/OFFICIAL revision만 생성하도록 정비했다. 구형 backfill 호출과 Fixture/Result 생성 제거, 실제 SYSTEM actor·currentOfficial pointer 설정, preview의 expectedVersion으로 confirmation 요청. 순위 기대점수는 유지했다. 최초 TS union narrowing 실패, SYSTEM actor 누락, legacy-only fixture의0점, stale confirmation을 수정 후 **12 PASS/2 기존 SKIP**, `/tmp/task168-canonical-config-sealed-pg.log`.
- 역사 lineage capture 테스트는 구형 Fixture/Result/Goal을 생성·변조해야 하므로 최종 봉인 DB에 실행하면 실패하는 것이 맞다. 봉인을 약화하지 않고 history checkpoint template에서 **2/2 PASS**(`/tmp/task168-history-fixture-consumers-final-pg.log`). 함께 실행한 repoint의 오래된 scheduledFixture 갱신 기대는 역사 보존 계약으로 정비; canonical 활성 TeamMatch 갱신 단언 유지, 최종 **5/5 PASS**(`/tmp/task168-history-config-repoint-final-pg.log`). history enum/backfill 최초 **3/3 PASS**(`/tmp/task168-historical-fact-enum-pg.log`)도 별도 checkpoint 증거다.
- 검증 중 도구 실패도 기록: tsx 미설치→ts-node 실행 시 루트 tsconfig 자동선택 오류→`--project tsconfig.json` 명시 후 bounded seed 성공. 존재하지 않는 setup 파일 탐색은 실제 `test/helpers/isolated-integration-environment.cjs` 확인으로 수정. 고의 SQL 거부 exit3은 negative 검증이며 자동 훅의 반복 경고와 실제 최종 test exit0을 구분한다. touched marker0, `git diff --check` 통과.
- **남은 Phase3**: active production의 구형 enum/FK/select/video cleanup/migration helper 의존 제거, 미처리 관련 outbox0, 모든 역사 lineage/edge/video 검증 뒤 old5 tables와 관계/컬럼/operational enum 최종 DROP. 최종 DDL에서 기존 `v1_games_source_expand_ck`를 제거할 경우 TEAM_MATCH·team_match_id nonnull 불변식 반드시 승계. 전체 CI는 historical migration tests에 pre-contract checkpoint를 제공해야 하며 모든 test를 최신 봉인 schema에 일괄 실행해서는 안 된다. 최종 Prisma DROP·새 설치 전체 migration chain·commit-tree/CI·dev/alpha 검증은 아직 미완.

## 2026-09-10 19:00 — Phase3 구형 쓰기 봉인·동시성·타입 의존 제거

최종 후속: 조회 서비스 **45/45 PASS**, `/tmp/task168-canonical-read-service-final-unit.log`. 최초37/45의 실패는 테스트 canonical Game의 visibility/source 기본값 누락 등 fixture drift로 수정했으며 production fallback을 복구하지 않았다. 모든 테스트/CLI handle terminal 확인, Jest 임시 clone0(템플릿만 남음), 소유 DB stop 완료. 새 API/Web/Ego를 만들지 않았다. Node85/browser24(시작85/23), 본 작업 test/CLI 프로세스0, 에이전트 결과 수신 완료. touched migration marker0 및 `git diff --check` 통과. 세션 전체 메모리 압박은 남아 있고 다른 세션 프로세스는 종료하지 않았다.

- 이전 턴은 G-R 실제 검증으로 progress였고, 이번 턴은 Phase3 production source/DB 전환 보강이다. 사용자 흐름은 **23/42 유지**. dev `f06d804af` shared tree 미커밋이며 schema DROP·dev 반영/alpha는 미완이다.
- 상세 query/presenter/통합순위의 구형 Prisma Fixture/Result 타입 의존과 테스트 전용 production `fixtures` slot을 제거했다. public 응답 `fixtures[]` 계약은 canonical Details/TeamMatch/Game으로 계속 구성한다. 테스트만 통과시키는 compatibility slot은 남기지 않았다. presenter **38/38 PASS**, `/tmp/task168-canonical-presenter-retirement-final-unit.log`. 최초 test-local type 누락 3건 수정 후 통과했다.
- 상세와 통합순위 canonical 조회에 `teamMatch.deletedAt:null`을 추가했다. 삭제된 경기의 재노출·집계 포함을 차단한다. 실제 PostgreSQL **1/1 PASS**, `/tmp/task168-canonical-detail-filter-pg.log`: 두 canonical Game은 모두 보존되며 삭제 표시한 TeamMatch만 실제 production include에서 제외된다.
- full-cutover는 첫 SELECT 전에 **Game EXCLUSIVE → audit → staff → legacy5 table** 순서로 잠근다. 이전 Serializable 스냅샷을 먼저 만들고 나중에 잠그는 방식은 대기 중 commit된 행을 놓칠 수 있어 제거했다. Game SHARE ROW EXCLUSIVE는 SELECT FOR UPDATE의 ROW SHARE를 기다리지 못함을 실제 테스트에서 발견해 EXCLUSIVE로 강화했다.
- 같은 cutover transaction의 audit seal 뒤에 legacy5(Fixture/Result/Goal/Video/AdvancementEdge) INSERT/UPDATE/DELETE/TRUNCATE를 ALWAYS statement trigger로 봉인한다. Game의 legacy source/FK, staff/audit의 fixture_id 재유입도 ALWAYS row trigger로 차단한다. `legacyWritesSealed:true`를 보고한다. 이 봉인은 최종 schema retirement와 다르며 구형 테이블 읽기·역사 검증은 유지한다.
- actual PG seal+full-cutover **7/7 PASS** (`/tmp/task168-retirement-seal-final-pg.log`). DML/TRUNCATE20회와 ingress4회 SQLSTATE55000, 봉인 트랜잭션 실패 시 trigger 롤백, 재실행, canonical 쓰기, 지연 writer의 대진 수정·신규 영상 보존을 검증했다. 첫 실행5/7의 실패는 Game 잠금 강도 및 test TeamMatch의 필수 tournament 연결 누락이었고 각각 수정했다.
- 진출 edge는 legacy ID·tournament·source/outcome·target/side·createdAt을 exact 비교한다. backfill 기존 edge와 post-copy, 이미 canonical이라 backfill을 건너뛰는 full-cutover에서도 검사한다. 신규 canonical-only edge는 기존 역사 집합 밖이면 허용한다. Unit **9/9 PASS** (`/tmp/task168-advancement-preservation-final-unit.log`); 기존 unbounded 호출 가드가 DB transaction 접근보다 늦던 결함도 범위 검증을 먼저 실행하도록 수정했다. 실제 PG full-cutover **6/6 PASS** (`/tmp/task168-retirement-edge-final-pg.log`), 이미 canonical edge의 timestamp drift는 봉인 전 거부하고 수정 후 원 ID/시각을 보존한다.
- 실제 `teameet_task168_projection` clone에 guarded CLI 적용 및 재실행 exit0. 기존 fixture2/details2/canonicalGame2, legacy Game·staff·audit 연결0. `output/qa/task168/legacy-write-seal-runtime.json`, `legacy-write-seal-runtime-repeat.json`. 재실행 전후 Game/audit/official-fact/lineage hash 동일: `legacy-write-seal-repeat-hashes.json`(이 clone의 lineage 집합은 비어 있으므로 populated lineage 증명은 별도 full-cutover PG에 의존한다). 원 runtime DB에는 이번 명령을 실행하지 않았다.
- Sol 최종 source blocker0. 최종 DROP 전에 남은 항목: immutable official fact의 legacy source literal을 보존하는 historical 타입 분리/zero proof, fixture 의존 DB guard6개(official fact/cache, staff, used-config, lineage insert/reparent) canonical 재작성, legacy 관련 미완료 outbox0, live delegate/FK/source 참조 및 migration 전용 소스 retirement, Prisma/DDL child→parent RESTRICT 제거. 후기 business discriminator `tournament_fixture`는 별개 계약으로 보존한다.
- 이번 추가 소유: `tournament-legacy-write-seal.ts`, `tournament-advancement-preservation.ts`, 기존 full-cutover/backfill 및 해당 tests, canonical detail-filter PG test, tournaments read query/service/presenter 및 tests. UI 소스는 이번 턴에 수정하지 않았다.

## 2026-09-10 18:41 — G-R 로컬 완료, 23/42

- **기본11/30 + 경계12/12 = 23/42**. G-R 익명 상세→일정→정정0:1 경기 기록 및 확정 전 기록까지 실제 Ego 클릭으로 확인했다. HIDDEN 상세404/목록 제외, OFFICIAL_ONLY 점수null/events없음, 동의 철회 프로필 연결과 개인 public records 차단, 세 화면 폭 시각 증거는 아래 18:40 기록을 따른다.
- 비로그인 bracket의 회원 전용 my-fixtures401을 `hasStoredV1Session()` 기반 enabled gate로 수정했다. 공개 schedule/player-records 조회는 유지한다. 신규 소유 파일: `apps/v1_web/src/app/tournaments/[id]/bracket/bracket-page-client.tsx`, `bracket-schedule-permissions.test.tsx`. 익명 false와 로그인 hint hydrate 후 true 회귀 **3/3 PASS**, `/tmp/task168-gr-bracket-auth-final-unit.log`. Sol production blocker0. 로그인 힌트는 서버 권한 검증을 대체하지 않는다.
- 실제 최종 브라우저에서 session/userId/userEmail 힌트 없음, my-fixtures 요청0, 공개 detail/schedule/player-records200, console error/warn/unhandled0, 실패 요청0, client-error 전송0. `output/qa/task168/gr-bracket-network-final.json`. 이어 실제 정정 경기 카드 클릭→정정0:1 표시, console/network 오류0: `output/qa/task168/gr-corrected-click-final.json`.
- 정리: Ego266 닫힘을 후속 list에서 확인했다. 소유 API12210, Web69008/69009/69015 TERM 후 ps에서 모두 없음. `teameet-task168-db` stopped/exited, Jest clone0(템플릿 DB만 존재). Node85/browser20로 시작 node86/browser18 부근이며 브라우저 증감은 별도 사용자 task268 등이 있어 강제 종료하지 않았다. swap 약6.28GB는 남아 있으므로 호스트 압박 전체 해소를 주장하지 않는다. 테스트 프로세스90549 exit0, 다른 세션 프로세스는 건드리지 않았다.
- 다음 재개: 남은 기본19개 사용자 흐름과 Phase3 구형 모델/참조 제거를 계속한다. `teameet_task168_projection` clone DB 상태는 보존했다. 현재 dev shared tree 미커밋 작업이며 dev 머지/push·alpha 검증 및 전체 완료를 주장하지 않는다.

## 2026-09-10 18:40 — G-R 공개 계약·시각 검증 보강, 네트워크 후속 확인 중

- 집계는 **22/42(기본10/30·경계12/12)** 유지한다. 공개 일정→기록 실제 클릭과 시각 검증은 통과했으나 비로그인 bracket의 회원 전용 `my-fixtures` 호출401을 발견하여 수정 중이다. auth/me401은 비로그인 상태 확인과 구분한다. dev 머지·alpha 및 Phase3 최종 구형 스키마 제거는 미완이다.
- 공개 대회 aggregate가 HIDDEN 경기와 동의 철회 사용자의 goal user UUID를 노출하던 문제를 수정했다. canonical Game policy를 조회하고 HIDDEN/정책 누락 경기는 공개 fixture에서 제외하며 STATUS_ONLY/OFFICIAL_ONLY 점수 계약을 적용한다. 공개 presenter의 `playerUserId`는 staff 요청에서도 null이다. 관리자 별도 bracket 계약은 유지한다. 실제 익명 응답3경기·staff 응답4경기, 모든 goal UUID null을 확인했다. `output/qa/task168/gr-aggregate-privacy-final-roles.json`. Sol 최종 blocker0, presenter unit **38/38 PASS** (`/tmp/task168-gr-aggregate-presenter-verified-unit.log`).
- 실제 clone DB의 두 지정 경기 정책만 OFFICIAL_ONLY/HIDDEN으로 준비했다. HTTP 운영 액션이 아닌 격리 QA fixture 준비임을 명시한다. `scripts/qa/task168-seed-public-record-policies.ts`, `output/qa/task168/gr-policy-fixture.json`. 실제 API에서 OFFICIAL_ONLY pending 점수null/events없음, HIDDEN 상세404, 동의 철회 개인 public-records items없음/summary0 확인. 활동명·participantId와 개인정보 프로필 연결의 공개 계약은 다르며 활동명까지 모두 숨겼다고 주장하지 않는다.
- open 대회 일정 진입과 league-format 경기 카드 링크를 보완했다. 모바일 기본 정보 바로 아래, desktop 신청 영역에 동일 일정 버튼을 배치했다. 초안의 중복 일정 버튼은 제거했으며 진행/종료 대회의 기존 CTA는 유지한다. 390/768/1440px 각각 모든 visible bracket href **1개**, 버튼높이 **50px**, 글씨 **16px**, 흰 배경/본문색 대비 약16.56:1, 가로 넘침0, HIDDEN fixture 링크없음. `output/qa/task168/gr-entry-verified-metrics.json` 및 `output/ego/competition-full-goal-20260908/staff-ui/gr-entry-verified-{390,768,1440}.png`를 직접 보았다. `gr-entry-final-*`은 중복이 남았던 중간 산출물이므로 최종 증거로 쓰지 않는다.
- OFFICIAL_ONLY 대기 기록에 공개 시점 안내를 14px로 표시했다. Ego266에서 실제 일정 버튼→bracket→pending 경기 클릭, `- : -`와 안내 확인. `gr-pending-verified-{390,768,1440}.png` 모두 직접 확인했고 넘침0. 정정0:1/골/이력은 `gr-record-final-{390,768,1440}.png`로 확인했다. UI 테스트는 detail69/69·CTA19/19, 별도 guidance23/23 통과. combined110/111의 남은 실패는 LIVE 테스트의 잘못된 official_only fixture를 수정한 뒤 narrow23/23으로 확인했다.
- 이번 후속 소유 파일은 기존 Task168 범위의 tournament detail client/tests/CTA tests, public-game-records match-detail-content/tests, tournament match metadata, public tournament read queries/presenter/tests, QA policy fixture script 및 본 task/API domain 문서다. 타 세션의 public-records 문서는 수정하지 않는다.

## 2026-09-10 — Phase3 시드·삭제 상태 보정, G-R 진입 수정 중

- G-R Ego266 비로그인(auth/me401·local user/session없음) 목록→대회947942e0 상세를 실제 클릭했다. 일정 API200·bracketPublishedtrue, corrected match ad8e46d3 상세API200·0:1/골이벤트1/lineup비공개, player-records200. `output/qa/task168/gr-guest-api-before.json`. desktop 일정 카드는 일반div로 기록 진입이 없고, mobile open 상세에는 일정 진입이 없어 실제 흐름이 끊긴다. `gr-before-{390,768,1440}.png` 직접확인. 현재 formatleague인 일반 대회가 LeagueSections 분기를 사용하는 점까지 반영해 카드링크·published mobile 진입을 수정 중이다. G-R은 미완이며22/42 유지.
- soft-delete 후속: bracket unit **59/59 PASS** (`/tmp/task168-canonical-softdelete-bracket-final-unit.log`), fields 실제 PostgreSQL **4/4 PASS** (`/tmp/task168-canonical-softdelete-fields-final-pg.log`). 사전 deletedAt404와 Game→TeamMatch 잠금 후 재확인, fields CAS deletedAt:null, 삭제 상태에서 mutation/audit 없음 검증. Sol 기능 blocker0; unused 사전 select는 실제404에 사용하도록 정리한 뒤 fields PG4/4를 재확인했다. 최초 bracket3실패는 기존 raw-lock fixture 행에 deletedAt:null이 없던 문제였으며 잠금 이후 삭제 race 테스트도 추가했다.
- 최종 unit **27/27 PASS**, exit0 (`/tmp/task168-canonical-mockseed-final-unit-typed.log`). 감사 주체 assertion 보강 때 기존 `user as never`가 TS2339를 일으켜 실제 V1AuthUser로 교정했다. PostgreSQL2/2 및 Sol 최종 지정 성공 경로 blocker0. bulk 생성은 초기 aggregate commit 뒤 명령을 순차 실행하는 기존 부분 실패 특성이 남아 있으며 atomic bulk 완료로 보고하지 않는다.
- 다음 소유 범위: Luna 구현1은 bracket service/spec 및 tournament-match-update helper의 soft-deleted canonical 수정·삭제404와 lock 후 재확인, Luna 구현2는 fields service 및 canonical-field-assignment 실제 PG suite의 assign/clear404와 lock/CAS 재확인을 담당한다. 기존 Task168 변경과 legacy migration guard는 보존한다. root는 직렬 검증과 Sol 결과 종합을 담당한다. 성공 기준은 삭제된 경기의 변경·감사 부작용0 및 기존 active/malformed 계약 보존이다.
- 후속 실증: idempotency header/body를 명령별 동일 UUID로 전달하고 실제 USER/platform_ops 생성 actor로 수정한 후 PostgreSQL **2/2 PASS**, exit0 (`/tmp/task168-canonical-mockseed-pg-third.log`). 자체 풋살/config/8팀 fixture에서 league 4팀→6경기, knockout 8팀→4경기/비동점 OFFICIAL/참가자 identity/후기 대상/legacy fixture0을 확인했다. 순위 worker 및 관리자 화면 E2E·alpha까지 완료했다는 의미는 아니다.
- 진행 수는 **22/42(기본10/30·경계12/12)** 유지. 메모리 압박 중 진행 지시를 적용해 병렬 분석/수정, 직렬 테스트로 진행했다. load 약5/12코어, swap 약5.6GB이며 타 세션 프로세스는 종료하지 않았다.
- mock seed의 신규 legacy Fixture/Result 쓰기 및 backfill 호출을 canonical TeamMatch/Details/Game 생성과 실제 start→GOAL→end→officialize 호출로 전환 중이다. 기존 관리자 권한·테스트 계정 제한·DTO 옵션은 보존한다.
- 최초 unit의 import/변수/fixture drift를 수정한 뒤 26/26, takeover 최신 version 및 8팀 토너먼트 비동점 회귀 보강 후 **27/27 PASS** (`/tmp/task168-canonical-mockseed-reviewed-unit.log`). 이는 이후 idempotency/audit 수정 전 결과다.
- 실제 PostgreSQL 신규 suite 첫 실행은 schema-only template에 종목이 있다는 fixture 가정으로 준비 단계 실패했다. 자체 종목/config/team 생성으로 수정한 두 번째 실행에서는 league/open의 canonical 6경기·legacy0 검증이 통과했다. 완료 경기 경로는 production 명령의 header/body idempotency key 일치 계약 위반으로 실패했고, 실제 서비스 호출부와 unit contract를 수정 중이다. 실패를 완료로 집계하지 않는다.
- Sol: legacy fixture table은 audit seal만으로 영구 잠기지 않는다. bracket/field/generator의 migration-required guard 제거는 최종 DROP release까지 유보한다. canonical mutation의 soft-deleted TeamMatch 404 검증, generator legacy unit harness 전환도 최종 retirement에 포함한다. mock seed의 SYSTEM/GAME_BACKFILL 감사 주체는 실제 USER/platform_ops로 보정한다.
- API19259/Web19340·19292·19291은 G-L 검증 후 TERM 및 exit143, Ego264 done:true 확인. 현재는 전용 DB와 직렬 테스트만 사용한다. dev 머지·alpha·최종 schema DROP은 미완이다.

## 2026-09-10 17:34 — G-L 로컬 완료, 22/42

- **기본10/30 + 경계12/12 = 22/42**. 원 runtime을 backend0 상태에서 `teameet_task168_projection`으로 복제했다. 이 복제 DB에서 production `V1GameOperationsWorkerService.processOne`을 실제 실행하여 target 공식 결과 projection을 완료했다. 원본 DB는 보존했다.
- 실제 전체 clone queue claim8회 후 대상 SUBMITTED/OFFICIAL event 각 COMPLETED/attempts1, current revision1275e3e1-daef-4eb6-bdf8-937c14c5db58 OFFICIAL0:0, officialFact1/teamFact2. `cloned-projection.json` 최초증거, current revision/event/score/teamfacts를 명시 assert하도록 강화 후 `cloned-projection-repeat.json` 재실행0claim/exit0. 8은 대상 경기만8건 처리했다는 뜻이 아니다.
- 원본 `teameet_task168_runtime` outbox24 hash c5d278a303480dce03e1b14de6f06bb5, officialFact6 hash69690bd50d5c4740119746fb7f158339가 전후 동일. 직접 fact 생성/수동 COMPLETED/원본 타Game 처리 없이 복제본의 실제 worker 효과를 확인했다.
- 실제 공개API `/tournaments/230/standings/overall`200: 양팀 draws1/points1, played1/remaining0/percent100 (`gl-overall-api.json`). Ego264 목록→종료상세(2부·3시즌)→리그순위 링크→일정탭 종료0:0→순위탭 두팀0-1-0/1점, 새로고침 후에도 유지. 준비/진행/종료 목록과 이전 부·시즌/상태 검증을 결합하여 G-L 완료.
- Persona 보정: 최초Ego264는 이전 staff007 인증을 상속했다. API logout만으로는 local userId/session/query cache가 남아 있었으므로, 이 taskspace의 인증·조회 cache만 제거했다(경기큐는 보존). 최종은 auth/me401 + userId/session없음을 확인한 뒤 목록부터 다시 클릭했다. 최종 비로그인 증거는 `gl-guest-browser-evidence.json`, screenshots `staff-ui/gl-guest-final-{390,768,1440}.png`이며 세장 직접확인/overflow0. 앞선 gl-populated 스크린샷은 staff 문맥으로 구분한다.
- 시각 보정: 대회 공용 하단 다음 링크 `TournamentFlowNav`의 enabled 배경을 기존 static-blue로 바꿔 흰색14px 글자대비5.41:1 확보. 실제 높이44px, 세폭에서 배치/정렬/줄바꿈 확인. disabled/링크/상태계약은 변경하지 않았다. 색상 한줄 변경은 실제Ego 검증으로 확인했으며 반복unit을 추가하지 않았다.
- 최초 reload 직후 탭조회실패는 dev hydration 시점의 자동화 오류였다. 이후 실제 snapshot에서 탭 존재를 확인한 뒤 클릭하여 통과. reload 관측 exception0/http>=400없음/loadingFailure0은 auth/me401 의도된 비로그인 확인과 구분한다.
- 병렬 Phase3 후속: alpha admin mock seed가 새 legacy fixture/result를 만드는 active write 경로가 발견되어 canonical 생성으로 전환 중. schema/type/projection/영상/CLI retirement 및 나머지20기본 흐름, dev 반영·alpha는 미완이다. dev f06d804af 미커밋.

## 2026-09-10 17:04 — G-L 배치 수정·개인 기록 canonical 전환, 21/42 유지

- 종료 검수: Sol이 seed worker 사전조회/claim race P1을 확인했고, Luna가 worker import/자동처리를 삭제했다. root는 최종 `assertOfficialProjectionCompleted`의 exact event 확인+명시 PENDING 오류 소스를 직접 확인했다. 이 마지막 삭제는 DB를 다시 기동해 재실행하지 않았으며, 이전 official0:0/재사용/대기열 실패 증거와 구분한다. 세 에이전트 상태 모두 completed, 추가 running/idle 회수 대상 없음. 다음 G-L은 handler-only fixture projection과 실제 worker E2E를 혼동하지 말고, worker E2E는 대상만 due인 격리 DB에서 별도로 검증한다.

- 최종 안전 보정: seed의 선두 조회→`processOne()`은 같은 job을 원자적으로 claim하지 않으며 worker는 만료된 PROCESSING도 먼저 처리하므로, 실제 큐 선두가 일치하더라도 타Game 보존을 보장하지 못한다. 이 자동 처리 루프/import는 삭제하고 대상 공식 outbox가 COMPLETED일 때만 통과, 나머지는 `OFFICIAL_PROJECTION_PENDING`으로 명시 중단한다. 실제 실행 당시에는 선두 불일치에서 종료되어 processOne을 호출하지 않았고, 사실/순위/타Job은 변경하지 않았다. 다음 단계는 원자적으로 대상 event를 한정하는 worker 실행 계약 또는 격리 projection 검증을 별도 구분해 구현하는 것이다.

- 리소스 정리: Ego263 done:true. API74388/Web74541·74535·74396 TERM, 실행2844/35722 exit143, owned PID 잔존0/8121·3013 listener0. integration clone0 확인 후 전용DB stop. 동일집계 Node85→85/browser36→34. 타세션 종료 없음. 최종 source diff --check 통과. dev/alpha 미반영.

- 최종 G-L 준비 상태: stale `seedOfficialLeagueResult` 호출을 제거하고 GamesService takeover/start/end → TournamentResultReviewService 공식화로 교체, 실제 성공. Game `3958fb4b-6db7-49ac-a808-17c7b3a0ece1` ENDED v3, current revision OFFICIAL0:0, revision1. 재실행 reused:true. 득점2:1 계획은 선수 득점 없는 공식0:0 전제로 바꿨으며 공개 G-L 흐름만의 선행 데이터다.
- 실제 종료 상세→보이는 `리그 순위` 링크→bracket 일정탭 종료0:0 확인. 순위탭은2팀0-0-0/승점0으로 남음. SQL은 `GAME_RESULT_SUBMITTED`와 `GAME_RESULT_OFFICIAL` PENDING/attempts0, officialFact0을 확인. projection worker가 상주하지 않는 local runtime 전제 때문이다. seed의 실제 `V1GameOperationsWorkerService.processOne` 경로는 선두가 타Game job이면 명시거절하도록 했으며, 실제 `League projection event ... is behind another game's outbox event`로 중단했다. 타Game 처리/fact 직접생성/fake COMPLETED를 하지 않았다. 해당 projection의 안전한 처리·순위 재검증이 다음 critical path다. **G-L 미완/21 of42 유지**.
- 최종 색상 screenshot gl-progress-final-390/768/1440.png 전부 직접 확인: CTA와 LIVE capsule 배경rgb27,100,218, 흰 글자대비5.41:1, 높이57.5px, overflow0. draft 3폭 수정과 진행중2열 보존까지 verified. 최신2개 capsule 토큰수정은 root 실제검증이며 Sol source0은 직전CTA배경2줄까지다.

- 추가 시각 보정: 진행 중 상세 CTA는 17px/800 흰 글자와 blue500 배경의 대비가 부족했다. 모바일 상·하단 공용 CTA 및 desktop CTA를 기존 `--static-blue`(#1b64da)로 변경해5.41:1 확보. LIVE12px 캡슐의 반투명 흰 배경도 같은 토큰으로 맞췄다. 버튼높이57.5px, 텍스트/초록상태점/링크는 유지. 진행중 desktop은 기존640px+360px 두열과 aside360px 유지(직접확인 gl-progress-after-1440.png). 최종 색상은 gl-progress-final-{390,768,1440}.png로 별도 확인하며 UI5/5 실행은 색상보정 직전이다.

- 사용자 load 우선 진행 승인에 따라 작업 지속. 시작 load2.95/4.55/5.03, swap5695.5MB. 타세션 프로세스는 종료하지 않았다.
- Ego263 실제 guest 목록의 준비/진행/종료 필터→각 상세를 클릭했다. 준비1부·4시즌, 진행2부·4시즌, 종료2부·3시즌 확인. 종료 리그230에 confirmed registration2/TeamMatch246/Game3958fb4b-6db7-49ac-a808-17c7b3a0ece1을 준비하여 일정과 2팀 0경기 순위 표시까지 확인. 공식 결과가 없는 상태이므로 **G-L 미완**, 기본9/30+경계12/12=21/42 유지.
- 실제 draft 상세1440px에서 rail이 없는데 2열을 유지하고 일정 facts를 숨기는 결함 발견. `tournament-detail-client.tsx`의 rail 유무 판정과 `desktop/tournaments.css`의 no-rail 1열로 수정. 기존 rail 있는 상태의 정책/신청/권한은 변경하지 않았다.
- before `staff-ui/gl-draft-{390,768,1440}.png`, after `staff-ui/gl-draft-after-{390,768,1440}.png` 직접 확인. 모바일/태블릿/데스크톱 overflow0, desktop 일정 복원과 중앙 단일열 확인. 실제 제목24px/구역제목17px/본문·보조12–13px. 흰 배경 보조색 rgb107,118,132 대비4.62:1, 본문78,89,104 대비7.11:1, 파란글자27,100,218 대비5.41:1. 이 수치는 표본 색 조합이며 모든 화면 대비 감사 완료를 뜻하지 않는다. draft reload 3초 관측 exception0/http>=400없음/loadingFailure0.
- public-user-records.service는 SQL TEAM_MATCH gate만 유지하고 old fixture select/row/분기를 제거. 현재 공식 revision 포인터·officialAt·본인/타인 동의·participant REVOKED·엄격한 TeamMatch/Details 분류·summary/cursor 유지. Sol source blocker0. 최종 unit17/17(`/tmp/task168-user-records-canonical-final-unit.log`), actual PostgreSQL3/3(`/tmp/task168-user-records-canonical-pg.log`), UI5/5(`/tmp/task168-gl-layout-ui-unit.log`), 모두 exit0. 이전 unit18/18은 transitional dual-binding mock 제거 전 결과다.
- 남은 retirement: `test/games/public-user-records-canonical.integration-spec.ts`의 legacy negative는 old Prisma model/enum/FK를 생성하므로 schema DROP 전 migration 전용 검증으로 이동해야 한다. production source 전환과 전체 schema retirement 완료를 구분한다.
- seed 실패는 숨기지 않음:230 config null→같은 종목 ACTIVE config를 null인 경우만 연결. 이후 기존 seedOfficialLeagueResult의 team_result_submit 경로가 현재 canonical competition 권한에 막힘(Actor scope is not permitted). staff scope 추가 후에도 같은 거절. 권한을 완화하지 않고 실제 takeover/start/end/공식확정 경로로 seed를 정비 중. 현재 기존 경기/공식 결과 덮어쓰기 없음. 이 실패는 G-L 완료 근거로 사용하지 않는다.
- 도구 오류 분리: 지연된 Next route 전환 후 이전 DOM 조회 null은 다음 snapshot으로 새 상세 도착 확인; Ego ESM에서 require 사용 실패는 dynamic import로 수정하여 screenshot 재실행. metrics null 출력은 별도 명시 반환 조회로 재측정했다.
- 미커밋 dev f06d804af. dev 머지/push·alpha·최종 schema retirement·전체 E2E는 아직 미완이다.

## 2026-09-10 16:44 — X06 로컬 완료, 21/42

- 정리: Ego262 done:true, API29786/Web29842·29836·29835 TERM 및 두 실행 세션 exit143. integration clone0, 소유 DB stop. Node86(시작86), browser41(시작40, 공유 호스트 다른 작업 공간 사용 중이며 추가1의 소유를 단정하지 않음). 새 fan-out/브라우저 상주 없음, 세 에이전트 completed. 미커밋 dev f06d804af이며 push/alpha 배포하지 않았다.

- **기본9/30 + 경계12/12 = 21/42**. X06 실제 운영 브라우저 응답 유실→동일 요청 replay를 완료했다. alpha/전체 기본 흐름 완료를 뜻하지 않는다.
- 최종 source: 원본 body/key 보존, 408/5xx/네트워크 불확실 오류 재시도, pending 중 lifecycle/event/queue/assist/reverse/penalty write 차단, scope useLayoutEffect generation+attempt guard, POST 성공과 refetch 실패 분리. 서버 command·권한 계약은 변경하지 않았다.
- `output/qa/task168/x06-response-loss-final.json`: staffDirector 실제 이메일 로그인·콘솔 종료 확인→POST201 응답 ConnectionReset→동일 command `16d1cda0-281a-4a15-abbd-7497ceedaf8e` 재시도201/replayed:true/ENDEDv2. 요청 SHA256 및 6종 DB 전체 행 hash가 재시도 전후 동일, Game1/TeamMatch1/revision1/participant6/audit3/outbox1. 감사3은 GAME_CREATED/START/END 각1이다. 재조회 후 종료 상태 유지.
- Ego screenshot `staff-ui/x06-retry-final-{390,768,1440}.png` 직접 확인: 모바일 세로 복구 안내, overflow0, 재시도 버튼44px/13px, 다른 명령·골 버튼disabled. `x06-response-loss-before.png`는 수정 전 Failed to fetch 상태다. 마지막 실제 reload 2초 관측에 console/exception/http error/loading failure0. 전체 서비스 console clean으로 일반화하지 않는다.
- 최종 **72/72 PASS** (`/tmp/task168-x06-final-regressions.log`) 및 Sol bounded source blocker0. 초기 refetch test1실패는 원인문자열 대신 저장완료+동기화실패 안내를 제공하고 비동기 렌더를 기다리도록 수정했다. 기존 malformed broadcast(id undefined) 점수 회귀에서 React key 경고가 남지만 이번 신규 retry 회귀의 실패가 아니며 최종 exit0과 구분한다.
- X06 instance0은 최초 재시도/hash 보존 성공, instance1은 추가 코드 HMR로 pending state가 초기화되어 최종 replay 근거로 쓰지 않는다. 최종은 instance2(1621/1622, Game ffc58996-a941-4a33-849e-2a6da9cccbf3)다. seed301은 기존 시상 대회와 충돌해 guard가 거부했고 기존 행을 변경하지 않았다; 확인 후1601대 namespace와 bounded instance 옵션으로 분리했다. 종료된 기존 X11 경기205/206을 되돌리지 않았다.
- 다음: G-L populated 순위는 `seed-official-league-result.ts`와 기존 league230 confirmed registration 실제 존재를 먼저 확인하여 GamesService create/submit/approve로 증거 준비. 정규 리그는 leagueId=tournamentId이며 TournamentMatchDetails를 생성하지 않는다. 전체 Phase3 runtime/schema retirement·커밋본 검증·dev 반영·alpha는 미완이다.

## 2026-09-10 16:23 — X06 실제 응답 유실 재현

- 이전 턴은 감사 봉인/개인 기록 수정과 검증으로 progress. 실제 디렉터 이메일 로그인→운영 보드→콘솔로 진입했다.
- 첫 축구206 재현 시 CDP Fetch가 heredoc 종료와 함께 해제되어 정상 종료됐다. ENDEDv3이고 응답 유실 성공으로 계산하지 않는다.
- 풋살205에서 한 Ego heredoc 안에서 OPTIONS 응답을 계속 진행시키고 POST end 응답201을 ConnectionReset으로 차단했다. 원래 commandId `45dd1193-b6f5-4be3-b2d7-9594d843d78e`, expectedVersion1. DB Game `4556808d-1f9d-439d-9a71-a1cbc20434f1`은 ENDEDv2/SUBMITTED1, UI는 진행 중 및 Failed to fetch였다.
- 실제 종료 재클릭은 새로운 commandId `8630aa12-7a08-43e7-9b5e-8737c788d58a`/version1로409, UI Expected version is stale. 서버 replay 계약을 UI가 사용하지 못하는 결함을 재현했다. 증거 screenshot `output/ego/competition-full-goal-20260908/staff-ui/x06-response-loss-before.png` 직접 확인.
- Luna는 exact command body/key 보존 및 명시적 재시도 UI, 별도 fresh canonical 경기 전제데이터를 담당한다. Sol은 오류 분류/권한/중복/승부차기 부작용을 검토한다. 기존 종료 경기는 복원하지 않는다. X06은 미완, 전체20/42 유지.

## 2026-09-10 16:05 — 감사 로그 봉인과 개인 기록 canonical 전환

마지막 guard 보강: Details뿐 아니라 Game 자체 누락/잘못된 sourceType도 같은409로 막는다. 두 테스트의 정확한 invalid IDs에 이 두 경우를 추가하여 일부만 감지하는 회귀를 잡는다. 최종 로그는 `/tmp/task168-canonical-player-records-complete-guard-unit.log`다.

최종 guard unit18/18 PASS exit0, Sol 재검토 봉인/개인기록 bounded blocker0. 세 에이전트 completed, 추가 테스트 handle13340도 terminal0. 전체 E2E 완료 아님.

최종 후속: 활성 TEAM_MATCH의 Details 누락/타대회 연결을 `TOURNAMENT_MATCH_GAME_MISSING409`로 차단했다. public/admin 회귀 포함 **18/18 PASS**, exit0 (`/tmp/task168-canonical-player-records-final-unit.log`). 아래16/16은 이전 실행이다. 모든 실행 handle40992/37745/56854/92944/28116/22978/66951 terminal 확인, integration clone0 및 소유 DB stop 완료. 새 API/Web/Ego는 시작하지 않았다. 최종 Node86/browser38, 타세션 미종료. 이번 변경 미커밋, schema retirement/dev·alpha 및 전체20/42 이후 흐름은 미완이다.

- Sol 후속: 봉인 경로 source blocker0. 개인 기록의 malformed canonical Details가 필터로 조용히 빠지는 부분 집계 위험을 발견해 readiness에서 별도409로 차단하는 후속 수정 중이다. 위16/16은 이 마지막 보강 이전 증거다.

- 실행 결과: 감사 봉인 실제 PostgreSQL **5/5 PASS** (`/tmp/task168-audit-seal-readiness-pg.log`, exit0), 실제 CLI **2/2 PASS** (초기 mixed `/tmp/task168-audit-seal-pg.log`의 CLI suite). 초기 seal test의 Prisma UnknownRequestError SQLSTATE 접근 실패는 raw UPDATE/DELETE + SAVEPOINT + meta.code 검증으로 고쳤다. legacy audit 존재·audit0이나 미전환 fixture 존재·비활성/잘못된 trigger 거부, 봉인 후 UPDATE/DELETE55000와 행 보존을 확인했다.
- runtime CLI `runtime-cutover-audit-sealed-20260910.json`과 `runtime-cutover-audit-sealed-repeat-20260910.json` 모두 exit0. 최종 readiness/trigger 형태 검증을 포함한 재실행 성공. 감사35/Game8/outbox17 유지, trigger 함수의 fixture 참조0. 보고서는 `output/qa/task168/` 아래에 있다. 원격 DB에는 적용하지 않았다.
- 공개/관리자 개인 기록은 canonical TEAM_MATCH+동일 대회 Details/미삭제/leagueId없음으로 집계한다. legacy Game이 남으면 typed409로 막아 부분 순위를 성공으로 내리지 않는다. public 미공개 bracket 빈 응답, 공개동의·가시성 계약 유지. 관련 단위 **16/16 PASS** (`/tmp/task168-canonical-player-records-unit.log`). 실제 기록 재집계 전체 E2E를 이 테스트로 대체하지 않는다.
- audit helper는 fullcutover 내부 finalizer이며 standalone 운영 진입점이 아니다. 같은 Serializable tx/maintenance gate와 검증된 잠금이 전제다. 최종 schema contraction/전체 E2E/dev·alpha는 여전히 미완이다.

- 직전 턴은 실제 runtime cutover/리그 UI·공개 API 검증으로 progress. 전체 20/42 및 Phase3/alpha 미완 상태 유지.
- full-cutover에 명시적 `sealOperationAudits` 옵션을 연결하고 guarded runner가 이를 켠다. 데이터 변환과 봉인은 동일 Serializable transaction에서 처리하며 NOOP도 봉인한다. 기본 migration helper 호출은 자동 봉인하지 않는다.
- Game row → audit table → fixture table 잠금 순서로 audit writer/FK 잠금 역전을 피하고, 최종 검증 후 fixture 참조 없는 UPDATE/DELETE 거부 함수로 교체한다. result의 `auditMutationSealed:true`는 commit된 CLI 증거에 포함한다. 아직 실행 검증 전이다.
- Luna: 실제 PostgreSQL 봉인·사전 거부·rollback/트리거 검증, 공개/관리자 개인 기록 canonical-only 집계 수정. Sol: 동일 transaction/잠금/재실행 심사. schema DROP 및 source enum 제거는 미실행이다.

## 2026-09-10 16:00 — 로컬 runtime cutover와 G-L 검증 중

Sol 후속 검토에서 nullable teamName을 Map<string,string>에 전달하는 타입 오류를 발견하여 null guard를 추가했다. 순위 CTA href 회귀 assertion도 보강했다. 전체 typecheck/committed-tree build는 아직 실행하지 않았다.

후속 결과: `/tmp/task168-league-detail-ui-reviewed-unit.log` UI 5/5 PASS, exit0. Sol 재검토에서 현재 G-L 변경 범위 blocker 0. 세 에이전트 모두 completed. 16:01 load6.72/6.90/6.90, swap5983.5MB; 압박 완전 해소를 주장하지 않는다.

최종 좁은 검증 갱신: API **49/49 PASS**, exit 0 (`/tmp/task168-league-detail-schedule-final-pass.log`). 조회 조건 공통 래퍼의 실제 중첩 위치까지 assertion을 수정했다. UI 5/5는 아래 문구·word-break 보강 직전 실행이며, 보강 후에는 Ego live 렌더로 확인했다. 최종 `gl-detail-final-{390,768,1440}.png`를 직접 확인해 단어 잘림 해소·정규 리그 참가팀 안내 보정·가로 넘침 0을 검증했다. 전체 디자인/색 대비 감사 또는 G-L 전체 완료를 의미하지 않는다.

정리: Ego256 done:true; API78000/Web58818·58812·58811 TERM, 실행 세션 모두 exit143 확인. 격리 DB integration clone 0 및 컨테이너 stop 완료. Node87/browser35(테스트 직전89/38); 타 세션 프로세스 미종료. 변경은 미커밋 상태다.

- 사용자 명시로 메모리 압박 중에도 직렬 검증을 진행한다. 타 세션 프로세스는 종료하지 않는다.
- 격리 runtime DB에서 claim gate와 audit canonical-binding migration을 적용하고 guarded cutover 및 재실행이 COMPLETED였다. 증거: `output/qa/task168/runtime-cutover-20260910-1537.json`, `runtime-cutover-20260910-repeat.json`. 첫 실패 보고서 `runtime-cutover-20260910-1534.json`은 누락된 audit binding migration을 확인하기 전 결과이며 삭제하지 않았다. Prisma config로 환경 파일 로딩을 생략하여 두 migration의 applied ledger도 기록했다.
- 기존 fixture 2건의 잔여 binding 정리 후 legacy Game/staff/audit scope 0. Game 8개 ID hash `b24d6f2f443f5967ea6677023a97d1d4`, outbox 17개 전체 hash `d2826e7beeefeb4ca19d2d5f7a3a61b8`, 감사 35개 내용 hash `faa404b25bfbe42377545eab21baf083`가 반복 실행 전후 동일하다. 감사 hash는 변경 대상인 fixture/team-match binding 두 필드만 제외했다. 기존 canonical Game을 새로 생성한 것으로 계산하지 않는다. legacy schema DROP 및 alpha 적용은 미완이다.
- G-L: 정규 리그 상세 API의 tier/seasonNo/seriesId, 상세 부·시즌 표시, 참가팀 수, 종료 후 리그 순위 문구를 보완했다. 공개 일정 API에 기존 공개 상태·삭제 필터를 적용했다. 실제 guest에서 정규 리그 draft/in_progress/completed 상세·일정·전체순위 200, 일반 대회 draft/cancelled/deleted 세 경로 404를 확인했다. 기존 정규 리그 draft 공개 정책을 변경하지 않았다.
- Ego에서 목록→종료 리그 상세→리그 순위 링크→순위 탭을 클릭했다. 현재 검증 데이터는 빈 순위이며 populated 순위 검증 전이므로 G-L은 진행 중이다. 집계는 **20/42 (기본 9/30, 경계 11/12)**를 유지한다.
- 시각 증거: `output/ego/competition-full-goal-20260908/staff-ui/gl-detail-before-1440.png`, `gl-detail-after-{390,768,1440}.png`. 세 폭 모두 horizontal overflow 0, 순위 링크 높이 62px. 직접 이미지 확인에서 모바일 제목 단어 잘림·정규 리그에 맞지 않는 참가팀 공개 안내를 추가 발견하여 수정 중이다. 전체 시각 PASS 아님.
- 검증: UI 5/5 PASS(`/tmp/task168-league-detail-ui-final-unit.log`). API는 fixture 누락을 수정 후 47/49이며 조회 기록 덮어쓰기·JSON 선택 필드 비교 2건을 수정 중이다. 최종 green 이전 완료 주장 금지. 변경은 미커밋이며 dev push/merge·alpha 배포·alpha E2E 미실행이다.

## 목표와 완료 조건

2026-09-08 사용자가 전체 실행을 명시했다. 정본은 `docs/design/competition-canonical-flow.md`, UI A/A 결정과 선행 구현은 Task 165, 역할별 시나리오는 `docs/scenarios/competition-role-flow.md`다. 일부 코드·단위 테스트·격리 UI 통과를 전체 완료로 대체하지 않는다.

- [x] 실제 API/DB 피리어드 저장·재조회와 기존 fixture/teamMatch/game/period 보존. Ego 실제 저장·페이지 재진입과 DB version/pin 확인; 기존 경기 보존은 실제 DB integration 5/5 중 보존 케이스로 별도 입증. 모든 역할·경계 E2E 완료를 뜻하지 않는다.
- [x] 같은 대회 동시 CAS, 다른 대회의 공유 config version 경쟁, 감사 실패 시 실제 transaction rollback. 전용 PostgreSQL에서 integration 5/5 PASS(2026-09-08); HTTP/UI 저장 증거는 별도 수집.
- [x] 실제 운영 UI 결과 확인 → 정정 → 공개 순위·팀 전적·개인 기록 반영. 2026-09-09 로컬 Ego/API/DB/worker에서 VOID 및 동일 요청 재전송까지 검증. alpha 검증은 별도 미완.
- [x] 관리자·팀장·팀원·첫 사용자·경기 운영자의 기본30개 흐름 실행 증거 확보. 2026-09-12 최신 집계30/30이며, 위 단계별 로컬/API/DB/Alpha 증거의 합계다. 최종 Phase 3 배포본의 Alpha 전수 재검증 완료를 의미하지 않는다.
- [x] 교차·경계12개 실행 증거 확보. 최신 집계12/12이며 기존의9/30·11/12 표기는 과거 진행값이었다.
- [ ] Phase 3: 대회 경기의 V1TeamMatch 수렴. 새 경기 생성·기존 데이터 이관·ID/권한/대진 연결·결과/순위/개인기록/시상/리뷰 소비처까지 정합.
- [ ] Ego 실제 route UI/UX·responsive·console/network 증거, Sol 독립/적대적 검수, 소유 리소스 정리.
- [ ] 사용자A 순서로 dev 중간 릴리스 머지·Alpha 검증 후 별도 최종 DROP 릴리스. 최종 Phase 3 Alpha에서42개 역할/경계 흐름과 결과→공개/팀/개인 기록 반영, UI 변경의 실제 화면을 확인한다.

## 진행판

### 2026-09-10 — guarded cutover 실행 진입점

- 최종 DB gate6/6 PASS4.493s(`/tmp/task168-cutover-db-gate-corrected-pg.log`) + 실제 CLI2/2 PASS(위 mixed-run 로그), Sol 최종 좁은 소스 blocker0. gate 테스트의 실행 시각 경계 문제를 수정하는 중 직접 UPDATE가 기존 version CAS에 걸렸으므로, 처음 INSERT에서 과거 availableAt을 주도록 수정했다. DB CAS/제약은 변경하지 않았다. 초기 실패/잘못된 전체 큐0 조건의 통과와 최종 증거를 구분한다.
- 실행 핸들77374·31045·72120·87322·9932·8891은 모두 종료 확인. CLI child도 close 확인 후 종료하며 시간 초과 시 해당 child에만 TERM/KILL하는 수명주기 코드를 둔다. integration clone0 후 전용 DB 컨테이너 중지. 기준선 `/tmp/task168-runner-process-baseline.txt` 대비 Node80→80/browser30→30, scoped diff --check 통과. 새 API/Web/Ego는 시작하지 않았다. 미커밋 dev f06d804af이며 실제 runtime DB 전환·retirement·dev 배포·alpha는 미완이다.
- 직전 단계는 canonical 조회/감사 원복 검증으로 progress. 이번 단계에서 실제 실행 CLI `apps/v1_api/src/games/migration/tournament-team-match-cutover-cli.ts`와 guarded runner를 추가했다. 기능 실행 수는20/42이며 최종 schema retirement/dev/alpha는 미완이다.
- worker claim transaction이 advisory shared lock(168,3001)을 사용하고, runner는 별도 Prisma pool의 READ COMMITTED transaction에서 exclusive lock을 잡은 뒤 실제 큐 상태를 확인한다. 이후 기존 Serializable data cutover가 시작되므로 잠금을 얻기 전 오래된 snapshot으로 PROCESSING을 놓치지 않는다. 동일 Prisma client 전달은 거부한다.
- Sol P1에 따라 PROCESSING만 CUTOVER_OUTBOX_NOT_DRAINED로 차단한다. PENDING/RETRY/POISONED는 상태별 수를 보고하고 보존한다. 정상 worker가 미래 LINEUP_REMINDER_SCAN을 항상 남기므로 모든 대기 작업0을 요구하던 초기 조건은 잘못된 실행 계약이었다. 실제 미래 예약 작업을 둔 CLI 변환 및 전체 row 보존으로 교정했다. 작업을 삭제/강제 완료/자동 재시도하지 않는다.
- 새 migration `20260910160000_v1_outbox_cutover_claim_gate`의 DB BEFORE UPDATE trigger가 구버전 worker의 직접 PROCESSING claim도 shared advisory lock으로 보호한다. runner는 trigger 설치·활성 상태를 먼저 확인하며 없으면 CUTOVER_CLAIM_GATE_MISSING으로 중단한다. 이번 migration은 격리 integration template에만 적용했고 runtime/alpha/production에는 적용하지 않았다. 최종 DDL 전환 때에는 API/스케줄러 등 쓰기 주체도 별도로 중지해야 한다.
- inner full-cutover는 명시 maxWait5초/timeout30초/최대3회로 제한하고 outer maintenance는180초, gate SQL은5초로 제한한다. lock SQL을 common/tournament-cutover-lock.ts에 모았다. maintenance 종료 실패가 inner commit 후 발생하면 결과를 보존하는 COMPLETED_WITH_GATE_RELEASE_ERROR/exit2를 기록한다.
- CLI는 절대 `--report` 경로를 wx/0600으로 먼저 확보하고 RUNNING을 datasync한 뒤 DB에 접근한다. 성공은 결과를 저장하며, 커밋 후 보고서 기록/maintenance transaction 종료 오류는 DB 커밋 사실을 보존하는 별도 상태·exit2다. `.env`를 읽거나 DATABASE_URL/SQL 오류를 출력하지 않는다. 두 Prisma client와 report handle 모두 종료한다.
- 실제 subprocess CLI로 scheduled fixture 하나를 같은 ID의 TeamMatch/Details/TEAM_MATCH Game으로 변환하고 config pin 보존·보고서 기록·덮어쓰기 거부를 검증했다. 초기 gate+CLI7/7은 잘못된 대기 작업 차단 계약까지 포함하므로 최종 readiness 증거로 사용하지 않는다. 최종 DB trigger 포함 실행은 CLI2/2 PASS(`/tmp/task168-cutover-db-gate-final-pg.log`), gate는 즉시 실행 테스트의 미래 availableAt fixture를 교정한 뒤 별도 최종 로그에 기록했다. DB 제약/작업 상태를 우회해 통과시키지 않았다. 기존 Jest ESM warning은 최종 종료코드와 별도로 기록한다.

실행 명령(대상 DATABASE_URL은 운영 환경에서 제공, 파일 내용 출력 금지):

```sh
pnpm --filter v1_api exec node -r ts-node/register/transpile-only src/games/migration/tournament-team-match-cutover-cli.ts --report /absolute/new-cutover-report.json
```

이 명령은 데이터 전환만 수행한다. legacy 테이블/컬럼/enum 삭제나 alpha 배포까지 완료하는 명령이 아니다. 실패 보고서의 상태별 queue 수를 해결한 뒤 새 경로로 재실행하며, 커밋 후 보고서 오류는 DB를 재조회해 결과를 확인한다.

### 2026-09-10 — Phase3 전환 증명과 canonical 조회 보완

- 최종 대진 단위56/56 PASS4.201s(`/tmp/task168-bracket-null-kind-final-unit.log`), Sol 좁은 소스 심사 blocker0. 전체 UI/E2E/retirement 완료를 의미하지 않는다. 테스트 핸들58110·51416·3098·35198·77239·26596·92390·76056·73794 모두 종료 확인. DB clone0 후 전용 컨테이너 exited/55435 리스너 없음. baseline `/tmp/task168-retirement-process-baseline.txt` 대비 Node80→80/browser31→30. 서브에이전트3명 completed, scoped diff --check 통과. 기존 Jest config ESM warning은 기록하되 실제 최종 종료코드0과 구분했다. 새 브라우저/API/dev server는 시작하지 않았다.
- canonical 대진은 Game source뿐 아니라 TeamMatch 소유 대회/삭제 여부, Game.teamMatchId, legacy 이중 연결을 검증한다. 역방향으로 상세 행이 없는 TeamMatch도 GAME_MISSING409로 차단하며 kind:null 기존 대회도 포함한다. 기존 미이관409는 유지한다. API 문서의 낡은 TOURNAMENT_FIXTURE 생성 설명을 실제 TeamMatch+Details+TEAM_MATCH 생성 계약으로 수정했다.
- 대회 전체 영상 조회는 권한/대회 확인 후 미이관 영상이 남으면 VIDEO_MIGRATION_REQUIRED409로 막는다. 실제 PG1/1 PASS4.565s(`/tmp/task168-canonical-video-migration-pg.log`): 409→실제 migration helper→같은 영상 ID/URL/순서 조회 및 공유 upload asset 보존. 영상 단위23/23 PASS3.563s(`/tmp/task168-video-durable-unit.log`). 초기 test harness 타입 오류와 예전 즉시 파일 삭제 기대3건을 실제 durable retirement/outbox 계약으로 교정했다. 실패 로그는 보존하고 최종 통과와 구분한다.
- 직전 단계는 G-A/X11 실제 검증·UI 수정으로 progress. 이번 단계는 Phase3 코드/증거를 보완하며 기능 실행 수20/42를 늘리지 않는다. dev f06d804af 미커밋, alpha/production 작업 없음.
- full-cutover의 마지막 검증에 전역 remainingLegacyAuditScopes를 추가했다. legacy fixtureId 감사 로그가 남으면 POST_CUTOVER_INCOMPLETE로 전체 transaction을 실패시킨다. 빈 dataset NOOP도 Game/staff/audit 잔존 수를 실제 조회해 보고한다.
- 실제 PostgreSQL full-cutover 최종5/5 PASS7s(`/tmp/task168-full-cutover-audit-final-pg.log`). 성공 시 감사 전체 행은 fixtureId→teamMatchId 외 동일하고, 후반 lineage 불일치 실패 시 새 pending 경기와 감사 연결 변경까지 rollback되어 원래 전체 감사 행과 같다. clean NOOP도 확인했다. 앞선5/5 PASS7.049s에서 rollback 증거를 보완하여 재실행한 것이다.
- 잘못 만든 별도 orphan-audit 반례는 실제 DB scope CHECK23514에 의해 생성부터 거부됐다. 이를 제품 실패나 검증 성공으로 세지 않고 새 테스트 파일을 제거했다. DB 제약을 해제하지 않았으며 실제 가능한 성공/rollback 계약으로 검증을 교정했다. 초기 조회의 잘못된 glob/파일 경로는 실제 rg --files 경로로 정정했으며 제품 런타임 오류가 아니다.
- Sol이 확인한 남은 실행 순서: worker 정상 종료 및 새 claim 중단/active handler0/DB PROCESSING0 증거 → guarded one-shot full-cutover 실행 진입점 → 잔존 Game/staff/audit0과 lineage 보존 → audit trigger를 무조건 UPDATE/DELETE 거부로 먼저 봉인 → runtime legacy 참조 제거/컴파일 → 외부 FK·컬럼/legacy child/fixture table → source enum 제거. 현재 runner와 최종 retirement는 미구현이다. 기존 14:15 기록의 trigger 복구 순서를 이 구체 순서로 보완한다.

### 2026-09-10 — 실제 시상·교체 흐름과 시각 결함 수정

- 단계 종료 정리: Ego255 completeTaskSpace done:true, API64480/Web64576·64493·64483 TERM 후 실행 핸들56311/51663 종료143 확인. 전용 DB 임시 clone0 확인 후 컨테이너 중지, 3013/8121/55435 리스너 없음. 기준선 대비 Node80→80/browser33→31, 소유 PID 잔존0. 세 에이전트 모두 completed. scoped diff --check 통과, 확인한 touched production source/seed의 TODO·FIXME·HACK·XXX 없음. 타 세션 프로세스는 종료하지 않았다.
- 기능 실행 20/42(기본9/30, 경계11/12), 남은22개. G-A/X11을 추가했다. 전체 UI/UX, X06 브라우저 종료 응답 유실·재시도, Phase3 최종 schema/runtime 전환, 커밋본 검증, dev 반영 후 alpha는 미완이다. dev f06d804af의 미커밋 변경이며 배포하지 않았다.
- G-A: 실제 로그아웃 후 상세→시상·리뷰→다른 대회 보기 실행. 실제 MVP 조회200과 화면 일치, 비인증 관리자 시상 수정401 확인. 별도 완료 대회에서 두 팀 순위만 표시하고 가짜 3위가 없으며 상품 안내를 지급 완료로 표시하지 않음을 확인했다. 개인 시상/기록 없는 상태도 확인했다.
- 시상 CTA 높이44px, 글자14px, 대비3.71→5.41:1로 수정하고 시상대 작은 파란 글자도 대비를 높였다. 조회 오류를 빈 순위로 숨기던 코드를 loading/error/retry/empty로 분리했다. regular_league 개인 기록은 실제 league-matches API를 사용하고 hiddenByEligibility 안내를 유지한다. Sol 독립 검수 후 회귀16/16 PASS(`/tmp/task168-awards-final-states.log`). 중간 JSX 오류와 다른 API 호출을 소비하던 mock을 수정한 뒤 최종 통과했으며 초기 실패는 통과로 세지 않는다.
- 새 전용 regular_league fixture d8168000-0000-4000-8000-000000000230의 날짜/지역 전제조건을 보완해 실제 개인 기록200 확인. 이는 테스트 데이터 준비이며 사용자 생성 E2E 증거가 아니다. Ego CDP로 standings 요청을 차단하여 실제 실패와 재시도 버튼을 확인하고 차단 해제 후 버튼 클릭→200/명시적 빈 순위를 확인했다. Failed to fetch 원문은 남아 있어 전체 오류 문구 품질 완료로 확대하지 않는다.
- X11: scripts/qa/task168-seed-substitution-prerequisites.ts로 서로 다른 canonical football/futsal 경기와 config pin을 준비했다. football Game c9fed90b-8aef-4116-af32-198ec043d59d에서 실제 운영 UI로 home1→home8 교체 저장, DB SUBSTITUTION1 및 GK 위치 승계 확인. WebSocket mutation이므로 HTTP201 증거라고 주장하지 않는다. futsal Game 4556808d-1f9d-439d-9a71-a1cbc20434f1은 실제 UI 교체 버튼 없음, 별도 signed-cookie/takeover REST 요청422 SUBSTITUTION_NOT_TRACKED와 이벤트0 확인.
- 제한 교체 선택창의 넓은 화면 절반 빈 공간을 한 열로 재배치했다. 저장 후 이미 나간 home1이 다시 후보로 뜨는 실제 결함도 발견해 활성 SUBSTITUTION/취소 이벤트 기준으로 제외했다. 최종 실제 UI 후보는 home9만 표시, home1 없음. 회귀4 PASS/44 skipped(`/tmp/task168-substitution-no-reentry-ui.log`), Sol 소스 심사 blocker0. 이전 독립 종목 PG7/7 증거를 함께 사용한다.
- Ego 실제 390/768/1440 화면에서 가로 넘침0 확인. 증거: output/ego/competition-full-goal-20260908/staff-ui/ 아래 guest-awards-flow-after-*, guest-awards-error-after-*, guest-awards-empty-after-*, x11-no-reentry-after-*, x11-rolling-*. root가 최종 교체 세 화면을 직접 확인했다. 전체 사이트 시각 검수로 확대하지 않는다.

### 2026-09-10 14:15 — canonical 관리자 집계·독립 종목 교체·종료 내구성

- Sol 최종 좁은 심사: 관리자 집계/종료 snapshot 범위 blocker0. schema retirement는 미실행이다. 다음 순서는 full-cutover all-dataset lock/preflight(BLOCKED/UNRESOLVED면 무쓰기) → 동일UUID TeamMatch/Details/Game/진출 연결과 config·역사ID 보존 → 결과/골 immutable lineage 보존 → 영상/staff/audit/source 이관 → fixture대비 Details/Game 수·legacy Game/staff0·전체 lineage 대조 → runtime 참조 제거 → 자식테이블/외부 fixture FK·컬럼 → fixture테이블 → source enum 제거다. 전환 중 MIGRATION_REQUIRED/GAME_MISSING409를 빈목록/404로 숨기지 않는다. 최종 audit trigger 완전 append-only 복구 및 worker quiesce/queued jobs 검증도 여전히 필요하다. 근거: games/migration/tournament-team-match-full-cutover.ts, tournament-team-match-source-cutover.ts, historical-fixture-result-import.ts 및 prisma/migrations/20260909000000_v1_tournament_result_lineage/migration.sql. 이 순서를 운영환경에 실행한 증거로 오해하지 않는다.

- Sol 후속 P1: 관리자 Game source만 검사하면 dual-bound 경기가 포함되는 누락을 발견했다. tournamentFixtureId:null 필터와 query contract 회귀로 수정, 관리자 최종71/71 PASS4.132s(`/tmp/task168-admin-canonical-count-final-unit.log`). 종료 durable snapshot도 revision 전체와 resultParticipants 전체까지 확장해 payload conflict 후 참가자 결과 불변을 검증했다. 최종PG1/1 PASS5.293s(`/tmp/task168-end-all-effects-pg.log`). 보완 때문에 전용 DB를 재시작했으며 핸들82674/29782 terminal0, clone0 확인 후 다시 중지했다.

- 후속 GK 명시 사례 포함 최종 PG7/7 PASS5.241s(`/tmp/task168-canonical-substitution-gk-pg.log`). 별도 골키퍼 예외 규칙을 추가한 것이 아니라 기존 position/coordinates 승계가 GK에서도 보존되는지 검증했다. 테스트 핸들49444(초기 실패),71835,54423,14281,78192,36456 모두 terminal. 격리 DB clone0 확인 후 전용 컨테이너 중지, 55435 listener없음. baseline 대비 Node80→80/browser19→19. scoped diff --check 통과, touched source TODO/FIXME/HACK/XXX 없음. Jest config ESM warning은 기존 설정 경고이며 최종 테스트는 PASS다.

- 직전 턴은 검증/코드 변경을 남긴 progress다. baseline /tmp/task168-next-phase-process-baseline.txt, dev f06d804af 유지. 사용자 압박 진행 지시로 직렬 테스트. 이번 단계는 기능 완료 수18/42를 올리지 않는다.
- 관리자 get의 legacy fixture union과 _count.fixtures DB 조회를 제거했다. 응답의 기존 fixtures 숫자 필드는 유지하고 canonical Details와 삭제되지 않은 같은 tournament 소유 TeamMatch/TEAM_MATCH Game만 센다. 관리자 단위71/71 PASS4.507s(`/tmp/task168-admin-canonical-count-unit.log`). 초기 잘못 지정한 tournaments.service.ts 경로는 실제 tournaments-admin.service.ts로 정정했다.
- 종료 재전송 PG에 Game/TeamMatch 전체 행·대회 scoped audit 전체 행·해당 revision outbox 전체 행의 전후 불변 검증을 추가했다. GAME_END 감사1개와 GAME_RESULT_SUBMITTED 존재도 먼저 요구하여 빈 비교 통과를 막는다. 최초 소문자 game_end 가정 실패는 실제 uppercase audit 계약 확인 후 수정했다. 최종1/1 PASS5.104s(`/tmp/task168-end-durable-effects-pg-final.log`). 브라우저 응답 유실은 미완이므로 X06은 아직 부분 증거다.
- X11 PG fixture를 legacy game 및 동일 game config 교체 방식에서 독립 canonical football/futsal TeamMatch+Details+config pin으로 전환했다. 제한 교체 cap/재진입/위치 승계와 rolling422 SUBSTITUTION_NOT_TRACKED·이벤트 미저장7/7 PASS4.785s. 후속 GK 위치 승계 명시 변경 검증은 아래 로그로 별도 기록한다. UI OperateConsole 교체 항목3 PASS/44 skipped1.14s(`/tmp/task168-substitution-ui-unit.log`). UI 단위 테스트는 실제 Ego 화면 검수와 구분하며 X11을 아직 완료로 세지 않는다.


### 2026-09-10 — 권한 회수·종료 재전송·canonical 프로필 집계

- 단계 종료 회수: Ego254 done:true. 소유 API36114/Web93646·93575·93529 TERM 후 PID 소멸, 핸들69568/72059 종료143(정상 TERM). 격리 Jest DB0개 확인 후 전용 DB 컨테이너 중지; 3013/8121/55435 listener 없음. 동일 ps 집계 기준 Node81→80, browser67→19, 타 세션 프로세스는 종료하지 않았다. 세 에이전트 모두 completed. touched source marker 없음 및 scoped diff --check 통과. 전체 기능 완료를 뜻하지 않는다.

- 사용자 메모리 압박 진행 지시를 유지하고 직렬 검증했다. dev HEAD f06d804af; 이번 변경은 미커밋이며 dev 배포/alpha 검증은 아직 실행하지 않았다. 현재 기능 18/42(기본8, 경계10), 남은24개와 Phase3/전체 UI 검증은 미완이다.
- 실제 manager 로그인으로 이전 명단 UI의 회귀를 발견했다. useV1Team의 viewerRole 가정이 실제 응답 viewer.role과 달라 manager도 읽기 전용이었다. useV1TeamDetail/viewer.role로 수정하고 fixture도 실제 구조로 바로잡았다. 이전 member 음성 검증만으로 manager 양성 계약까지 검증했다고 볼 수 없다. Luna 구현, Sol 소스 blocker0, roster Vitest33/33 PASS(`/tmp/task168-roster-real-team-contract.log`).
- X02: Ego254에서 managerA가 선수16fbe99c-6069-49c6-ac5b-e7f9635affd6 편집폼을 열어 등번호6을 입력했다. owner API로 membership5f8c4896-f76f-4de1-91f8-d3792acf1158을 member로 변경200; UI가 읽기 전용으로 전환되고 폼이 닫혔다. 같은 demoted actor의 signed-cookie 저장 PATCH는403 PERMISSION_DENIED. 대상 신청9ba41403-06d7-4c69-a346-92671a724f25 전체 선수 행 hash555317f8233ac03bf59dbb7a4f5e52c4가 전후 동일했다. 브라우저 저장 요청403 자체는 capture되지 않았으므로 UI/network 단일 E2E로 확대하지 않는다. owner API로 원래 manager 역할 복구200 후 실제 UI 추가/수정/삭제 재노출을 확인했다.
- Ego x02-revoked-390/768/1440.png 모두 overflow0/수정버튼0; 실제 화면에서 카드 정렬·내용 폭·반환 CTA·읽기 안내를 확인했다. 이는 해당 명단 화면의 증거이며 전체 서비스 UI 통과가 아니다. 증거 경로 output/ego/competition-full-goal-20260908/staff-ui/.
- X06 부분 증거: canonical-game-end-retry.integration-spec.ts 실제 PostgreSQL1/1 PASS1957.902s(`/tmp/task168-canonical-end-pg-2.log`). TEAM_MATCH 시작→종료→동일 command/key 재전송은 SUBMITTED1개와14명 snapshot 보존, 다른 payload/same key 충돌을 검증한다. 최초 fixture 컴파일 오류는 수정했다. 브라우저 응답 유실/재시도와 audit/outbox 중복 전체 검증은 남아 X06 완료로 세지 않는다. X11 종목별 교체도 미완이다.
- 프로필 공식 출전 집계를 canonical TEAM_MATCH로 제한하고 대회 소유권과 league 분류를 확인한다. 명시적 null fixture를 바로잡고 friendly/league 출전은 경기 수에 포함하되 대회 수에서는 제외하는 테스트를 추가했다. profile unit5 PASS/29 skipped(`/tmp/task168-profile-canonical-unit.log`), Sol 소스 blocker0. 재시작한 실제 API GET users/member005/public-profile200의 activitySummary totals/monthly 모두 matchCount1/tournamentCount1 확인. 이 응답 확인을 모든 분류의 HTTP 검증으로 확대하지 않는다.


### 2026-09-09 20:35 — 참가 신청·팀원 읽기 흐름

- 직전 단계는 실제 구현/PG/UI 증거를 남긴 progress다. dev HEAD f06d804af 유지. 새 소유 process baseline `/tmp/task168-next-process-baseline.txt`; 사용자 pressure override로 serial/min-worker 진행.
- 관리자 실제 로그인 API로 무료 대회 `1c1ed603-be99-4d2a-8950-3e07c533781b` 생성201→open201. 기존 대회/결과를 바꾸지 않았다. teamLeader 실제 Ego253 로그인→홈대회→상세→내신청→primary팀 신청→필수3동의만선택→확인모달→신청201/submit201/재조회200. registration `9ba41403-06d7-4c69-a346-92671a724f25`, payment_checking/무료 payment1, media/record 선택동의미선택.
- 팀장 실제명단추가 UI로 member005 선택→프로필 자동조회→등번호5→추가201→명단GET200/1명. native select는 Ego DOM value/change 이벤트를 사용했으며 키보드 선택 성공으로 주장하지 않는다. 역할 UI용 임시 /settings 경로404는 실제 /my/settings로 수정했고 로그아웃은 보이는 버튼으로 실행했다.
- X01 증거: 기존 신청에 대해 실제 signed-cookie HTTP POST2개 동시 호출201이 같은ID를 반환, 동일submit재전송409 REGISTRATION_NOT_DRAFT. 대상 신청1/payment1/알림1, 알림 fullhash `9346c1180d65d402f7662c9934a671f9` 전후동일. 최초 draft 생성 동시 경쟁을 실행한 증거와는 구분한다.
- teamMember 실제 로그인→내신청→자기팀상세. HTTP자기신청/명단200, 제출/취소요청/선수추가403 PERMISSION_DENIED, 다른팀명단403. DB원신청 payment_checking/cancelRequestedAt null/명단1 보존. 다만 상세UI의 명단 링크누락/수정가능거짓배지/무료입금확인문구 발견해 Luna 수정중이며 M-T 완료로 아직 올리지 않는다.
- 무료 신청 알림이 유료입금안내였던 결함은 entryFee===0 분기로 수정. 새테스트 kind누락 실패 후 수정해 registration unit65/65 PASS5.408s(`/tmp/task168-free-notification-unit-final.log`). API재시작 후 ownerB 실제API신청 `e792e3c7-91d4-4739-8b36-6b9a81e9c319`/201로 알림본문이 접수·명단안내인지 DB 확인. 기존 알림은 과거 증거로 보존했다.
- Phase3 bracket parent는 canonical Details/같은대회/미삭제만허용하고 legacy fallback 제거. 관련unit51/51 PASS5.283s(`/tmp/task168-parent-canonical-unit.log`), Sol source blocker0. 다른대회/삭제의 명시unit 사례는 추가하지 않았으며 source+복합FK 근거와 구분한다. count/video/field migration guard와최종schema retirement는여전히미완.
- 시각근거 `staff-ui/registration-consent-{390,768,1440}.png`, `leader-roster-{390,768,1440}.png`, `member-registration-before-{390,768,1440}.png`. 신청CTA50px/font15px/세viewportoverflow0, root390/768/1440동의화면과390/1440명단 직접검수. 동의하지 않은checkbox에도회색check모양이보이는기존표현은 선택상태색구분과함께후속시각검토대상. 실제 클릭은숨김input이아닌연결label span으로수행했다.
- M-T UI수정 완료: 상세member명단확인44/50px·font14/15px·대비15.02:1·Tab초점2pxblueoutline, 무료는결제완료/입금일/입금자명오안내제거. 명단page도team.viewerRole owner/manager만쓰기·handler가드·권한없으면열린draft/edit닫기. 실제member내팀→global대회메뉴→목록→해당대회→내신청→명단확인→players200/쓰기버튼0 확인. 내팀전용참가대회shortcut은없어globalnav경유한경로로정확히기록한다.
- `member-registration-after-{390,768,1440}.png`/`member-roster-after-{390,768,1440}.png`: 세폭overflow0·멤버쓰기CTA0, root직접확인, Solsource/visualblocker0. my테스트의membermock누수로owner마감4건실패를각beforeEachowner복원으로수정. 무료nullpayment회귀포함 my11+roster33 **44/44 PASS1.81s**(`/tmp/task168-member-flow-ui-final.log`). backend65+bracket51도PASS. **M-T/X01 추가로17/42**, L-T무료부분실행만으로전체완료판정하지않는다.
- 다음 미완: X02권한회수열린폼, X06종료응답유실, X11교체두종목과나머지기본역할22개, L-T관리자승인/유료/마감전체경로, Phase3남은runtimeguard/video/schema/trigger수렴, 전체UI·커밋본검증·dev반영·alpha. 현재변경은미커밋이다. 이번UI console전체수집은없어clean으로표시하지않는다.
- 종료확인: Ego253 done:true, API41711은수정반영재시작전TERM/143·새API69183과Web41771/41772/41779도TERM/143, 모든테스트handle terminal. JestcloneDB0, 전용DBstop,3013/8121/55435리스너없음, Node86/browser54(시작85/58), 에이전트3개completed. 전체Node는공유호스트기준1개증가했으나이번소유서버/테스트는모두종료확인했으며타세션프로세스를임의종료하지않았다. 신청/명단fixture는후속L-T/A-T/X02검증을위해소유DB에보존했다. 이번변경diff-check PASS·touched제품소스TODO/FIXME/HACK/XXX없음; 커밋·push·dev머지·alpha는미실행.

### 2026-09-09 20:08 — VOID canonical 전환·피리어드 실제 시각 검수

- Luna가 VOID handler의 legacy fixture join/역진출 구현을 shared canonical normalizer/advancement로 전환했다. Sol 심사에서 sourceHash의 stale 참조, unit helper 응답 부족, null predecessor 성공 처리 문제를 찾아 수정했다. 첫 unit 실행은 officialAt nullable 타입 오류로 0 tests 실패했고 non-null 검증 후 재구성으로 수정해 재검증 중이다.
- 피리어드 editor의 추가/취소/저장/재로드 높이를40→44px, 핵심 안내를12→14px로 정리하고 footer wrap을 허용했다. 실제 computed control font는 기존부터16px이다. Ego390/768/1440 before/after 직접 확인: 가로 overflow0, 입력/버튼44px, 저장 색상 대비5.25:1. Sol은 모바일 충돌 액션 줄바꿈까지 blocker0으로 검수했다.
- 실제 owner UI13/13 draft와 ops API12/12 저장을 경쟁시켜409를 확인했다. 최신 설정 재로드12/12→owner UI13/13 저장200 및 요약 재표시 확인. 기존4Game+전체GamePeriod full JSON hash는 전후 `ffe850a6223699152bf85143aac2ef56`으로 동일하다. owner UI+ops API 경쟁이며 두 UI 세션 증거로 확대하지 않는다.
- 증거: `output/ego/competition-full-goal-20260908/staff-ui/period-sizing-{before,after}-{390,768,1440}.png`, `period-conflict-after-{390,768,1440}.png`, `period-save-final-390.png`. Ego event drain은 빈 배열이므로 전체 console clean을 주장하지 않는다. screenshot helper의 require/top-level await 오류는 dynamic import로 수정 후 캡처 성공했다.
- 실제 queued VOID source cutover 후 worker 성공과 null predecessor RETRY/불변성 PG를 추가했다. 검증 결과/리소스 회수는 아래에 이어 기록한다. 기능 완료15/42는 유지한다.
- 검증 중 발견/수정: unit의 cache+watermark 실행 기대1→5 정합 후 **6/6 PASS4.328s**(`/tmp/task168-void-canonical-unit-3.log`). PG의 잘못된 직접 tournamentId filter는 `group.tournamentId` 관계 필터 및 전체 standing row 비교로 수정했다. cutover snapshot을 VOID 생성 전에서 이관 직전으로 옮겼다. 정상 VOID RETRY의 실제 lastError는 standings의 completed-match invariant였으며, matched 상태에 OFFICIAL/VOID를 둔 fixture를 completed로 정합화했다. 운영 검증을 완화하지 않았다. canonical advancement 실제PG **7/7 PASS**, active-target rollback·역진출·스케줄/반대편 보존 포함(`/tmp/task168-void-cutover-pg-2.log`). malformed predecessor PG는 write 전 실패/불변성을 증명하며 중간 write 이후 rollback 증거로 확대하지 않는다.
- 최종 source-cutover 실제PG **5/5 PASS11.434s**(`/tmp/task168-void-cutover-pg-final.log`): 이관 전 queued VOID가 이관 후 실제 worker에서 COMPLETED/attempt1/lastError null, malformed VOID는 RETRY/attempt1 및 projection 불변. 합계 고유DB12개+단위6개 통과. 기존 jest.config.ts 모듈 로딩 warning은 PASS 실행에도 출력되는 알려진 경고로 분리하며 실패 원인으로 오인하지 않는다.
- 종료 확인: Ego252 `done:true`, API3592/Web3610·3622·3629 TERM 후 command handles143 종료, 모든 테스트 terminal, Jest clone DB0, 전용DB stop,3013/8121/55435 리스너 없음. Node85/browser62로 이전 기준87/85 이하이며 타 세션 프로세스를 건드리지 않았다. 에이전트3개 completed. touched path diff-check PASS·새TODO/FIXME/HACK/XXX 없음.
- 다음 미완: 남은 legacy runtime consumer/최종 schema 및 trigger contraction, worker quiesce/retry 전체 운영 preflight, 나머지27개 역할·경계 흐름, 전체 시각 검수, 커밋본 검증/dev 반영/alpha. 이번 단계는 로컬 미커밋 진척이며 전체 완료가 아니다.

### 2026-09-09 19:10 — Phase3 새 legacy 생성 차단·감사 연결 이관

- 직전15/42 단계는 실제 증거와 코드 변경이 있는 progress로 분류했다. dev f06d804af 유지, 공유 dirty tree를 보존한다.
- 현재 production 생성 호출부와 기존 full/source cutover 구현을 재조사했다. backfill만 보고 cutover가 없다고 판단하지 않으며 기존 source/full cutover와 그 보존 테스트를 재사용한다.
- Luna implementation_inventory 소유: GamesService 신규 source 생성 TEAM_MATCH 제한, getGame canonical knockout 조회, 미사용 legacy helper 제거와 좁은 회귀. Luna flow_contract_map 소유: source-cutover의 operation audit ID/내용 보존 및 canonical FK 전환과 실제PG 회귀. 각 agent는 자기 파일만 수정하고 테스트/서버/커밋은 root가 직렬 관리한다.
- Sol은 pending/retry outbox의 legacy payload 해석과 이미 canonical인 fixture의 legacy video 누락 경로를 독립 조사한다. 전체 테이블/FK 삭제는 데이터·의존성 보존 게이트가 증명된 뒤 진행하며 현재 완료로 표시하지 않는다.
- 신규 Game 생성 TEAM_MATCH 제한 및 getGame canonical knockout 조회를 적용하고 미사용 knockout-fixture helper를 제거했다. actor/source 단위21/21 PASS6.801s, 실제PG 생성·idempotent replay·legacy/dual source 거부3/3 PASS6.318s. 새PG fixture의 config 초기화·잘못된 audit 필드·Details 누락은 수정했으며 제품 소유권 가드는 완화하지 않았다.
- 감사 연결 UPDATE는 기존 append-only 트리거55000에 막혀 실제PG 최초 실패했다. migration20260909110000은 같은 UUID/대회에 속한 fixture→TeamMatch+Details 연결의 단방향 이동만 허용하고 두 FK 외 전체 JSON(미래 컬럼 포함)을 비교한다. 내용 변경/삭제/역전환은 계속55000이며 이미 전환된 행은 UPDATE하지 않는다. root는 OLD fixture 소유권 EXISTS와 유효 연결 전환에 위장한 action/reason/after 변조·DELETE 테스트를 보강했다. 오류 메시지 비교 실패는 SQLSTATE+정확한 트리거명으로 수정 후 실제PG4/4 PASS6.466s(`/tmp/task168-audit-cutover-guard-final-2.log`). 마이그레이션은 소유한 테스트 template DB에만 적용했고 런타임/alpha에는 적용하지 않았다. 최종 fixture DROP migration에서는 이 한시적 연결 예외도 제거하고 완전 append-only 함수로 복원해야 한다.
- Sol source 심사에서 queued result outbox의 Game/revision UUID는 보존되어 payload rewrite가 불필요함을 확인했다. 다만 official/VOID/shared SELECT 및 submitted escalation/access SQL이 legacy fixture 테이블에 의존한다. 특히 canonical tournament의 제출 검토자 범위를 놓치는 escalation을 Luna가 수정 중이다. final contraction 전 worker quiesce·PROCESSING0·재시도 job 바인딩 검증과 cutover 전 job의 사후 실행 검증은 남아 있다.
- 영상 phase를 공통 helper로 분리하고 full cutover에서 전체 fixture ID에 적용했다. 이미 canonical인 경기의 match/details/game 값을 다시 덮어쓰지 않고 영상만 동일 ID·URL/title/order/createdAt으로 이관한다. 실제 full-cutover PG5/5 PASS9.308s(`/tmp/task168-full-cutover-video-pg.log`), Sol extraction/URL잠금/충돌/잔여영상 검사 source blocker0. 이 시점 새 생성3+감사4+fullcutover5의 서로 다른 실제PG12개와 단위21개가 통과했다. 후속 official query/escalation 변경은 별도 검증 대기이며 기능 흐름15/42 집계는 올리지 않았다.
- 후속 official 공용 SELECT에서 legacy fixture join을 제거하고 Raw의 legacyFixtureTournamentId도 소비 fixture와 함께 제거했다. 실제 Game legacy FK는 읽어서 dual binding을 숨기지 않으며 normalizer는 canonical-only/삭제/소유권 불일치를 거부한다. 브래킷의 legacy SQL fallback/helper도 제거했다. Sol이 발견한 nullable startAt 회귀는 COALESCE(startAt, officialAt)로 수정했고 실제 team record facts의 양쪽 playedAt이 공식 시각인지 PG로 검증했다.
- submitted escalation/access의 legacy join을 제거했다. Sol은 canonical 대회 알림이 상대팀장으로 먼저 가는 분기, Details+league 모순 허용, SUPPORT_READONLY ACK 허용, 권한 조회→취소 경쟁을 발견했다. 대회 director 우선/배타적 source 분류/ACK의 director 재검증과 assignment·admin·user FOR SHARE 잠금으로 수정했다. 실제PG에서 일반계정 director 알림/ACK, support 조회허용/ACK403·상태version불변, pure league/friendly 기존 동작을 검증했다. support fixture의 future-due 시간 및 ops 겸직 director 오분류를 바로잡았으며 제품 due/kind 정책은 유지했다. 기존 문서의 support ACK 허용 서술도 읽기 전용 권한에 맞춰 정정했다. 권한 취소 경쟁의 잠금은 Sol 소스 심사 근거이며 별도 경쟁 PG 실행 증거로 확대하지 않는다.
- 최종 직렬 검증: official-source2 + fullcutover5 + escalation4 실제PG **11/11 PASS28.674s**(`/tmp/task168-final-projection-escalation-pg.log`). 앞선 생성3·감사4를 합친 이번 단계 고유 PG는18개다. normalizer/escalation 단위12개, source/actor21개, canonical bracket6개 모두 통과해 고유 단위39개다. bracket fixture의 normalized/raw 필드 혼동·lineup/side/Game 의존성 누락을 수정 후6/6 PASS4.519s(`/tmp/task168-canonical-bracket-unit-final-2.log`). 초기 실패를 전체 성공처럼 기록하지 않는다. 최신 bounded Sol source blocker0.
- 다음 명시 미완: VOID projection의 legacy fixture 직접 조인/역진출 SQL 제거, 남은 runtime migration guard·mock seed 정리, 최종 schema/FK/table contraction 및 임시 audit trigger 예외 회수, worker quiesce/기존 retry jobs 실처리 검증, 나머지27개 역할·경계 흐름과 전체 Ego UI 검수, dev 반영/alpha. 기능15/42 유지. CPU load가130~180까지 올랐지만 사용자 명시 지시대로 serial/min-worker만 수행했고 타 세션 프로세스는 건드리지 않았다.
- 단계 종료: 소유 테스트 handles 모두 terminal, Jest 격리DB 잔여0, 전용DB stop,3013/8121/55435 리스너 없음. Node87로 시작 기준 복귀·browser78(시작85), agent3개 completed. 이 단계 API/Web/Ego는 시작하지 않았다. 관련 변경 diff check PASS; 새 기술부채 marker 없음. commit/push/dev merge/alpha는 미실행이다.

### 2026-09-09 19:08 — X03 충돌 화면·X05 실패 처리·보드 canonical fixture

- 사용자 지시대로 메모리 압박 중 진행했다. Node90/browser88, swap 약12.6~13GB 상태에서 검증을 직렬·최소 worker로 실행했다.
- X03: Ego248 owner 편집 draft12/12를 유지한 채 별도 ops 실제 이메일 로그인/cookie API로 같은 버전의11/11을 PATCH200 저장했다. owner 화면 실제 저장은409, 입력12/12·편집 화면·최신 설정 다시 불러오기 CTA가 유지됐다. 실제 reload 후 편집 종료/11분·11분 요약으로 복귀했다. 두 UI 세션이 아니라 실제 두 관리자 중 한 명은 API, 한 명은 UI다. Sol은 기존 실제PG CAS 증거와 결합해 PASS로 판단했다.
- 대회947942e0-1de5-49dd-968d-234353048234의 새 pin ecccbd98-2c7a-4f90-8a0c-bb306274f7cd, updatedAt2026-09-09T10:03:52.901Z를 DB에서 재조회했다. screenshot `output/ego/competition-full-goal-20260908/staff-ui/x03-conflict-1440.png`를 직접 확인했다. 입력44px 대비 저장/취소40px·안내12px 크기 차이는 시각 후속 검수 항목이며 전체 UI PASS를 뜻하지 않는다. 모바일 readback 가로 overflow0.
- X05: 실제 editor를 렌더하고 유효 입력 후 mutation onError를 실행하는 회귀 테스트를 추가했다. draft/편집 유지·오류 toast1회·성공 toast0을 검증했다. Vitest4/4 PASS(977ms), `/tmp/task168-period-editor-x05.log`. 기존 실제PG audit 실패 rollback 증거와 결합한 계약 PASS이며, 실제 HTTP500 fault injection E2E를 했다고 주장하지 않는다.
- 운영 보드 snapshot/filter describe의 fixture를 TeamMatch/Details/TEAM_MATCH Game/canonical staff scope로 전환했다. 처음에는 seed id optional 타입으로 실행 전 실패했고, 다음에는 legacy staff scope FK 때문에 beforeAll11개 실패했다. required-id seed type 및 teamMatchId 관계로 바로잡은 뒤 실제PG11/11 PASS(50 skipped,7.719s), `/tmp/task168-board-snapshot-pg-3.log`. 전체61개를 실행한 것은 아니다.
- 기능 합계15/42(기본7/30·경계8/12), 남은27개 및 Phase3·전체 UI 검수·커밋/dev 반영/alpha는 미완이다.
- 단계 정리: Ego248 done:true, API86276/Web86343·86356·86369 TERM 및 command handles143 종료, 격리 테스트DB 잔여0, 전용DB stop,3013/8121/55435 리스너 없음. Node87로 시작 기준 복귀; 전체 browser91(시작85)로 타 세션/공유 브라우저 프로세스는 종료하지 않았다. 에이전트3개 completed, 소유 변경 diff check PASS. 이번 단계 제품 스타일 변경은 없으며 시각 후속 항목은 미해결로 남긴다.

### 2026-09-09 18:05 — A-R 재확정·M-R 일반 팀원 기록 실제 실행

- 이전 턴은 보드/결과 경로 구현·검증을 남긴 progress였다. 현재 dev f06d804af 및 로컬 runtime을 재확인하고 Ego247에서 실제 운영을 이어갔다.
- 운영 보드 같은 행에서 VOID4→사유 입력/결과 제출201→DRAFT5→확정 모달/officialize201→OFFICIAL5를 실행했다. current pointer ebb97125-c2ee-41d7-85c2-e567c8a328cb, version11. 이전1~4 리비전 hash가 모두 그대로이며 새 audit2건은 legacy fixture FK null/canonical TeamMatch FK 연결이다.
- 실제 worker one-shot(scripts/qa/task168-drain-result-worker.cjs)을 추가해 격리DB/허용된 task 게임만 처리하도록 guard했다. 기존 due scan 및 이전0:0결과도 실제 handler로 처리했고 새 official job COMPLETED/attempt1, current cache는5만true. 양 팀 API에는 해당경기 한 건씩, 공개 화면0:1/5차정정, 개인005본인1경기0골0도움,010참가자1골5분이 반영됐다. 전체팀 전적에는 별도 친선/0:0 경기도 포함됨을 구분했다.
- 일반 팀원005 SQL member/active·admin0·staff0. 실제 로그아웃/이메일로그인→경기상세→명단에서나찾기(모두 연결됨, 타인후보없음)→닫기→마이→내활동기록 순서로 실행했다. 본인200/1경기/consentfalse, 익명200/0건. 본인005·타인010 identitylink version1 각각유지. mobile390 가로overflow0/경기링크111px. Sol 기능 승격 판정 대기이며 단순 page-open을 완료로 세지 않는다.
- 세부 원본 receipt: output/ego/competition-full-goal-20260908/role-records-restoration-20260909-1805.md. Screenshot staff-ui/ar-public-revision5.png, ar-away-records.png, mr-zero-goal-restored.png, mr-claim-unavailable.png, mr-zero-goal-390.png 직접확인. 팀전적의 기존 left accent rail은 전체시각감사의 잔여이며 기능 성공과 분리한다. 전체consoleclean은 event수집한계로 미입증이다.
- Sol 최종 증거심사 A-R/M-R 로컬 기능PASS. 기존 SUBMITTED201·X07·PG20 경합/중복/rollback과 이번 VOID재입력 양의 재투영 증거를 결합해13/42(기본7/30,edge6/12)로 갱신했다. 전체UI/UX·Phase3·dev머지·alpha 완료가 아니다.
- 종료: Ego247 done:true, API41720/Web41831·41847·41862 TERM 및 handles143, 전용DBstop, 3013/8121/55435 리스너0. Node87 시작값유지, 전체browser85→88이나 이번 taskspace는 종료확인했고 다른 세션 프로세스는 종료하지 않았다. worker one-shot exit0/shutdown, 에이전트3개completed, diffcheckPASS. 이번 단계 별도 부하 suite 반복 없이 실제 사용자/API/DB/worker 증거를 수집했다.

### 2026-09-09 — 운영 보드 실제 시각 검수·결과 검토 canonical 전환 진행

- 이전 단계는 구현/실제DB 증거를 남긴 progress였다. 현재 dev HEAD f06d804af 및 로컬 runtime을 재확인했다. 사용자 메모리 압박 예외에 따라 테스트는 계속 직렬 실행한다. 이번 runtime은 API81946/8121, Web82407/3013, Ego244(이전 공간 없음 확인 후 생성), 전용DB teameet-task168-db를 사용한다. 종료 시 이번 소유 리소스만 회수한다.
- 실제 이메일 관리자 로그인→대회 목록→상세→운영 보드 이동. 1440px에서 표1295px/본문1134px, 결과 정정 버튼x1474로 화면 밖에 숨는 결함을 직접 확인했다. 균형 열 너비/table-fixed 수정 후 표1134px·버튼right1362/height44px로 본문 안 노출을 확인했다. 모바일 팀명이 잘려 상대 팀을 식별할 수 없어 줄바꿈 처리했다. before/after는 output/ego/competition-full-goal-20260908/staff-ui/ar-board-*에 저장했다. API 상태 계약 보완 후 최종 화면 재검증 전이다.
- 실제DB current revision VOID(경기 ad8e46d3-64ea-556d-876e-8959e940fd27)인데 보드에0:1이 노출되는 결함도 재현했다. board selector가 revision state를 누락하고 점수만 반환하는 원인으로 확인됐으며 상태/점수/갱신 토큰 및 무효·미확정 CTA 구분을 수정 중이다. 정정 행을 실제 클릭하면 같은 보드에 무효 후 재입력 폼이 열리고 닫히는 것을 확인했다. 저장은 이번 단계 아직 실행하지 않았다.
- ResultReview live legacy status write/knockout facts fallback 및 GamesService penalty legacy facts 분기를 제거 중이다. 첫 좁은 PG 실행은 입력 select 누락·불가능한 fixture 분기로 TS 오류가 발생해 실행0건; 타입/분기를 수정해 재검증 중이다. 미실행을 PASS로 집계하지 않는다. 역할 흐름11/42 유지, 전체E2E/Phase3/dev머지/alpha 미완이다.
- 단계 결과: 위 결과 검토/승부차기 canonical 전환을 적용했다. 첫 타입 수정 뒤 실제DB17FAIL/3PASS에서 canonical 감사의 legacy FK 위반과 테스트 target Game 누락을 발견했다. 감사는 fixtureId:null/teamMatchId로, 진출 대상은 canonical Game/2 sides로 보완한 뒤 실제PG20/20PASS10.364s(`/tmp/task168-review-canonical-pg-3.log`). review unit52/52PASS7.713s(`/tmp/task168-review-unit.log`), legacy source의 인가 전404 회귀 포함. 초반 source review PASS는 실제DB 실패로 철회하고 수정/재검증했다.
- 보드: currentRevisionState 추가, OFFICIAL만 점수/득점자누락 경고 표시, VOID는 결과 무효 표시, state를 watermark hash에 포함했다. UI21/21PASS2.46s(`/tmp/task168-board-ui.log`). 실제DB incremental OFFICIAL→same-score VOID에서 score:null·MISSING_SCORER 제거·stableRevision/watermark 변경 PASS6.518s(`/tmp/task168-board-void-pg-3.log`). 기존 보드 spec 준비 데이터의 scope tournamentId/expiry 누락을 보정하고 **변경 대상 incremental describe만 canonical으로 전환해 1건 실행, 나머지60건 skipped**했다. 기존 보드 전체 suite 통과로 보지 않으며 나머지 legacy fixture 전환/검증은 잔여다.
- 최종 Ego244 실측: 1440 표1134px, 정정버튼right1362/높이44/font14; 768·390 가로 overflow0, 버튼높이44/font16, 모바일 팀명2줄로 모두 표시. 예정/PAUSED no-revision은 disabled+사유, OFFICIAL/VOID는 진입 유지. DB VOID pointer와 보드 결과 무효 일치, 같은 route에서 정정행 확장/닫기 확인. screenshots ar-board-1440-before.png → ar-board-1440-final.png, ar-board-390-before.png → ar-board-390-final.png, ar-board-768-final.png(root 직접 확인). Network resource에서 operations200 및 관측된400+없음; drainEvents는 target 이벤트만 제공해 전체 console clean 증거로 간주하지 않는다. 이번 단계 신규 결과 저장 E2E는 실행하지 않았으며11/42 유지.
- 리소스: Ego244 completeTaskSpace done:true. API81946 재시작 뒤13666과 Web82309/82399/82407 TERM, exec handles terminal143 확인. 전용DB와 최종 테스트 정리는 아래 종료 증거로 기록한다. 변경은 미커밋, dev머지/alpha 미실행이다.
- 종료 증거: 임시복제DB0, 전용DBstop, 3013/8121/55435 리스너0, Node87/browser85(시작91/87), 에이전트3개completed. 최종 Sol bounded source blocker0. 이번 단계 실제PG21개/단위73개 통과이며 보드 전체61개 중60개는 실행하지 않았다. 남은 Phase3 migration guards/final contraction 및 역할별E2E 범위는 유지한다.

### 2026-09-09 — 일괄 순위 재계산 canonical 전환

- 관리자/배치 재계산이 `loadCanonicalStandingsSource`를 공유한다. advisory→Tournament→정렬된 Game→TeamMatch 잠금, 잠금 후 config/source 재조회, source fingerprint 검증을 유지하고 중복 잠금 조회를 제거했다. legacy fixture 결과를 섞는 helper는 제거했다.
- 모든 nondeleted canonical Game의 연결을 검증한 뒤 completed만 계산한다. 배치 discovery는 regular_tournament/legacy null kind로 제한하여 regular_league scan·lock·write를 제외한다. 누락/잘못된 config는 기존 CONFIG_INVALID, canonical 누락은 CANONICAL_SOURCE_INVALID로 격리하며 경합/예상 밖 오류는 전파한다.
- Sol이 비완료 경기 포함, 경합 오류 삼킴, config 분류 변경, regular_league 늦은 제외를 지적했고 모두 수정 후 source-only blocker0을 확인했다. 첫 PG 7PASS/1FAIL의 config 분류 회귀를 수정한 뒤 실제 PG 2suites8/8PASS21.153s(`/tmp/task168-batch-pg-2.log`). 상충 legacy0:9·삭제/취소 canonical 제외, canonical3:1 계산·재실행 일치, regular_league standing77 보존 및 기존 관리자 동시성/감사 rollback을 검증했다.
- 단위 첫 실행은 bracket50/50PASS, batch spec 중복 teamMatch 속성 TS1117로 실행 전 실패했다. 중복 제거 후 batch11/11PASS10.902s(`/tmp/task168-batch-unit-2.log`), 총61개 단위 계약 통과. 배치 discovery exact count assertion 보강 후 실제PG1/1PASS17.535s(`/tmp/task168-batch-pg-final.log`); 앞선 관리자7개와 합해 실제DB8개 사례가 통과했다. 반복 실행은 별도 사례로 집계하지 않는다.
- 단계 종료: 임시 복제DB 잔여0, 전용DB stop, 모든 테스트 handle 종료, 에이전트3개 completed. API/Web/Ego는 이번 단계에 시작하지 않았다. diff check 및 batch/source의 legacy-query/debt-marker 검사 통과. 타 세션 프로세스는 종료하지 않았다.
- 전체 역할 흐름은 11/42(기본5/30, edge6/12) 유지. 이번 단계는 backend 회귀 검증이며 전체 UI/E2E·Phase3·dev 머지·alpha 완료가 아니다.

### 2026-09-09 — 결과 확정 후 자동 순위 반영 canonical 전환

- 직전 권한/수동재계산 단계는 구현·실DB증거 progress다. HEAD f06d804af/dev 및 역할11/42를 유지하며 자동 결과 projection을 이어 처리했다.
- GameResultStandingsProjectionService의 legacy fixture 조회와 shared append fallback 의존을 제거했다. trigger revision은 canonical Details/TeamMatch/TEAM_MATCH Game 소유권을 검증한다. 같은 대회의 nondeleted canonical Details에서 missing/wrong Game은 CANONICAL_MATCH_REQUIRED 오류로 tx 전체를 실패시키며 부분 순위를 성공 저장하지 않는다.
- target group의 phase를 먼저 확인해 groupId가 있는 결선도 no-op을 유지한다. 조별 upsert 뒤 원천을 다시 읽던 READ COMMITTED 불일치 경로를 제거하고, 하나의 canonical 전체 조 배열을 affected group과 overall 양쪽 계산에 재사용한다. worker가 이미 Game 잠금을 가진 경로이므로 수동 재계산의 Tournament-first 잠금을 추가하지 않았다.
- 실제PG2suites10/10PASS19.408s: canonical-standings-recalculation7개(자동정상/깨진sibling rollback2개 추가) + historical-fixture-result-import3개. 자동 결과1:0은 상충 legacy0:9/삭제canonical0:8을 합산하지 않고 수동과 같은 순위를 만든다. historical importer는 실제 소스에서 먼저 canonical TeamMatch를 만들고 projector를 호출하므로 별도legacy adapter가 필요 없음을 확인했다.
- 초기검증 compile 실패는 readonly accumulator와 optional match narrowing, validation 필드 select 누락이었다. 실제 Prisma select와 mutable local 배열을 맞춘 뒤 위 실제PG가 통과했다. projector/VOID 좁은 단위 및 Sol 최종 검수는 진행 중이다. 이 단계는 서버/UI/Ego를 시작하지 않았고 역할UI11/42·전체Phase3·dev/alpha는 미완이다.
- 단계 최종: projector/VOID unit2suites10/10PASS8.848s, Sol 최신source blocker0. typed invalid sibling·동일 source 배열·결선 no-op을 확인했다. diff check 및 touched debt marker/legacy query 없음. 테스트 임시DB 잔여0, 전용DB stop, 테스트 handles 종료, 에이전트3개 completed. 서버/브라우저를 새로 시작하지 않았다. 다음 구현 잔여는 batch tournament-standings-recalculation과 shared legacy bridge 제거이며 historical importer는 canonical임을 실제PG로 확인했으므로 불필요한 legacy adapter를 만들지 않는다. dev커밋/머지/alpha는 미실행이다.

### 2026-09-09 — 경기 권한·명령 및 관리자 순위 재계산 canonical 전환

- 직전 시상 단계는 실제 수정/검증 progress다. HEAD f06d804af, dev, 역할11/42 상태에서 이어갔다. 사용자 지시대로 메모리 압박에서도 직렬·최소 worker 검증을 수행한다.
- GamesService resolveActor가 legacy TOURNAMENT_FIXTURE Game을 GAME_NOT_FOUND로 거부한다. 같은 UUID의 canonical 스태프 scope가 있어도 legacy Game으로 우회할 수 없다. 라인업 명단 자격, 경기 시작 팀 검증, 출전정지 경기 순서, operation audit는 canonical TeamMatch context를 사용하고 deleted TeamMatch도 actor에서 거부한다. 기존 canonical 대회/정규 리그 권한 positive는 유지했다.
- 관리자 recalculateStandings는 group.fixtures legacy 결과 입력 및 append fallback을 제거하고 Details→non-deleted TeamMatch→TEAM_MATCH Game/current official만 읽는다. 조별/전체 upsert와 관리자 감사는 같은 transaction이다. create/update/delete/getBracket의 기존 migration completeness guard는 이 단계 범위에서 보존한다.
- 단위2suites67/67PASS12.025s: official-team-match-authorization + tournament-bracket.service. 실제PG2suites6/6PASS14.269s: canonical-staff-scope + 신규 canonical-standings-recalculation. 새 실제 서비스 재계산 테스트는 canonical1:0, 상충하는 legacy0:9, 삭제된 canonical0:8을 함께 seed해 실제1:0만 양 순위에 반영됨을 검증한다. 관리자 감사 실패 시 두 view 모두 이전값 유지. 최초 새 테스트의 V1AuthUser 필드 누락 compile 오류는 보정 후 통과했다.
- 기존 실제 tournament-lineup-suspension fixture를 canonical TeamMatch/Details/TEAM_MATCH Game으로 전환했다. red-card 정지 제출 거부/상태 복구 및 규정 OFF 제출 성공은 실제PG2/2PASS8.919s. 이번 단계 중복 없는 실제DB 결과는3suites8개다. 기본역할 UI 흐름 실행으로 세지 않으므로11/42 유지.
- 독립 검수 및 source의 이제 도달 불가능한 legacy 조건 정리는 진행 중이다. 전체Phase3/table수축/기존데이터이관/남은31흐름/dev반영/alpha는 미완이다.
- Sol 추가3건 반영: actor는 TEAM_MATCH 외 source 및 relation 없는 orphan을 관리자도 거부하며 valid friendly TEAM_MATCH는 유지한다(최종 actor unit20/20PASS9.679s). 관리자 재계산은 nondeleted Details의 missing/wrong Game을 숨기지 않고 TOURNAMENT_MATCH_GAME_MISSING409로 거부한다. source/Game 집합을 같은 transaction에서 Game→TeamMatch 순서로 잠근 뒤 재조회하고 집합 변경은 COMMAND_CONCURRENCY_CONFLICT409다.
- 후속 실제 PostgreSQL 재계산4/4PASS11.419s: 기존2개 + incomplete canonical 거부/순위 불변 + 동시 삭제. 동시 삭제는 별도 tx에서 실제 Game FOR UPDATE를 잡고 pg_blocking_pids로 재계산 대기를 관측한 뒤 삭제 commit; 재계산409 및 양 view 불변을 검증했다. 시간 경과만으로 잠금을 추정하지 않는다. 중복 없는 실제DB는 현재10개(재계산4+staff4+출전정지2)이며 역할UI11/42는 그대로다.
- 최종 config 경합 보강: advisory→Tournament FOR UPDATE→Game→TeamMatch 순서로 규칙 조회까지 tx 안으로 이동했다. 실제PG에서 config writer의 advisory 대기를 관측하고 승점규칙3→4 및 대회/Game/TeamMatch pin 변경을 commit한 뒤, 재계산 응답의 새 config ID와 양 순위4점을 확인했다. 최종 재계산5/5PASS10.134s; 실제DB 중복 없는11개다. tx 밖 config ID 참조 compile 오류는 callback 반환값으로 보정 후 통과했다. 단위는 actor20/20, bracket50/50까지 총70개이며 config 이동 뒤 좁은 recalculate 검증은 진행 중이다.

- 단계 최종: config 이동 후 recalculate 단위6/6PASS12.323s(나머지44개는 이전50/50 증거를 재사용). Sol 최종 bounded source blocker0. 테스트 임시DB 잔여0, 전용DB stop, 테스트 handles 모두 종료. 이번 단계는 API/Web/Ego를 시작하지 않았고 타 세션 프로세스는 건드리지 않았다. 소유 파일 diff check 통과. 기존 Jest config ES-module warning은 출력됐지만 실행은 모두 명시한 최종PASS이며 이를 테스트 실패로 집계하지 않는다. 커밋/push/dev머지/alpha는 미실행이다.

### 2026-09-09 — G-A 두 팀 시상대·정규 리그 순위 연결 후속

- 사용자 지시대로 메모리 압박에서도 직렬·최소 worker로 진행했다. 두 팀 단일 조 리그의 `getTopThree` 3팀 최소 조건을 제거하고 실제 position 1~3을 보존했다. `AwardsPodium`은 존재하는 단상만 렌더한다. 1440px 실화면에서 각 단상이497px로 늘어지는 것을 확인해 내부 시상대 폭560px로 제한하고 중앙 정렬했다. 모바일152px 두 칸 배치는 유지한다.
- Sol이 실제 `regular_league` API는 `groups: []`라는 계약을 대조해 추가 누락을 발견했다. 정규 리그는 그룹 수와 무관하게 overall standings endpoint를 사용하도록 수정했다. 로컬 그룹을 넣은 정규 리그 테스트는 실제 응답을 대표하지 않으므로 단일 조 대회 테스트와 그룹 없는 정규 리그 endpoint 테스트로 구분했다.
- 로컬 읽기 검증용 대회 `1acff596-87c4-4e7a-9ab6-a3cf5ca74b55`를 별도로 생성했다. 초기 groups=[]는 bracketPublishedAt 미설정이 직접 원인이었으며 이 synthetic 대회만 공개했다. 현재 수동 seed 순위1/2는 UI 읽기 증거이고 경기 lifecycle/projector 완료 증거가 아니다. canonical 경기 연결 및 projection 보강은 진행 중이다.
- Ego242 guest 상세→시상 진입 및390/768/1440 캡처: `staff-ui/ga-podium-final-{390,768,1440}.png`는 폭 조정 전, `ga-podium-balanced-{390,768,1440}.png`는 조정 후. API가 제공한 두 팀명·순위와 상품 안내만 표시하며 없는 개인 시상은 등록 없음으로 구분한다. 가로 overflow 없음, 로그인CTA44px/13px. health/detail/player-records resource status200. CDP drainEvents가 비어 반환된 수집은 console/network 전체 무오류 증거로 인정하지 않는다.
- 중간 최종 Vitest2suites19/19PASS1.80s. 최초 assertion 중복/후속 fixture kind 불일치 실패를 실제 렌더 계약에 맞게 수정했다. Sol의 nullable teamName·position 하한 후속 검수 반영은 진행 중이다. 전체11/42 및 Phase3/dev/alpha 미완 상태 유지.
- 후속 완료: overall은 정수1~3/nonempty 팀명만 허용하도록 type guard를 보강했다. 해당13개 렌더 테스트 재검증13/13PASS1.30s, 마지막 Sol source review blocker0. 중복 없는 테스트 수는19개다.
- canonical 검증 데이터 보강 성공: match `e7aaa682-5100-4355-9887-2dba8c377cad`, TEAM_MATCH Game `bf16a3e0-e28a-4a44-a2e6-9f89cc6ca2af`, current OFFICIAL revision `820880af-7e1b-4c83-a53d-57659a71f76f` 1:0. persisted Details→Game→revision 재조회로 실제 group/overall projector 실행 후 North Stars1위3점1:0/River Rovers2위0점0:1을 anonymous API200에서 재확인했다. 초기 SYSTEM actor 식별자 누락과 Details에 없는 id select 실패는 각각 transaction rollback 후 보정했다. 이는 실제 DB 순위 projection/공개 읽기 증거이며 UI 경기 확정 lifecycle은 아니다.
- 마지막 실제 projection 화면 `staff-ui/ga-projected-{390,768,1440}.png`. 정규 리그 groups=[] API 연결 수정은 단위 렌더 증거까지이며 별도 실제 regular_league 시상 UI는 미실행이다. G-A 전체 상태/오류 시나리오와 Phase3/전체31개/alpha 검증은 미완으로 유지한다.
- 단계 종료: Ego242 done:true, API92217/Web92226·92228·92235 TERM, 전용DB stop. 에이전트3개 completed. 타 세션 프로세스는 건드리지 않았다. 소스 touched path marker 없음 및 diff check 통과. 커밋·push·merge·alpha 배포는 수행하지 않았다.

### 2026-09-09 — G-A 시상 화면 실제 Ego 검수·빈 상태 재배치

- 직전 라인업 전환은 progress. Ego241에서 완료대회 상세→시상 진입, 기존 first-user 로그인 상태 확인 후 실제 /my 로그아웃→/login 확인→guest 시상 재진입했다. completed fixture `d8168000-0000-4000-8000-000000000301` anonymous API200의 MVP label/recipient/team이 화면과 일치했다. 세 prize 필드는 null이다.
- 개인 기록의 기존 전체 페이지용 empty 영역이 후기를 아래로 밀어내는 문제를 확인하고 이 페이지 안에서 compact card로 바꿨다. 이후 후기 제목이 너무 붙는 것도 실제 screenshot에서 발견해20px 간격과 keep-all 줄바꿈으로 재조정했다. 모바일 before는 로그인 상태였으므로 guest 전후 기능 비교로 주장하지 않는다. tablet/desktop before는 확보하지 못했고 최종3viewport를 직접 확인했다.
- `prizeBreakdown`만 있는 실제 open 대회 `947942e0-1de5-49dd-968d-234353048234` API200(prizePool=null,prizeSummary=null,breakdown='1위 / 2위 / 3위')과 실제 화면의 안내3행을 대조했다. hasPrizeData 누락을 수정했고 `상금 안내 · 시상`/등록된 안내 정보 문구로 지급 완료와 구분한다. completed awards=[]는 '등록된 개인 시상이 없어요'로 바꿔 미확정 집계를 사실처럼 말하지 않는다.
- Vitest 최종 **10/10 PASS,1.45s**. 최초9PASS/1FAIL은 총액이 없는 breakdown-only에서 '총 상금'을 기대하던 테스트 오류였고 실제 heading/breakdown 내용을 검증하도록 고쳤다. 마지막 간격/keep-all 변경은 스타일뿐이며 실제 Ego로 재검증했다.
- 최종 `staff-ui/guest-awards-ga-final-{390,768,1440}.png` 직접 확인: 모두 scrollWidth=viewport, 로그인CTA44px/13px. before `guest-awards-ga-before-390.png`, breakdown `guest-awards-breakdown-390.png`. 관련 resource status는 health/tournament/player-records200. drainEvents는 attach/resize뿐이어서 전체 console/network 무오류 증거로 쓰지 않는다. 파랑/흰색 기존 대비 예외도 유지하며 AA PASS로 주장하지 않는다.
- G-A는 팀 podium 실데이터·개인시상 없는 completed 실제화면·전체상태/네트워크 검증이 남아 있어 미완이다. 전체11/42 유지. 이번 수정으로 UI/UX 진척은 있지만 전체E2E·dev/alpha 완료가 아니다.
- Sol source/3viewport 변경 검토 blocker0. Ego241 done:true, API73696/Web73708·73752·73771 TERM 종료, 전용DB exited를 확인했다. 관련3포트 리스너와 소유PID 없음. 모든 테스트/브라우저 실행 handles 종료, 다른 세션 리소스는 건드리지 않았다.

### 2026-09-09 — 신원 연결·라인업 진입 canonical 전환

- 직전 스태프 배정 전환은 progress이며 HEAD f06d804af/역할11/42 유지. GamesService의 `listClaimableParticipants`, `resolveFixtureLineupAccess`, `resolveFixtureLineupRoster` 세 메서드의 legacy fixture fallback을 제거 중이다. 대회 route는 같은 소유권의 non-deleted TeamMatch+Details+TEAM_MATCH Game을 요구하며 기존 not-found·side·roster·claim 권한 계약을 유지한다.
- Luna는 source/unit과 새 실제 PostgreSQL `canonical-tournament-lineup-access.integration-spec.ts`를 분리해 구현한다. Sol은 직접 소비 drift와 인가 경계를 검토하며 root만 직렬 테스트한다. 이 단계가 전체 GamesService legacy 제거 완료를 뜻하지 않는다.
- 단위 최초19PASS/1FAIL(2files,7.075s)은 TBD fixture의 Details 소유권 누락이었다. 배정 시각만 바꾼 중간 실행으로 해결되지 않았고, root가 game의 Details에 teamMatchId/tournamentId와 조회용 null-registration Details를 정확히 넣은 후 해당 file **16/16 PASS,5.741s**. controller file의4PASS와 합쳐 중복 없는20PASS다. 권한 기대값은 유지했다.
- 새PG 최초는 assignment/scope를 별도 autocommit해 DB deferred constraint에 막혔다. 하나의 실제 transaction으로 수정했다. 다음2PASS/2FAIL에서 자동 identity-link 참가자의 claimable 제외와 팀 고정 번호의 membership 의존 계약을 확인했다. 팀장을 플랫폼 관리자로 만들던 seed도 권한 검증을 왜곡하므로 별도 admin·팀장·상대팀장·비참가자로 분리 중이다. 실패한 테스트를 통과로 세지 않는다.
- 최종 실제 PostgreSQL **4/4 PASS,7.761s**. 플랫폼관리자/홈팀장/원정팀장/순수스태프/미연결등록선수/무소속 사용자를 분리했다. 연결된 참가자는 claimable에서 제외되고 미연결 참가자만 표시된다. 팀 고정번호7/8과 membership 없는 등록선수의 null을 경기 jersey9와 구분한다. 스태프 양쪽 roster, 각 팀장의 상대 roster 거부, 무소속 거부를 실제 인가로 확인했다. legacy/deleted 모두 실제Game이 있으며 세 진입API 각각404를 확인했다. Sol 최종 source/PG bounded review blocker0.
- 전체 역할 완료 수11/42는 유지한다. 이번 결과는 API service/실제 DB 계약이며 브라우저 UI 역할행이나 전체 GamesService command/access 전환 완료가 아니다. 전체Phase3·남은31흐름·dev/alpha 미완.
- 종료 확인: agent3개 completed, 모든 테스트 handles 종료, 자동clone0 확인 후 전용DB exited/55435 리스너 없음. 이번 단계 브라우저/API/Web서버를 시작하지 않았다. 소유 외 리소스는 유지했다.

### 2026-09-09 — 신규 스태프 배정 canonical scope 전환

- 직전 개인 기록 전환은 progress이며 HEAD f06d804af, 역할11/42를 재확인했다. `TournamentStaffService.assertStableScopes`가 legacy fixture와 canonical TeamMatch ID를 합쳐 허용하던 경로를 제거 중이다. 기존 fixtureIds API·오류 응답·감사 atomicity는 유지한다.
- 신규 배정은 삭제되지 않은 같은 대회 TeamMatch만 허용한다. 대회 Details 소유권과 leagueId null, 정규 리그의 kind/leagueId/tournamentId/Details-null 계약을 구분한다. 새 scope 저장의 legacy fixtureId branch도 제거한다. 기존 legacy Game 명령 접근은 별도 Phase3 잔여이며 이번 변경만으로 완료 처리하지 않는다.
- Luna source/unit과 실제 PostgreSQL regression을 분리하고 Sol이 권한·직접 소비 테스트를 검토한다. root만 직렬 검증한다. UI 역할행 수는 이 backend 검증으로 올리지 않는다.
- 최종 canonical scope PostgreSQL **4/4 PASS,8.217s**, unit **20/20 PASS,8.212s**. 같은 대회의 canonical scope와 정규 리그 배정/인계 성공, 다른 대회·legacy-only grant·삭제 경기 거부, 거부 후 assignment/scope/audit 불변을 확인했다. 최초PG3PASS/1FAIL은 추가 takeover 거부의 테스트 기대형식 오류였으며 기존 GamesService PERMISSION_DENIED 응답을 명시하도록 수정했다. 배정 오류의 CROSS_TOURNAMENT_FIXTURE_SCOPE는 유지한다.
- Sol source검토 blocker0이나 기존 `src/tournaments/staff/tournament-staff.service.integration-spec.ts`의 legacy-only seed drift를 발견했다. 해당 직접 소비 테스트도 canonical seed로 정리 후 실제 DB 검증한다. board suite의 이전 persisted scope read 호환성은 이번 신규 배정 계약과 구분해 유지한다.
- 직접 소비 스펙을 canonical TeamMatch/Details seed로 바꾸고, 현재 Jest integration 검색 범위인 `test/tournament-operations/staff-management.integration-spec.ts`로 이동했다. 이전 src 위치는 기본 discovery에서 누락됐다. 최종 실제 PostgreSQL **3/3 PASS,8.573s**: 최초 디렉터/권한 배정·즉시 회수와 감사 실패 transaction rollback assertions를 유지했다. 이번 단계 중복 없는 결과는 unit20PASS + 실제DB2suites7PASS이며 UI E2E 행은11/42 그대로다.
- Sol 이동본 최종 검토 blocker0, 에이전트3개 completed 확인. 자동clone 잔여0, 전용DB exited/55435 리스너 없음, 테스트 handles 종료를 확인했다. 이번 단계 브라우저·API/Web 서버를 시작하지 않았다. dev 커밋/머지·alpha 검증은 미완이다.

### 2026-09-09 — 개인 경기 기록 canonical-only 전환

- 개인 기록의 live legacy fixture 조회·hydrate fallback과 미사용 필드를 제거했다. 모든 정상 분류는 TEAM_MATCH를 요구한다. 대회는 TeamMatch와 Details의 tournamentId 일치, 정규 리그는 leagueId=tournamentId 및 regular_league kind, 친선은 양 ID와 Details가 모두 없어야 한다. 삭제·누락·교차 대회·legacy-only 기록은 친선으로 바꾸지 않고 집계와 목록에서 제외한다. current official·본인/공개 동의·participantResultId cursor 계약은 유지한다.
- 새 실제 PostgreSQL 회귀는 최초1FAIL/2PASS(13.33s): 테스트가 OFFICIAL 결과에 참가자를 추가해 DB trigger에 차단됐다. 정상 DRAFT→참가자→OFFICIAL 순서로 수정 후 최종 **3/3 PASS,19.481s**. canonical 문맥·현행 revision·같은 revision의 참가자 커서·동의 철회와 legacy-only 친선 오분류 제외를 확인했다.
- 개인 기록 unit 최종 **17/17 PASS,10.017s**. Sol source/unit/canonical PG bounded review blocker0. 직접 소비하는 lineup-consent/assist-foul/privacy 실제 DB 스펙3개도 canonical seed로 전환했으며 최종 실행 결과는 아래에 기록한다.
- 이번 단계는 backend 계약 검증이다. 역할 완료 수 **11/42(기본5/30+경계6/12)** 유지. 전체Phase3·남은31개·dev 반영·alpha 검증은 미완이다.
- 직접 소비 fixture의 confirmed registration·TeamMatch 홈/원정 mirror·Details 등록 연결·lineup roster를 보강했다. 최종 lineup-consent/assist-foul **2 suites,3/3 PASS,17.914s**. privacy는 최초 팀 mirror 누락으로11FAIL, 보완 후10PASS/1FAIL을 확인했다. 최초 확정 후 팀 전적 누락은 테스트 drain이 첫 empty claim을 완료로 오판한 문제였다. outbox writer의 DB now()/TIMESTAMP(3) 반올림과 worker의 즉시 claim 경쟁은 worker 주석214–240에도 설명돼 있다.
- privacy drain은 소유 경기의 OFFICIAL/VOIDED 이벤트 완료를 확인하고, PENDING만 짧게 재확인한다(25ms cadence/5초 deadline/50개 처리 제한). RETRY 등 실패 상태·lastError·25ms보다 먼 미래 예약은 즉시 실패하며 예정된 reminder/escalation은 완료 대상에서 제외한다. 단순 DB 조회 추가 후11PASS한 중간 결과를 수정 증거로 쓰지 않았다. 최종 helper에서 **11/11 PASS,10.344s**. 중복 없는 실제 DB 검증은4 suites17PASS, unit1 suite17PASS이며 전체 E2E/전체 API suite가 아니다.
- 다음 Phase3 잔여: staff scope의 legacy-only ID 허용, GamesService command/access의 legacy branches, bracket migration guard의 최종 전환 정합. 기존 오류 처리 계약을 유지해야 하므로 migration guard를 단순 삭제하지 않는다. 이번 단계 UI/브라우저/서버 실행은 없었다.
- Sol 최종 helper/consumer 검토 blocker0. 자동 DB clone 잔여0 확인 후 전용 teameet-task168-db 종료, 테스트 handles 모두 종료했다. Luna2개 completed, Sol은 최종 검토 수신 후 running 상태를 interrupt했다. 사용자 압박 예외를 적용해 직렬 진행했으며 다른 세션 리소스는 건드리지 않았다.

### 2026-09-09 — 공개 경기 기록 canonical-only 전환 검증

- 직전 G-T/실제 DB 검증은 progress였다. HEAD f06d804af와11/42 상태를 재확인했다. 이번 변경은 Phase3 전환이며 역할 행 완료 수는 늘리지 않는다.
- PublicTournamentRecordsService의 일정/상세/다음경기에서 live legacy 조회 arms를 제거했다. canonical Details+TEAM_MATCH만 읽고 UUID·응답 모양·visibility·공개 대진·커서·시간순서를 유지한다. 사용하지 않는 legacy 상세 selector/isCanonical marker도 제거했다.
- 실제 PostgreSQL `canonical-public-match.integration-spec.ts` 최종 **6/6 PASS,15.894s**. canonical 공개 상세·비공개404·숨김/페이지네이션·next 소유권/취소/시간/숨김·legacy-only 상세404/일정/next 제외를 확인했다.
- 최초5PASS 후 soft-delete 조건 누락을 발견해 반례를 추가했다. 실제 **2FAIL/4PASS,20.714s**에서 삭제된 next가 선택되고 삭제 상세가200으로 조회됨을 재현했다. 세 nested TeamMatch query에 deletedAt:null을 넣은 뒤6PASS. next는 삭제된14:45 후보보다 정상15:00 후보가 선택됨을 비교하며, 삭제 상세404/일정 제외도 검증한다. 이전 실행 수를 합산하지 않는다.
- 공용 단위 fake가 legacy 데이터에 의존하는 drift는 별도 Luna가 canonical fixture로 정리 중이다. 최종 단위 검증/리뷰 전이며 전체Phase3·남은31개·dev/alpha는 미완이다. 자동 DB clone 잔여 없음 확인 후 전용 DB를 종료했다.
- 후속 단위 fixture 전환 완료: canonical Details→TeamMatch→TEAM_MATCH Game을 사용하고 기존 lineup/event/visibility/consent/staff 권한 계약을 유지했다. legacy-only404 케이스 포함 최종 **37/37 PASS,16.303s**. source의 live v1TournamentFixture 조회와 제거한 marker 잔여 없음, touched diff check 통과. 새 UI 시나리오를 실행한 것으로 세지 않으며11/42를 유지한다.
- Sol 추가 감사에서 event-order/schedule-scorers 직접 소비 테스트의 legacy fake drift를 확인했다. 두 파일을 별도 Luna가 canonical fixture로 전환하고 기존 이벤트/득점자/시간미상 backfill/공개/커서 assertions를 유지했다. 해당2파일 **34/34 PASS,7.53s**. 중복 없는 관련 unit 합계3파일71PASS이며 API 전체 suite 통과로 주장하지 않는다. 실제DB는6PASS. 현재 단계는 backend 계약 검증이고 새 Ego 역할행은 실행하지 않았다.
- Sol 최종 bounded review blocker0. 테스트 handles 모두 종료, task DB stopped/55435 리스너 없음, 자동 clone 잔여 없음. 이번 단계는 브라우저/서버를 시작하지 않았다.11/42 및 dev/alpha 미완 상태를 유지한다.

### 2026-09-09 15:25 — G-T 실제 로그인 복귀 및 목록 DB 검증

- 직전 단계는 Phase3 소스와 실제 DB 증거를 추가한 progress다. HEAD f06d804af 유지. 최신 집계 **11/42 = 기본5/30 + 경계6/12**, 아래10/42는 이전 시점이다. G-T만 추가했으며 나머지31개는 미완이다.
- 전용 로컬 테스트 대회 `37be5df6-a4bd-4c00-acae-0358712b083c` API생성201(draft)→anonymous404→모집 시작201→anonymous200/entryFee0. Ego239 guest 상세에서 일정/마감/팀6~10명/팀장·운영진 신청/무료 확인→참가→로그인→이메일 로그인(first.user)→같은 대회 `/my` 복귀·팀 없음/팀 만들기 확인. `/tournaments` 실제 목록의 무료0/4 요약 및 해당 링크 클릭→같은 상세도 확인했다.
- 검증 종료 후 이 새 테스트 대회만 ID+title 조건으로 deleted_at를 설정했다(06:21:10.888 UTC). anonymousGET404 TOURNAMENT_NOT_FOUND request41. 삭제는 DB 선행 조건이며 UI 삭제를 실행했다고 주장하지 않는다. 일반 무료 참가에 입금/결제 필수 문구가 없음을 실제 화면에서 확인했다. Sol G-T 전체 계약 승인.
- `staff-ui/guest-tournament-390.png`, `first-user-return-390.png`, `first-user-list-390.png`, `first-user-detail-{390,768,1440}.png` 증거. 상세와 복귀 화면 직접 확인. 세 viewport 모두 가로 넘침 없음, 참가CTA50px/글자17px. UI 소스 변경은 이번 단계에 없다. 기존 파랑/흰색 대비 예외는 AA PASS로 바꾸지 않는다.
- `canonical-my-fixtures.integration-spec.ts` 최종 실제DB **4/4 PASS,25.878s**: owner/manager와 member/left 구분, canonical UUID/시간순서, 다른 팀/삭제 제외, 내 팀 Details 누락 오류, 정상 정규 리그와 잘못된 소유권 링크 구분. 최초0tests compile 실패(inactive enum 오기)를 left로 수정했다. 중간4PASS는 최종 mirror 보강 전 증거라 별도 합산하지 않는다.
- 실측 검토에서 regular_league 표시만으로 Details-null을 허용하던 gap을 발견해 `leagueId===tournamentId`도 필수로 검증하도록 수정했다. Sol 최종 소스 blocker0. 전체 Phase3와 dev/alpha는 미완이다.
- 종료 정리: Ego239 done:true, API92236/Web92246·92291·92304 TERM 종료, 전용 DB stopped, 3013/8121/55435 리스너와 해당PID 없음. 자동 integration clone 잔여 없음, 에이전트3개 completed. 다른 세션은 건드리지 않았다.

### 2026-09-09 15:05 — canonical 승부차기 실제 DB 검증

- 직전 턴은 G-V 완료와 실제 구현/검증을 추가한 progress였다. HEAD f06d804af와 현재 10/42 집계를 재확인했다. 이번 Phase3 회귀 검증은 별도 역할 행 완료로 중복 집계하지 않는다.
- `test/tournament-operations/canonical-result-review.integration-spec.ts` 실제 PostgreSQL **4/4 PASS, 26.079s**. canonical 결선 무승부 정정의 승부차기 누락 거부/리비전 수 불변, 정상 5:4(양쪽5회) DRAFT 저장→OFFICIAL→재조회, 정규 리그 승부차기 거부를 검증했다. 기존 명령재전송/다음경기 상태 conflict/승자 교체/감사 실패 rollback도 같은 suite에서 실행했다. 실제 staff access와 Prisma transaction을 사용했다.
- 첫 시도는 임의 DB 이름 guard에서 0 tests로 중단됐다. 수동 생성한 전용 복제본 `task168_penalty_20260909`는 삭제했고, 승인된 `ulw_v1_integration_task168`를 입력으로 저장소 isolated environment가 자동 복제·회수하는 경로로 통과했다. 보호 규칙을 우회하지 않았다. 테스트의 미결판 승부차기 fixture와 preview hash 누락도 실행 전에 수정했다.
- 팀장/운영진의 `my-fixtures` 목록에서 legacy 조회/병합을 제거하는 작업 진행 중. 원래 scheduledAt→id 정렬과 owner/manager 경계를 유지한다. 이관 불일치를 조용히 누락하지 않고 명시적409로 처리하는 후속 검토를 반영 중이다. 최초 좁은 unit은1PASS/68SKIP였으며 후속 변경의 최종 증거는 아직 아니다.
- 최종 목록 변경: legacy query/merge 제거, canonical UUID/시간→ID 정렬/게임 없는 경기 유지. 내 팀 소유의 누락 Details 또는 잘못된 Game source는409 TOURNAMENT_MATCH_MIGRATION_REQUIRED로 명시한다. Details가 원래 없는 정규 리그는 구분한다. 기존 owner/manager gate를 바꾸지 않았다. 최종 좁은 unit **4PASS/68SKIP, 13.612s**; 같은 시간 ID 순서·fixtureNumber 무관 시간 순서·source 불일치·Details 누락을 검증하고 membership/registration/query scope를 확인했다. 72개 전체 통과로 주장하지 않는다. 실제 목록 UI/DB 역할 행은 후속 검증 대상이다.
- Sol 최종 bounded source review blocker0. 정규 리그 Details-null 목록 예외의 직접 단위 케이스는 아직 없어 후속 실제 목록 검증에서 보강한다. 전체10/42 유지, dev/alpha 미완. 종료 시 전용 DB stopped/55435 리스너 없음, 테스트 handle 종료, 자동 DB clone 잔여 없음 확인. Node90/browser90(시작90/101), 다른 세션 프로세스는 종료하지 않았다.

### 2026-09-09 14:57 — G-V 수정·실제 검증 완료

- 최신 집계 **10/42 = 기본 4/30(G-M·G-V·A-A·A-V) + 경계 6/12**. 아래 9/42는 이전 시점이다. Sol source/증거 검토와 최종 390px 줄바꿈 재캡처를 통과했다. M-V/L-V는 미완이다.
- 후기 유무에 관계없이 guest 로그인/작성 자격 안내를 표시한다. 실제 로그인 버튼 클릭→`/login?redirect=%2Ftournaments%2Fd8168000-0000-4000-8000-000000000301%2Fawards` 도착. 앞선 실제 GET200/POST401 및 X12 숨김 제외 증거와 연결해 G-V를 완료했다.
- awards/detail query 복원 중 isPending=true/isLoading=false/data=undefined를 skeleton으로 처리하고 실제 오류를 유지했다. awards 최종 **9/9 PASS**, detail **3/3 PASS**. 수정 전 테스트 횟수는 합산하지 않는다. Phase3 penalty 별도 **51/51 PASS** 및 Sol source blocker0; 실제 DB 승부차기 정정 실행을 대신하지 않는다.
- Ego238에서 390/768/1440 화면 직접 확인: 로그인 CTA 높이44px/글자13px, scrollWidth=viewport. 390 한국어 단어 중간 분리를 keep-all로 수정 후 다시 직접 확인했다. `staff-ui/guest-awards-390.png` before, `guest-awards-after-{390,768,1440}.png` after. tablet/desktop before는 없어 전체 before/after라고 주장하지 않는다. 개인 기록 빈 상태의 큰 여백은 별도 UI/UX 잔여 관찰이다.
- 남은32/42, Phase3 최종 제거/DB 검증, dev 반영/alpha는 미완이다.
- 종료 정리: Ego238 done:true, API63130/Web63245·63247·63254 TERM 종료, 전용 DB stopped. 관련 리스너/PID 없음과 에이전트 completed를 확인했다.

### 2026-09-09 14:46 — Phase3 승부차기 gap 및 guest 후기 진입 점검

- 직전 단계는 X10 완료로 authoritative evidence가 증가한 progress다. 현재 HEAD f06d804af를 재확인했다. 전체 집계는 9/42로 유지한다.
- Phase3 source audit에서 결과 정정 `assertPenaltiesForRevision`이 legacy fixture facts만 읽어 canonical TEAM_MATCH 결선의 승부차기 판정을 잘못하는 gap을 확인했다. Luna가 해당 서비스와 좁은 회귀 테스트를 수정 중이다. legacy query arms 최종 제거도 별도로 남아 있다.
- 후속 구현/실행: canonical Details의 phase/진출 edge를 읽도록 수정. 결과 review unit **51/51 PASS, 9.659s**. 최초 48 FAIL은 더 이상 허용되지 않는 TOURNAMENT_FIXTURE 기본 fixture 때문이었고, canonical 기본 fixture로 전환 후 남은 fieldId:null 미보존 1건도 수정했다. 실패 실행은 최종 PASS 수에 더하지 않는다. API 문서에 정정/재제출의 canonical 승부차기 계약을 동기화했다.
- Sol은 M-V/L-V에서 대회 전체 후기(owner/manager)와 경기별 상대 후기(active member/출전 조건)를 혼동하지 않도록 판정했다. 시나리오의 후기 종류를 명시했으며 권한이나 전체 범위를 변경하지 않았다. G-V의 populated 목록 안내 누락 및 query restore isPending 상태의 false error를 수정/검증 중이다.
- Ego237에서 실제 로그아웃 후 공개 시상/후기 페이지를 조회했다. 공개 후기 GET200, guest POST401 UNAUTHENTICATED(request48). 390×844 screenshot `output/ego/competition-full-goal-20260908/staff-ui/guest-awards-390.png` 직접 확인: 수상자·공개 후기 표시, 개인기록 빈 상태가 큰 세로 공간을 차지함. 후기 있는 상태에 로그인/자격 안내 CTA가 없어서 G-V는 PASS로 승격하지 않았다.
- 초기 상세/시상 화면에서 오류 문구가 잠깐 표시되고 이후 API200 데이터로 정상 렌더됐다. 초기 상태 전환은 미해결 관찰 사항이다. 마지막 추가 DOM 계측은 JS regexp escape 오류로 실패해 근거로 세지 않았다. 앞선 pageInfo와 screenshot만 유효하다.
- 런타임 정리: Ego237 done:true, API47865/Web47879·47887·47893 종료, 전용 DB stopped; 해당 PID와 3013/8121/55435 리스너 없음. 다른 세션 리소스는 유지했다. 사용자 pressure 예외에 따라 진행했으며 이번 단계 호스트 baseline은 Node91/browser80, 12 cores, load6.91/7.75/10.66, swap 약16GB였다.

### 2026-09-09 14:40 — X10 실제 운영 화면 권한 회수 검증

- 최신 집계 **9/42 = 기본 3/30 + 경계 6/12**. 아래 8/42 기록은 이전 시점이다. Sol 독립 검토에서 X10 승격 승인; S-T의 director/field/support 전체 역할 흐름은 여전히 미완이다.
- Ego236에서 owner의 실제 디렉터 배정 → staff 이메일 로그인 → 내 담당 대회 → 운영 콘솔 진입 → 일시 중지를 실행했다. Game `f6e58410-05e1-4bfb-a9aa-19e6cd9c836a`의 LIVE v1→PAUSED v2 저장을 DB로 확인했다.
- 로컬 admin revoke HTTP200, 배정 version1/revokedAt 및 감사 사유 저장 후 같은 열린 콘솔에 권한 경고와 재개/종료/골/자책골/파울 비활성화를 확인했다. 회수된 staff의 events GET은 HTTP403 PERMISSION_DENIED였다. 이전 실제 Socket.IO PostgreSQL 검증의 만료/다른 필드/정상 observer 대조와 연결했다.
- reconnect resync의 STAFF_SCOPE_DENIED에서도 held takeover를 REVOKED로 전환하도록 수정했다. durable queue는 보존한다. 관련 Vitest 3/3 PASS(14:29, 단일 worker), 초기 실패 fixture 수정 후 재실행 결과다. Sol source 검토 blocker 0.
- 390/768/1440 실제 화면을 직접 확인했으며 tablet/desktop scrollWidth는 viewport와 같았다. before/revoked screenshot은 `output/ego/competition-full-goal-20260908/staff-ui/operate-*.png`. 이 경기의 TBD 팀/장시간 타이머는 기존 선행 fixture이므로 전체 경기 생애주기 증거로 사용하지 않는다.
- 남은 33/42, Phase3 최종 전환, dev 반영과 alpha 검증은 미완이다. 사용자 메모리 압박 예외를 유지한다.
- 단계 종료 정리: Ego236 done:true, 소유 API30067/Web30074·30082·30089 TERM 종료, 전용 DB stopped. 해당 PID와 3013/8121/55435 리스너 없음 확인. 에이전트 3개 completed이며 타 세션 프로세스는 종료하지 않았다.

### 2026-09-09 14:20 — 실제 검증 재개 결과와 스태프 입력 UI 수정

- 사용자 예외 지시를 적용해 pressure 2에서도 직렬 실행했다. 최종적으로 수정 대상 API unit 10개 파일이 각각 통과했다(실패 후 해당 파일만 재실행). 연결 fixture 인증 metadata/고유 socket ID, join→backfill 실패 cleanup, snapshot 변수 shadow/type, identity REQUESTED participantId 누락을 수정했다. 초기 실패를 통과 숫자에 합산하지 않는다.
- 실제 PostgreSQL integration: historical importer/full-cutover **2 suites 8 tests PASS**, 실제 Socket.IO **1 suite 1 test PASS(20.162s)**, staff revoke·audit rollback **1 suite 3 tests PASS(15.955s)**. 소켓 fixture는 실제 약관 서비스 동의를 거쳐 관리자 wire append ACK+DB event 1개를 확인하고, 같은 이벤트의 허용 observer 수신/회수·만료 operator 미수신을 검증한다. Sol 증거 검토 fake-positive blocker 0. X10의 UI 편집 차단은 미실행이므로 전체 집계는 **8/42**다.
- Ego235 스태프 페이지 owner001 실측: 모바일 field input이 `flex-1` column 영향으로 21px이었다. `min-h/h 44px + flex-none sm:flex-1`, 모바일 16px 글씨로 수정했다. 등록/배정 버튼은 공통 의미 토큰으로 맞췄다. 기존 사용자 결정(`globals.css` 2026-08-27)에 따라 흰색/파랑 약3.7:1 대비는 유지하며 AA PASS로 보고하지 않는다.
- 실제 UI 경기장 등록→확인→성공 표시→페이지 재진입 후 유지, DB ID `5f92306c-ee52-464a-9781-4d1563484188`, 이름 `Task168 A구장`. fields 재조회 API200. 모바일 재진입 실측 input44px/font16px, scrollWidth390=viewport390. 390/768/1440 screenshot 직접 확인; `output/ego/competition-full-goal-20260908/staff-ui/after-*.png`와 `field-created-390.png`. 초기 before 이미지는 Ego 공용 임시 파일이 다른 세션 캡처로 덮여 증거에서 제거했다. 최초 390 화면은 직접 관찰했으나 신뢰 가능한 before 파일은 남지 않아 before/after 전체 증거 완료로 세지 않는다.
- dev 머지·alpha 및 남은 역할별 E2E는 미완이다. 이번 실제 DB 검증은 전용 로컬 DB/격리 clone에서만 수행했다.
- 종료 정리: Ego235 `done:true`, 소유 API17550/Web17853·17859·17881 TERM 종료, 전용 DB stopped. 서브에이전트3개 completed. 사용자 명시 예외는 유지되며 다음 실행에서도 메모리 압박만으로 중단하지 않는다.

### 2026-09-09 13:48 — 사용자 명시 예외로 실행 검증 재개

- 사용자가 “메모리 압박 해소 또는 압박 상태에서도 진행해”라고 명시했다. 이 작업은 pressure 2가 유지되어도 직렬·최소 worker로 진행한다. 압박만으로 다시 중단하지 않으며 타 세션 프로세스는 종료하지 않는다.
- 첫 좁은 API unit 실행: 7 suites 중 4 PASS/3 FAIL, 실행된 tests 131 PASS/6 FAIL. main/protocol socket fixture의 연결 수명주기·퇴장 순서 기대값과 snapshot fixture 타입/변수 shadow 오류를 발견했다. 실패를 숨기지 않고 Luna 2개 담당으로 수정 중이며 root만 테스트를 직렬 실행한다.
- 기준선 `/tmp/task168-resume-process-baseline.txt`, 첫 Jest PID 99855/PPID 99841 종료 확인. 전용 `teameet-task168-db`를 시작했고 포트 55435, pg_isready 정상. 다른 Docker 컨테이너는 건드리지 않았다. 현재 PostgreSQL importer/full-cutover/실제 Socket.IO integration 실행 중이며 결과 확정 전이다.

### 2026-09-09 12:15 — 실행 환경 blocker 확정

- 직전 턴은 원본별 이관 보고와 실제 DB 회귀 소스를 추가한 progress다. 이번 턴의 현재 소스/환경 재확인 결과, 다음 필수 단계는 누적 수정분의 좁은 실행 검증이다. 이 검증 없이 최종 legacy 제거·dev 통합·alpha로 진행하지 않는다.
- 메모리 pressure 2가 세 번 이상의 연속 goal turn에 걸쳐 유지됐으며 현재 swap 약 14.6GiB, 12코어 load 9.10/8.61/7.95다. load보다 메모리 압박이 실행 차단 원인이다. `.codex/qa-rules.md` Host load preflight에 따라 테스트·빌드·Ego·runtime 시작을 보류한다.
- 소유 API/Web/DB 포트 3013/8121/55435에 리스너 없음. 실행 중인 외부 프로젝트 Docker 컨테이너는 종료하지 않았다. 대기 중인 소유 테스트나 브라우저 작업이 없으므로 verified wait로 처리하지 않는다.
- 다음 재개 순서: 현재 변경된 API 단위 계약 → 실제 Socket.IO 및 historical/full-cutover PostgreSQL 테스트 → 미실행 34개 역할/경계 흐름과 Ego 시각 검수 → Phase 3 최종 전환 검증 → dev 머지/alpha. 완료 범위는 계속 **8/42**이며 축소하지 않는다.
- 자동 진행은 실행 환경 blocker로 중단한다. 메모리 압박 해소 또는 사용자의 명시적 load-gate 예외 지시 후 호스트 상태를 재확인하고 위 실행 단계부터 재개한다. 구현 완료나 테스트 통과 판정이 아니다.

### 2026-09-09 12:10 — 이관 원본별 증거와 기록 보존 테스트 보강

- 직전 goal turn은 권한 회수 await와 현재 revision 메모 조회를 수정한 progress다. 현재 HEAD는 `f06d804af`, 실행 완료 집계는 **8/42**다.
- 원본 결과별 `originalResultId → teamMatchId → gameId → officialRevisionId` 연결을 전체 이관 결과의 `resultLineageDisposition`에 추가했다. exact-set·귀속·잔여 링크 검증 이후 실제 DB 조회 값으로만 `VERIFIED`를 구성하고 원본 결과 ID 순으로 정렬한다. 이 상태는 이관 데이터 불변식 검증을 뜻하며 E2E 완료 판정이 아니다. 원본이 없으면 빈 배열이며, 실제 DB 재실행 결과의 안정성 검증 소스를 추가했다.
- 별도 no-Game 이관 PostgreSQL 시나리오에 관리자 계정→revision 작성자 매핑, 게스트 득점·여러 득점의 순서/ID·승부차기 보존과 Game/revision/lineage 각각 1개 유지 확인을 함께 추가했다. 테스트 파일 작성은 해당 사용자 흐름 실행 완료를 뜻하지 않는다. DB schema/migration 추가 변경은 없다.
- 12:09 호스트 pressure 2, swap 약 14.4GiB, load 10.40/8.29/7.45. 신규 테스트·서버·브라우저 실행은 보류했으며 타 세션 프로세스는 건드리지 않는다. 실제 E2E·시각 검수·dev 머지·alpha는 계속 미완이다.
- Sol 최종 소스 검토 blocker 0, 해당 경로 diff check 이상 없음. 실행 PASS는 미확인이다. 에이전트 3개 모두 completed 확인, 이번 턴 runtime 생성 없음, 대상 포트 3013/8121/55435 리스너 없음. 동일 command signature 54개 증가 없음.

### 2026-09-09 12:00 — 권한 회수 응답과 역사 메모 계약 보완 중

- 직전 턴은 프로세스 상태 재확인과 현황 보고만 했으므로 no progress로 분류한다. 이번 턴은 현재 소스를 재확인하고 별도 구현을 진행한다. 검증 집계는 **8/42**로 유지한다.
- `revokeStaff`가 DB transaction 완료 후 비동기 game-room 퇴장을 기다리지 않던 연결 누락을 수정했다. 권한 회수 성공 응답은 해당 방 퇴장 이후 반환하며, 감사 저장 실패 시 배정 변경 rollback과 퇴장 미호출을 확인하는 PostgreSQL 회귀 소스를 추가했다. 실행 전이다.
- 역사 결과의 공개 메모는 현재 OFFICIAL revision에 연결된 immutable lineage에서만 조회하도록 구현했다. Sol이 몰수·중단 사유인 `outcomeNote`를 일반 메모로 반환하는 의미 혼합을 지적해 제거했다. 정정 revision에 lineage가 없으면 과거 메모를 재사용하지 않으며, 서로 다른 lineage 메모가 연결된 비정상 데이터는 임의 선택하지 않는다. 원본 메모를 `outcomeNote`에 복사하거나 immutable revision을 수정하지 않았으며, 조회/resolver 회귀 소스는 실행 전이다.
- 호스트 pressure 2와 swap 약 15.5GiB가 유지돼 자동 테스트·typecheck·브라우저·서버를 시작하지 않았다. source 검토나 테스트 작성은 실행 PASS가 아니다. dev 머지·alpha·나머지 사용자/시각 검수는 미완이다.
- Sol 최종 소스 재검수: 이번 변경 범위 blocker 0. 테스트·DB·UI 실행 판정은 아니다. Luna 2개 작업 완료, Sol 결과 수신 후 종료 상태 확인. 이번 턴 소유 runtime 생성 없음, 3013/8121/55435 리스너 없음, 동일 command signature의 54개 이상 증가 없음.

### 2026-09-09 — 실시간 권한·이관 누락 검증 소스 보강, 실행 전

- 완료 수는 **8/42**로 유지한다. 이번 단계에서는 테스트·typecheck·빌드·브라우저·서버를 시작하지 않았다. dev 커밋·push·머지와 alpha 검증도 미완이다.
- 시각 검수는 역할별 문서의 기록표로 관리한다. 버튼 크기, 글자 크기·줄 높이, 색 대비, 정렬·여백, 반응형·마지막 스크롤, 키보드·오류 후 복귀를 개별 판정한다. 시상 모바일의 기존 Ego before/after 캡처를 재검토했으며 새 라이브 검수를 실행한 것은 아니다.
- 실시간 구독은 대기 중인 요청과 마지막 승인 권한을 분리했다. Sol의 두 차례 리뷰에서 나온 만료·취소·늦은 응답 경쟁 조건 때문에 이 부분은 Sol이 구조를 수정하고 root가 재검토했다. 실제 만료 시각, 방 소유 generation, 재가입 시 전체 snapshot, disconnect/destroy의 timer 회수를 함께 처리한다. 친선 경기 역시 읽기 권한 확인 뒤에만 방에 들어가며 이전 요청이 새 연결을 끊지 않게 한다.
- 이벤트 조회는 동일 RepeatableRead transaction의 version·state·lastSequence·events를 반환한다. root는 서버 오류를 권한 거부로 바꾸지 않도록 기존 예외 계약을 유지하고, 취소된 승인 lease의 registry 정리 및 방 회수 완료를 기다릴 수 있는 내부 Promise 계약을 보강했다.
- 프로필의 canonical 대회 참가 수와 계정 연결 만료 알림 분류를 수정했다. 리그/친선과 손상된 Details 조합을 구분하며, 만료 작업은 participant가 payload의 gameId에 속하는지 쓰기 전에 검증한다. 다른 경기 version이나 알림을 변경하는 잘못된 payload를 거부한다.
- 전체 이관에는 원본 result ID와 lineage ID의 정확한 집합·대회·TeamMatch·Game·official revision 귀속 검증을 추가했다. 실제 PostgreSQL 회귀 코드는 추가 lineage가 있을 때 새 경기 전환 전체가 rollback되는 상황과 재실행 불변성을 다룬다. **이번 추가 회귀는 아직 실행하지 않았다.** 공개 note 반영, 전체 disposition 보고, importer 추가 경계, 최종 legacy 제거는 계속 미완이다.
- 검증 대기: gateway 및 protocol/handshake/takeover unit, snapshot unit, profile/identity-expiry unit, 실제 Socket.IO integration, 강화된 full-cutover integration. deferred 테스트는 단일 microtask 대기 대신 명시적 진입 신호와 실제 room membership을 사용한다. 테스트 파일 작성이나 diff 검사만으로 PASS 처리하지 않는다.
- 11:50 호스트: 12코어, load 7.53/6.16/6.15, memory pressure 2, swap 사용 약 15.5GiB, Node 100·브라우저 80. 메모리 게이트에 따라 새 부하 실행을 보류했다. 전용 runtime 포트 3013/8121/55435는 열려 있지 않으며 타 세션 프로세스는 종료하지 않았다.

### 2026-09-09 11:10 — 시각 검수 항목 구체화와 소켓 만료 검증 준비

- 전체 완료 수는 **8/42**다. dev 머지·alpha 검증은 아직 하지 않았다.
- 역할별 시나리오에 화면별 시각 기록표를 추가했다. 버튼 실측, 글자 크기와 줄 높이, 색 대비, 정렬·여백, 반응형·마지막 스크롤, 키보드·오류 후 복귀를 각각 판정한다. 기능 흐름의 성공 수와 전체 시각 검수 완료를 혼동하지 않는다.
- Luna가 실제 Socket.IO/PostgreSQL 통합 테스트를 작성했다. 취소 후 수신 차단과 실제 배정 만료 시각 이후의 차단을 정상 권한 관찰자와 비교한다. 현재 실행 전이며 PASS 증거로 세지 않는다.
- 배정 만료를 클라이언트 ping에 의존하지 않도록 Gateway와 권한 principal을 수정했다. root/Sol이 초기 구독·취소·만료·재가입의 경쟁 조건과 타이머 회수를 검토 중이다. 검토에서 드러난 결함을 해결하기 전 완료 처리하지 않는다.
- 프로필 대회 참가 수와 계정 연결 만료 알림의 canonical 경기 분류도 수정 중이다. 정규 리그를 대회로 잘못 세는 비정상 Details 조합까지 검토한다.
- Sol의 역사 기록 재점검에서 원본 lineage/import 구현과 기존 DB 증거를 확인했다. 남은 것은 공개 note 반영, 전체 원본 result ID와 lineage ID의 일치 확인, importer의 기록자·guest·승부차기·득점 순서 추가 증거, 최종 legacy 제거다. Luna가 전체 ID 일치와 귀속 검증을 먼저 보강하며, 다른 항목은 미완으로 유지한다.
- 이벤트 조회는 동일 RepeatableRead transaction에서 version·state·lastSequence·events를 반환하도록 보강했다. 실제 소켓 가입 순서와 결합해 재가입 중 이벤트 누락이나 오래된 경기 상태 반환을 막는 작업이며, 이번 수정의 실행 검증은 아직 하지 않았다.
- 호스트 load는 12코어보다 낮아졌지만 메모리 pressure 2가 유지돼 새 자동 테스트·서버·브라우저는 시작하지 않았다. 코드·문서 작업은 계속하며 타 세션 프로세스는 정리하지 않는다.

### 2026-09-09 10:56 — 실제 소켓 회수 검증과 만료 시각 차단

- 직전 goal turn은 시상/후기3개행 및source수정/실행증거를추가한progress다. 현재HEAD는f06d804af, 전체8/42유지.
- 추가source결함: realtime은ping기반60초재검증이라ping중단시배정만료후계속수신가능함을기존주석도인정한다. 이는S-T/X10의만료적용기준에미달한다. 단순서버sweep60초로성공기준을낮추지않고실제expiresAt deadline에서읽기room회수·유효한대체권한재검증·disconnect/unsubscribe/revoke/destroy시정리를검토한다.
- Luna implementation_inventory는실제Nest/Socket.IO/PostgreSQL기반test/realtime/canonical-game-subscription.integration-spec.ts를작성중이다. mocked socket/직접gateway호출은실제E2E로세지않으며, canonical대회·정규리그의revoke/expiry와다른field거부를검증한다. root가실행을소유하고Sol은race/타이머수명주기를검토한다.
- Luna flow_contract_map은profile countOfficialGameAppearances의canonical대회횟수누락과identity-link-expiry의잘못된team_match알림분류를수정중이다. 현재실행/완료미확인. 외부알림은전송하지않는다.
- 10:49~10:56 pressure2에서신규고부하테스트/개발서버시작을보류했다. 코드분석과수정은계속하며타세션프로세스를종료하지않는다.

### 2026-09-09 10:40 — 시상 UI·후기 moderation, 정규리그 staff/realtime 경계

- 최종10:46증거: **8/42 = 기본3/30(G-M·A-A·A-V) + 경계5/12(X04·X07·X08·X09·X12)**. duplicate400/rows불변, ops어워드PUT200, ops후기hide200→anonymous0→unhide200→anonymous1/원문보존, Sol증거심사완료. 아래6/42/보류는이전시점이력이다. realtime28/28, resolver/staff후속PASS, field실제DB3/3PASS12.029초. 실제소켓회수E2E/dev머지/alpha미완.
- 실제 시상 저장PUT200/재조회/DB감사, 종료 검증 대회301에서 guest 공개MVP 확인. 모바일 입력순서/44px추가버튼/반응형배치 수정. 대회밖recipient400, support/member/staff쓰기403, 지원관리자읽기200, 실패후수상내역불변. duplicate awardType은500을발견하여400사전검증수정; 최종HTTP재실행전.
- 팀장004 실제후기POST201 → owner001 숨김PATCH200/사유감사 → 공개원문제거 → 공개전환/원문복구/감사확인. support/팀장/팀원/staff의hide403. 증거 `output/ego/competition-full-goal-20260908/awards-moderation-20260909.md`.
- Sol 증거심사에서 **X12 로컬 완료**, 합계 **6/42 = 기본1/30 + 경계5/12**. A-V owner 경로는입증했으나ops양성/숨김상태anonymousGET보강전전체행보류. A-A duplicate400최종검증전보류.
- source수정: 리그공통결과resolver fixtureId보존/kind판별, staff관리ALL_COMPETITION_KINDS와경기범위, canonical/league실시간구독registry·취소/만료회수, malformedkindfail-closed. Sol source추가blocker0. 첫unit실행은realtime nullablekind타입오류및resolver spec2건실패; 실제수정·재실행전이며 source검토를PASS테스트로대체하지않는다.
- Ego226 종료, 소유Web/API정리후압박회복. 최종API검증/좁은테스트진행중. dev HEAD f06d804af, 커밋·push·merge·alpha 미완.

### 2026-09-09 10:15 — 실제 대회 리뷰 저장, 터치 영역·반응형 배치 보강

- 최종 검증: 리뷰 batch unit34/34, 최신batch 실제DB리뷰3/3, 리뷰 UI/view-model17/17 PASS. Config 실제DB3/3 PASS8.766초(`/tmp/task168-config-real-db-retry.log`): period ID보존·추가/삭제, 진행경기pin보존/확인gate, 독립대회SCHEDULED→LIVE경합의실제Game row-lock대기·잠금뒤impact재검증. 최초fixture실패는Sport및periodJSON제약정합화로해결했고DB제약은변경하지않았다. 복제DB잔여0. 아래 실행전 표기는 이 최종 결과로 갱신한다.
- Ego 실제 관리자 배정/일정 PATCH200 → 경기 시작/종료201 → 결과 OFFICIAL 확정201 → 참가팀장 별점4+태그 리뷰 POST201 → DB 귀속/작성 목록/재진입 잠금 확인. 경기 `07de1d55-3468-4b69-9ef3-9c0bc0bed297`, 리뷰 `c55136a0-d579-40d6-9672-c7c1bcbf878a`. 이 신규 경기의 worker/public projection은 미실행이다.
- 목록 대상7/상세1 불일치는 공식 참가 이력 기준 집계로 수정하고 live 목록1을 확인했다. 후속 batch는 최대3query로 정리, mock 바인딩 정합화 후 unit2suites34/34 PASS6.024초. 최신 batch의 실제 DB 검증은 별도 결과를 기록한다.
- 리뷰 별점 pseudo 터치영역 겹침 수정, 별점/태그 전체 카드 폭 사용, 단일 팀 대상 데스크톱720px 카드로 재균형. 320/390/768/1440px overflow없음, 320 하단 scroll 확인. 파울 바 모바일 줄바꿈·태블릿/데스크톱 배치 직접 확인. 팀 리뷰 수치 ‘명’→‘건’ 실제 재진입 확인.
- Config 변경 소비처를 canonical TeamMatch로 전환하고 Game→TeamMatch 잠금 순서, 잠금 뒤 CAS/impact 재확인, 미시작 Game pin/period 동시 정합화를 보강했다. unit6/6 PASS. 실제 DB 최초 실행은 template Sport 부재로 실패; fixture 보강 및 Sol이 찾은 동시성 테스트 증거 결함을 수정했다. source 추가blocker0, 최종 실행 결과는 후속 기록한다.
- 상세 증거: `output/ego/competition-full-goal-20260908/tournament-review-ui-20260909.md`. 10:11 pressure2에서 새 테스트를 보류했고 소유 Ego/API/Web 정리 후 pressure1/free44%로 회복되어 단일worker 검증을 재개했다. 전체 완료수5/42, dev머지·alpha 미완.

### 2026-09-09 09:32 — 리뷰·관리자 canonical 전환 및 실제 DB 통합 검증

- Phase3 리뷰 Wave A/B: 실제 대회 리뷰 원천을 TeamMatch+Details+TEAM_MATCH Game의 현재 OFFICIAL로 전환. business discriminator `tournament_fixture`와 보존 UUID, 대회별 중복·기간·권한·공개 계약 유지. 일반 `team_match` 접근의 대회 우회는409로 차단하고 리그 경로는 유지한다.
- 대회 신뢰 경기 수는 Details 등록팀 기준으로 한 번만 집계하며 친선/리그/VOID/legacy 미러 합산 제거. 관리자 `hubInbox`도 canonical TeamMatch로 전환해 기존 검토대기·관리자권한 조건을 유지한다. API 계약 문서 sync 및 Sol source 검토 blocker0.
- 단위 검증: 리뷰 관련3suites86/86, 후속 trust조건4/4, 관리자hubInbox3/3(50skip). 실제 PostgreSQL 통합 최종2suites5/5 PASS30.417초: canonical count/pending, source→submit→DB귀속재조회→중복rating불변→비참가자거부, 관리자pending2건/일반사용자거부. 테스트 복제DB 잔여0. 로그 `/tmp/task168-review-admin-real-db-final.log`.
- 구현/검증 근거: `output/ego/competition-full-goal-20260908/review-wave-b-20260909.md`, `apps/v1_api/test/reviews/canonical-tournament-review.integration-spec.ts`, `apps/v1_api/test/admin/canonical-inbox.integration-spec.ts`. 브라우저/HTTP E2E 증거로 확대해석하지 않는다.
- 결과 승인 UI 득점자/MVP/카드대상은 기존 caption12px→body15px/24px로 개선, Ego390/768/1440 실제화면 재검수. `readability-review-20260909.md` 참조.
- 전체 완료수는 여전히5/42. 나머지 Phase3 소비처·전체역할/경계·UI/E2E·커밋본검증·dev머지/alpha 미완. 이전 날짜 항목의 진행중/실패 상태는 해당 시점의 이력이며 위 최종 검증으로 갱신된다.

### 2026-09-09 09:00 — 친선 승인·공식 결과·양 팀 기록, 리뷰 소비 전환 진행

- 이전 goal turn은 코드/실제 검증이 바뀐 progress다. 현재 dev HEAD f06d804af, 공유 dirty tree를 유지하며 커밋·push·merge 없음. 완료 수는 아직5/42.
- Ego221 실제 홈팀010의 상대 승인201→양팀 schedule각1건→결과1:0 제출(SUBMITTED)→상대004 승인201(OFFICIAL revision1, Gameversion3) 확인. 홈팀 자기결과승인 정상DTO403, 상대팀이홈팀신청을승인하려는요청403. worker SUBMITTED/OFFICIAL outbox각attempt1 COMPLETED. 공개팀기록홈1승/상대1패 및 상대 실제전적/완료일정UI 확인.
- 자세한 근거와 소유PID는 `output/ego/competition-full-goal-20260908/friendly-approval-e2e-20260909.md`. L-M의 중복/동시승인·취소경계 및 전체role완료는 아직입증하지않아숫자를올리지않는다.
- 발견: 상대결과승인화면이 득점자/MVP를 내부 UUID앞8자로 표시. result-revisions에같은game 참가자들의기존name-gating정책표시projection추가, 상대라인업권한미확장, UUID표시제거. Sol sourcePII blocker0; 새backendtest는fixture타입과Jest/Vitest혼동으로2회실행전실패0tests이며수정중. green으로계산하지않는다.
- Phase3 identity-attest notification: canonical TEAM_MATCH+tournamentDetails/ID일치→대회알림분류,양등록팀리더/activityprefs/tournamentdeeplink. regularleague mirror ID는기존league분류유지. undefined test-only fallback 제거및실제Prismashapefixture동기화.좁은2suites14/14 PASS. 런타임재시작후실제알림E2E는별도미완.
- Phase3 리뷰wave A 구현중: tournament-fixture-review-mappers/service/appearance의실제DB소스를canonical TeamMatch+Details+TEAM_MATCHGame으로전환. 기존`tournament_fixture`는리뷰API비즈니스구분자로유지하지만옛경기테이블읽기근거로쓰지않는다. sourceId는보존된TeamMatch UUID. 다음wave general dispatcher/reputation/trust/visibility전환도필요하며이들은아직미구현이다.

### 2026-09-09 08:34 — 첫 사용자 친선 흐름 및 실제 배치 수정 확인

- 최신 합계 **5/42 = 기본1/30(G-M) + 경계4/12**. 아래4/42는 과거 시점이다. 전체 구현·dev 반영·alpha는 미완이다.
- G-M PASS: 실제 익명 목록 → 친선 상세의 조건·일시·무료비용 → 로그인 CTA의 동일 상세 redirect, 앞선 실제 로그인 후 동일 상세 복귀·팀장 신청을 확인. 최종 익명 auth/me401, 생성/신청/결과 POST 모두401. 완료된 무료 비용 수정 UI 저장200→GET `총 0원 · 상대팀 0원`→edit 재진입 입력 `[0,0]` 보존 확인.
- 신청 대기 UI: Ego390/768/1440에서 버튼50px·글자15px, 취소 대비2.16→15.02:1, 공 장식/상태 글자 겹침 해소. 실제 마지막 스크롤 카드와 CTA 간격16px/16.25px, 가로넘침0. ResizeObserver로 실제 CTA높이+16px을 확보하고 desktop에서는 해제. Sol source blocker0. 실제 신청취소→재신청201→승인대기 유지 확인.
- 전역 지침의 Ego 검수에 버튼·글자·색 대비·배치·끝 스크롤 실측 항목을 중복 없이 추가했다. 상세 증거 `output/ego/competition-full-goal-20260908/friendly-ui-verification-20260909.md`.
- 리그 방식 일반 대회(`kind: regular_tournament, format: league`)의 canonical fixtures4건이 빈 일정으로 표시되던 소비 오류 수정. 실제 regular_league는 별도 canonical leagueFixtures 계약을 유지하며 assigned 신호로 비공개와 TBD를 구분. Sol이 발견한 kind 회귀 및 live→매칭됨 의미 손실을 수정하고 회귀 검증 중이다. API presenter 최신34/34 PASS; 최종 web 추가 회귀 및 실제 공개 일정 화면 재검수는 진행 중이다.
- 후속 검증: kind/assignment/live 배지 Web87/87 PASS. Ego3폭에서 실제 일정4건·예정/진행 중/완료·비공개/TBD 표시와 가로넘침0을 직접 확인했다. 마지막 Sol이 지적한 과거 kickoff의 live 카드에 결과 대기를 함께 표시하는 결함도 수정하고 단일 card suite14/14 PASS. 이 마지막 dated-live 캡션 제거는 소스/회귀 증거이며 실제 dated-live 시나리오는 후속 실행 대상이다.
- 회수: Ego220 complete done:true. 소유 API12049(이전80720/98643 포함), Web80742/80751/80757 종료, 전용DB stop.3013/8121/55435 리스너0 및 대상 PID0 확인. 타 세션 프로세스는 종료하지 않았다. 커밋·push·dev 머지·alpha 실행 없음.
- Sol 최종 좁은 범위 source blocker0. 에이전트3개 모두 completed 재확인. 최종 프로세스 baseline 대비 Node94→75/Ego20→19, 동일 signature54개 증가0. 전체 QA·개인정보 최신 API 실환경·dated-live·키보드·확대 화면까지 완료했다는 뜻은 아니다.

### 2026-09-09 08:18 — 친선 매치 실제 생성·신청, 모바일 배치 검수 진행

- 전체 완료 수는 여전히 **4/42**. G-M/L-M 일부 단계의 실제 성공을 전체 흐름 PASS로 올리지 않는다. dev 머지·alpha 검증은 미완이다.
- Ego220에서 실제 폼으로 친선 매치 `0805f900-0c3c-4b59-aebf-b8f905396dd2` 생성(201), Game `8df1ef52-0058-4596-b8ee-dac8bd9551f7` 생성 확인. 익명 상세 → 로그인 → 동일 상세 복귀 → 상대 팀장004 신청 → 승인 대기 확인. application `f148c226-443a-4b8f-a2fc-a10f7391fd58`.
- 실제 region catalog는 `region-seoul-jongno` 같은 문자열 ID이므로 regionId DTO의 UUID 제한을 제거했다. 서비스의 지역 존재·활성·구군 검증은 유지한다. 임의 UUID나 지역 대체로 성공을 꾸미지 않았다.
- 실제 0원/0원 입력이 truthy 검사로 costNote:null이 되는 결함 수정. 명시적 0원과 미입력 null을 구분하고 생성/수정/카드 파서를 동기화. 관련 Web 3 suites **37/37 PASS**(`/tmp/task168-friendly-cost-unit.log`). 기존 생성 건의 costNote는 아직 null이므로 수정 후 실제 저장 증거는 별도 필요하다.
- canonical lineup consumer 단위 23/23, history/upcoming/reminder/region 13/13, 무효화 라인업 제외 실제 DB integration 2/2(16 skipped), 종료 후 clone DB0 확인. invalidated revision을 과거 명단으로 되살리지 않는다.
- canonical 공개 일정/결과 및 개인정보 숨김의 최신 API 4 suites **140/140 PASS**(`/tmp/task168-public-privacy-unit.log`). Sol이 발견한 잘못된 메서드의 privacy 변수 삽입을 수정한 후 실행했다. 최신 API의 실제 익명/직원 화면 재검증은 진행 중이다.
- UI 실측: 모바일390×844 신청 대기 화면에서 왼쪽 버튼50px/오른쪽86px, 긴 팀명으로 취소 문구 줄바꿈, 밝은 주황 배경+흰 글자, 상단 공 이미지와 상대팀 상태 겹침을 발견했다. 증거 `output/ego/competition-full-goal-20260908/pending-cta-layout-before-mobile.png`. 버튼 높이·글자·색 대비·레이아웃을 같은 변경으로 수정하고 Ego 3폭 재검수한다.
- runtime/API/Web/Ego220은 현재 검증 중이다. 종료 시 소유 PID·포트·브라우저 회수 결과를 추가한다.

### 2026-09-09 07:40 — 실제 기록 흐름 4/42

- 최신 완료 수는 기본0/30 + 경계4/12 = **4/42**. 아래 과거 스냅샷의1/42는 해당 시점 기록이다. 상세 최신 근거는 `docs/scenarios/competition-role-flow.md`에 있다.
- Ego219에서 실제 무득점 참가자005의 1경기/0골과 경기 링크, 본인010 동의 ON/OFF 및 익명·본인 차이, 관리자001의 VOID→worker→공개/순위/팀/개인 집계 제외를 확인했다. revision1/2/3 보존, revision4 VOID, 동일 요청 replay로 revision4개 유지.
- Luna의 canonical bracket 조회·수정·삭제 전환은 Sol 독립 검토 중. 첫 좁은 Jest는 반환 타입에서 result 누락 TS2339로 실행 전 실패(0 tests); 수정 전 PASS로 계산하지 않는다.
- 후속: result/videos 타입 정합, 실제 Prisma sourceType select, TBD Game 보존, 삭제의 잘못된 aggregate 409, VOID transaction 및 mock delegate를 수정했다. Sol 최종 source blocker0. Luna가 host exec_command에서 지정된 bracket 단일 suite **50/50 PASS** 및 PID76714 종료를 보고했다. `/tmp/task168-bracket-canonical-unit.log`는 이전 실패 실행 로그라 최종 PASS 근거로 사용하지 않는다. API 계약 문서도 동기화했다. 이는 실제 최신 API/alpha E2E 완료가 아니다.
- 실제 UI 검수는 버튼/폰트/대비와 간격·배치·스크롤·모달 겹침을 함께 본다. 기존 일정/신청 모달 수정의 3폭 증거는 이전 UI 보고서에 있다. 전체 역할/전체 화면 PASS와 dev 반영 후 alpha 검증은 여전히 미완이다.
- 로컬 기록 실행 증거: `output/ego/competition-full-goal-20260908/role-records-e2e-20260909.md`. Ego219 종료 done:true, API47132/Web47144·47146·47152/worker56138 종료, 전용DB stop 및3013/8121/8122/55435 리스너0 확인. 동일 comm 기준 Node94→95/browser45→47, signature54개 이상 증가0. 타 세션 프로세스는 건드리지 않았다.
- 개인 기록의 Persist 복원 pending+idle 상태를 isLoading으로 분기해 초기 오류를 보이던 문제는 isPending으로 수정했다. Sol source blocker0, pending+idle skeleton 및 실제 오류 메시지 보존을 포함한 좁은 Vitest **4/4 PASS**(`/tmp/task168-user-records-pending-unit.log`). 수정 후 실제 브라우저 최초 재진입은 아직 미검증이다.

### 2026-09-09 일정·경기 기록 실제 Ego UI 재검수 (진행 중)

- Ego taskspace211, 전용 runtime DB/API8121/Web3013에서 팀장010 로그인 상태로 실제 대진표→canonical 경기 상세 클릭을 확인했다. 결과0:1, 후반 골, 정정1·2·3차 이력이 표시된다. 전체30+12 흐름의 완료 수는 여전히1/42이며 dev merge/alpha 검증은 미완이다.
- 일정이 전부 시간 미정인 경우 큰 EmptyState가 경기 목록을 첫 화면 밖으로 밀어냈다. 동일 안내 문구를 compact status로 바꿨다. 모바일390×844 첫 경기 y556.6~637.6, 탭 높이44px/글자14px, 가로 overflow0. 768×1024와1440×1000 실제 스크린샷도 확인했다. 우리 팀 카드의 금지된 왼쪽 accent rail도 제거했으며 이 최종 변경 화면 재캡처는 진행 중이다.
- 경기 상세의 하단 CTA는 44px/14px이다. 최초 window scroll로 가림을 의심했으나 실제 scroll owner는 main.tm-scroll-area였다. 내부 scrollTop49.5에서 CTA y697~741로 메뉴 위에 완전히 표시됨을 확인했다. 불필요한 padding 수정을 하지 않는다.
- 실제 '명단에서 나 찾기' 클릭→모두 계정 연결된 상태의 안내 dialog를 확인했다. 모바일 dialog358×188, 닫기 버튼318×44, Escape로 닫힘과 원래 CTA focus 복귀를 확인했다. 이는 연결 신청/승인 전체 E2E 완료가 아니다.
- 캡처 helper의 공용 임시 파일명이 타 taskspace 캡처로 덮이는 상황을 확인했다. 이후 같은 Ego heredoc 안에서 즉시 고유 output 파일로 복사해 대상 화면을 직접 확인했다. 잘못된 타 화면을 QA 근거로 사용하지 않는다. 이전 큰 EmptyState before 파일은 독립 보존되지 않아 최종 before/after 증거 세트로 주장하지 않는다.
- 최종 rail 제거 후 세 viewport 재캡처·직접 시각 확인 완료. 카드 좌우 border0/padding16px로 균형 유지. 증거: output/ego/competition-full-goal-20260908/schedule-unscheduled-final-{mobile,tablet,desktop}.png, corrected-match-detail-{mobile,desktop}.png, claim-connected-empty-mobile.png. 상세 판정은 같은 디렉터리 ui-sizing-layout-20260909.md. API/DB 또는 모든 console/network 경로 검증을 이 캡처만으로 대체하지 않는다.
- Phase3 남은 scheduled/cancelled no-Game 경로는 Luna 구현·Sol 검토 중이다. in_progress 무Game/이전 SCHEDULED 강등 및 completed 무결과는 자료를 추정하지 않고 typed blocker로 처리한다. 아직 통합/DB 증명 전이다.
- Sol 시각 검수에서 claim 안내 dialog의 backdrop이 하단 nav를 덮지 못하는 실제 결함을 발견했다. claim-my-record.tsx를 body portal로 옮겨 기존 claim API/모달 접근성 hook은 유지했다. Ego218에서 모바일/태블릿/데스크톱 overlay 전체 viewport, 하단nav 좌표 실제 클릭 시 URL 유지, Tab 순환, 동일viewport Escape 후CTA focus 복귀를 확인했다. claim-connected-empty-mobile.png가 before, claim-connected-empty-after-{mobile,tablet,desktop}.png가 after다. Sol이 세 after를 독립 확인하여 해당 blocker 해소 판정. resize 도중 focus 복원은 별도 미검증이다.
- **무결과 이관 최종 실제DB4/4 PASS**, `/tmp/task168-no-result-full-cutover-verified.log`. scheduled/cancelled no-Game을 canonical TEAM_MATCH로 생성하는 importer를 연결했다. RETIRED exact pin, TBD sides, confirmed/active roster의 nickname·jersey·ROSTER_ASSERTED identity, 취소 CANCELLED/STATUS_ONLY/periods 유지와 played facts 미생성, in_progress 무Game/기존SCHEDULED 강등 차단 및 rerun 무증가를 검증했다. 기존3건의 전체이관·원본이력·실제동시writer도 함께 통과했다.
- factory 추출은 기존 production의 ACTIVE/idempotency/audit 검증 뒤 aggregate 저장만 공유한다. no-result importer는 source.gameId가 없는 행만 처리하며 기존 legacy Game은 source cutover에서 ID를 유지한다. plain error를 typed code로 바꾸고 역사 timestamps를 필수로 했다. 기존 fixture-game-backfill도 scheduled-only로 좁혀 in_progress를 SCHEDULED로 추정 생성하지 않는다.
- 실행 중 실패는 숨기지 않는다: 최초 import/type 연결 오류는 수정 후3/4까지 실행됐고, 신규test의 report.findings 루트 가정은 실제 fixtures[].findings로 고쳤다. 새case 단독실행은 beforeAll의 conflict fixture를 앞선case가 해소하는 이 suite의 순서 의존성 때문에 실패했다. 같은4case 파일 전체를 직렬 실행한 최종 로그가4/4이며, 별도 전체suite/committed-tree/CI 검증으로 과장하지 않는다. 좁은 importer unsupported-state unit1/1은 필수timestamp 보강 전 실행이었다.
- runtime DB에 새 lineage migration을 단일transaction으로 적용했다(전용 로컬DB만, alpha 미적용). Ego211/218 종료 done:true, API/Web 두 실행의 소유PID 모두 TERM 종료, integration clone DB0 확인 후 전용DB stop(데이터보존). 전체1/42·Phase3 consumer/legacy 제거·dev merge/alpha는 계속 미완이다.

### 2026-09-09 기존 Game의 역사 revision 연결

- 이전 턴은 no-Game 전체 전환과 공개 집계 DB 검증을 완료한 progress였다. 이번에는 기존 Game+legacy result 경로를 구현했다. preflight와 locked capture가 동일한 history matcher를 사용한다. 현재 revision 점수 비교를 원본 판정으로 사용하던 코드를 제거했다.
- 새 matcher는 OFFICIAL 이력 전체에서 점수·승부차기·side·실제 등록 user 연결·득점 minute·guest 이름과 중복 골 개수를 비교한다. 기존 event UUID와 legacy goal UUID는 각각 보존하며 동일하다고 추정하지 않는다. legacy가 sparse면 canonical의 추가 골을 보존하되 골 수가 점수를 초과하는 데이터는 거부한다. period는 유효한 값을 보존하고 legacy에 없다는 이유로 null을 강제하지 않는다. 후보0/복수는 typed 오류로 차단한다.
- 전체 전환 순서는 canonical anchors → 기존 history 검증 → no-Game import → source cutover → 기존 Game lineage capture다. 이미 저장된 lineage는 새로운 후보를 고르지 않고 원 revision을 다시 검증한다. Game current pointer·모든 revision/event/fact ID를 바꾸지 않는다.
- 신규 lineage snapshot에 canonical goalEvents와 정규화 parity evidence를 포함했다. SQL guard에서 current pointer 동일 조건만 제거하고 OFFICIAL/canonical ownership/복합 FK/append-only/reparent 금지는 유지했다. 수정한 INSERT guard 함수만 전용 integration template에 transaction으로 적용했다. runtime/alpha DB에는 아직 적용하지 않았다.
- matcher/preflight unit **15/15 PASS** (`/tmp/task168-existing-lineage-unit.log`). 실제 DB 최신 lineage+fullcutover **5/5 PASS** (`/tmp/task168-existing-lineage-final-db.log`): 최초 capture 전 후속 정정 존재, 점수는 같지만 minute 불일치 거부, 후보 중복 rollback, 원본 연결 후 VOID 및 rerun, 기존 legacy Game의 현재3:0을 유지하면서 원본2:0 연결, 전체 혼합 이관·실패원복·동시writer 검증.
- 같은 변경의 historical importer/공개 소비 DB **1/1 PASS**는 앞선 `/tmp/task168-existing-lineage-db.log`에서 확인했다. 그 로그의 fullcutover 순서 assertion 실패는 후속 수정 후 위5/5로 재검증했으므로 단일6/6 실행으로 보고하지 않는다. 초반 nullable participant 컴파일 오류는 수정했고 데이터 관계를 캐스팅으로 우회하지 않았다.
- 랜덤 Game UUID로 인해 fixture 순서와 Game ID 순서가 달라지는 기존 테스트 기대를 정정했다. 보존 검증은 Game ID↔current revision 쌍과 나머지 ID 집합을 비교하며, 연결 관계가 뒤바뀌면 실패한다. 제품 snapshot/cutover 보호를 약화하지 않았다.
- Sol 추가 검토에서 실제 GAME_BACKFILL의 nested score/score.goals 형식 누락과 positive score-only의 증거 부재를 발견해 보강했다. 점수는 공용 parseOfficialScore를 사용한다. frozen score.goals는 원본 (team, TournamentPlayer ID, 이름, minute) multiset으로 직접 비교하며 GameParticipant를 요구하거나 새로 만들지 않는다. goalEvents 배열이 있는 경우 그 기록이 우선한다.
- 새 no-Game importer는 revision score에 provenance=HISTORICAL_FIXTURE_RESULT_IMPORT와 정확한 originalResultId를 기록한다. 득점 정보0·양수점수는 이 명시적 원본 연결이 맞고 canonical goals도0인 경우에만 허용한다. 기존 revision의 점수만 같은 경우는 계속 거부한다. 정상0:0과 sparse-but-recorded goal은 각각 정보가 있는 범위로 검증한다.
- **최종 실제DB3 suites 7/7 PASS** (`/tmp/task168-existing-lineage-shapes-db.log`): nested frozen 등록득점+참가자0인 기존 Game 전체전환, score-only no-Game의 출처/무득점 참가기록/재실행, 공개순위/팀/개인 소비, 원본lineage/정정/VOID/모호성rollback/동시writer 모두 포함. 최신 matcher unit10/10 PASS (`/tmp/task168-existing-lineage-shapes-matcher.log`), preflight7/7은 직전 shapes-unit 로그에서 PASS. 테스트 fixture의 frozen 이름과 신규 importer의 실제 goalEvents 배열 모양을 정합화한 뒤 재검증했다.
- 후속 Sol 검토의 마지막2건도 보강: frozen score는 동일 source snapshot이므로 subset이 아니라 exact multiset이며, frozen 경로는 goalEvents===null일 때만 허용한다. malformed non-null goalEvents를 다른 자료로 우회하지 않는다. 두 반례를 추가한 최신 좁은 matcher unit10/10 PASS (`/tmp/task168-existing-lineage-strict-matcher.log`). 위 DB7/7은 이 두 거부 조건 보강 전 실행이며 같은 DB suite를 중복 실행하지 않았다. 전체 committed-tree/CI/live 검증은 후속 단계에서 필요하다.
- 리소스: 모든 Jest 실행 종료, clone DB0 확인 후 전용DB stop(보존), 새API/Web/Ego 미기동. 동일집계 Node94→94, 브라우저57→53, signature54개 증식0. 소유 migration marker0, diff whitespace check PASS. runtime DB는 신규 lineage DDL 미적용 상태이므로 실제API 재개 전 전용 runtime schema를 먼저 정합화한다.
- 이 단계는 실제 HTTP/Ego/alpha 검증이 아니다. 전체 30+12 완료 수는1/42를 유지한다. Game 없는 나머지 fixture 상태의 전환, 전체 runtime/역할/시각 검증, legacy 제거, dev/alpha는 계속 남아 있다.

### 2026-09-09 W2 전체 전환·공개 소비 DB 검증

- 이전 목표 턴은 UI 검수 기준과 W2 blocker를 정본에 반영한 progress였다. 이번에는 Game 없는 완료 fixture의 과거 결과를 실제 전체 전환 transaction에 연결했다. no-Game 허용 조건은 완료 상태·legacy result·fixture의 고정 config이며 불명확한 행을 임의 생성하지 않는다. TeamMatch/Details 선행 생성 → historical importer → source cutover 순서다.
- 실제 전체 전환 integration **2/2 PASS** (`/tmp/task168-w2-combined-db.log`의 full-cutover suite): 정상 legacy + 이미 canonical + no-Game 과거 결과 2건 혼합 전환, imported lineage/revision/hash 재실행 보존, wrong-side 득점자 연결 실패 시 앞서 생성된 다른 경기까지 TeamMatch/Details/Game/lineage rollback, 기존 source Game 무변경, 실제 writer 경합 검증. 같은 로그의 historical suite는 당시 테스트의 Prisma relation 입력 타입 오류로 실행되지 않았으며 합산 PASS로 보고하지 않는다.
- Sol이 발견한 공개 순위 누락을 shared standings projector 호출로 수정했다. facts/cache/조별·통합 순위 계산을 동일 import transaction에 둔다. bracket 진출/알림을 재발송하지 않는다. canonical startAt과 원fixture scheduledAt 불일치는 기존 match를 덮어쓰지 않고 CANONICAL_MATCH_REQUIRED로 차단한다.
- 별도 historical integration **1/1 PASS** (`/tmp/task168-historical-standings-db.log`): 실제 PublicTournamentRecordsService 일정 순위 승패/득실, PublicTeamRecordsService 양팀 승패/득실·대회 분류·canonical UUID·원경기시각09:00(결과확정11:00과 구분), PublicUserRecordsService 득점/무득점 참가 및 동의 전→공개→철회/본인 유지 확인. 이 증거는 실제 서비스+DB이며 HTTP 인증/브라우저 전체 E2E를 대체하지 않는다.
- 공개 팀 점수를 처음 기대한 테스트는 PUBLIC_LIVE off의 정상 status_only 정책 때문에 실패했다. 테스트에서 off일 때 점수/이벤트 숨김을 먼저 검증하고 on일 때 결과 공개를 별도로 검증했다. 제품 공개 정책을 약화하지 않았다.
- preflight 좁은 unit **6/6 PASS** (`/tmp/task168-w2-preflight-unit.log`). full-cutover 첫 실행의 raw row status 타입 오류와 새 데이터에 맞지 않는 기대 건수는 수정 후 실제 DB로 재검증했다. 공유 working tree 전체 build/CI 검증은 아직 하지 않았다.
- Sol 후속 독립 검토: 이번 no-Game import/startAt/standings/full-wrapper 무결성 범위의 concrete blocker0. malformed goal은 선행 preflight에서 READY일 수 있지만 importer의 typed 오류와 전체 rollback으로 보호된다. 기존 Game parity를 통과한 것으로 해석하지 않는다.
- 단계 cleanup: Jest session 전부 종료, clone DB0 확인, 전용 teameet-task168-db stop(데이터 보존), 새 API/Web/Ego 미기동. 동일 프로세스 집계 Node94→94, 브라우저56→55, command signature +54 증식0, touched migration TODO/FIXME/HACK/XXX0. 다음 런타임 검증 전 호스트 preflight부터 재개한다.
- **남은 critical path:** 기존 Game+legacy result를 전체 revision 이력/goal parity로 원 revision에 결박하는 구현, Game 없는 다른 fixture 상태의 canonical 생성 계약, legacy 제거, 실제 runtime/Ego 30+12 흐름과 시각 검수, dev 반영·alpha 배포/E2E. 전체 진행은 여전히1/42이며 이번 DB 증거로 흐름 수를 올리지 않는다.

### UI/UX 완료 판정 보강 — 크기·색상·배치를 함께 검수

사용자의 버튼·글씨·색상·레이아웃 검수 지적을 모든 아래 역할별 흐름의 완료 조건에 적용한다. 기능 성공과 시각 검수는 별도 판정하며, 한 화면의 통과를 다른 화면으로 확장하지 않는다. 수동 검수는 Ego를 사용한다.

| 검수 축 | 실제 화면에서 남길 증거와 판정 |
| --- | --- |
| 버튼·입력 | 실제 클릭 영역의 가로/세로, 글씨·아이콘 정렬, primary/secondary/danger 구분, 모바일 주요 조작 44px 기준, 인접 버튼 오조작 가능성 |
| 글씨 | 제목/본문/보조문구의 font-size·weight·line-height, 긴 한글·영문·무공백 이름, 숫자/단위 정렬, 확대 시 잘림 |
| 색상 | 실제 전경/배경색과 대비, disabled/error/selected/focus 구분, 색상만으로 상태를 전달하는지, 프로젝트 토큰 일관성 |
| 전체 배치 | 첫 화면의 핵심 정보와 주요 행동, 안내 영역의 과도한 높이, 콘텐츠 폭·열 수·양쪽 정렬·여백, 작은 데이터/많은 데이터의 밀도, 중복 제목 |
| 반응형 | 모바일/태블릿/PC에서 줄바꿈·가로 넘침·스크롤, sticky header/하단 버튼의 가림, drawer/modal 및 키보드로 인한 가림 |
| 조작 상태 | 기본/hover/focus/pressed/disabled/loading/error/empty, 저장 후 피드백·포커스 복귀, 취소/뒤로가기, 더보기 |
| 역할별 여정 | 관리자·팀장·팀원·첫 사용자·경기 운영자의 대회/매치/리그/기록/시상/리뷰 화면에서 권한에 맞는 행동과 다음 단계가 명확한지 |

- 화면별 증거는 route·persona·데이터 상태·viewport·before/after·실측값·문제·수정·재검증 결과로 기록한다. 미실행 상태를 PASS로 처리하지 않는다.
- Luna는 확정된 수정 범위의 구현, Sol은 독립 시각/사용자 흐름 검토, root는 정보 우선순위·화면 전체 균형과 최종 판정을 담당한다.
- 기존 활동 기록 캡처의 모바일/PC를 다시 열어 검토했다. 기존 44px/14px 실측 증거는 유지하되 무공백 장문·확대·focus/pressed/더보기는 미검증이다. 이번 재검토는 새 라이브 실행이나 alpha 검증이 아니다.
- 완료 수는 여전히 전체 시나리오 1/42이며 dev 반영·alpha 배포/실제 E2E는 미완이다.

### W2 연결 작업의 현재 경계

- Luna가 full-cutover 안에 historical importer 호출을 연결했지만 실제 실행은 미검증이다. no-Game 결과는 선행 preflight의 MISSING_GAME_LINK 및 backfill의 game 필수 조건에 막히므로 연결 완료로 계산하지 않는다. 두 helper의 생성 경계를 함께 보강해야 한다.
- Sol은 기존 Game의 과거 결과를 현재 점수만으로 연결하지 말고 전체 OFFICIAL 이력의 점수·득점자/guest 이름·side·minute 증거로 유일한 원 revision을 식별해야 함을 확인했다. 정정/VOID 후에도 원본 lineage를 보존하고 후보 없음/복수는 명시적으로 차단해야 한다. 이 검토안은 아직 구현·검증되지 않았다.

### 2026-09-09 W0 실제 PostgreSQL 검증

- 이전 턴은 실제 UI 증거와 코드 보강이 있는 progress였다. 이번 턴도 전체 목표(Phase3 및30+12흐름)를 유지한다.
- `V1TournamentResultLineage` 마이그레이션을 전용 `ulw_v1_integration_task168` DB에 단일 transaction으로 적용했다. 관련 테이블은 `v1_tournament_result_lineages`, 참조하는 `v1_tournaments`/`v1_team_matches`/`v1_tournament_match_details`/`v1_games`/`v1_game_result_revisions`다. 원본 결과·득점 UUID와 시각은 snapshot/scalar로 보존한다. API 응답 변경은 없다.
- Sol이 단순 trigger 조회의 동시 insert/delete write-skew를 확인해 Details 기존 composite unique를 참조하는 RESTRICT FK와 INSERT guard Game FOR UPDATE를 추가했다. root는 Prisma onUpdate 및 실제 SQL constraint/index 이름 mapping도 동기화했다.
- 실제 DB integration **2/2 PASS**, `/tmp/task168-lineage-db-test.log`: 원본 점수/승부차기/메모/시각/득점 snapshot, exact rerun, penalty mismatch rollback, Details 삭제/재귀속 차단, append-only 수정/삭제 차단, 실제 새VOID 포인터 이동 후 원OFFICIAL lineage 재실행, 잘못된Game/revision 거부. 이는 W0 보존 계약의 증거이며 historical importer·goal projection parity·전체cutover 완료는 아니다.
- 실패한 테스트 fixture의 `HOME` enum을 `home`으로 정합화하고 VOID 입력 거부는 실제 `OFFICIAL_REVISION_REQUIRED` 계약으로 기대를 고쳤다. 테스트 중 source 변경은 rollback 안에서만 수행해 원본 updatedAt/hash가 오염되지 않는다. 새 mock-only W0 단위 스펙은 실제 DB 증거로 대체하여 제거했다.
- Prisma CLI 첫 시도는 저장소 상위 env 자동탐색 및 임시경로 package 자동설치 시도로 실패했다. root package.json/pnpm-lock.yaml 변경 없음 확인. 저장소 밖 `/tmp/teameet-task168-w0-prisma`와 명시적 설치된 generator, auto-install 차단으로 생성 성공했고 env 파일 로드 메시지가 없다. 이후 CLI 생성은 이 격리 경로 사용.
- 이전 Prisma Engine empty 원인은 확정하지 않았다. 신규 보존 DB 테스트에서는 재현되지 않았고 전체전환 테스트는 이제 실제 assertion 실패를 보고한다. 동시 promise rejection/release cleanup과 대상DB 필터를 보강했으며, 단순 AccessShareLock을 쓰기 차단으로 오판하던 assertion을 실제 차단 lock mode만 확인하도록 수정했다. 최종 실행 결과 대기.
- W1 Game 없는 역사 결과 importer는 Luna가 신규 파일과 실제DB spec으로 구현 중이다. 결과가 있는 행의 `LEGACY_RESULT_LINEAGE_UNVERIFIED` gate는 계속 유지한다. 진행 완료 수1/42 및 dev/alpha 미완 상태는 그대로다.
- full-cutover 최종 실제 DB **2/2 PASS**, `/tmp/task168-full-cutover-concurrency.log`: 전체사전검사 충돌무변경·mixed전환·rerun 및 실제writer와 Game-first 잠금/round보존 검증. 이전 engine empty는 이 실행에서 재현되지 않았다. 두 suite는 각각 순차 실행했고 모든 Jest clone DB는 종료 후0건이다.
- W0 최종 Prisma 생성도 성공. 실제 PostgreSQL 카탈로그에서 Details 복합 FK의 ON UPDATE/DELETE RESTRICT 및 다른 canonical FK를 확인했다. 저장소 상위 env 자동탐색 없는 격리 generator 경로 유지.
- W1 첫 초안은 root가 반려했다: fixture.game 역relation으로 canonical Game rerun을 찾는 오류, 잘못된 goalEvents JSON shape, 등록선수 참가자 매핑/완료상태/양팀검증/locking 누락. fake 이름·신원·GameEvent를 추가하는 대신 실제 canonical source와 기록 당시 명단을 기준으로 수정 중이다. 아직 실행하거나 전체전환 gate에 연결하지 않았다.
- **W1 보강 후 실제 DB1/1 PASS**, `/tmp/task168-historical-import-db-test.log`: Game없는 완료결과→canonical Game/양팀side/명단/실제user identity link/resultParticipants/OFFICIAL revision/lineage/official facts/cache 및 재실행 확인. root가 존재하지 않는 confirmedAt 필드 제거, 명단 전원 resultParticipant(무득점0·분unknown null), 실제원admin.user actor 보존을 보강했다. DB가 official 뒤 resultParticipants 쓰기를 거부하여 DRAFT에서 참가자기록 완성→같은tx OFFICIAL 전환 순서로 수정했다. terminal 보호 trigger를 우회하지 않았다. 전체preflight/cutover 연결 및 실제공개API/브라우저 이관결과 E2E는 미완이다.
- 게스트 골 snapshot 소비 구현: 등록participant가 있으면 parser에서 snapshot을null로 제거하고 기존 이름/동의 경로 유지. guest 이름만 기존 participantName에 표시하며 identity/profile/jersey는null. 상세·일정·팀 기록을 수정했고 public-user 서비스는 변경하지 않았다. docs/api/domains/public-records.md 동기화.
- 관련5파일 **104개 PASS(분리한 좁은 실행의 합)**: 첫 실행에서 detail/team/league3파일44PASS; 일정 fixture canonical delegate 누락을 고친 후 schedule26PASS; parser nullable fixture 타입을 고친 후 parser34PASS. 로그 `/tmp/task168-guest-goal-consumers-test.log`, `/tmp/task168-guest-goal-followup-test.log`, `/tmp/task168-guest-goal-parser-test.log`. 한 번의 전체suite green으로 보고하지 않는다. 새일정 회귀는 실제canonical Details 입력과 legacy동일UUID 우선순위도 확인한다.
- Jest clone DB0 확인 후 전용DB stop(데이터보존). 이번 턴 API/Web/Ego를 새로 시작하지 않았다. W1 적대검토 및 전체시나리오1/42, dev/alpha 미완은 유지한다.
- W1 최종 Sol blocker2건 수정 후 **실제DB1/1 재통과**: sparse골/guest에 missingScorer=true 명시, 현재신청confirmed 강제제거. cancelled 및 cancel_requested 팀의 과거 완료경기도 import되고 원status/confirmedAt/cancelRequestedAt을 변경하지 않는 회귀를 추가했다. 완료fixture와 등록·대회·양팀 소유권이 역사참가 증거이며 현재상태를 과거상태로 조작하지 않는다.
- 최종 cleanup: 모든 테스트/생성 session은 exit, Jest clone0, 전용DB stop. 에이전트3개 모두completed 확인. 동일집계 Node100→101·브라우저31→31; 증가1개는 이번 턴 시작하지 않은 기존Ego app(PPID32287)의 Node helper PID68236이다. 타세션/사용자소유이므로 종료하지 않았다. 동일signature54개 증식 없음. 신규 lineage/importer TODO/FIXME/HACK/XXX 0건.
- **다음 resume critical path:** full-cutover의 result-bearing 차단을 무조건삭제하지 말고 새 importer/검증된lineage/공개집계 parity를 전체transaction 순서에 통합한다. 기존Game+과거result 조합은 원Game/모든revision을 보존하면서 별도검증 필요. source없는과거결과 import는 이제구현됐지만 모든 fixture 종류를아직보증하지않는다. 다음에는 해당누락분과 runtimeAPI/Ego actualimport 공개결과, 30+12흐름, 최종구FK/테이블삭제·dev·alpha를 계속 진행한다.

### 2026-09-09 활동 기록 UI 실측·동의 철회 후속

- 사용자 지적대로 버튼·글씨·색상뿐 아니라 정렬·여백·줄바꿈·화면별 정보 배치를 검수한다. 개인 활동 기록의 장식용 왼쪽 rail을 제거하고 CTA 대비를 `#1b64da`/white로 개선했다. Ego 390×844, 768×1024, 1440×1000 캡처를 root가 직접 열어 확인했다. CTA/필터 높이44px·글씨14px, 가로 overflow 없음, 모바일 긴 팀명 두 줄, 통계2열→4열 전환 확인. 이 한 화면의 결과로 전수 UI PASS를 주장하지 않는다.
- 상세 증거: `output/ego/competition-full-goal-20260908/ui-layout-verification-20260909.md` 및 같은 폴더의 `user-records-owner-layout-after-{mobile,tablet,desktop}.png`. before는 `user-records-owner-after-revoke-mobile.png`.
- 실제 Ego 공개 동의 OFF 후 익명 개인 기록 API는 1경기→0경기, 본인은1경기/1골 유지. 실제 로그아웃 후 공개 기록 없음 UI 확인. 공개 경기 닉네임은 기존 정책상 유지되며 profileHref만 null이 된다. 모든 이름 비노출을 보장한 것으로 보고하지 않는다. X09 전체 PASS는 미선언, 진행1/42 유지.
- 추가 full-cutover 동시성 통합 실행은 Prisma `Response from the Engine was empty`로 종료했다. 통과로 계산하지 않고 환경 원인 확인 전 동일 테스트 반복을 보류한다.
- W0 lineage 저장·append-only/ownership 제약·실제DB spec 코드가 추가됐다. migration 적용/Prisma generate/실제 테스트는 아직 미실행이며 Sol 재검토 중이다. 이전 tsc green은 이 신규 변경의 검증 증거가 아니다.
- dev commit/push, alpha 배포 및 alpha E2E는 아직 완료되지 않았다.
- Sol W0 후속 리뷰: penalty 존재 의미 비교 누락, lineage 이후 TournamentMatchDetails 삭제/소유 변경 보호 누락을 blocker로 확인했다. integration 최초 fixture의 penalty 불일치와 실제 VOID pointer rerun 증거도 보강 필요하여 Luna에 수정 배정했다. 실제 void는 원OFFICIAL 행을 보존하고 새VOID 행으로 포인터를 이동하므로 stored revision OFFICIAL 검사 자체는 production blocker가 아니다.
- 화면 검수 단계 cleanup: Ego154 `done:true`로 닫음. API17699/Web17756·17764·17770 TERM 후 해당 PID 및3013/8121 리스너 없음 확인. 전용 DB 컨테이너 stop 완료(데이터 보존). 동일 프로세스 집계 기준 시작/종료 Node command100·브라우저31로 동일, signature54개 이상 증식 없음. Luna 두 작업은 completed이며 Sol W0 리뷰 결과 대기 중.
- 최종 후속: Luna가 W0 penalty 유효성·Details mutation trigger·penalty fixture·VOID rerun spec을 보강했다. root가 해당 helper/SQL을 확인했으나 실제 DB 실행은 여전히 미완이다. 다음에는 migration/generate 및 좁은 실제DB 검증 전에 engine 오류 원인을 확인한다.
- Sol 독립 시각 검수는 위 세 캡처에서 blocker0. 단, 무공백 장문 팀명은 캡처로 증명되지 않았고 팀명 flex 영역에 min-width/overflow-wrap 보호가 없어 별도 실측 필요 WARN. hover/focus/pressed/더보기 상태 역시 미검증이다. 이 경계까지 포함한 전체 UI PASS로 확대하지 않는다.

### 2026-09-09 05:00 전환·타입 검증 후속

- API tsc exit0. Web은 공식 `next typegen`으로 삭제된 route 참조를 재생성하고 실제 응답/라인업 타입에 맞춰 테스트 fixture를 수정한 뒤 tsc exit0. 생성 파일 수동 삭제나 `unknown` 강제 캐스팅으로 오류를 숨기지 않았다.
- Web focused fixture 검증: 6파일 첫 실행 76/80 PASS. 운영 콘솔의 실제 팀 배정 누락 fixture와 시작 안내의 마침표 기대를 정합화한 뒤 해당 파일 47/47 PASS; 나머지 5파일33개는 첫 실행에서 PASS였다. production kickoff gate를 약화하지 않았다.
- 전체 cutover DB 1/1 PASS로 충돌 시 무변경·canonical/legacy 혼합 전환·재실행을 확인했다. 기존 source-cutover DB도 2/2 PASS. Sol이 별도로 발견한 연결된 mixed 대진의 scope 경계와 온라인 잠금 순서 보강은 후속 수정 중이며 이 테스트만으로 온라인 실행 안전을 주장하지 않는다.
- 후속 보강 뒤 full-cutover DB 1/1 PASS: canonical parent + legacy child 연결을 포함한 혼합 전환과 재실행을 확인했다. full wrapper는 Game ID순 잠금→fixture table 잠금으로 수정됐고 P2034/PostgreSQL 40P01·40001을 최대3회 재시도한다. 실제 동시 writer 경합 검증은 별도 남아 있다.
- 최종 후속 API tsc도 exit0. 이번 단계의 테스트/typegen/tsc 프로세스는 모두 종료했고 전용 DB를 다시 stop했다. 새 브라우저/API/Web 서버는 시작하지 않았다. 신규 full-cutover 파일의 TODO/FIXME/HACK/XXX 검색 결과는 0건이며 해당 rg exit1은 검색 결과 없음이다.
- **전용 runtime 실제 전체 cutover 완료(구 결과0건인 데이터셋):** 기존 fixture2건의 Game `48ae7299-4e31-49a6-a2fb-64433807df1c`, `5c3df024-5db9-4502-a150-dab602129559`를 TEAM_MATCH로 전환했다. legacy Game link0, legacy staff scope0, 해당 canonical Details/Game 각각2건. DB 전체4개 Game의 ID/pin/state/version/currentOfficialRevision/periods/lineups/participants/events/resultRevisions 전후 JSON hash 동일(`66cbddafbe9a62443dbc4fc2199ed5687563ac0919a63a1748a4c4a27c3b9954`). 재실행 convertedGameIds=[]이고 동일 집계였다. API/Web writer가 모두 종료된 전용 DB에서만 실행했다. alpha 적용·legacy result importer·구 table drop 완료가 아니다.
- 새 전체 데이터셋 cutover operator를 구현 중이다. 개별 ID 방식만으로 전체 완료를 주장하지 않으며 전체 열거→전체 사전 검사→backfill/source 전환→누락0 검증을 한 transaction으로 묶는다. 첫 실제 DB 실행에서 충돌 무변경·2경기 변환까지 통과했고 재실행 반환값의 오래된 테스트 기대를 수정했다. 전체 통합 PASS는 아직 확정 전이다.
- Sol이 legacy result/goal의 note·기록자·원본 timestamps·goal ID/player lineage가 현재 canonical revision에 전부 보존되지 않았음을 확인했다. 점수 일치만으로 lossless를 주장하지 않는다. 이 데이터의 명시적 보존/import와 공개 projection parity를 먼저 구현해야 하며 그 전에는 result-bearing 행의 최종 전체 전환과 구 테이블 drop을 차단한다. 이는 보존을 생략한 채 범위를 줄이는 완료 조건이 아니다.

#### 남은 역사 기록 보존 단계의 필수 계약

- 보존 필드: result/fixture 원본 UUID, home/away·승부차기 점수, note, recordedByAdminUserId, recordedAt/createdAt/updatedAt; 각 goal의 UUID/team/playerId/playerName/minute/createdAt와 안정된 순서.
- 원본 `playerId`는 TournamentPlayer ID이므로 GameParticipant ID로 간주하지 않는다. 같은 대회·registration·side를 확인한 실제 연결만 허용한다. 이름만 남은 골은 이름과 null participant 의미를 보존하며 추정 사용자 연결을 만들지 않는다.
- 기존 Game이 없는 완료 경기에도 pinned config와 원본 기록 시각을 보존한 Game/official revision을 생성해야 한다. 기존 Game/revision이 있으면 ID 충돌·점수뿐 아니라 위 전체 필드를 대조한다.
- 원본 정보를 정정 `reason`에 끼워 넣지 않는다. canonical immutable lineage와 원본 필드 fingerprint를 저장하고 재실행에서 검증한다. 공개 note·scorer·기록 시각의 source 전환 전후 parity를 함께 입증한다.
- 모든 기존 result 행은 imported 또는 구체적 blocker로 집계한다. 누락0·재실행 ID/건수 불변·부분 실패 rollback을 실제 DB에서 확인한 후에만 legacy FK/enum/table 제거 단계로 진행한다.

### 2026-09-09 최신 UI/UX 검증 인계

- 전체 완료는 여전히 1/42(X04). dev 작업 중이며 이번 변경의 dev 반영·alpha 배포/E2E는 미완이다.
- 결과 정정 화면에서 모바일 고정 4열의 가로 넘침을 2열로, 태블릿의 좁은 편집 영역을 단일열로 수정했다. 중복 제목·위험 작업 강조를 줄이고 주요 조작 높이 44px, 버튼 글자 14px, 색상 대비와 포커스 복귀를 확인했다. 마지막 확정 후 포커스 보강은 단위 검증만 통과했으며 라이브 재검증이 남아 있다.
- 실제 정정 revision 3(후반 득점·출전 5분)의 worker 처리와 공개 점수·팀 전적·개인 1경기/1골 반영을 부분 입증했다. 개인 기록에서 canonical 경기 링크를 실제 클릭하여 정확한 상세 URL 도착을 확인했다. Sol 검토로 양 팀명 null은 모집 중 신원 가림 정책의 정상 응답임을 확인했다. 다만 UI가 배정된 비공개 팀과 실제 TBD를 모두 `미정`으로 표시하는 결함은 확정했다. API 권한을 유지하고 non-null side의 이름 없음은 `참가팀 비공개`, null side는 `미정`으로 구분하는 좁은 수정에 착수했다.
- Ego 113을 종료한 뒤 150으로 복구했다. 새 공간의 Page.captureScreenshot 및 기본 캡처가 시간 초과되어 개인 기록의 새 시각 증거는 확보하지 못했다. Computer Use 앱 캡처는 다른 작업의 alpha 화면이므로 이번 증거에서 제외했다. DOM 확인을 시각 PASS로 대체하지 않는다.
- 검증 단계 종료 시 API PID 80784(8121), Web PID 57349/57350/57356(3013)을 TERM 종료하고 Ego 150의 소유 탭을 닫았다. 해당 PID 잔여 없음, 3013/8121/8122 listener 없음, Node 86·브라우저 28개를 확인했다. 다른 작업의 브라우저/서버는 종료하지 않았다. 이전 런타임 PID 기록은 과거 실행 이력이다. Web 생성 route 타입 오류와 전체 시나리오, 최신 변경 시각 재검증, dev/alpha 검증이 남아 있다.
- 전용 PostgreSQL 컨테이너 `teameet-task168-db`도 정상 stop했다. 후속 검증 재개를 위해 컨테이너와 데이터는 삭제하지 않고 보존했다.
- 비공개/TBD 문구 구분은 Luna 구현 후 root가 실제 응답과 같은 null teamId 회귀까지 보강했다. `match-detail-content.test.tsx` 20/20 PASS(단일 worker, `/tmp/task168-masked-team-label-test.log`). 이 마지막 문구의 live visual 검증은 미완이며 commit/alpha-ready 근거로 사용하지 않는다.

1. **진행 중 — 현재 상태/로컬 DB:** branch dev, HEAD 1375f23c3 관측. 다른 세션 WIP 다수라 branch/stash/reset/commit/push 금지. 기존 postgres 컨테이너의 다른 DB를 수정하지 않고 `teameet_goal_20260908` DB와 해당 DB 소유 role만 생성했다. 소스 `ulw_v1_integration_yellow`는 읽기 전용 clone 원본.
2. **진행 중 — 실제 DB 통합 테스트:** Luna가 새 피리어드 integration spec/전용 fixture를 소유. 기존 게임 보존·CAS·rollback을 실제 Prisma 쿼리로 입증.
3. **진행 중 — Phase 3 조사:** Luna가 생성/소비 경로와 schema/TBD 대진/기존 ID 보존을 읽기 전용 조사. 메인이 정본과 대조 후 단계별 구현을 배정.
4. **진행 중 — 42개 실행 계약:** Sol이 기존 30+12 시나리오의 권한·fixture·실행 가능한 완료 조건을 점검.
5. **대기 — 구현/이관/전체 Ego E2E:** 준비 결과를 통합해 실제 런타임에서 진행. 프로덕션/alpha 업무 데이터에는 쓰지 않는다. local DB에서 먼저 모든 mutation을 검증한다.

## 소유권과 검증 원칙

- 메인: 방향/정본 판정, task/scenario 문서, 로컬 런타임/DB/테스트 실행, Ego 검수, 최종 완료 감사.
- Luna integration: 새 `apps/v1_api/test/tournaments/tournament-period-settings.integration-spec.ts` 및 필요 시 새 전용 fixture. 테스트 실행은 메인만 직렬 수행.
- Luna Phase 3: 현재는 읽기 전용; schema/shared contract 변경은 선행 단일 소유 wave로 배정한다.
- Sol: 읽기 전용 계약·계획·변경 리뷰. 결과는 실제 코드 근거로 재검증한다.
- `.env*`를 읽거나 출력하지 않는다. 런타임은 명시적 로컬 DB와 task 전용 설정만 사용한다. 메시지/푸시/외부 결제의 실제 발송을 테스트 성공으로 요구하지 않는다.
- 원래 동작과 의미 있는 거부를 구분한다. 권한 없는 역할의 403/차단도 해당 시나리오의 기대 결과로 검증한다.

## 증거/리소스

- 시작 프로세스 목록: `/tmp/teameet-full-goal-process-baseline.txt`.
- DB clone 로그: `/tmp/teameet-goal-db-clone.log`.
- 서비스/브라우저를 시작하면 PID/PPID/port를 기록하고, 재개 시 실제 handle/health를 확인한다.
- 진행 중 DB는 이 목표의 후속 검증을 위해 유지하며 다른 세션 DB와 분리한다. 테스트 데이터/DB 제거는 정확한 소유 대상에만 적용한다.

### 런타임 보강

기존 Jest integration environment는 승인된 `ulw_v1_integration_*` DB 이름만 허용하고, 동일 PostgreSQL 인스턴스의 오래된 Jest clone을 자동 회수한다. 공유 PostgreSQL에서 다른 세션 clone에 영향을 줄 여지를 없애기 위해 전용 컨테이너 `teameet-task168-db`(127.0.0.1:55435, postgres:16-alpine)를 생성했다. 테스트 template은 `ulw_v1_integration_task168`, 앱 실행 DB는 별도로 생성한다. 첫 공유 DB에서의 실행은 이름 gate에서 중단되어 테스트 본문은 실행되지 않았다. API PID 16152는 전용 DB로 전환하기 위해 종료했다.

전용 앱 DB는 `teameet_task168_runtime`이며 base seed(종목/지역/약관)를 적용했다. 테스트 template과 분리해 Jest clone 생성이 앱 연결과 충돌하지 않게 했다. 공유 인스턴스에 처음 만들었던 `teameet_goal_20260908` DB/role은 소유 대상만 제거했다. 현재 API PID 29520(8121), Web pnpm PID 16647/Next 16661(3013), 컨테이너 `72c2413a807a`를 이 목표가 소유한다. 실행 handle API 81217/Web 73684. 로그 `/tmp/teameet-goal-{api,web,period-integration}.log`. 목표 진행을 위해 유지하며 재개 때 handle/health를 확인한다.

## Phase 3 기술 설계의 기준

현재 대진 생성은 양 팀이 미정이어도 V1Game을 만든다. 미정 슬롯을 오류로 격리하거나 임의 팀/지역/작성자로 채우는 이관은 원래 기능을 훼손한다. 따라서 tournament 소속 팀 매치에는 명시적 미정 상태를 표현하고, 친선 매치의 팀/일시/지역/작성자 필수 계약은 별도로 유지해야 한다.

최종 불변식은 모든 실제 경기의 단일 `V1TeamMatch → V1Game` 연결이다. 대진표의 그룹·라운드·진출 연결은 1:1 부가 정보로 보존할 수 있지만, 별도의 fixture 경기 엔진·상태·일정·설정 소유권을 최종 상태로 남기지 않는다. 기존 fixture UUID/game/revision/participant/event ID를 보존하며 새 match ID로 같은 UUID를 사용한다. 이 설계는 단계적 expand/backfill/read-swap/contract로 적용하고, 각 중간 단계는 최종 완료로 표시하지 않는다. 현재 V1League 테이블 제거는 이미 반영되어 있으므로 오래된 Task 164의 미착수 서술을 새 차단 요인으로 재사용하지 않는다.

### W0 독립 검수와 이관 전 게이트

- 대회 소유권은 TeamMatch 자체의 `tournamentId`로 판단한다. FK 삭제는 RESTRICT로 공식 경기가 친선으로 바뀌는 것을 막는다. 친선 경기 필수 필드 제약은 DB에서도 유지한다.
- 저장 모델이 TEAM_MATCH여도 대회 소속이면 대회 운영자 권한·담당 구장·인계·종료 후 SUBMITTED·관리자 확정 계약을 유지한다. 팀장 권한으로 운영자 검증을 우회하지 않는다.
- 부가 테이블은 대진 구조만 소유한다. 일정·상태·구장·설정·결과를 중복 소유하지 않는다. 영상·진출 연결·운영자 담당·감사 FK의 전환도 완료 조건이다.
- expand/backfill 중에는 기존 fixture 링크를 보존할 수 있다. 전체 소비처 전환 뒤 기존 링크를 제거하고 단일 TeamMatch 연결을 강제해야 최종 완료다.
- 실제 DB 이관 전 ID 충돌, Game 링크 누락/불일치, 등록 팀의 대회 불일치, 설정 pin 불일치, LIVE 경기, 구 결과와 현재 revision 불일치를 검사한다. 불일치는 조용히 덮지 않고 중단한다. 미정 팀은 유효한 null로 보존한다.
- 전후 Game/revision/participant/event 및 종속 행의 ID 집합·수를 대조한다. 재실행은 추가 변경 0이어야 한다. 운영 전환 시 LIVE는 0이어야 한다.
- 대회 SUBMITTED 정정과 친선 CHANGE_REQUESTED 재제출은 서로 다른 계약이다. 저장 통합을 이유로 대회에 상대 팀 재승인 절차를 추가하지 않는다.

2026-09-08 재개: W0 스키마/SQL 초안 작성 완료, 아직 적용·생성·실행 검증 전. 페르소나 seed도 실행 전이며 검수 중 문법 오류 2곳을 수정했다. 이전 상태 답변 턴은 진행 실적에 산입하지 않는다. 호스트 load 10.63/19.46/28.23(12코어), swap 11.8GB 관측으로 새 빌드/테스트는 보류하고 코드·읽기 전용 검수를 진행한다.

### 2026-09-08 21:49 진행 증거

- W0 스키마 Prisma validate PASS. 전용 runtime/template DB 양쪽에 SQL transaction 적용 PASS. 실제 기존 fixture 이관은 아직 하지 않았다(UPDATE league ownership 0행).
- 임시 스키마 경로에서 Prisma Client 생성 PASS. 처음 CLI validate는 저장소 `.env` 자동 로딩 로그가 있어 후속 실행은 `/tmp/teameet-task168-prisma`로 분리했다. 값은 출력하지 않았다. 임시 경로 의존성 해석 실패는 기존 api node_modules 연결 후 해결했다.
- `tournament-team-match-preflight.spec.ts` + `resolve-game-source.spec.ts`: 2 suites, 10 tests PASS, 10.927s, 단일 worker. `/tmp/teameet-task168-w0-unit.log`. Jest config ES module 경고는 기존 통합 실행과 동일하며 테스트는 exit 0이다.
- 이관 사전 검사는 유효한 TBD와 대회 최신 pin 변경을 오류로 취급하지 않고, 기존 fixture/game pin 불일치·LIVE·ID 충돌·권한 범위 불일치를 차단하도록 보강했다. Sol 검수 진행 중.
- seed 문법 오류(중복 닫는 괄호)는 DB 접근 전 중단됐고 수정 후 파싱 PASS. 실제 seed transaction PASS: 계정 12, 팀 3, 정확한 membership 5, 관리자 3, 현재 필수 약관 검증. `output/qa/task168/seed-manifest.json`은 observed이며 실제 실행 시각 기록. 로그 `/tmp/teameet-task168-role-seed.log`.
- Ego 113: 실제 이메일 로그인 → `/home`에서 `task168-1` 표시 확인. 토큰 주입이나 샘플 인증이 아니다. `output/ego/competition-full-goal-20260908/admin-real-login-home.png`.
- 공개 대회 안내의 무료 결제 필수·고정 조별/결선·상금 정산 오인을 수정했다. 실제 route 1440×1800, 768×1024, 390×844 화면 직접 확인, horizontal overflow 없음. `tournaments-flow-before.png`, `tournaments-flow-after-{desktop,tablet,mobile}.png`. 이 확인만으로 G-T/G-A 전체 완료 처리하지 않는다.
- API 이전 PID 29520은 TERM/exit 143 확인 후 새 Prisma Client 적용을 위해 재시작했다. 현재 PID 89014, port 8121, handle 9067. Web PID 16647/16661 port 3013, 전용 DB port 55435, Ego113은 다음 실제 E2E에 계속 사용한다. 전체 목표 종료 시 해당 소유 리소스만 회수한다.
- 다음: W1 transactional backfill 구현/검수 → 실제 데이터 이관·ID 보존 검증 → 생성·권한·결과 소비처 전환 → 30+12 E2E. 완주 기준은 여전히 0/30, 0/12다.

### 실제 대회 생성·설정 저장 (21:55)

- Ego 관리자 UI에서 대회 생성 → 초안 저장 → 확인 대화상자 → 접수 시작 실행. `947942e0-1de5-49dd-968d-234353048234`, `Task168 실제 운영 검증 대회`, `regular_tournament`, `format=league`, 무료, 2팀, 풋살, 2026-10-01 10:00~18:00 KST. DB status=open 재조회 확인.
- 같은 대회 `/info` 피리어드 편집 20/20분 → 15/15분 저장 → 페이지 다시 열기 → `2개 · 15분 / 15분` 확인. DB 새 pin `838ac577-5628-476c-b86c-bdcb47ed318b`, version=2, 전후반 durationMinutes=15 확인. 이전 pin `22222222-2222-4222-8222-222222222222`.
- 스크린샷: `periods-real-before.png`, `periods-real-after-reload.png`, `periods-real-after-reload-top.png` (마지막은 scroll 0으로 전체 맥락 캡처). 저장값은 실제 UI/API/DB로 검증했고, 운영자별 권한·기존 경기 있는 UI 흐름은 추가 실행 대상이다.
- W0 ownership 일치/field 필수 대회 연결 CHECK 2개를 runtime/template에 추가 적용했다. W1 backfill 초안은 작성됐으나 Sol 검수에서 사전 검사의 결과 상태/공식 기록 보존 범위 누락이 발견되어 보강 중이다. 아직 데이터 backfill 실행 전.
- 생성 화면 안내에 '등록 명단 중 출전 인원만 경기 출전' 문구가 남아 정본의 명단=출전자와 충돌한다. 다음 UI 계약 수정 대상이며 이번 공개 목록 문구 수정과 혼동하지 않는다.
- DB 감사 조회에서도 `tournament.period_settings.change` 1행과 실제 관리자, before 20/20 → after 15/15를 확인했다. 최초 조회의 잘못된 `name` 컬럼과 감사 서비스 경로는 실제 schema/파일 목록에서 `title`/`common/admin-context.service.ts`로 교정했다. 읽기 실패였으며 DB mutation은 없었다.
- 구장 scope 전달 누락 수정(Sol): resolver → staff resource → actor에 fieldId 전달, null은 키를 생략. 기존 fixture와 신규 TeamMatch 모두 적용. 관련 정책/서비스 테스트는 추가했으나 마지막 10/10 실행 이후 변경이므로 아직 미실행이다.
- 21:59 호스트 재확인: load 20.89/19.09/19.90, swap 14.3GB(앞선 9.6GB에서 증가), Node94/브라우저39. 신규 테스트/빌드를 보류했다. W1 실제 DB integration spec 작성은 계속 진행한다. 이 환경 상태만으로 전체 목표를 blocked/complete로 바꾸지 않는다.
- 비인증 공개 API `GET /api/v1/tournaments/947942e0-1de5-49dd-968d-234353048234`는 200/open/league/entryFee=0 재조회 확인.
- W1 backfill 초안 보강: 등록 팀/GameSide 일치 확인 뒤 hostTeamId/approvedApplicantTeamId 보존, TBD만 null, 기존 operational 값 비교, parent/advancement 닫힌 범위 검사, 구·신 Game 링크 잠금, 전후 보존 fingerprint. 실제 DB integration 파일 `apps/v1_api/test/tournaments/tournament-team-match-backfill.integration-spec.ts` 작성 및 fixture 정합성 검수 중. 아직 미실행.
- 재개 후 실행 순서: 최신 field scope/preflight/backfill 단위 테스트를 좁게 1회 → 전용 template DB의 새 backfill integration 1회. API는 field scope 변경 전 로드된 프로세스이므로 해당 검증 후 PID 89014만 재시작해야 최신 코드가 반영된다.
- 프로세스 비교: 재개 기준 897 → 916 프로세스, 관련 신규29개, 동일 command signature +54 없음. 공유 앱 PPID 아래 이번에 확인된 소유 신규는 API89014뿐이다. 타 세션 프로세스는 종료하지 않았다. 기존 API29520 및 이번 Prisma/Jest/seed 단발 프로세스는 종료 확인.

### 2026-09-08 22:30 진행 증거 및 남은 게이트

- 최신 W1 관련 단위 5 suites/71 tests PASS (`/tmp/teameet-task168-w1-unit.log`). 실제 DB backfill integration 3/3 PASS (`/tmp/teameet-task168-backfill-integration.log`): resolved/TBD 연결과 종속 ID 보존, 재실행 무변경, LIVE/ID 충돌 시 원자적 거절. 이전 Task165의 71개와 중복 합산하지 않는다.
- 실제 DB 검증에서 기존 `v1_games_source_exactly_one_ck`가 expand 연결을 막는 것을 발견했다. W0 SQL과 전용 template/runtime DB에 같은 UUID일 때만 두 링크를 허용하는 `v1_games_source_expand_ck`를 적용했다. 최종 contract 단계에서는 fixture FK 제거 및 단일 TeamMatch 연결 강제가 필수다.
- 신규 생성 화면 및 편집 화면의 명단/rolling 설명을 정본과 일치시켰다. 편집 모달 날짜 입력 잘림을 1열로 수정하고 desktop/mobile 실화면 확인: `datetime-after-desktop.png`, `datetime-after-mobile.png`. 생성 화면 변경의 시각 검증과 tablet 재확인은 남아 있다.
- Ego113 관리자 UI에서 A조(`abd63249-b41f-4aa5-88a6-022c40b0d496`)와 TBD 경기 `07de1d55-3468-4b69-9ef3-9c0bc0bed297` 생성. 실제 Game `48ae7299-4e31-49a6-a2fb-64433807df1c`, config pin `838ac577-5628-476c-b86c-bdcb47ed318b`, SCHEDULED 확인. 처음 화면 밖 버튼 클릭은 요청을 보내지 않았고, scrollIntoView 후 실제 생성됐음을 DB와 UI로 확인했다.
- 위 1건만 전용 runtime DB에 backfill 실행 PASS: TeamMatch 1, Details 1, Game 연결 1. Game ID/라인업 2개 ID/피리어드 2개 ID 전후 동일. 기존 source는 TOURNAMENT_FIXTURE로 보존한 expand 상태다. 브라우저 전체 재조회 후 같은 경기/TBD/운영 콘솔 링크 표시를 확인했다. 최종 source cutover 증거는 아니다.
- `GamesService.resolveActor`에 공식 TeamMatch의 대회/구장/담당 경기 정책을 연결하고 소유권 충돌을 거절했다. 종료 게이트는 tournamentId를 인정하며, 공식 TeamMatch는 takeover 검증을 면제하지 않도록 수정했다. API PID89014는 변경 전 코드이므로 재시작 전 이 변경의 실서버 검증을 주장하지 않는다.
- 최초 creator/auth 단위 실행은 creator 2개 PASS, 권한 5개 FAIL. 원인은 권한 정책이 거절하는 비 UUID 테스트 데이터였다. UUID로 수정했으며 생산 정책을 완화하지 않았다. 추가 takeover 검증 후 재실행 대상. `/tmp/teameet-task168-creator-auth-unit.log`의 이 실패를 전체 PASS로 보고하지 않는다.
- Sol이 식별한 남은 Phase3 게이트: 공식 TeamMatch lineup 저장/제출, 등록 명단/징계, scorer 필수, 토너먼트 승부차기/진출, 결과 복구, 선수 신원/명단 조회가 아직 기존 fixture 판별에 의존한다. 생성 helper의 실제 DB 중복/신원/일정 검증도 진행 중이며 production creator wiring은 아직 하지 않았다.
- 전체 30개 기본+12개 경계 흐름의 완료 판정은 계속 0/42다. 부분 UI 동작·단위·DB 통합을 전체 E2E 완료로 대체하지 않는다. 이전 상태 설명 턴은 no progress로 분류하며 이번 턴에는 실제 코드 수정과 runtime backfill 증거가 생겼다.

### 2026-09-08 22:38 X04 실제 완료

- **기본 0/30, 경계 1/12, 합계 1/42**. X04를 실제 관리자 UI → API → DB → UI 새로고침으로 끝까지 실행했다. 자세한 실행 증거는 `docs/scenarios/competition-role-flow.md` 최신 기록에 있다.
- 기존 경기 생성·backfill 뒤 피리어드를 15/15 → 10/10으로 저장. 기존 Game/fixture/TeamMatch는 pin `838ac577-5628-476c-b86c-bdcb47ed318b`(15/15) 보존, 이후 UI로 생성한 새 fixture `a0617666-476b-44c8-89d4-0b76f3c8b5ee` / Game `5c3df024-5db9-4502-a150-dab602129559`는 새 pin `5120c2cb-74ae-4762-af56-e28ab47c1695`(10/10) 적용. 이관 후 운영 콘솔 진입도 확인했다. Phase3 creator 교체 후 해당 회귀는 다시 실행한다.
- 최신 creator helper는 per-side 등록/팀 null 일치, 활성 roster 신원, command/resource 충돌, 정규화 SHA256, 저장된 생성 응답 replay, Game/TeamMatch 설정 pin 일치를 검사한다. 실제 DB integration spec을 추가했지만 아직 실행하지 않았다. Sol 지적을 반영한 이후 최종 검수도 필요하다.
- GamesService의 공식 TeamMatch lineup/징계/scorer gate 및 나머지 recovery/knockout/identity 접근 변환을 Luna가 담당한다. 파일 소유권을 root에서 Luna로 넘겼으며 동시 편집하지 않는다. API8121은 아직 이전 소스다.
- 22:36 load47.96/41.12/28.87(12코어), swap19.3GB로 새 테스트/빌드를 시작하지 않았다. process baseline868→847, 동일 signature +10 이상 없음(+54 없음). 단발 Jest36741, backfill87181, Ego navigation81428/69466는 모두 terminal 확인. API89014/8121, web16647·16661/3013, 전용DB55435, Ego113은 다음 E2E 단계용으로 유지하고 전체 검증 종료 시 소유 자원만 회수한다.

### Phase3 소비처 전환 순서 (현 코드 전수 검색 결과)

1. 공유 경기 context: `games/games.service.ts`, `tournament-operations/resolve-game-source.ts`, `game-operations/official-revision-row.query.ts`. 공식/친선 구분, 권한, 경기 종료, lineup, 복구, identity, 징계/승부차기 규칙을 source enum만으로 판단하지 않는다.
2. 생성·수정·삭제: `tournaments/tournament-bracket.service.ts`, `league-fixture-generator.service.ts`, `mock-seed/mock-tournament-seed.service.ts`. fixture-shaped API는 유지하되 TeamMatch/Details를 생성한다. 기존 Game 보존 및 대진 replacement 계약을 먼저 확인한다.
3. 결과·진출·순위: `tournament-result-review.service.ts`, `game-result-bracket-projection.service.ts`, `game-result-standings-projection.service.ts`, `game-result-void-projection.service.ts`, `tournament-standings-recalculation.ts`, `knockout-fixture.ts`.
4. 조회: `tournaments-read.service.ts`, `tournament-detail.presenter.ts`, `public-tournament-records.service.ts`, `public-user-records.service.ts`, 관리자 통계. 기존 fixture-shaped 응답을 TeamMatch operational 필드와 Details bracket 필드로 조합한다.
5. 운영: operations board, `tournament-fixture-lineup.service.ts`, operations fields, `tournament-staff.service.ts`, 완료 알림. scope UUID 및 감사 대상은 보존한다.
6. 리뷰·영상·감사 및 contract migration: tournament fixture review service/mappers, tournament/league video services, `V1TournamentStaffFixtureScope`, `V1OperationAudit` FK, 구 fixture result/goal/video 연결. 영상/리뷰 ID와 과거 감사 이력을 지운 뒤 새로 만드는 방식은 불가하다. 시상은 직접 fixture query보다 순위/공개 DTO 의존성이 주 경로다.

이 목록은 완료 목록이 아니다. 특히 신규 helper만 만들고 기존 creator/consumer를 유지한 상태는 Phase3 완료가 아니며, 마지막에는 구 fixture 운영 테이블과 이중 source 연결을 제거한다.

### 2026-09-08 22:46 검증 갱신

- 공식 TeamMatch 권한/생성 단위 2 suites/15 tests PASS, 22.685s (`/tmp/teameet-task168-creator-auth-unit.log`, Jest58566 exit0). UUID fixture 수정 후 director/field scope 및 실제 GameTakeoverService 토큰 검증이 통과했다. 기존 Jest ESM 경고는 exit0인 baseline이며 실패로 오인하지 않는다.
- 신규 creator 실제 DB integration 4/4 PASS, 7.652s (`/tmp/teameet-task168-creator-integration.log`, Jest12924 exit0). 최초84343 실행의 2개 실패는 테스트간 동일 대진 좌표 충돌이었고 서로 다른 fixtureNumber로 수정했다. 검증 대상은 저장/replay·roster 변경 후 replay·동시 동일 요청·payload 충돌·잘못된 팀/선수·TBD·한쪽 일정이다. 전용 template clone이며 runtime 업무 데이터와 분리됐다.
- G-T 부분 실행: 실제 관리자 로그아웃 → 비로그인 홈/대회 목록 → 무료 대회 상세 → 참가 신청 → 이메일 로그인(firstUser) → 같은 대회 `/my` 복귀 → 소속 팀 없음/팀 만들기 안내 확인. `first-user-login-return.png`. 무료 대회 상세의 입금/환불 필수 오안내를 발견했으므로 아직 G-T 전체 PASS로 올리지 않는다.
- `tournament-detail-client.tsx`는 수정 전 clean 확인 후 Luna에 단독 소유권을 줬다. `free-tournament-notice-before-desktop.png`에 실제 오류를 캡처했다. 무료/유료 안내 분기 수정 및 desktop/tablet/mobile 시각 검수가 남아 있다.
- API89014는 최신 GamesService 변경 전 프로세스다. 단위/DB 통합 통과를 최신 운영 API E2E로 보고하지 않는다. UI task113의 현재 로그인은 `task168.first.user@example.test`다.

### 2026-09-08 22:59 실제 UI 결함 수정 / 감사 expand

- 무료 대회 안내를 `tournament-detail-client.tsx`와 기존 shared `TournamentApplicationGuideSection`에 fee-aware로 반영했다. 처음 새로고침에서 하위 Notice의 잘못된 `tournament` 참조를 발견해 명시적 `isFreeEntry` prop으로 수정했다. 재컴파일 중 Next JSON parse 500은 이후 같은 URL의 200 및 실제 UI 재조회로 회복 확인; `.next` 삭제나 타 프로세스 종료는 하지 않았다.
- 실제 desktop1440×1800/tablet768×1024/mobile390×844에서 신청 안내/유의사항 문구와 가로넘침0 확인. `free-tournament-notice-after-{desktop,tablet,mobile}.png`, `free-tournament-precheck-after-mobile.png`. 수정 전 tablet/mobile 이미지는 확보하지 못했으므로 desktop before만 비교 증거다.
- 콘솔의 `Cannot update AppShellFrame while rendering TournamentDetailPageClient` 오류를 실제 Ego overlay에서 확인했다. 기존 `shell-override.ts`의 render 중 store publish를 effect로 옮겼다. 새로고침 후 오류 배지 소멸 및 모바일 참가 CTA 확인(`free-tournament-precheck-after-shell-fix-mobile.png`). 3개 회귀 테스트 첫 실행 PASS지만 테스트의 act 경고와 warning assertion 표현을 root가 보강했으며 재실행/Sol 심사 필요.
- 신규 감사 expand migration `20260908150000_v1_operation_audit_team_match_expand`: 기존 fixture FK/감사 행은 유지하고 `team_match_id` 및 동일 대회 composite FK/CHECK 추가. Prisma validate/generate PASS; template/runtime DB 각각 transaction 적용 PASS. 기존 league ownership 정규화는 양쪽 UPDATE0. 이관 SQL 적용은 로컬 검증 DB에 한정한다.
- `OperationAuditWriterService`가 teamMatchId를 검증·기록하도록 확장했다. GamesService 감사 scope 연결과 league creator tournamentId 입력, 실제 감사 DB 테스트는 Luna 작업 중이며 아직 완료가 아니다.

### 2026-09-08 23:15 감사 회귀 해결 및 실제 DB 검증

- 사용자 확인: 완료 기준은 dev 반영 → alpha 배포 확인 → Ego 실제 E2E다. 현재 이번 변경은 로컬 미커밋 상태이며 alpha 검증 완료로 보고하지 않는다. main 승격은 사용자 소유다.
- Sol이 친선 TEAM_MATCH 생성의 감사 scope 회귀를 발견했다. tournamentId가 없는데 teamMatchId를 기록해 writer/DB CHECK가 트랜잭션을 거부했다. 공식 경기는 tournament/teamMatch scope를 기록하고, 친선 경기는 GAME resource 감사와 null competition scope를 유지하도록 수정했다.
- 실제 PostgreSQL 통합 **3/3 PASS**, 4.889s, Jest75342 exit0, `/tmp/teameet-task168-audit-db-final.log`: 공식 경기 감사 scope/field 저장·재조회, 감사 writer 실패 시 Game 및 감사 행 롤백, 친선 경기 생성과 null competition scope 감사 저장. 초기 실패는 신규 테스트의 잘못된 targetId 필드명과 친선 경기 필수 데이터 누락으로 수정했다. DB 제약을 완화하지 않았다.
- 권한 단위 **15/15 PASS**, 3.98s, Jest66658 exit0, `/tmp/teameet-task168-auth-resume-final.log`. Phase3 nullable host로 드러난 league forfeit 타입 실패는 홈/원정 양팀 확정 가드를 추가해 해결했다. unsupported source 테스트는 실제 Nest 409 response.code를 검증한다. forfeit HTTP 전체 회귀는 별도 미실행이다.
- shell 단위 최신 증거는 **4/4 PASS**, `/tmp/teameet-task168-shell-unit.log`. Sol은 실제 route transition 수정에 blocker 없음을 확인했다. 동시 publisher의 역순 unmount 복원 지원 여부는 별도 확인 필요하다.
- 전체 사용자 시나리오는 여전히 **기본 0/30 + 경계 1/12 = 1/42**. 위 단위/DB 통과를 alpha E2E로 계산하지 않는다. Phase3 creator 및 소비처 전환은 아직 미완이다.
- API8121은 아직 이 수정 이전 프로세스다. dev/alpha 반영 전에 생성·운영·결과·순위 조회 소비처를 함께 전환하고 커밋본 검증을 수행해야 한다.

### Phase3 집계 전환: Sol 검토로 확정한 구현 제약

- `official-revision-row.query.ts`의 semantic tournamentId에 TeamMatch.tournamentId/leagueId를 무조건 COALESCE하지 않는다. 공개 팀 기록은 non-null tournamentId를 대회로 분류하므로, 리그 기록이 대회로 오분류된다. 대회 소속은 fixture 또는 tournamentDetails에서, 리그 소속은 leagueId에서 구분한다.
- 공유 row에 canonical TeamMatch/Details identity와 leagueId 및 raw owner를 분리해 전달하고, projector 진입 전 owner 일치를 검증한다. mixed ownership은 실패시킨다. 공식 결과·void·역사 backfill row 생성은 함께 변경한다.
- 순위는 Details/group source를 기존 계산 입력으로 구성한다. 진출/취소는 신규 advancement edges와 Details를 사용하고, target TeamMatch 팀·GameSide·일정을 같은 transaction에서 동기화한다. canonical ID를 구 tournamentFixtureId에 넣어 구 테이블 조회를 유도하지 않는다.
- 완료 알림은 sourceType TEAM_MATCH만으로 친선/리그 알림을 보내지 않는다. canonical tournament discriminator로 preference·문구·대회 deep link를 보존한다.
- 다음 검증 matrix: 기존 대회, canonical 대회 TeamMatch, 양 owner가 같은 리그 TeamMatch, 친선 TeamMatch, 소속이 충돌한 행. 각각 attribution/cache/집계 분기 및 잘못된 소속의 원자적 실패를 실제 DB로 확인한다. 이 항목들은 계획이며 아직 구현/검증 완료가 아니다.

### 2026-09-08 23:25 집계 source 전환 진행

- 공유 SQL은 raw fixture/TeamMatch/Details/league ownership을 분리하고 `normalizeOfficialRevisionRow`로 semantic tournamentId를 결정한다. 공식 projection·team record backfill·void 순위용 조회가 같은 normalizer를 사용한다. 잘못된 backfill 소속은 `INVALID_SOURCE_OWNERSHIP`으로 격리된다.
- 순위 projector는 canonical Details의 공식 Game 결과를 조별·통합 계산 입력에 포함한다. legacy fixture는 sourceType TOURNAMENT_FIXTURE, canonical Details는 TEAM_MATCH만 읽어 expand 중 중복 집계를 피한다.
- 순위 단위 9/9 PASS (`/tmp/teameet-task168-canonical-standings-unit.log`, Jest40832 exit0, 6.592s). source/void/기존 bracket 단위 3 suites/10 PASS (`/tmp/teameet-task168-projection-source-unit.log`, Jest71951 exit0, 6.088s). 이 bracket 검증은 신규 canonical 진출 구현의 증거가 아니다.
- 완료 알림은 canonical 대회 경기를 기존 대회 lane으로 연결하고 TeamMatch lane에서 제외한다. 기존 tournament-fixture-completed 중복 방지 키·수신자·activity preference·대회 링크를 보존한다. 알림 단위 2 suites/14 PASS (`/tmp/teameet-task168-notification-source-unit.log`, Jest63814 exit0, 5.497s).
- 추가 자체 검토에서 equal-owner 리그를 orphan으로 거부하던 normalizer 조건과 Details가 raw owner 없이 통과하던 조건을 수정했다. 보강 후 normalizer 3/3 PASS (`/tmp/teameet-task168-normalizer-final.log`, Jest28465 exit0, 3.93s).
- 실제 DB source/facts attribution matrix는 신규 통합 테스트 작성 중이며 아직 PASS가 아니다. canonical bracket 진출·void 역진출, creator/기타 소비처 전환 및 alpha/Ego E2E는 계속 미완이다. 전체 시나리오 수는 1/42 그대로다.

### 2026-09-08 23:31 실제 DB 집계·캐시 계약 확인

- 실DB 검증에서 기존 official fact trigger가 fixture 소속만 읽어 canonical tournament 기록을 23514로 거부하는 실결함을 발견했다. 공개 cache trigger에도 같은 제한이 있었다. 신규 `20260908160000_v1_official_fact_team_match_scope` migration에서 두 guard를 동일한 소속 규칙으로 전환하고 기존 snapshot 검사들을 보존했다.
- 새 migration을 전용 template/runtime DB에 각각 transaction 적용해 두 함수 생성 성공을 확인했다. alpha/production에는 적용하지 않았으며 로컬 수동 적용분은 `_prisma_migrations`에 기록하지 않았다.
- 실제 DB integration **2/2 PASS**, 5.29s, Jest46376 exit0 (`/tmp/teameet-task168-source-facts-db.log`). 서로 다른 regular_tournament/regular_league와 친선 TeamMatch 3개, 실제 Game/공식 revision/팀을 만들고 공유 SQL→normalizer→facts/cache projection→재조회로 대회/리그/친선 귀속과 양 팀 기록을 확인했다. 잘못된 대회 귀속 저장은 거부되고 fact 수가 그대로임도 확인했다. UI/API 공식화 경로를 실행한 테스트는 아니다.
- 최초 두 setup 실패는 종목 seed 의존과 친선 필수값 누락을 수정했다. 세 번째 실패는 실제 trigger 계약 누락으로 위 migration으로 해결했다. 정상 경로에서 Jest ESM warning은 exit0 baseline이며 검증 실패가 아니다.
- Sol이 지적한 source cutover 중 same-UUID dual link는 ID·fixture owner·Details owner·raw owner가 모두 일치할 때만 normalizer에서 허용하도록 수정했다. 최종 contract 단계의 구 링크/테이블 제거 의무는 그대로다.

### 2026-09-08 진출·무효화 Wave 진행 중

- canonical advancement helper와 bracket entry를 Luna가 구현 중이다. root는 void entry를 연결하고 canonical 소속의 순위 재계산 및 tournament watermark를 전달하도록 수정했다. helper 완료/통합 검증 전에는 완료로 취급하지 않는다.
- root void handler는 현재 결과 포인터와 다른 과거 VOID 작업을 쓰기 전에 종료하도록 수정했다. 늦게 도착한 무효화 작업이 최신 정정 결과 cache를 숨기는 것을 막는다. 기존 fixture 역진출도 승부차기 결과와 공유 점수 파서를 사용하도록 수정했다.
- 초기 helper 검토에서 outer-join 잠금, 잘못된 Prisma 필드, target Game LIVE 누락, 팀 이름 snapshot, lineup ID 삭제, 취소 일정 재활성화, source 등록/팀 정합성 문제가 발견돼 수정 요청했다. 실DB 테스트 초기안도 대진/edge unique 위반과 공유 fixture 의존이 있어 실행 전 재작성 중이다.
- 이 Wave의 자동 검증은 아직 실행하지 않았다. helper·void·스케줄·명단 동기화 및 실DB 통과가 필요하다. API8121/dev/alpha는 이 Wave가 반영된 상태가 아니다.

### 2026-09-08 23:49 진출 DB / 명단 무효화 검증

- canonical 진출·역진출 helper는 Details/TeamMatch/GameSide/일정을 같은 transaction에서 갱신한다. target Game SCHEDULED 확인, 실제 등록팀 정합성, 이름 snapshot, Game version 증가, 진행 중 target 충돌 시 전체 rollback을 적용했다. 구 fixture branch는 contract 제거 전까지 남아 있다.
- 제출/잠금 명단을 남기고 새 DRAFT만 만들면 기존 selector가 옛 제출 명단을 계속 고르는 결함을 Sol이 확인했다. `V1GameLineup.invalidatedAt/invalidationReason`과 migration `20260908170000_v1_lineup_invalidation`을 추가했다. 이전 명단/참가자 ID를 보존하고 SIDE_TEAM_CHANGED로 무효화한 뒤 새 draft를 생성한다. Prisma generate 성공, 전용 template/runtime DB에 ALTER TABLE 적용 성공; alpha 미적용.
- 중앙 명단 selector, 공식 결과/신원 후보, 운영 명단, 공개 live 명단, team-match latest, todo/운영board, review 상대 명단, public tournament record picker와 frontend lineup-grid에 무효화 제외를 연결했다. frontend 타입/fixture 정합성 점검은 진행 중이다.
- bracket/void 단위 **8/8 PASS** (`/tmp/teameet-task168-advancement-unit.log`, Jest34024 exit0, 5.824s). 중앙 명단 selector **8/8 PASS** (`/tmp/teameet-task168-lineup-invalidation-unit.log`, Jest63249 exit0, 3.905s). frontend lineup-grid **16/16 PASS** (`/tmp/teameet-task168-lineup-ui-unit.log`, Vitest84706 exit0, 841ms).
- 진출 실DB 최초 실행은 ambiguous id SQL로 실패했고 registration alias를 명시해 수정했다. 이후 **4/4 PASS** (`/tmp/teameet-task168-advancement-db.log`, 최신 Jest89343 exit0, 7.809s): 정상·승부차기 승자 배정, replay 일정 중복 방지, LIVE target 전체 rollback, 실제 진출 후 역진출·반대편 보존·명단 이력 보존. 중앙 selector가 실제 보존된 DB 참가자를 현재 명단에서 제외하는 추가 assertion까지 통과했다.
- 남은 gate: canonical result-review synchronous downstream409, 생성·수정·조회 소비처 전환, 취소→재진출 일정 복구 실DB 검증, 완전한 active lineup 소비처/fixture 점검, 이관 후 이전 팀의 이력 접근, 실제 Ego·alpha 사용자 E2E. 이 단계 통과를 42개 사용자 흐름 완료로 계산하지 않는다.

### 2026-09-08 23:55 최신 API 부팅 확인

- API 재시작에서 Nest `LeagueMatchForfeitService` dependency index2 실패를 실측했다. GamesService → league-fixture-list-source → league-match-forfeit.service → GamesService 순환이 원인이었다. 순수 몰수 판정 함수를 `league-forfeit-result.ts`로 분리해 해결했다. 신규 진출 코드의 일정 생성도 `team-match-schedule.ts`라는 서비스 무의존 함수로 분리했다.
- 최초 재시작 PID41829/Jest session55940 및 PID43204/session81231은 exit1 terminal 확인. 최신 **API PID44827 / port8121 / session43229**가 `Nest application successfully started`를 기록하고 실제 대회 상세 GET200을 반환했다. 이전 PID89014는 root가 TERM했다.
- Ego113에서 같은 대회 상세를 새로고침했다. 로딩 직후 이전 오류 overlay가 잠깐 관찰됐지만 후속 실제 DOM은 정상 대회 제목/신청 안내, `hasRuntimeError:false`, 가로 넘침 false였다. 이 증거는 대회 상세 복구에 한정하며 운영 lineup/진출 전체 UI 검수 완료를 뜻하지 않는다.
- latest API는 명단 무효화/진출 코드와 새 Prisma client를 사용한다. web16647/16661(child listener16667), 전용 DB55435, Ego113은 후속 E2E를 위해 유지하며 전체 검증 종료 시 root 소유 자원만 회수한다.
- frontend MSW/운영 명단 fixture, backend public-record/claimable fixture에 invalidatedAt:null 계약을 동기화했다. 이 추가 fixture 묶음의 좁은 재검증과 실제 명단 화면 검수는 남아 있다. 전체 시나리오 1/42 및 dev/alpha 미반영 상태는 그대로다.

### 2026-09-09 생성·조회 실제 DB 전환 검증

- `TournamentBracketService.createFixture`가 canonical 생성 helper를 사용하도록 연결했다. 새 생성은 TeamMatch/Details/단일 TEAM_MATCH Game/팀 일정만 저장하며 구 fixture mirror를 만들지 않는다. 관리자 getBracket 및 공개 detail query/presenter에 canonical 조회와 동일 UUID 중복 제거를 연결했다. 구 영상 보존과 Game 기반 live 상태를 유지한다.
- 실DB 통합 **6/6 PASS**, Jest PID61086 / session45236 exit0, 7.115s, `/tmp/teameet-task168-creator-read-db.log`. helper 재생·동시 요청·잘못된 명단 rollback 외에 실제 관리자 서비스의 동시 생성, 단일 경기/양팀 일정 저장, 다른 payload409, 관리자·공개 대진표 재조회와 Game LIVE 반영을 확인했다. 초기 실행은 nullable tournamentId 반환 타입으로 본문 실행 전 실패했고 필수 대회 ID를 명시해 해결했다.
- Sol 결과 처리 심사에서 실제 재시도 CAS 순서, 승자 정정 시 이전 진출 배정 잔존, 비동기 진출 직전 다음 경기 시작 경쟁을 발견했다. root는 `LockedTournamentGame.teamMatchId` 타입 및 replay 이후 신규 요청 CAS를 수정했다. Luna는 명시적 Game→Details→TeamMatch 잠금과 동기 결과 트랜잭션/진출 교체를 보완 중이다. 이 부분은 아직 테스트 완료가 아니다.
- 현재 증거는 전용 로컬 DB의 서비스 통합이다. HTTP/Ego의 생성·정정 흐름과 alpha 실행 증거는 아니다. Phase3 수정/삭제/운영 소비처·구 FK/테이블 제거, 42개 흐름, dev/alpha 완료 gate는 계속 남아 있다. 사용자 시나리오 **1/42**, dev/alpha 미반영.

### 2026-09-09 00:28 canonical 명령 경계 검증

- 생성 재시도에서 기본 장소 누락 시 hash가 달라지는 결함을 effective venue 통일로 수정했다. 자연키 replay는 Game source/config/양쪽 side 정합성을 검사하고 생성 감사는 1건만 남긴다. 새 ID의 update/delete도 canonical branch로 연결했다. update는 Game 잠금 안에서 결과/진행 상태 재검사, 팀/명단/일정 동기화, 일정 이동 시 duration 보존을 수행한다. delete는 기존 Game 이력 보존 계약으로409다.
- 생성·수정·재조회/진출 테스트 **14/14 PASS**, 2 suites, 7.591s, Jest PID72061 session38966 exit0, `/tmp/teameet-task168-canonical-mutations-db.log`. 기본 장소 replay, 생성 감사 중복 방지, 불완전 aggregate409, 새 경기 일정 수정/동일 Game ID 보존, 삭제409, 승자 정정 시 단일 명단 교체와 LIVE 재생/side drift를 포함한다.
- 실제 결과검토 서비스 통합 **2/2 PASS**, 5.662s, Jest PID74207 session12756 exit0, `/tmp/teameet-task168-canonical-review-db.log`: 실제 staff/audit 서비스로 첫 확정→원래버전 동일키 replay→승자 변경 정정, 진행중 다음 경기409/포인터 보존, 감사 writer 강제 실패 시 포인터/리비전/TeamMatch 완료 rollback. 신규 테스트의 JSON null 타입 및 빠진 header idempotency key로 초기 실행이 실패했고 테스트 계약을 바로잡았다. 성공 경로에 mock 감사/권한을 사용하지 않았다.
- 결과 확정은 공유 completion helper(완료시각/상태로그/일정 완료)를 사용하고 canonical 진출·정정·무효화를 같은 명령 transaction에서 수행한다. 감사는 canonical teamMatchId를 기록해 구 fixture FK에 가짜 ID를 넣지 않는다. 동일 승자 정정은 다음 경기 LIVE여도 안전한 exact assignment 검사로 허용하고 실제 팀 교체만409로 막는다.
- Sol 후속 심사에 따라 VOID worker의 이미 제거된 배정 재생과 opposite-side/display snapshot 일치 검사를 보완했다. 마지막 helper 변경의 좁은 DB 재검증은 이어서 수행한다. 일정 lifecycle까지 완전한 replay predicate, canonical 운영보드/선수 이력/구 테이블 제거는 잔여 검토 항목이다.
- 현재 API PID44827:8121은 이번 새 생성/결과 경계 변경 이전 프로세스다. web PID16647/16661/16667:3013, 전용 DB container teameet-task168-db:55435, Ego113은 후속 HTTP/Ego 검증을 위해 유지한다. dev/alpha 미반영 및 전체 사용자 시나리오1/42 상태는 변함없다.
- 마지막 helper 검증 **7/7 PASS**, 5.855s, Jest PID76198 / session63145 exit0, `/tmp/teameet-task168-advancement-correction-db.log`. 강화한 opposite-side 검사에서 대상 경기의 반대편 등록을 조회하지 않아 정상 replay3건이 실패했고, 대상 양팀 등록까지 실제 잠금 조회에 포함해 해결했다. 이미 제거한 배정의 VOID 재생은 target LIVE 이후에도 데이터 변경 없이 통과한다. 테스트 프로세스는 모두 terminal; 에이전트3개 completed 확인. Node90/browser35, 시작 기준 동일 command signature +54 증식0. 기존 작업 소유 runtime은 다음 HTTP/Ego 검증까지 유지한다.

### 2026-09-09 canonical 운영 화면·권한 이관 검증 진행

- Ego113 플랫폼 운영자 UI에서 새 경기 `ad00f936-5d34-551b-a484-06c7035815b5`를 생성하고 재조회했다. Game `f6e58410-05e1-4bfb-a9aa-19e6cd9c836a`, source TEAM_MATCH, 구 fixture FK/row 없음, 10/10 피리어드 설정 보존을 확인했다. `canonical-create-reload-desktop.png` 증거. 기존 2경기도 같은 UUID로 backfill했으며 `/tmp/teameet-task168-runtime-backfill-next.log`의 before/after fingerprint가 일치한다.
- canonical 운영보드 조회를 실제 생성 통합에 추가해 **7/7 PASS**, 6.042s, Jest86839/session20985 exit0, `/tmp/teameet-task168-board-db.log`. 관리자 대진 건수는 legacy/canonical UUID를 중복 제거하도록 수정했다. alpha/전체 운영보드 검증은 아니다.
- 실제 Ego 시작 확인을 눌렀을 때 양 팀 미정 경기가 LIVE/version1로 저장되는 결함을 재현했다. 재현 Game은 증거로 유지하고 임의 상태 복원을 하지 않았다. 서버 시작 가드와 UI 비활성·배정 안내를 추가했다. 실제 DB `tournament-start-teams.integration-spec.ts` **3/3 PASS**, 7.958s, session62867 exit0, `/tmp/teameet-task168-start-teams-db.log`: 양쪽/한쪽 TBD 거부 및 상태·version·period/event 보존, 양 팀 확정 시 시작, canonical Details 누락 거부. 리그 회귀/경쟁 검증은 추가 검토 중이다.
- 다른 기존 SCHEDULED 경기 `a0617666-476b-44c8-89d4-0b76f3c8b5ee`에서 Ego 실제 화면을 확인했다. 1440×900/768×1024/390×844 모두 시작 버튼 disabled, 팀 배정 안내, 가로 넘침 없음. `output/ego/competition-full-goal-20260908/tbd-start-before-desktop.png` 및 `tbd-start-after-{desktop,tablet,mobile}.png`를 직접 보았다. 모바일/tablet before는 미수집이다. 처음 새로고침 2회에도 이전 화면이 남았으며 서비스워커 우회+cache 무시 reload로 최신 번들을 확인했다. 이 우회는 서비스워커 제품 동작의 정상 증거로 계산하지 않는다.
- staff canonical scope migration `20260908180000`의 잘못된 UPDATE alias/NOT NULL/지연 trigger DDL 순서를 수정했다. 기존 scope1건을 넣은 transaction에서 migration→동일 UUID/소속 유지 assertion→ROLLBACK 성공. 이후 전용 template/runtime DB에 각각 적용하고 Prisma generate 성공. 로컬 수동 적용이며 alpha 및 `_prisma_migrations` 반영은 아직 아니다. GamesService 구 source 권한과 staff API/board는 두 ID를 정규화한다. 실제 grant/access 통합은 이어서 검증한다.
- 현재 API PID87866:8121/session56518은 위 마지막 start/staff 변경 전 런타임이다. Web16647/16661/16667:3013, DB teameet-task168-db:55435, Ego113 유지. 새 API 재시작과 staff/리그 회귀 검증 뒤 실제 사용자 플로우를 계속한다. 전체 시나리오 **1/42**, Phase3 구 테이블 제거·dev 반영·alpha E2E 모두 미완이다.

### 2026-09-09 01:00 시작 가드·권한 실제 DB 추가 검증

- Sol이 canonical regular_league에 Details를 요구하던 회귀를 발견했다. root는 기존 `resolveTeamMatchCompetitionContext`를 재사용해 대회/리그/친선을 판별하고, 리그는 실제 TeamMatch 양팀과 GameSide 정합성을 확인하도록 수정했다. canonical 및 equal-owner 리그 정상 시작/TBD 거부를 포함한 시작 통합 **4/4 PASS**, `/tmp/teameet-task168-start-staff-db.log`, session24260. 같은 실행의 staff suite는 타입 오류로 실패했으므로 전체 green으로 세지 않는다.
- 최초 리그 확장 fixture는 새 데이터를 leagueId-only로 넣어 composite audit FK에 실패했다(`/tmp/teameet-task168-start-league-db.log`). migration1500은 기존 leagueId를 tournamentId로 채우지만 아직 남은 구 생성 경로는 새 행을 구 형태로 만들 수 있다. 이 경로의 canonical 쓰기 전환이 배포 잔여 blocker다. 최종 시작 테스트는 실제 목표 스키마의 canonical/equal-owner 데이터를 사용하며 leagueId-only 신규 생성 통과를 주장하지 않는다.
- staff 실제 DB 통합 **2/2 PASS**, 5.654s, session99468 exit0, `/tmp/teameet-task168-staff-db.log`. 한 assignment에서 canonical-only(구 fixture row 없음)와 기존 fixture 경기를 둘 다 scope로 저장하고 실제 takeover 권한을 확인했다. API list/myAssignments UUID 보존, 외부 대회 scope 거부/assignment 수 보존을 검증했다. 반복된 초기 실패는 readonly Prisma 정렬 배열 및 잘못된 복합 정렬 객체였으며 두 select 상수에 `satisfies Prisma.V1TournamentStaffAssignmentSelect`와 정렬 배열을 사용해 해결했다. 권한·감사 성공을 mock으로 대신하지 않았다.
- 구 API87866은 TERM/session56518 exit143 확인 후 최신 API **PID10666:8121/session9890**으로 교체했고 Nest 부팅 성공을 확인했다. Web16647/16661/16667:3013, 전용 DB55435, Ego113은 다음 실제 E2E를 위해 유지한다. 별도 test 프로세스는 모두 terminal이며 에이전트3개 completed 확인. 전체 목표 종료 때 이 소유 자원만 회수한다.
- 최근 호스트 load4.31/4.90/4.85, Node91/browser37, swap사용13.38GB(이전보다 감소). 새로운54개 단위 증식은 관찰되지 않았다. 현재 dev HEAD는 `f06d804af`; Task168 변경은 여전히 미커밋이며 alpha 배포/E2E 미실행. 전체 **1/42**를 유지한다.

- 후속 현재 소스 전수 확인으로 위 leagueId-only 생성 blocker 추정을 정정한다. `createLeagueFixture()`는 이미 `tournamentId: input.leagueId`와 `leagueId`를 함께 저장한다. 런타임 TeamMatch 생성 4경로(친선/리그/대회/backfill)에서 새로운 leagueId-only 쓰기는 찾지 못했다. 해당 테스트 실패는 구 형태를 새로 넣은 fixture 문제이며 현재 런타임 생성 결함의 증거가 아니다. 별개로 `league-fixture-generator.service.ts`의 구 tournament fixture 생성 전환은 남아 있다.

### 2026-09-09 실제 팀장 참가·명단 및 자동 대진 전환 진행

- Ego113에서 로그아웃→공개 대회 참가 CTA→로그인 redirect(`/tournaments/947942e0-1de5-49dd-968d-234353048234/my`)→팀장 로그인→같은 대회 내 팀 선택→필수 동의3건만 선택→무료 신청을 실행했다. 선택 사진/기록 공개 동의는 미선택이다. 신청 `67df37e7-b9e4-4fa6-9f55-40813fe5747f`, primary팀101, DB상태 `payment_checking`를 재조회했다. 상대 팀장으로 같은 신청 경로를 실행해 `bf18354e-1516-45de-826c-ec56a6b04e33`, secondary팀102도 같은 상태로 저장했다.
- 양 팀 모두 실제 명단 UI에서 6명씩 추가하고 새로고침·DB 재조회로 보존 확인했다. primary등번호7/9/10/11/12/13, secondary1/2/3/4/5/6. `team-leader-roster-six-reloaded.png`, `opponent-roster-six-reloaded.png` 증거. 관리자 확정·대진 배정·결과 E2E 전 단계이므로 L-T 전체 완료로 계산하지 않는다.
- 부족한 명단을 위한 보조 fixture `scripts/qa/task168-seed-roster-prerequisites.ts`는 전용localhost55435/runtime DB만 허용하고 신규 synthetic201–208만 추가한다. 기존 역할12계정과 권한은 유지한다. 양 팀 activeMembership6명 확인, `/tmp/teameet-task168-roster-prerequisites.log` exit0. tsx가 없어 최초 실행은 DB변경 전 실패했으며 Node24 nativeTS와 명시적 `.ts` import로 실행했다. 파괴적 초기화는 없다.
- 무료 상세/확인 팝업이 입금 필요 안내를 표시하는 G-T/L-T 결함을 발견했다. API Decimal 문자열 `"0"`를 Number로 판별하도록 detail/apply 분기를 수정했다. 상세는 서비스워커 bypass+cache무시 reload 후 입금2시간/입금확정 문구가 사라짐을 확인했다. `free-detail-guide-after.png`는 스크롤 직후 큰 빈 영역이 있어 시각 PASS 근거로 삼지 않는다. apply팝업은 두 번째 실행에서도 구 번들이 관찰돼 아직 최신 실제 화면 재검증이 필요하다. `free-apply-confirm-before.png` 증거; 무료 신청 저장 자체는 정상이다.
- `league-fixture-generator.service.ts`의 쓰기를 canonical helper로 전환했다. 구 미이관 fixture가 있으면 명시409, tournament 전체 allocation lock, exactplan replay, 같은 좌표의 `updateTournamentMatchInTx` 기반 재생성/감사, 실제 신규건수와 유지된round수 분리를 추가했다. root는 nullable 일정 삭제 시 endAt도null이 되도록 helper 계약을 보완했다.
- 생성 실DB1건 **PASS**, 6.169s, session21753 exit0, `/tmp/teameet-task168-generator-final-db.log`. 한 시나리오 안에서 구mirror없는 생성→동일 replacefalse 재시도→일정변경/동일Game·config 보존→LIVE 재생성 거부/이전일정 보존을 확인했다. 앞선 실패는 Date|null 타입 및 replay created카운트가1인 실결함으로 수정했다. 여러 조 동시생성·감사실패rollback·전체 replay불변식은 추가심사/검증 대상이다.
- API10666:8121/session9890은 generator 마지막 변경 이전 프로세스다. Web16647/16661/16667:3013, 전용 DB55435, Ego113(현재 상대팀장 로그인/roster 화면)을 후속 E2E에 유지한다. 모든 Jest 실행은 terminal. dev/alpha 미반영, 전체42흐름은 **1/42**를 유지한다.

### 2026-09-09 01:40 관리자 확정·조 배정 및 동시성 보완

- Ego113에서 상대팀장 로그아웃 후 최고운영자 계정으로 이메일 로그인했고 `/home`의 인증 UI를 확인했다. 관리자 신청 관리에서 North Stars와 River Rovers를 각각 확인 다이얼로그로 확정했다. 새로고침과 DB 재조회 모두 두 신청의 `confirmed` 상태를 증명했다. 같은 대회 A조 검색/담기/2팀 배정 UI를 실행했고 DB groupTeams에도 두 신청 UUID가 저장됐다. 아직 경기 운영/공개 기록까지 끝난 전체 흐름은 아니다.
- 무료 신청 카드의 `계좌이체 · 결제 완료 · 무료`를 `무료 참가`로 수정했다. `admin-two-registrations-confirmed.png` before와 `admin-free-registration-copy-after.png` after를 root가 직접 확인했다. 후자는 1440×900에서 카드2개·무료 참가2건·구 문구없음·가로넘침없음을 확인했다. 좁은 문구 변경 검증이며 전 화면/전 viewport PASS는 아니다.
- Sol이 발견한 generator의 과거 config pin 재시도 결함을 수정했다. 저장된 TeamMatch pin이 존재하고 Game pin과 일치하면 현재 tournament pin이 바뀌어도 exact replay로 처리한다. generator는 tournament allocation lock 뒤 조/정렬된 소속팀을 재조회한다. 신규 DB 케이스에 period service 변경 후 과거 pin/no-op audit 보존, A/B조 좌표 분리와 A 일정변경 시 B ID·좌표 유지, 양 조 replay를 추가했다. **이 추가 테스트는 아직 미실행**이다.
- 조 팀 추가/삭제·조 수정/삭제 및 수동 canonical 경기 생성에 같은 tournament lock을 사용하도록 보완했다. 추가의 group/confirmed registration/중복 검사는 transaction 안으로 이동하고 registration 행을 잠근다. 삭제는 canonical Details도 잠금 안에서 검사한다. 수동 생성은 tournament→coordinate 순서로 잠그고 조를 재확인한다. 조 수정 감사 beforeJson과 중복 해제는 잠금 후 재조회한다. 이 변경의 실제 동시성/rollback 검증은 남아 있다.
- Sol의 '경기가 하나라도 있으면 팀 배정 금지' 권고는 그대로 적용하지 않았다. 현재 계약과 실제 진행 흐름은 TBD 경기를 만든 뒤 팀을 배정하므로 포괄 차단은 기존 동작을 깨뜨린다. 생성된 경기와 소속팀 변경의 정합성은 해당 경계 시나리오로 추가 검증해야 한다.
- 테스트 전 호스트 확인: load18.90/11.37/7.83(12코어), 메모리free33%, swap17,445MB/18,432MB, Node108/browser72로 압박 증가. 새 Jest/build/typecheck를 시작하지 않았다. 잘못 추정한 `jest.integration.config.ts` 경로 읽기는 ENOENT였고 다음 실행 전 실제 설정 경로를 확인해야 한다. 모든 에이전트3개 completed, 이번 단계 추가 장기 프로세스 없음. 기존 API10666:8121(최신 변경 전), web16647/16661/16667:3013, DB55435, Ego113은 후속 E2E까지 유지하고 종료 시 소유 자원만 회수한다.
- dev 미커밋/alpha 미배포·미검증, 전체 시나리오 **1/42** 유지. 다음은 호스트 상태 허용 시 신규 좁은 DB 검증, 최신 API 교체, 새 canonical 경기 배정→실제 운영→확정/정정→공개 기록 검증이다.

### 2026-09-09 01:58 실제 운영→확정→승자 정정 증거

- Ego113의 관리자 A조 직접 입력에서 홈 North Stars/원정 River Rovers를 선택하고 조별4라운드1번 경기 생성 성공. canonical TeamMatch `ad8e46d3-64ea-556d-876e-8959e940fd27`, Game `6a33b350-a3e3-4ecc-89bd-1b02942b0c35`. 기존3경기 보존. 운영 콘솔에 등록 선수12명이 보였고 시작 확인→홈7번 task168-4 골(전반0:11)→경기 종료 확인을 실제 클릭했다. 종료1:0 화면 증거 `canonical-game-ended-one-zero.png`.
- 결과 검토에서 1:0 공식 확정 성공 후 검토대기0건으로 전환. 결과 정정에서 홈0/원정1, 득점팀 원정·선수 task168-6(원정1번)으로 변경했다. UI가 참가자 득점도 기존선수0/정정선수1로 동기화했다. 로컬 synthetic E2E 정정 사유를 입력하고 초안 제출→정정 확정 다이얼로그→확정을 실행했다. 화면0:1, 이전1:0→0:1, revision2와 이전revision1 이력 보존 확인. DB도 revision1 OFFICIAL1:0, revision2 OFFICIAL0:1을 반환했다. `canonical-result-corrected-zero-one.png` root 직접 시각 확인.
- 관리자 대진표 공개 확인 다이얼로그까지 실행했고 DB `bracket_published_at=2026-09-08 16:53:04.887 UTC` 저장 확인. 그러나 공개 경기 URL `/tournaments/947942e0-1de5-49dd-968d-234353048234/matches/ad8e46d3-64ea-556d-876e-8959e940fd27`은 여전히404. HTTP API도 `TOURNAMENT_MATCH_NOT_FOUND`를 반환한다. `public-tournament-records.service.ts`의 legacy-only 조회를 Luna가 전환 중이며 public 성공으로 집계하지 않는다.
- 순위 미반영의 별도 원인: 전용 로컬 runtime에 `v1-game-operations-worker.main` 프로세스 없음. 대상 Game outbox의 SUBMITTED1건/OFFICIAL2건이 전부 PENDING/attempts0이며 standings행은 아직 없다. 실제 worker 가동·처리와 공개 팀/개인 기록 검증이 남아 있다. 직접 DB 순위 조작이나 mock 처리로 우회하지 않았다.
- Field assignment/clear를 canonical Details→TeamMatch.fieldId로 전환하고 구 fixture mirror 쓰기를 제거했다. legacy-only는 명시 migration409. 새 실제 DB spec에 저장/해제/감사 canonical scope를 추가했으며 root는 clear 감사도 이전 fieldId를 남기는 계약에 맞춰 잘못된 감사 개수 단언을 수정했다. 테스트 미실행, Sol 검토 중. API 계약 문서에 local pending으로 기록했다.
- 호스트 부하 때문에 신규 Jest/worker/API 재시작은 실행하지 않았다. 01:57 load13.97/16.06/14.95, free30%, swap20,219MB로 압박이 계속된다. 실제 Jest config는 `apps/v1_api/jest.config.ts`의 integration project다. worker 검색 중 추정 경로/셸 glob 실패는 실제 `apps/v1_api/src/jobs/v1-game-operations-worker.main.ts`와 service 경로를 찾아 해소했다.
- API10666:8121/웹16647→16661→16667:3013/DB55435 유지, 이번 단계 추가 장기 프로세스 없음. Ego113 현재 공개 경기404 화면. 전 단계 generator/조 잠금 및 이번 field/public 변경은 최신 API 교체와 좁은 통합검증 필요. dev/alpha gate 미완, 시나리오 전체 **1/42** 유지.

- Field 후속: 동일 값 배정/빈 값 해제는 idempotency 응답만 저장하고 변경 감사는 생략한다. root는 사전 field 읽기→Game 잠금 사이의 경쟁에서 no-op이 잘못 성공할 수 있어 Game→TeamMatch 행 잠금 뒤 최초 관측값과 다시 비교해409 처리했다. API에 client expectedVersion 필드는 기존에 없으며, 이 CAS는 겹치는 서버 transaction 경쟁만 보호한다. 오래된 클라이언트 화면의 순차 변경까지 차단한다고 주장하지 않는다. replay/다른 payload409/타 대회 거부/no-op 감사 불변 테스트를 추가했으나 미실행이다.
- Public 후속 Sol 검토: legacy-first 조회는 동일 UUID 백필 뒤 canonical Game만 남으면404를 만들 수 있으므로 canonical-first로 보완 필요. nextMatch에는 HIDDEN/취소 경기 비노출과 정렬 tie-break, 전환 중 양 source 정합성이 필요하다. 초기 public DB spec은 로컬 고정 UUID에 의존하고 score 키도 실제 `{home,away,penalties}`와 달라 root가 반려했다. Luna가 self-contained fixture/visibility 회귀로 재작성 중이다. 아직 public 수정 완료·테스트 통과로 보지 않는다.

### 2026-09-09 공개 소비처 전환 후속

### 2026-09-09 03:10 이후 실제 통합 검증 재개

- 04:15 후속: 정정 피리어드 selector와 출전시간 입력, status_only 사유 비공개 API/UI 방어를 추가했다. API 공개기록35/35 PASS(기존 fake의 canonical delegate 누락을 실제 조회 계약에 맞게 보정), frontend 정정폼31+공개19+정정페이지9=59 PASS. 실제 최신 API GET200에서도 history 두 revision의 reason=null과 status_only를 확인했다.
- 04:18 실제 Ego390 폼에서 득점 period=2와 원정 득점자의 minutesPlayed=5를 입력했다. enabled 제출 버튼 실제 좌표 클릭 → 처리 중 disabled → draft3 저장·폼닫힘·H2 `경기 결과 정정` focus 확인. 이어 정정 확정 CTA와 확인 dialog를 실제 클릭해 revision3 OFFICIAL, goal_events period2 및 참가자 minutes_played5를 DB로 확인했다. 이 3차 결과의 워커 후속 반영은 아직 대기다. 기존 1·2차 공식 이력은 보존된다.
- 04:21 worker67584/session60071로 3차도 COMPLETED·attempt1 확인, cache current는3차만 유지한다. 소유 worker TERM/session143 종료. 로컬 전용 DB에 `PUBLIC_LIVE=on` 테스트 fixture를 추가하여 공개 점수/전적 소비처를 검증했다(운영 flag 승인 API 자체의 E2E 증거가 아니며 alpha/production 설정 변경 없음). 공개 API·Ego에서0:1/후반 득점, 팀 API·팀 상세→전적 실제 클릭에서1경기1승 확인. 사용자010의 본인 dev-auth GET은1출전1골·5분, 타인 GET은 동의없음으로0건. 실제 사용자 로그인·공개동의 전후 브라우저 확인은 계속 진행한다.
- `sw-push.js`가 `/ _next/static/` 개발 chunk까지 cache-first하고 HTTP Cache-Control을 무시하는 원인을 확인했다(실제 경로는 공백 없는 `/_next/static/`). 단순 reload/server restart로 일부 UI가 갱신되지 않은 이유이며, no-store/no-cache 존중 수정 및 좁은 검증을 진행한다. 오래된 화면을 최신 시각 증거로 확정하지 않는다.
- 정규리그의 tournamentId/leagueId 동시 존재를 실제-shaped fixture로 검증한다. leagueId 우선 분류와 canonical metadata 누락의 명시409를 추가했으며 todo/lineup 최신27/27 PASS. 앞선 loadContext 실패는 tx 대신 wrapper를 전달한 fixture와 `sideId` 대신 실제 `ownSideId` 반환 계약 불일치였으며 수정했다. reminder와 recentVenues를 포함한 다른3개 파일은 앞선 실행 PASS였다.
- Web 타입검사는 `.next/dev/types/routes.d.ts`의 생성물 중복 꼬리/문법 오류로 중단됐다. 제품 소스 타입 검사 통과를 의미하지 않는다. 실제 UI 검증 후 소유 dev server를 멈추고 생성물 재생성 및 검사를 진행한다.
- 최신 runtime: Web57349→57350→57356(session82221):3013, API57859(session34512):8121. 이전 Web3343/3344/3350 및 API30228은 TERM·session143 확인. Ego gotoAndWait가 90초 이상 반환하지 않은 실행 PID48451만 TERM/session8로 종료했으며 gotoUrl+실제 DOM 확인으로 재개했다. screenshot/변경 DOM이 갱신됐는지 검증 없이 완료로 세지 않는다.
- 04:00 후속: admin 상세 11건 PASS, 목록은 JSX 삼항식 누락으로 최초 실패했다. 누락된 `: null` 수정 후 목록 5건 PASS. 별도 agent의 첫 재실행은 Vitest 미지원 `--runInBand` 옵션으로 실패했으며 올바른 최소 worker 명령으로 재검증했다.
- Sol 후속에서 todo의 무효화 명단 제외 누락, 한쪽 팀만 정해진 경기의 비대칭 readiness, canonical 대회의 todo/reminder 친선 분류, recentVenues의 tournament-only 제외 누락을 발견해 수정 중이다. 완료로 분류하지 않는다.
- 실제 runtime DB의 대상 경기 outbox는 OFFICIAL 2건/SUBMITTED 1건이 아직 PENDING·attempt0이며 대상 조 순위는 0행이다. UI 정정 성공만으로 순위·팀·개인 전적 반영을 완료했다고 보지 않는다.
- 04:03 실제 worker PID46336/session85859를 전용 runtime DB 대상으로 시작했다. 대상 OFFICIAL 2건/SUBMITTED 1건 모두 COMPLETED·attempt1·lastError 없음, 원정 등록팀3점1승1득점/홈0점1패1실점으로 순위2행 생성. 공식 fact와 팀 fact는 1차1:0·2차0:1 이력을 보존하고 cache는 2차만 isCurrent=true다. 검증 후 소유 PID46336 TERM, session143 및 port8122 listener 없음 확인(정상 종료 확인용 ps/lsof exit1은 실패가 아니다). 팀·개인 브라우저 반영과 전체 E2E는 남아 있다.
- 공개 상태 전용 모바일 화면은 대상 URL 검증 후 `public-status-only-mobile-final.png`로 직접 캡처·확인했다. 안내문 고립 음절과 신원 연결 패널의 장식 점선 개선을 진행한다. UI 검수에는 글자/버튼 크기, 대비, 배치, 줄바꿈, 실제 focus와 가로 넘침을 포함한다.
- 03:51 API `tsc --noEmit` session38744 **exit0**, diagnostics0. 최초97건은 Phase3 nullable 소비처와 기존 테스트 fixture13건을 포함한 컴파일 진단 수이며 제품 결함97개가 아니다. 이후 드러난 선언 추론 TS2742 29건은 service/return type을 명시해 해결했다. 선언 생성을 끄거나 any로 완화하지 않았다.
- 일반 모집 list/detail/manage는 tournament-only canonical을 대회 운영 경계로 분리하며 기존 league 경로를 유지한다. canonical 라인업/todo 지원은 보존한다. reviews의 양 팀/완료시간, chat의 목록·직접진입 양 팀 조건, admin의 nullable 팀/생성자/시간·대회 소속을 동기화했다. 독립 Sol 재심사 진행 중이다.
- worker module/chat 기존 테스트는 PASS. reviews fixture의 invalidatedAt 누락을 보정하고 TBD/시각누락/기간만료3건을 더한 session24171 **56/56 PASS**. 정정 페이지9건은 앞선 실행 PASS, 정정 폼은 visible label과 순번 있는 접근성 이름을 유지한 session74794 **29/29 PASS**. 공개 상세 status-only 안내 문구 session52477 **18/18 PASS**.
- 정정 버튼 최종 실측 대비 **5.4098:1**, 높이44px/글자14px. inline open은 홈 점수 INPUT, visible 취소 버튼의 실제 좌표 클릭 후 시작 BUTTON으로 focus 이동을 확인했다. Ego offscreen click은 결과 확인 없이 성공으로 세지 않는다.
- 관리자 TBD 상세390px에서 팀/장소 미정, invalidLinks0, 가로폭390=390 확인. 임시 screenshot 경로가 다른 작업 캡처로 덮인 건은 폐기하고 대상 URL 전후 검증+CDP screenshot을 고유 파일에 즉시 기록하는 방식으로 바꿨다. admin-canonical-tbd-mobile.png는 올바른 대상 이미지로 재생성했다.
- API3105 종료 후 API30228(session23281):8121로 교체, Web3343→3344→3350:3013 유지. 관리CTA 실제 클릭으로 canonical 공개 상세에 도달했고 기존404는 재현되지 않았다. runtime PUBLIC_LIVE off의 점수 숨김은 정상이다. 전체 결과→정정→공개순위/팀/개인 기록 E2E와 dev/alpha는 미완이다.

- 03:33 후속: 공개 경기4건 + source cutover2건 session89450 **6/6 PASS**. 공개 spec은 자체 sport/region/owner를 생성하고 공개 점수 검증에 PUBLIC_LIVE=on을 명시했다. flag off에서 점수를 숨긴 기존 동작은 보존했다. source spec은 실제 전환 전 mixed batch 실패에서 Game/Scope 복구, 반대 Game ID 정렬의 복수 fixture, 기존 공식 fact/cache ID·snapshot 보존, 최신 HIDDEN policy, rerun을 포함한다. 실제 canonical registration 변경 후 rerun과 worker 동시성 실행은 별도 미검증이다.
- 개인 공개 기록 session2073 **2/2 PASS**, canonical 영상 공유참조 보존 session58834 **1/1 PASS**, canonical 경기장 배정 session31336 **1/1 PASS**. 서로 다른 실행 결과를 전체 suite/전체 E2E PASS로 확대하지 않는다.
- source cutover 잠금은 Sol writer 교차검토 후 Game→source→cache로 유지하고 revision의 추가 FOR UPDATE를 제거했다. revision→Game을 쓰는 worker와 반대순서 교착을 만들지 않도록 공식 revision은 shared SELECT로 검증한다. 이는 코드 심사 근거이며 실제 경쟁 테스트 통과 주장과 구분한다.
- Ego113 최신 390×844/768×1024에서 득점 입력4개 visible label과 control 연결, 가로폭390=390/768=768, 하단 사유/취소/제출 배치를 직접 확인했다. 양 viewport 실제 취소 뒤 activeElement가 BUTTON '정정 시작'으로 복귀하고 폼이 사라짐을 확인했다. screenshot: corrections-goal-labels-mobile-final.png, corrections-actions-mobile-final.png, corrections-goal-labels-tablet-final.png, corrections-actions-tablet-final.png. 인라인 제출 성공 뒤 focus는 아직 실제 제출로 검증하지 않았다.
- 마지막 버튼 실측: 정정 시작83.63×44px/14px, 무효화70.30×44px/14px. 무효화 red700/white 대비6.51:1. primary blue500/white는3.71:1로 AA 일반글자4.5:1 미달이라 이 패널의 component CSS token만 static-blue로 보정 중이며 전역 globals.css는 수정하지 않는다.
- API 재시작 PID3105(session30873):8121, Web PID3343→3344→3350(session54708):3013, 기존 별도next-server22024는 타세션이므로 건드리지 않는다. 재시작 전 baseline Node92/Browser34, pressure1. 이 root가 시작한 runtime은 단계 종료 시 회수 대상이다.

- root 소유 API PID10666와 Web PID16647/16661/16667를 종료하고 8121/3013 리스닝 종료를 확인했다. 메모리 pressure가 1(normal)로 내려가 직렬 테스트를 재개했다. DB55435는 유지한다. 03:14 기준 12코어, load6.53, 메모리 free50%, Node92/Browser41. 최신 화면 검증에는 API/Web 재시작이 필요하다.
- `video-upload-cleanup.integration-spec.ts`: 첫 실행은 friendly TeamMatch 필수 fixture 누락으로 setup 실패. fixture 보완 뒤 4/5 통과, 재시도 테스트의 availableAt 변경이 DB version CAS 규칙을 빠뜨려 실패했다. 두 update에 version increment를 적용한 session77229는 **5/5 PASS**: DB rollback, 정확히 한 outbox, 실제 worker 실패→동일 작업 retry 완료, 실제 파일 unlink/ENOENT/EACCES, canonical 참조 보호. 제품 제약을 완화하지 않았다.
- 공개 경기 spec은 추가 팀의 필수 regionId 타입이 nullable인 fixture 오류로 실행 전 실패했다. 필수 지역 null 가드를 추가했다. 개인 기록 spec은 실제 대회 등록 명단 없이 임의 sourceParticipantId를 넣어 생성 계약에서 거부되어, 실제 V1TournamentPlayer를 생성하도록 수정했다. 실행 실패를 공개 기능 PASS로 취급하지 않는다.
- 개인 공개 기록의 구 클라이언트 `matchType` 별칭을 물리 Game source가 아닌 tournamentId로 계산해 source cutover 뒤에도 대회 분류를 보존하도록 수정하고 기존 canonical DB spec에 assertion을 추가했다.
- source cutover의 기존 공식 cache는 같은 TX에서 표준 builder/project로 재투영하도록 보완 중이다. root는 오래된 cache visibility 재사용을 반려하고 현재 visibility policy를 읽는 공식 shared query/normalizer 사용을 요구했다. 기존 append-only fact는 이력으로 보존한다.
- Sol에 실제 mobile/tablet/desktop 캡처 기반 버튼·타이포·색상·배치 독립 검수를 배정했다. 전체 역할 흐름 **1/42**, 최신 변경 dev 반영/alpha 검증 미완 상태는 유지한다.

### 2026-09-09 기존 경기 source cutover

- 현재backfill은Game.teamMatchId만추가하는dual-expand이며 sourceType과tournamentFixtureId를바꾸지않는다. Prisma migration1300 및 실제runtimeDB의CHECK를대조해 TEAM_MATCH+동일UUID/null legacy link 허용을확인했다. sourceimmutable trigger는찾지못했고 runtimeGame의사용자trigger는revision pointer FK였다.
- legacyfixture 최종삭제 전 직접참조는 Game,FixtureResult,FixtureVideo,AdvancementEdge(source/target),StaffFixtureScope,OperationAudit이며 Goal은Result경유간접참조다. 공식fact/cache SQLguard도legacytable을조회하므로 FK만삭제해서끝낼수없다. 역사적append-onlyfact를임의rewrite하지않는다.
- Luna가새명시ID source-cutover함수+실제DBspec을구현중이다. 같은UUID ownership/config/teams검증,Game와좌표잠금,staffscope ID보존전환,Game.id/revision/events/periods/facts/audit보존,배치불일치전체rollback,rerun멱등성계약. legacytable drop와운영DB실행은아직수행하지않았다.
- Sol은source변경후기존공식fact/cache/팀기록의읽기와재처리충돌여부를독립검토중이다. 완전전환완료를주장하지않는다.

- Sol 후속심사에서 공개조회 blocker2를 확인했다: nextMatch에서 hidden canonical을 병합 전에 제외하면 visible legacy shadow가 노출됨; schedule에서 visibility를 pagination 뒤에 적용해 hidden행이 page limit/cursor를 소모함. Luna implementation_inventory에 canonical우선병합→visibility→pagination 순서 및 실제 회귀 보강을 배정했다. 개인기록 currentOfficial/canonical우선/participantResultId cursor는 코드상 일치하지만 dual-shadow 통합 검증은 부족하다. 테스트는 실행되지 않았다.
- 영상 cleanup2차 구현은 공통 URL helper와 DBvideo삭제commit후별도cleanup으로 바뀌었다. Sol 재심사중이며 root는 cleanup transaction의 physical삭제→asset삭제→commit 실패 시 asset만 복원되는 추가 경계를 제기했다. 파일삭제 안전성을 아직 PASS로 처리하지 않는다.

- 공개 상세는 canonical Details 우선으로 전환했고 getSchedule은 canonical/legacy UUID 중복 제거와 canonical 우선 정렬을 추가했다. 대회 선수 기록/관리자 선수 기록에 TEAM_MATCH 대회 경기를 포함했다. nextMatch는 양 source 후보를 합쳐 숨김/취소 제외·동일UUID canonical 우선·시각/ID 정렬을 적용했다. 새 런타임 검증 전이며 공개404 해결을 아직 입증하지 못했다.
- 공개 개인 기록은 Details로 대회/라운드를 판별·hydrate하도록 수정했다. currentOfficialRevision·동의·노출 필터는 유지하며 실제 새 fixture 기반 spec을 추가했다. Sol 후속 심사 중이다. 공개 상세 spec의 self-contained 재작성에도 남아 있던 잘못된 score 키를 root가 실제 DB shape `{home,away}`/public `{home,away,penalties}`와 scoreStatus official로 수정했다.
- 경기 영상의 canonical 전환은 Luna `canonical_videos` 담당으로 진행 중이다. 소유 파일은 tournament fixture videos service 및 새 DB spec으로 제한하며 schema/public records는 수정하지 않는다. 영상 FK/이관이 추가로 필요하면 먼저 사실과 필요한 변경을 보고하도록 지정했다.
- `docs/scenarios/competition-role-flow.md`에 실제 운영·정정 부분 증거 및 미완 공개/worker 상태를 동기화했고 W3의 오래된 설계 검토 문구를 현재 확정된 TeamMatch+Details 전환 목표로 갱신했다. API games 문서에도 canonical public response/후처리 gate를 명시했다. 전체 계수 1/42 및 dev/alpha 미완은 그대로다.
- 현재 load16.90/16.39/15.75, swap20,655MB, OS `kern.memorystatus_vm_pressure_level=2`(경고). 단순 잔존 swap 용량만이 아니라 실제 압력 신호가 있어 신규 DB 테스트·worker 가동은 미실행이다. 기존 API/Web/DB만 유지하며 구현·검토를 계속한다.

### 2026-09-09 결과 정정 시각 검수 보강

- 모바일 입력 후속: 실제 폼에서 사유 공백 한 칸 입력 시 제출 disabled=true, 취소 후 textarea 제거와 공식점수0:1 유지 확인. submit API 호출은 하지 않았다. Ego fillInput('')는 DOM값만 비우고 disabled가 갱신되지 않는 관측이 있어 그 결과는 앱 계약의 PASS/FAIL 근거로 쓰지 않았다. 새 폼에서 비어 있지 않은 공백 입력으로 trimmedReason 검증을 확인했다. 전체42흐름 계수는 유지한다.

### 2026-09-09 순위 재계산 경로 누락 발견

- root worker module 검토에서 UploadsModule import가 UploadsController까지 내부worker에등록하는 경계확장을 발견했다. PrismaModule을 이미 사용하므로 UploadsService만provider로 주입하도록 보정하고 기존worker module 경계spec에 UploadsModule 비도달 단언을 추가했다. 실행하지 않았다.

- cleanup 회귀 보강 도착: processOne 실제처리→RETRY/attempt1→동일event 재처리 및 실제 UploadsService 임시파일삭제/ENOENT/EACCES 경로를 추가했다. root는 재시도 후 동일event COMPLETED/attempt2 단언, 파일검증시실제DBtx, fs fault spy finally복원을 추가했다. 아직 실행하지 않았다. 02:54 OSpressure2 지속으로 테스트게이트는 유지한다.
- 전체Phase3 최종수렴을 놓치지 않도록 Luna에 기존Game.sourceType 전환을 막는 DBtrigger/constraint 및 legacyfixture FK잔여목록을 read-only 조사하도록 배정했다. 현재backfill/신규경기canonical지원만으로기존경기전체전환완료를주장하지 않는다.

- Sol 최신 영상 production bounded review: 이전 blocker는 코드상 해소, 새 blocker 미발견. DB video/asset/outbox 원자화, insert URL잠금 안 자산검증, 동일claim strict unlink 및 ENOENT재처리 확인. 이는 실행PASS가 아니다. 기존 combined upload storeFiles 직후 crash orphan은 이번 삭제 변경이 새로 만든 결함과 구분하며 무단TTL정책은 추가하지 않는다.
- cleanup integration초안은 DB원자rollback/event생성을 검증하지만 retry를 handler+worker.fail 수동조합으로 만들고 ENOENT를mock resolve로대체한 약점이 있었다. Luna에 processOne 실제전이 및 taskowned실제파일/ENOENT 경로 보강 요청. 문서 tournament-operations 영상 절도 canonical ID/404/URL잠금/durable삭제 및 local검증미완 상태로 동기화했다.

- Outbox1차 구현 root검토: afterCommit 물리삭제→fresh retry event 방식은 commit/콜백 사이 process crash 유실과 attempts 초기화 문제가 있어 반려했다. enqueue 단계에서 asset삭제+outbox를 commit하고 handler는 같은event로 strict unlink를 await해 기존retry/poison을 사용하도록 보완 중이다. video행삭제와 enqueue도 같은tx로 원자화하도록 지시했다.
- 추가 actual source 결함: UploadsService.removeStoredUrl이 safeUnlink를 호출하여 ENOENT 외 파일삭제 오류도 warn 후 삼켰다. 이경로만 ENOENT멱등성+나머지throw로 바꾸고 임시파일best-effort cleanup은 유지하도록 Luna에 배정했다. 재시도 계약 검증 전이다.
- nextMatch 신규 DBspec은 과거시각canonical/미래legacy를 분리하지 않으면 반례가 되지 않는 점과 visible모드명시/hidden-shadow누락을 root가 지적해 재작성 중이다. 테스트를 작성했다는 이유만으로 PASS로 보지 않는다.

- 자동 GameResultStandingsProjectionService도 중복 addCanonicalMatches를 제거하고 동일 appendCanonicalTournamentMatches를 사용하도록 Luna가 통합했다. legacy group query의 game.id를 포함하여 중복 제거하며 affected/all group 양쪽에 적용했다. 실행 검증 전이다.
- 영상 삭제는 기존 V1OutboxEvent에 durable cleanup 요청을 남기는 구현으로 진행한다. URL 잠금 안 참조0확인+asset삭제+작업등록을 원자 commit하고, 기존 worker가 실제 파일삭제를 재시도한다. insert의asset owner/kind/existence 확인도 동일잠금 안으로 이동한다. 현재 구현 중이며 완료 아님.
- 02:41 host pressure2, load13.91/15.40/17.97, swap20,431MB로 새 통합실행은 여전히 보류. 사용자에게 단일worker 좁은검증 진행 예외 여부를 질문했고 응답 전에는 부하 예외를 가정하지 않는다. 준비용 DB read에서 격리 template의 football-v1 ACTIVE v1 존재를 확인했다.

- 1차 helper의 canonical 우선순위는 조 이동까지 보강됐다. root는 추가로 completed 필터를 ownership 조회에서 제거하고 계산 포함 단계로 이동했다. 새모델취소/예정+이전모델완료 조합에서 옛 결과가 되살아나는 것을 막기 위한 수정이다. Luna에 fixture status 및 취소 회귀 추가를 요청했다. diff whitespace 확인만 통과했고 실제 DB/통합 테스트는 아직 실행하지 않았다.
- 영상 후속은 양테이블 URL 참조 검사/advisory URL 잠금/scoped404/동일URL다른ID 충돌 검사를 추가했으나 Sol 재검토가 진행 중이다. root는 physical file 삭제가 DB transaction commit보다 먼저 발생하는 복구 위험도 검토 항목에 추가했다. 저장소 파일 보존 계약을 충족했다고 아직 판단하지 않는다.

- 실제 코드 대조: 자동 GameResultStandingsProjectionService는 addCanonicalMatches로 TEAM_MATCH 공식 결과를 포함하지만, runTournamentStandingsRecalculation 배포 batch와 TournamentBracketService.recalculateStandings 관리자 경로는 legacy fixtures만 읽는다. canonical-only 경기를 빠뜨린 채 순위 upsert할 수 있어 Phase3 완료 차단 결함이다.
- Luna에 batch/관리자 재계산 메서드/관련 회귀 검증의 canonical source 통합을 배정했다. API 권한 및 같은 transaction 안의 감사 계약 유지, 전환 중 dual source 중복계산 방지를 요구했다. 아직 구현·실행 결과 미확인이다.
- Sol은 canonical 영상 이관의 ID/필드 보존, 충돌 rollback, storage reference, 재실행 검토 중이다. 이전 tool thread limit 이후 이번 followup은 접수되었다.
- 이번 탐색에서 존재하지 않는 wildcard 및 guessed shared.ts 경로 조회가 실패했으며 실제 파일 목록으로 정정했다. 애플리케이션/테스트 실패로 해석하지 않는다. 신규 테스트 실행 없음.

- 후속 실측: 390px에서 인라인 폼 개방 시 document.scrollWidth486px로 넘침. 원인은 득점 입력 고정4열의 최소폭과 grid의 auto minimum이었다. 모바일 득점2열/태블릿이상4열 및 corrections grid minmax(0,1fr)로 보정. Ego에서 clientWidth390=scrollWidth390 확인, 화면 직접 확인 및 corrections-inline-mobile-overflow-fixed.png 저장. 스크롤 캡처에는 도구 좌표 오프셋이 보여 해당 이미지로 하단 시각 PASS를 주장하지 않는다.
- Luna 순위 helper 1차 구현을 root가 검토했으나 legacy game ID가 있으면 canonical을 제외하는 역우선순위를 발견했다. canonical 조 이동/등록팀 변경에 대해 canonical 우선으로 교체하도록 재수정 요청했다. 통합 실행 미완이다.
- Sol 영상 검토 blocker3: legacy 공유URL 참조를 고려하지 않는 물리파일삭제, 동일teamMatch/url 다른ID의 이관충돌 누락, scoped fixture404 이전 bareID 영상조회로 타대회409노출. Luna flow_contract_map이 이 세 항목 및 rollback 증거 보강을 담당한다.

- 태블릿 후속: 768px에서 320px picker가 편집 영역을 좁히는 문제를 실제 확인하고 corrections route에만 1024px 미만 단일열을 적용했다. Ego computed grid=720px 및 screenshot 직접 확인. 인라인 폼을 경기 요약 다음으로 옮기고 편집 중 시작/무효화/처리이력을 숨겼다. 실제 버튼 클릭으로 0:1·원정 득점1이 hydrate된 폼, 가로 overflow 없음 확인. screenshots: corrections-layout-tablet-after.png, corrections-inline-tablet-after.png. 첫 취소 후 DB readback에서 리비전은 기존 OFFICIAL 두 건만 존재하며 현재 포인터는 revision2(score home0 away1)를 유지했다. 이는 취소 계약의 부분 증거이며 전체 결과 E2E 통과가 아니다.

- 사용자 지적에 따라 버튼·글씨·색상·배치를 기능 검증과 함께 추적한다. Ego113에서 390×844 실제 결과 정정 화면을 직접 확인했다. `output/ego/competition-full-goal-20260908/corrections-layout-mobile-before.png`에 변경 전 화면을 보존했다.
- 버튼 실측: 정정/무효화 모두 324×44px, 글자14px. 크기 부족으로 단정하지 않는다. 경기명이 목록·패널 제목·점수 카드에 세 번 반복되고 정정 CTA가 첫 화면 하단까지 밀리는 문제, 데스크톱에서 위험 작업이 primary와 같은 넓이로 강조되는 문제를 확인했다.
- Luna가 corrections-page-client 및 game-result-correction-panel 두 파일에 한해 제목 중복·버튼 강조·공개 링크 터치 영역을 수정 중이다. A 인라인 정정 및 기존 권한/저장/확인 계약을 유지한다. 변경 후 화면 검증 전에는 시각 PASS로 처리하지 않는다.
- 02:21 호스트 load23.19/26.27/23.33, pressure2, swap20,562MB. 기존 API10666/Web16667는 live이며 새 고부하 검증은 실행하지 않았다. 전체 시나리오는 여전히1/42, alpha E2E 미완이다.
- 후속 구현: 중복 h2는 sr-only로 focus/접근성 유지, 공개 링크 min-height44px, 정정 버튼 self-start, 무효화 outline+red700 적용. corrections route에 선택 A에 맞는 inline prop을 연결했다. Ego에서 모바일390와 데스크톱1440 렌더를 직접 확인해 중복 제목 제거와 버튼 강조 완화를 확인했다. 모바일 정정 버튼 상단이661→593px로 올라왔다. outline 기본색이 utility를 덮어 root가 style 토큰으로 보정했으며 실제 무효화 색 rgb(180,35,50), 높이44px 확인. after 스크린샷은 같은 output 폴더의 corrections-layout-mobile-after.png 및 corrections-layout-desktop-after.png. 모바일 이미지는 마지막 빨간 텍스트 보정 전이다. 태블릿·인라인 폼 행동·전체 화면 시각 검수는 미완이다.
