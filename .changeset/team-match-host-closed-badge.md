---
'v1_web': patch
---

호스트가 자기 팀매치의 마감 상태를 목록에서 볼 수 있게 합니다.

`statusToCardStatus()` 가 viewerState 를 API status 보다 먼저 보기 때문에
(`if (viewerState === 'host_team') return 'mine'`), 호스트에게는 그 매치가
matched/closed/cancelled/completed/expired 여도 카드 status 가 항상 `'mine'` 이었습니다.
결과적으로 **매치를 만든 사람만 자기 매치가 마감된 줄 목록에서 알 수 없었습니다.**

- `TeamMatchModel` 에 `closed: boolean` 을 추가합니다 — API status 만으로 판정하며 관계와 독립입니다.
- 카드 배지를 **나와의 관계**(내 매치·승인 대기·승인 완료)와 **매치 상태**(신청 마감)로 나눕니다.
  둘 다 해당하면 둘 다 붙습니다.
- 지면·썸네일 흐림도 `match.closed` 로 판정해 호스트에게도 적용됩니다.

정렬(`sortTeamMatchesByAvailability`)은 viewerState 없이 `statusToCardStatus(getStatus(item))` 를
쓰므로 이 변경의 영향을 받지 않습니다.
