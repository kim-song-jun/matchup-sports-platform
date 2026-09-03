---
'v1_api': major
'v1_web': major
---

결과 리비전의 반려·보완 요청 상태를 제거한다 (Task 166 contract).

정본 §4 가 "결과는 보내기 → 어드민 확인 한 단계, 이의 없음" 으로 확정하면서 그 두 상태로
들어가는 명령은 expand 단계에서 이미 사라졌다. 여기서 남은 행을 옮기고 enum 값을 지운다.

**`V1GameResultRevisionState` 에서 `REJECTED`·`SUPPLEMENT_REQUESTED` 가 사라진다** — 이 값을
읽던 클라이언트는 더 이상 그 값을 받지 않는다. 마이그레이션은 남은 행을 두 갈래로 보낸다:
아직 확정되지 않았고 승계되지도 않은 마지막 리비전은 `SUBMITTED`(어드민 확인 대기)로
되살리고, 나머지는 `CHANGE_REQUESTED`(불변)로 얼린다.

`officializeResultRevision` 의 STANDARD 흐름에 **409 `RESULT_ALREADY_OFFICIAL`** 가 새로
생긴다 — 이미 공식 결과가 있는 경기를 옛 리비전으로 다시 확정하는 것을 막는다(정정 경로는
그대로).

alpha 데이터를 되돌릴 수 없게 바꾸므로 사용자 직접 승인 뒤에만 머지한다.
