# Alpha QA 실제 검증 원장

실제 관찰한 공개 시나리오 **24행/24행 기록 완료**. 이는 전체 admin/app 기능·라우트의 분모나 전체 PASS가 아닙니다. 모든 행에 실제 URL, 관측 폭, 실제 action 폭, 결과, 증거, 검증 한계를 분리했습니다. `VIEW`는 읽기 전용 표시 관측이며 기능 전체 PASS가 아닙니다.

|ID|실제 관측|결과|화면 CSS폭|실제 action CSS폭|
|---|---|---|---|---|
|P01|[대회 진행 중 복합 필터의 빈 안내](https://alpha.teameet.co.kr/tournaments?status=in_progress&genderCategory=male&sportId=10fe8a75-9824-4a09-824a-385b37266fff)|FAIL #1516|390, 768, 1440|390|
|P02|[팀 목록 성별 배지](https://alpha.teameet.co.kr/teams)|FAIL #1522|390, 768, 1440|표시 관측|
|P03|[팀 상세 성별 조건](https://alpha.teameet.co.kr/teams/97e70a02-1af6-4c44-bcd9-4c8a09eb9298)|FAIL #1522|390, 768, 1440|390|
|P04|[리그 참가 명단](https://alpha.teameet.co.kr/tournaments/c1f2ff15-9363-4915-9c11-8179e57369cb)|VIEW|390, 768, 1440|390|
|P05|[리그 경기 일정](https://alpha.teameet.co.kr/tournaments/c1f2ff15-9363-4915-9c11-8179e57369cb/bracket)|VIEW|390, 768, 1440|표시 관측|
|P06|[리그 순위](https://alpha.teameet.co.kr/tournaments/c1f2ff15-9363-4915-9c11-8179e57369cb/bracket)|VIEW|390, 768, 1440|표시 관측|
|P07|[리그 최종 결과](https://alpha.teameet.co.kr/tournaments/c1f2ff15-9363-4915-9c11-8179e57369cb/results)|VIEW|390, 768, 1440|390|
|P08|[리그 시상](https://alpha.teameet.co.kr/tournaments/c1f2ff15-9363-4915-9c11-8179e57369cb/awards)|VIEW|390, 768, 1440|390|
|P09|[리그 확정 경기 기록](https://alpha.teameet.co.kr/league-matches/c1f2ff15-9363-4915-9c11-8179e57369cb/fixtures/3054516f-a173-4775-9e35-7ea4acb652a9?from=%2Ftournaments%2Fc1f2ff15-9363-4915-9c11-8179e57369cb%2Fbracket)|VIEW|390, 768, 1440|표시 관측|
|P10|[리그 기록 → 선수 → 페이지 뒤로가기](https://alpha.teameet.co.kr/league-matches/c1f2ff15-9363-4915-9c11-8179e57369cb/fixtures/3054516f-a173-4775-9e35-7ea4acb652a9?from=%2Ftournaments%2Fc1f2ff15-9363-4915-9c11-8179e57369cb%2Fbracket)|FAIL #1418|390, 768, 1440|390, 768, 1440|
|P11|[개인 매치 q 검색 → 상세 → 페이지 뒤로가기](https://alpha.teameet.co.kr/matches?q=1.0.3)|PASS scoped|390, 768, 1440|390, 768, 1440|
|P12|[대회 참가 명단](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1)|VIEW|390, 768, 1440|390|
|P13|[대회 참가팀 후기](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/reviews)|VIEW|390, 768, 1440|1440|
|P14|[대회 후기 검색 빈 상태](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/reviews)|PASS scoped|390, 768, 1440|1440|
|P15|[대회 최종 결과](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/results)|VIEW|390, 768, 1440|1440|
|P16|[대회 확정 경기 기록](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/matches/04f8b827-d4dd-5225-835c-46ffd96b0e11?from=%2Ftournaments%2F932beb19-bc91-4446-86d8-9f69f5e4eae1%2Fresults)|VIEW|390, 768, 1440|1440|
|P17|[대회 명단에서 나 찾기 — 게스트](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/matches/04f8b827-d4dd-5225-835c-46ffd96b0e11?from=%2Ftournaments%2F932beb19-bc91-4446-86d8-9f69f5e4eae1%2Fresults)|PASS scoped #1401|390, 768, 1440|390, 768, 1440|
|P18|[게스트 명단 찾기 모달 닫기](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/matches/04f8b827-d4dd-5225-835c-46ffd96b0e11?from=%2Ftournaments%2F932beb19-bc91-4446-86d8-9f69f5e4eae1%2Fresults)|PASS scoped|390, 768|390, 768|
|P19|[게스트 명단 찾기 로그인 이동](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/matches/04f8b827-d4dd-5225-835c-46ffd96b0e11?from=%2Ftournaments%2F932beb19-bc91-4446-86d8-9f69f5e4eae1%2Fresults)|PASS scoped|1440|1440|
|P20|[대회 시상 → 선수 → 페이지 뒤로가기](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/awards)|PASS scoped #1418 control|390, 768, 1440|390, 768, 1440|
|P21|[대회 대진표 경기 일정](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/bracket)|VIEW|390, 768, 1440|1440|
|P22|[대회 순위·대진표 탭](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/bracket)|VIEW|390, 768, 1440|1440|
|P23|[대진표 → 선수 → 페이지 뒤로가기](https://alpha.teameet.co.kr/tournaments/932beb19-bc91-4446-86d8-9f69f5e4eae1/bracket)|PASS scoped #1418 control|1440|1440|
|P24|[확정 친선 득점 기록과 상태 문구](https://alpha.teameet.co.kr/team-matches/cb3442a3-3cb1-49e3-97ad-0410e4280349)|FAIL copy #1518; VIEW result|390, 768, 1440|390|

정확한 단계·증거·한계: [coverage.json](coverage.json). 이번 대회 원본31장: [manifest.json](manifest.json). 기존 공개 리그·개인매치 증거: [manifest](https://github.com/kim-song-jun/matchup-sports-platform/blob/219ac7df75a6ace6d29ffc25ee5192ba4cc13b9f/docs/qa/evidence/2026-10-02-alpha-public-flows/manifest.json).

|지정 관리자 수정|회귀 결과|실제 증거 댓글|
|---|---|---|
|#1463|PASS scoped — 팝업 가로넘침 after|[원본/after·폭·시간·한계](https://github.com/kim-song-jun/matchup-sports-platform/issues/1463#issuecomment-5944828069)|
|#1461|PASS scoped — 회원 상세 팀 반복 after|[원본/after·폭·시간·한계](https://github.com/kim-song-jun/matchup-sports-platform/issues/1461#issuecomment-5944371249)|
|#1464|PASS scoped — 입력 라벨 after|[원본/after·폭·시간·한계](https://github.com/kim-song-jun/matchup-sports-platform/issues/1464#issuecomment-5944830461)|
|#1483|PASS scoped — 신고 집계/기간 안내 after|[원본/after·폭·시간·한계](https://github.com/kim-song-jun/matchup-sports-platform/issues/1483#issuecomment-5944395629)|
|#1458|BEFORE only — 선수 카드/대회 실명 설정 중복 헤더 잔여|[원본/after·폭·시간·한계](https://github.com/kim-song-jun/matchup-sports-platform/issues/1458#issuecomment-5944404115)|

부모 cloud 관리자의 [별도9개 실제 보조 시나리오](https://github.com/kim-song-jun/matchup-sports-platform/blob/f9c2d024576f16ea8b35b29da83cb196c61e2498/docs/qa/evidence/2026-10-02-alpha/supplement-0254/results/functional-matrix-20261002-0234.json)를 로컬 guest 검증과 혼동하지 않습니다. #1520 admin browser Back 결함은 해당 원장과 공개6장으로 등록됐습니다. 공개되지 않은 다른 캡처 파일명을 이미지 URL처럼 표시하지 않습니다.

## 남은 범위

- 전체 admin/app route의 완결 QA를 주장하지 않는다. 이 원장은 실제 공개24개 관측 시나리오와 지정 회귀5건을 구분한다. 소스 라우트 목록/검색한 이슈 수는 QA 분모가 아니다.
- 부모 클라우드 관리자가 수행한9개 실제 보조 시나리오는 링크한 외부 ledger만 참조한다. 일부 캡처가 공개되지 않아 그 파일명을 공개 이미지 링크로 가장하지 않는다.
- 로컬 IAB는 guest; 부모 원격 클라우드의 관리자 세션을 로컬 인증으로 가정하지 않았다. 실제 팀장/매니저/참가자/상대팀 로그인 권한·서버 쓰기 거절은 미검증.
- 완료된 지정 합성 리그/대회/친선만 읽었다. 활성·수정 가능한 disposable roster draft가 없어 중복 등번호 제출/삭제/교체/재등록/검증 오류는 미검증.
- 실제 Android/iOS/태블릿 기기, OS 소프트 키보드, 화면 읽기 프로그램, 전체 Tab 순서 미검증. local CSS390/768/1440과 cloud CSS402/787/1180은 다른 환경이다.
- 1458/PR1508 및1516/PR1519는03:21Z OPEN이어서 after 미검증. 1518/1520/1522 after도 배포 경계/인증된 원본 브라우저를 기다린다.
- viewport 캡처는 보이는 영역만 증명한다. 모든 below-the-fold, 빈/로딩/오류 조합, 모든 링크·검색·정렬·페이지네이션·필터 연속입력·포커스 순서를 검증한 것이 아니다.
- 초기 React419/418 console의 원인은 미확정. guest auth401과 navigation canceled ERR_ABORTED는 예상 행동으로 구분했다. 전체console/network0오류 주장은 하지 않는다.
- 이미지 commit은 evidence commit이다. 각 캡처 순간 app serving SHA는 미관측. 배포 run 성공 시각과 캡처 시간만 구분해 기록한다.

## 안전 경계와 증거 관리

원본 픽셀을 편집하지 않았습니다. 완료 합성 결과 B1:A0(리그), A1:B0(대회), A0:B1(친선)은 읽기 전용입니다. 과거 QA179 명단을 건드리지 않았습니다. 자격증명·토큰·비밀번호를 저장하거나 게시하지 않았습니다. 이 evidence branch에는 docs/qa/evidence 아래 이미지·메타데이터만 추가되며 앱 코드/PR/배포를 변경하지 않습니다. 물리 기기 PASS가 아닙니다.
