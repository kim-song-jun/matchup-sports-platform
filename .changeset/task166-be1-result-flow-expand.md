---
'v1_api': minor
'v1_web': minor
---

결과 확인을 한 단계로 만든다 — 반려·보완 요청(팀에게 되돌려 보내는 왕복) 제거 (Task 166 BE-1, expand).

- 상태 기계가 더는 `SUPPLEMENT_REQUESTED`·`REJECTED` 로 **들어가지 않는다**. `review-decision`
  엔드포인트·서비스·DTO 와 워커 감사 핸들러 2개 삭제.
- 어드민이 틀린 결과를 만나면 되돌려 보내지 않고 **그 자리에서 고쳐 확인한다** —
  `supersede-and-submit` 의 base 에 `SUBMITTED` 추가(권한은 기존 스태프 경계 그대로).
- 어드민 검토 패널: "반려"·"보완 요청" 버튼 제거, SUBMITTED 카드에 "확인" + "고치고 확인"
  (기존 재제출 모달 재사용, 신규 컴포넌트 없음).
- **레거시 행은 건드리지 않는다.** 이미 반려·보완 요청된 행은 여전히 읽히고(단계 매핑),
  변경 불가이며(terminal), 재제출로 고칠 수 있다. enum 값 제거와 데이터 변환은 후속
  contract PR.
