---
"v1_api": minor
"v1_web": minor
---

팀 가입 신청 상태 반영·안내 개선

- 신청/취소 후 refetch 완료까지 버튼 pending을 유지해 상태가 즉시 반영되도록 수정
- 팀 상세의 배지·CTA가 서로 다른 쿼리를 보던 문제를 eligibility 단일 소스로 통일
- 승인 대기 안내 카드를 팀 상세에 상시 노출(신청일 + 승인 절차 안내)
- 정원 마감 시 영어 문구(`Team member capacity has been reached`)가 버튼 라벨로 노출되던 버그 수정
- 신청 실패 시 서버가 준 구체적 사유를 그대로 노출
- `GET /me/join-applications` 신설 + `/my/join-applications` 화면 추가(승인 대기 + 처리 결과 확인)
