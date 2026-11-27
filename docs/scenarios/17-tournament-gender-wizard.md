# Tournament Gender Quota and Creation Form Scenarios

대회 성별 카테고리·혼성 쿼터와 관리자 생성/수정 화면의 공통 계약을 추적한다.

## API / DB

- [ ] `TOURN-029-A` create/update는 `mixed | male | female`를 받고, update 는 `null`(성별 구분 없음으로 되돌리기)도 받는다. 혼성이 아니면 쿼터를 `null`로 정리한다.
- [ ] `TOURN-029-B` 최소가 최대보다 크거나, 최소 합이 `maxPlayers`를 넘거나, 성별 최대가 `maxPlayers`를 넘으면 `TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID`다.
- [ ] `TOURN-029-C` 혼성 대회 선수 추가는 서버 프로필의 `gender`를 기존 `genderSnapshot`에 저장하며 누락 시 `PLAYER_REQUIRED_PROFILE_MISSING`다.
- [ ] `TOURN-029-D` 혼성 명단 잠금은 registration row lock과 쿼터 집계·감사 로그를 serializable transaction에서 처리한다.
- [ ] `TOURN-029-E` 쿼터 미충족 잠금은 `TOURNAMENT_GENDER_QUOTA_NOT_MET`와 남성/여성 `count/min/max/ok`를 반환하고 잠금 상태를 바꾸지 않는다.

## Admin Create Form / Shared Editing

- [ ] `TOURN-030-A` 만들기는 종목·대회명·진행 방식·대회 시작·신청 마감·팀 수(+성별)만 받는 한 화면 폼이다. 진행 방식은 조별리그 → 토너먼트·토너먼트만·리그전·여러 단계 네 가지다.
- [ ] `TOURN-030-B` 시작 일시 선택 시 신청 마감 D-3 23:59만 제안하고(명단 제출 마감은 제안하지 않음), 사용자가 수정한 값은 이후 덮어쓰지 않는다. 시작이 3일 이내면 제안하지 않고 직접 정하도록 안내한다.
- [ ] `TOURN-030-C` 팀 수 기본값은 8(2~64)이다. 선수 수·참가비는 받지 않고 서버 기본값(6/10/무료)을 쓴다.
- [ ] `TOURN-030-D` 혼성일 때만 남녀 인원 4칸을 표시하고, 제출 payload는 필수 칸과 성별/인원만 보낸다(서버 기본값 필드를 덮지 않는 최소 payload). 혼성이 아니면 인원 키를 보내지 않는다.
- [ ] `TOURN-030-E` 커버·상금·홍보 카드·장소·참가비·경기 규칙은 만들기에서 받지 않고 초안 뒤 대회 정보 섹션 시트에서 편집한다.
- [ ] `TOURN-030-G` 기존 `genderCategory = null` 대회는 수정 화면에서도 `성별 구분 없음 (기존)`으로 보이고, optional 일정·장소·계좌·규정·환불 값을 비우면 `null`로 저장된다.

## Live / Visual QA

- [ ] 기존 Web `3013`, API `8121`, 기존 dev DB만 사용해 생성 → 상세 수정 → 공개 목록/상세 → 혼성 명단 잠금 성공/실패를 확인한다.
- [ ] `/admin/tournaments/new`, 관리자 상세 편집, `/tournaments`, 공개 상세를 390×844, 768×1024, 1440×900에서 확인한다.
- [ ] 오류 시 포커스 이동, 하단 고정 바, 가로 넘침, 이미지 비율, console error, 실패 network를 확인한다.
- [ ] `html`, `body`, form control, Tailwind `font-sans`/`font-mono` computed font가 Pretendard를 첫 번째 유효 서체로 사용한다.
- [ ] QA가 만든 대회·등록·선수·감사 로그만 exact cleanup하고 기존 row는 보존한다.

검증 전 `uptime`, CPU/memory/swap, Node/브라우저 수, Docker와 3013/8121 상태를 확인한다. 검증은 직렬·최소 범위로 실행하고 이 작업이 시작한 PID만 정리한다.

## Related (Todo 26 reconciliation, 2026-08-04)

이 파일은 이미 v1 스택(`3013`/`8121`) 기준이며 Tasks 12-24와 stack이 어긋나지 않는다. 다만 범위가 대회 생성 폼과 성별 쿼터로 좁아, 관리자/스태프 **actor 권한 행렬**(director/field_operator/support_readonly/platform_ops)은 이 파일이 다루지 않는다. 그 행렬은 `docs/api/domains/tournament-operations-auth.md`가 계약을 정의하고, `E2E-AUTH-01`(Todo 26이 새로 명명한 시나리오 ID, `docs/scenarios/index.md`의 "v1 Team & Tournament Operations Scenario Ledger" 참조)가 그 계약의 E2E 검증을 담당한다. `E2E-AUTH-01`은 `e2e/v1-tests/tournament.spec.ts`에 아직 구현되지 않았다 — 이 파일의 체크리스트(전부 `[ ]`)와 마찬가지로 미검증 상태이며, 이번 재조정 라운드에서 fabricate하지 않는다.

이 파일의 다른 어떤 문장도 Tasks 12-24 소스(`apps/v1_api/src/tournaments/**`, `apps/v1_api/src/tournament-operations/**`)와 상충하는 것으로 확인되지 않았다 — 대회 생성 폼/쿼터 범위는 이번 재조정에서 정정할 false claim이 없었다.
