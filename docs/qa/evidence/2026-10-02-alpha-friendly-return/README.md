# alpha 팀매치 검색·유형 복귀 회귀 및 인계

[실제 공개24행 원장](https://github.com/kim-song-jun/matchup-sports-platform/blob/d64f8f74c815f81157c9b89a37444e2aa3a77506/docs/qa/evidence/2026-10-02-alpha-tournament-coverage/README.md) + [라벨2개 추가 관측](https://github.com/kim-song-jun/matchup-sports-platform/blob/59f067550b8d4d0a174705771fb0f928ac642cac/docs/qa/evidence/2026-10-02-alpha-postdeploy-label/README.md) + 이번 팀매치1개 원래조건 회귀 = **실제 공개27개 관측 시나리오 기록**. 기능/전체라우트 분모나전체PASS가 아닙니다. 부모 cloudadmin 보조9개 원장은별도입니다.

현재 /team-matches?q=QA179&kind=friendly → 실제친선bafbfa카드 → 실제페이지뒤로가기390/768/1440 모두 검색QA179·유형friendly·결과1건보존. 원래1420 before사진은없으며이번9장은PR1467 after입니다. `entry/detail/return`은 탐색 단계입니다. 정확한UTC/CSS폭/URL/해시는 [manifest.json](manifest.json).

## 검증된 신규 이슈와 남은 회귀

|이슈|검증된결함|현재단계|
|---|---|---|
|[#1516](https://github.com/kim-song-jun/matchup-sports-platform/issues/1516)|진행중필터의빈상태가모집중으로설명|PR1519 OPEN, after대기|
|[#1518](https://github.com/kim-song-jun/matchup-sports-platform/issues/1518)|확정친선의공동기록참여안내잔여|fixqueue, after대기|
|[#1520](https://github.com/kim-song-jun/matchup-sports-platform/issues/1520)|관리자 상세후browserBack 검색/완료상태유실|PR1524 OPEN, after대기|
|[#1522](https://github.com/kim-song-jun/matchup-sports-platform/issues/1522)|공개팀목록/상세 male원문|fixqueue, after대기|

위이슈는각각공개실제결함이미지·단계·기대/실제·환경/UTC/CSS폭·우선순위·한계가본문에있습니다. 기존1418은경기기록/leaguefixture선수링크의from누락결함으로보강했고, awards/bracket정상대조를분리했습니다.1420은team-matches경로이며teams프로필과혼동하지않습니다.

지정admin1463/1461/1464/1483은증거에정의한UI회귀만PASS.1458은선수카드/실명설정중복헤더원본만보강했고PR1508 OPEN으로after대기.27개공개관측·5지정admin수정·9외부admin보조를한전체PASS숫자로합치지않습니다.

## 남은검증/cleanup

- Guest CSS390/768/1440, not physicaldevice, OS keyboard or screenreader
- Initial q search/filter selection performed at390; actual card click and actual page Back performed separately at390/768/1440
- Only original q=QA179&kind=friendly combination, not region/sport combinations, rapid filters, pagination, direct URL fallback, all scroll restoration, browser Back/Forward or logged-teamleader persona
- No historical original1420 defect screenshot obtained; all9images are current afterPR1467, stages entry/detail/return rather than before/afterfix
- OldQA179 bafbfa match detail read only; roster not opened/changed, no result reopening, membership/permissions/payment/message changes
- ServingSHA at capture unobserved; evidence commit not deployed app SHA. Initial03:44/03:45team-matches502 during alpha bf47852a deployment window recovered afterone reload and not filed as a defect
- No authenticated teamcount member images or JSON included; those remain with original evidence worker awaiting explicit payload/destination approval
- 역할별로그인·활성수정가능명단draft·중복등번호저장검증미확보.기존완료합성결과 B1:A0/A1:B0/A0:B1 유지.
- appcode/중복fixPR/merge/deploy미실행.로컬작업트리변경없음.내가열었던브라우저와viewport는QA실행후해당소유탭만정리하며다른사용자탭/원격인증세션은건드리지않음.
