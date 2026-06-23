# 카피/UX 문구 품질 전수 audit findings (Workflow wf_f7ee7435-0dc)

> 전 UI surface 8 그룹 병렬 분석(sonnet) + opus 종합. **170개 화면 전수 검토**(auth+onboarding 31·home+matches 24·teams+team-matches 24·tournaments 12·my+settings+reviews 26·chat+notifications+community 15·landing+shared-ui 15·admin 23).
> 152 raw → opus 적대검증 40 prioritized + 10 불일치 클러스터. lint가 합니다체 패턴은 0 강제하나 **자연스러움·어색함·일관성·명확성**은 판단 필요 → 이 audit이 채움.
> "모든 기능 하나도 빠짐없이 문구 점검"의 커버리지 증거.

## 10 불일치 클러스터 (전 인스턴스 통일 — 수정 진행 중)
1. `모집중` vs `모집 중` → **모집 중** 통일
2. `취소` vs `취소됨`(어드민 필터) → **취소됨**
3. `가입 신청` vs `가입 요청` → **가입 신청**
4. `팀매치` vs `팀 매치` → **팀매치**(붙임)
5. 어드민 토스트 `처리했어요.` 뭉뚱 → action-specific
6. 대회 취소 `신청` vs `요청` → **참가 취소 요청**
7. `준비중` vs `준비 중` → **준비 중**
8. 모바일↔데스크톱 어미(`확인해요` vs `확인해 주세요`) → 권유형 통일
9. 합니다체 잔재(`생깁니다`) + 과격식(`보여드릴게요`) → 해요체
10. raw enum(`개인매치`) → user-facing(`개인 매치`)

## prioritized 40 (currentText → suggestedText @ location)
HIGH 11: #1 처리했어요→상태변경 · #2 승인중→승인 대기 · #3 모집중→모집 중 · #4 취소→취소됨 · #5 개인매치→개인 매치 · #6 모바일 어미 · #7 별점 완료→선택됨 · #8 채팅 나가기 모달 · #9 메시지를 전송 · #10 결선 대진표 · #11 입금 안내.
MEDIUM 29: #12 잠깐 문제 · #13 보여드릴게요 · #14 생겨요 · #15~17 용어 통일 · #18 선택 가능 제거 · #19 준비 중 · #20 신청 접수 · #21 검토 중 · #22~32 어색 표현 · #33~40 spacing/microcopy/명확성.

상세: Workflow 결과 또는 수정 커밋 메시지 참조.

## 검증 방침
수정 후 pnpm lint(합니다체 0 재확인) + vitest + 핵심 화면 라이브(매치 상태·채팅 모달·리뷰 chip 등) 스팟체크.
