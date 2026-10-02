# alpha 배포 후 라운드 라벨 UI 회귀

[앞선 실제 공개24개 시나리오](https://github.com/kim-song-jun/matchup-sports-platform/blob/d64f8f74c815f81157c9b89a37444e2aa3a77506/docs/qa/evidence/2026-10-02-alpha-tournament-coverage/README.md)에 추가한 읽기 전용2개 관측입니다. 전체 admin/app QA 분모·전체PASS가 아닙니다.

|실제 공개 관측|판정|한계|
|---|---|---|
|7e04 /tournaments/7e04a6e9-4d5c-4a90-89dc-6865130c6a99 → 실시간순위표 → /bracket → A조 카드|390/402/768/1440 일반1라운드 한줄·전체텍스트·가로넘침없음|2라운드·확정날짜없음; 원본QA179gallery와동일입력비교아님|
|공개대회목록에서 (QA179) 명단 조정 대회 → /tournaments/b9be4094-ada6-42a5-968b-2c64b668621e → 진행중인대회보기 → /bracket|390/402/768/1440 일반1·2라운드 한줄·가로넘침없음.390/402일반라벨도말줄임관측|아주긴조이름미확보; 정상길이전체텍스트390/402 PASS주장안함|

이미지는 실제 alpha 원본이며 편집하지 않았습니다. 정확한 UTC/CSS폭/해시/DOM 측정은 [manifest.json](manifest.json). 모든라벨높이18px=line-height18px, white-space nowrap입니다. QA179390의1라운드는clientWidth61px<scrollWidth81px,2라운드는74px<83px입니다. 말줄임은설정된ellipsis동작이며원래줄바꿈결함과구분합니다. 물리기기나모든라벨길이에대한보증이아닙니다. 팀count 이미지나인증명단JSON은이게시물에포함하지않습니다.

## 검증 한계

- CSSviewport testing only, not physical mobile/tablet, screen reader or software keyboard
- Current7e04 public bracket has only1round and unknown schedule. Original1502 gallery is QA179 b9be public bracket with1/2rounds, dated fixtures and long venue. QA179 exactURL was found from actual visible tournament title and bracket link, not guessed.
- QA179390/402 have one-line but ellipsized normal1/2round text. No claim all normal labels render in full. Tablet768/desktop1440 render complete1/2round text.
- No unusually long group-name label fixture; long-label ellipsis behavior remains unverified. Fixed-date long venue and1/2round normal labels were observed onQA179.
- No app mutation, new registration, membership/roster/result change, permission/payment/user message or oldQA179 roster change.
- Evidence commit is not serving app SHA. Successful alpha98a2a9e deployment03:16:14Z is an observed boundary; servingSHA at each later capture is unobserved.
