# Tournament Gender Quota and Creation Wizard Scenarios

대회 성별 카테고리·혼성 쿼터와 관리자 생성/수정 화면의 공통 계약을 추적한다.

## API / DB

- [ ] `TOURN-029-A` create/update는 `mixed | male | female`만 받고 혼성이 아닌 카테고리의 쿼터를 `null`로 정리한다.
- [ ] `TOURN-029-B` 최소가 최대보다 크거나, 최소 합이 `maxPlayers`를 넘거나, 성별 최대가 `maxPlayers`를 넘으면 `TOURNAMENT_GENDER_QUOTA_CONFIG_INVALID`다.
- [ ] `TOURN-029-C` 혼성 대회 선수 추가는 서버 프로필의 `gender`를 기존 `genderSnapshot`에 저장하며 누락 시 `PLAYER_REQUIRED_PROFILE_MISSING`다.
- [ ] `TOURN-029-D` 혼성 명단 잠금은 registration row lock과 쿼터 집계·감사 로그를 serializable transaction에서 처리한다.
- [ ] `TOURN-029-E` 쿼터 미충족 잠금은 `TOURNAMENT_GENDER_QUOTA_NOT_MET`와 남성/여성 `count/min/max/ok`를 반환하고 잠금 상태를 바꾸지 않는다.

## Admin Wizard / Shared Editing

- [ ] `TOURN-030-A` 4단계는 기본 정보 → 일정·장소 → 참가 조건 → 상금·홍보 순서이며 뒤로가기와 단계 이동에서 값이 유지된다.
- [ ] `TOURN-030-B` 시작 일시 선택 시 신청 마감 D-3 23:59와 명단 마감 D-7 23:59를 제안하고, 사용자가 수정한 값은 이후 덮어쓰지 않는다.
- [ ] `TOURN-030-C` 참가 조건 기본값은 팀 8, 최소 선수 6, 최대 선수 10이며 직전 대회 복사는 계좌 3필드만 바꾼다.
- [ ] `TOURN-030-D` 혼성은 쿼터 4필드를 표시하고 남성부/여성부는 숨기며 제출 payload도 같은 계약을 따른다.
- [ ] `TOURN-030-E` 생성과 수정은 날짜, 커버, 상금 배분, 홈/목록 홍보 카드 컴포넌트를 공유한다.
- [ ] `TOURN-030-F` 커버·상금·홍보 미리보기는 저장 전 실제 공개 카드 구조로 보이고 이미지 실패를 성공으로 숨기지 않는다.
- [ ] `TOURN-030-G` 기존 `genderCategory = null` 대회는 수정 화면에서도 `성별 구분 없음 (기존)`으로 보이고, optional 일정·장소·계좌·규정·환불 값을 비우면 `null`로 저장된다.

## Live / Visual QA

- [ ] 기존 Web `3013`, API `8121`, 기존 dev DB만 사용해 생성 → 상세 수정 → 공개 목록/상세 → 혼성 명단 잠금 성공/실패를 확인한다.
- [ ] `/admin/tournaments/new`, 관리자 상세 편집, `/tournaments`, 공개 상세를 390×844, 768×1024, 1440×900에서 확인한다.
- [ ] 단계별 focus order, sticky action, 가로 넘침, 이미지 비율, console error, 실패 network를 확인한다.
- [ ] `html`, `body`, form control, Tailwind `font-sans`/`font-mono` computed font가 Pretendard를 첫 번째 유효 서체로 사용한다.
- [ ] QA가 만든 대회·등록·선수·감사 로그만 exact cleanup하고 기존 row는 보존한다.

검증 전 `uptime`, CPU/memory/swap, Node/브라우저 수, Docker와 3013/8121 상태를 확인한다. 검증은 직렬·최소 범위로 실행하고 이 작업이 시작한 PID만 정리한다.
