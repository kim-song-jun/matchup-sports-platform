# 결선 표시 순서·단판 합산

Task [20261119](../../.github/tasks/20261119-tournament-round-display.md).
기준 production 대회3b0b8241-71d7-4d55-a1ca-dfe3750eef4e 공개API/배포SHA852290b7를 읽기 전용 확인.

## 검증 계약
- 종료 결과: 결승→3·4위전→4강→8강→12강. 실제 경기 상세 링크와 점수 보존.
- 단판4강은 합산/1차 중복행0. 진짜1·2차전만 참가 식별자 확인 후 합산.
- 어드민 목록·그림·모바일: 4강→3위전→결승. 승자/패자 edge의 엔티티·연결 방향 유지.
- 저장 sortOrder·fixtureNumber·legNumber·경기시각·참가팀·점수 불변. DB migration/write0.
- 실제 시간순 일정 정렬은 변경하지 않음.

## 증거/잔여
- 결과렌더 RED: 단판/잘못된대진 합산2건 실패. 수정 후 관련Web141건 PASS.
- API bracket service221건 PASS: 조회 순서, 입력 불변/쓰기 없는 read 계약 포함.
- 어드민 desktop/mobile 실제 컴포넌트62건 PASS. Web 총203건 PASS. Web/API 타입·Web 패턴·API surface PASS.
- Alpha before/after390·768·1440 및 console/network: 미배포로0/3. 로컬Next 서버 실행0.
- prod/alpha 데이터 쓰기0, 기존 데이터 변환0.
