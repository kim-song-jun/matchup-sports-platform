# Payment Review Badge Scenarios

> Status: Implemented, verification pending
> 결제/환불/리뷰/배지 표면은 코드에 존재하지만, 이 문서 기준 scenario verification evidence는 아직 부족하다.

## Scenario Checklist

- [ ] PAY-001 체크아웃 완료 후 주문 데이터 저장 (`match` 결제 중심, dedicated Playwright pending)
- [ ] PAY-002 환불 요청과 후속 상태 반영 (owner-bound detail/refund UI exists, cross-surface verification pending)
- [ ] REV-001 경기 후 리뷰 작성과 반영 (pending review form exists, received reviews screen is still sample-labelled)
- [ ] BADGE-001 배지 / 진행도 갱신 (badge catalog exists, earned/progress is mixed sample data)

## PAY-001 체크아웃 완료 후 주문 데이터 저장

### Target Domains

- [x] 개인 매치 참가 결제
- [ ] 장터 주문 (현재 미지원)
- [ ] 레슨 구매 (현재 미지원)

### Steps

- [ ] 결제를 완료한다.
- [ ] `/payments`와 상세 화면을 확인한다.
- [ ] 원 기능 화면에서 상태를 다시 확인한다.

### Expected

- [ ] 결제 내역이 저장된다.
- [ ] 원 화면과 결제 화면의 상태가 일치한다.
- [ ] 중복 결제가 발생하지 않는다.

## PAY-002 환불 요청과 후속 상태 반영

### Steps

- [ ] 환불 요청을 생성한다.
- [ ] 사용자 화면에서 상태를 확인한다.
- [ ] 관리자 또는 정산 화면에서 같은 건을 확인한다.

### Expected

- [ ] 환불 상태가 양쪽 화면에 일관되게 보인다.

## REV-001 경기 후 리뷰 작성과 반영

### Steps

- [ ] 종료된 경기 뒤 리뷰를 작성한다.
- [ ] 상대 사용자 프로필과 리뷰 리스트를 확인한다.

### Expected

- [ ] 리뷰가 저장된다.
- [ ] 중복 제출 정책이 정상 동작한다.

## BADGE-001 배지 / 진행도 갱신

### Trigger Candidates

- [ ] 경기 완료
- [ ] 리뷰 누적
- [ ] 팀 활동 누적

### Expected

- [ ] `/badges`에 진행도 또는 신규 획득 상태가 반영된다.

## Notes

- 결제/환불은 외부 연동 범위 때문에 mock/stub 경계 정의가 필요하다.
- 2026-04-11: checkout/refund/review/badge 화면은 “구현됨”과 “검증됨”을 분리해서 기록한다. 현재 상태는 implemented surface가 존재하지만 verified scenario는 아직 없음이다.
- 2026-04-11: match payment detail/refund surface는 real-data + owner-bound contract로 정리됐고, context 없는 checkout 진입은 막혀 있다.
- 2026-04-11: lesson/marketplace commerce는 fake success가 아니라 명시적 미지원 상태라서 `PAY-001`의 현재 인스코프는 match payment 중심이다.
- 2026-04-11: `/my/reviews-received`와 `/badges`는 trust signal banner로 sample/mixed 상태를 명시한다. 실데이터 기반 리뷰/뱃지 progression verification은 follow-up이다.
- 2026-04-11: Task 38에서 venue review form의 사진 업로드 UI가 real `/uploads` contract로 연결됐고, venue detail route에서 form open smoke는 통과했다. 다만 리뷰 저장 end-to-end verification은 아직 별도 시나리오로 닫히지 않았다.
