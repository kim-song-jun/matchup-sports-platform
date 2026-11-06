# Task 20261129: 통합 계정 정책 후속 — 수단 해제·이메일 변경 인증·번호 찾기 노출 축소 외

Status: In Progress
**Owner**: 오케스트레이터(Opus) → 서버 레인(Sonnet) 4개 + 화면 3안(디자인) 1개
**Created**: 2026-11-06
**Related**: [20261125-unified-account-email-login.md](./20261125-unified-account-email-login.md), [20261124-auth-recovery-account-linking.md](./20261124-auth-recovery-account-linking.md)

## Context

통합 계정(카카오·Apple·이메일+비밀번호를 한 계정의 로그인 수단으로) 구현 뒤, 실계정 검증에 앞서 코드 304곳을 대조한 정책 정리에서
공백 13개(G1~G13)를 찾았다. 2026-11-06 사용자가 전부 추천안으로 결정했고, 번호 찾기 노출(G14)을 추가로 결정했다.
같은 날 alpha 에서 사용자 alpha 카카오 계정으로 "카카오 계정에 이메일 연결 → 이메일·카카오 양쪽 로그인 = 같은 계정"을 확인했다(리허설).
운영·alpha 모두 한 계정에 같은 제공자 신원이 둘인 행은 0건이다(읽기 전용 조회, 2026-11-06).

## Goal

결정된 정책을 서버·화면·문서에 반영해, 붙인 로그인 수단을 사용자가 직접 정리할 수 있고(실계정 검증을 되돌릴 수 있게),
이메일·번호를 통한 정보 노출과 계정 선점 여지를 줄인다.

## Original Conditions (사용자 결정 2026-11-06)

- [ ] **G1 B — 사용자 직접 수단 떼기**: 최근 30분 안 로그인 필요, 마지막 남은 수단은 뗄 수 없음, 떼면 다른 기기 로그아웃(`sessionEpoch` 증가 + 현재 기기 쿠키 재발급), 보안 알림. 같은 외부 계정을 나중에 다시 붙일 수 있어야 한다.
- [ ] G2 A — 계정 합치기 없음(현행 유지, 변경 없음)
- [ ] **G3 A — DB 에 "계정당 제공자 하나"(활성 신원 기준) 제약** + 로그인 중 자동 연결 경로에도 같은 제공자 검사
- [ ] **G4 A — 자동 연결 경로에도 운영자 계정 거절 + 보안 알림**(명시적 연결과 같은 규칙)
- [ ] **G5 A — 이메일 변경은 항상 인증번호 필수**(프로필 수정 포함, 소셜 계정의 연락 이메일도 동일)
- [ ] G6 C — 비밀번호 재설정을 이메일 인증으로 치지 않음(현행 유지)
- [ ] **G7 A — 개인정보처리방침 v1.8 "로그인 수단" 절 추가**(재동의 없이). 문구는 사용자·법무 확인 뒤 게시
- [ ] **G8 C — Apple 비공개 릴레이 발신 도메인 등록 상태 확인 후 결정**(외부 콘솔 — 사용자 확인 필요)
- [ ] **G9 C — 설정에 "모든 기기에서 로그아웃"**
- [ ] **G10 B — 이메일 계정 찾기에서도 메일함 확인 뒤 탈퇴 대기·종료일 안내**
- [ ] **G11 B — 흔한 비밀번호 차단을 가입·이메일 연결·재설정에 같은 규칙으로**
- [ ] **G12 B — 문서·코드 불일치 6건을 G3·G4 뒤 한 번에 정정**
- [ ] G13 A — 이메일 별칭 정규화 없음(현행 유지)
- [ ] **G14 — 번호 계정 찾기 노출 축소**: SMS 인증 뒤에는 가입 수단과 로그인 버튼만. 마스킹 이메일·탈퇴 종료일은 이메일 인증(메일함 소유)을 한 번 더 통과해야 보인다
- [ ] **E A — 실계정 검증 순서**: G1 구현 → alpha 리허설 → 다음 승격 뒤 운영 실계정
- [ ] 화면 변경(G1·G5·G9·G11·G14)은 A·B·C 3안 → 사용자 선택 → 구현(CLAUDE.md UI 착수 규칙)

## 서버 계약 (레인 공통 기준)

| 결정 | 계약 |
|---|---|
| G1 | `POST /auth/identities/unlink { provider: 'kakao'\|'apple'\|'email' }`. 로그인 필수, 최근 30분 로그인 아니면 403 `RECENT_LOGIN_REQUIRED`, 호출자 가드(운영자 403 `SOCIAL_LINK_ADMIN_FORBIDDEN`·정지·가입 미완료)는 `link-caller-guards.ts` 재사용. 활성 신원 없으면 404 `LOGIN_METHOD_NOT_FOUND`, 남은 활성 수단이 그것뿐이면 409 `LAST_LOGIN_METHOD`. 성공 시 신원 `status=unlinked`(이메일이면 비밀번호 해시 제거), `sessionEpoch`+1 후 현재 쿠키 재발급, 상태 로그 `login_method_removed`, 알림 `social_identity_unlinked`. `users.email` 은 연락 이메일로 남는다. 같은 `(provider, providerUserKey)` 를 다시 연결하면 기존 행을 되살린다 |
| G9 | `POST /auth/sessions/revoke-others` — `sessionEpoch`+1, 현재 쿠키 재발급, 상태 로그 `sessions_revoked`. 최근 로그인 요구 없음 |
| G3 | 부분 유니크 인덱스 `(user_id, provider) WHERE status = 'active'`(idempotent 마이그레이션). 자동 연결 경로(`linkExistingKakaoIdentity`·`linkExistingSocialIdentity`)에 같은 제공자 검사(409 `SOCIAL_LINK_PROVIDER_EXISTS`) |
| G4 | 자동 연결 경로에 운영자 거절(연결하지 않고 기존 충돌 응답으로) + 성공 시 `social_identity_linked` 알림 |
| G5 | 이메일 변경 증명: 새 주소로 인증번호(목적 분리 — `email_change`) → 10분 `emailChangeToken`. `PATCH /me/profile` 에서 이메일이 바뀌면 그 토큰이 필수(없거나 다른 주소면 400 `EMAIL_CHANGE_PROOF_REQUIRED`). 비밀번호 계정은 로그인 ID 가 바뀌므로 최근 30분 로그인도 요구. 변경 후 `emailVerifiedAt`=지금 |
| G10 | `POST /auth/recovery/email/find-account` 가 메일함 증명 뒤 탈퇴 대기 계정도 찾고 `withdrawalPendingUntil` 을 싣는다(휴대폰 경로와 같은 모양) |
| G11 | 공통 비밀번호 규칙에 흔한 비밀번호 목록 차단(400, 해요체 안내). 웹의 즉시 안내도 같은 목록·같은 결과(목록은 한 곳) |
| G14 | 휴대폰 `find-account` 응답에서 `maskedEmail`·`withdrawalPendingUntil` 을 빼고 `providers`·`hasPassword` 만. 같은 계정의 이메일 인증을 추가로 통과한 증명이 있을 때만 두 값을 싣는다 |

## User Scenarios
1. 카카오 계정에 이메일을 붙였다가 필요 없어 뗀다 — 최근 로그인 확인 → 떼기 → 다른 기기 로그아웃, 알림 수신. 카카오만 남은 상태에서 카카오는 뗄 수 없다.
2. 프로필에서 이메일을 바꾸려는 사람은 새 주소로 온 인증번호를 넣어야 바뀐다. 남의 주소를 증명 없이 선점할 수 없다.
3. 번호를 새로 받은 사람이 계정 찾기에 그 번호를 넣으면 "카카오로 가입한 계정이 있어요"만 보이고 이전 주인의 이메일 힌트는 보이지 않는다.
4. 세션을 잃어버린 기기가 걱정되는 사람이 설정에서 "모든 기기에서 로그아웃"을 누른다.

## Test Scenarios
### Happy path
- [ ] 수단 2개 계정에서 하나 떼기 → 200, 신원 unlinked, epoch+1, 현재 쿠키 유효·옛 쿠키 401, 알림 1건, 다시 연결 시 같은 행 active
- [ ] 이메일 변경: 인증번호 → 토큰 → 프로필 저장 → `users.email`·이메일 신원 키 갱신, `emailVerifiedAt` 채움
- [ ] 모든 기기 로그아웃 → 다른 쿠키 401, 현재 쿠키 유효
- [ ] 이메일 계정 찾기 → 탈퇴 대기 계정 + 종료일
- [ ] 번호 계정 찾기 → providers 만, 이메일 인증 추가 후 마스킹 이메일·종료일
### Edge cases
- [ ] 마지막 수단 떼기 409, 30분 지난 세션 403, 운영자 403
- [ ] 같은 제공자 두 번째 활성 신원 삽입 → DB 거절(통합), 자동 연결 경로 409
- [ ] 이메일 변경 토큰이 다른 주소 → 400, 만료 → 400
- [ ] 흔한 비밀번호 → 가입·연결·재설정 모두 400, 웹 안내와 서버 판정 일치
### Error paths
- [ ] 연락처용 인증번호로 이메일 변경 토큰 발급 불가(목적 분리)
### Mock data updates needed
- [ ] `apps/v1_web/src/test/msw/` 핸들러·타입(새 엔드포인트, `find-account` 응답 모양 변경), 통합 fixture

## Parallel Work Breakdown
### Backend (+ 웹 데이터 계층, 화면 제외)
- 레인 A: G1 + G9 (`auth` 신원·세션)
- 레인 B: G3 + G4 + G12 (마이그레이션·자동 연결·문서)
- 레인 C: G10 + G11 + G14 (`account-recovery`·비밀번호 규칙)
- 레인 D: G5 (`profile`·`verification`) — 화면과 함께 배포(서버만 먼저 머지하면 기존 프로필 이메일 수정이 깨진다)
### Frontend
- 3안 결정 페이지(G1·G5·G9·G11·G14 화면) → 선택 뒤 화면 구현
### Docs / 법무
- G7 방침 v1.8 초안 → 사용자·법무 확인 뒤 게시
### Sequential
- 이번 1.13.x 승격 준비가 끝난 뒤에 dev 머지(승격 범위가 다시 늘지 않게). G5 서버는 화면과 같이.

## Acceptance Criteria
- [ ] 위 결정 항목(변경 대상 10개) 서버·화면·문서 반영, 단위·실제 DB 통합·웹 테스트 green
- [ ] 화면 항목: A·B·C 3안 → 사용자 선택 → 구현 → alpha 3폭 갤러리
- [ ] 리뷰 Critical=0
- [ ] alpha 리허설: 붙였던 시험 이메일 수단을 G1 으로 떼고 같은 계정·카카오 로그인 유지 확인
- [ ] 문서(`docs/api/domains/auth.md` 등) 같은 PR 에서 갱신, G12 6건 정정

## Tech Debt Resolved
- 수단 해제 경로 부재(최종 삭제 때만 unlinked) → 사용자 해제 경로 추가
- 이메일을 바꾸는 두 경로(이메일 연결 vs 프로필)의 규칙 불일치 해소

## Security Notes
- 해제·이메일 변경은 세션 탈취 시 피해를 키우는 동작이라 최근 로그인 + 알림 + 다른 기기 로그아웃을 함께 건다.
- 번호 재배정 노출 축소(G14). 계정 존재 여부는 여전히 번호 증명 뒤에만 드러난다.
- 흔한 비밀번호 목록은 서버가 최종 판정한다.

## Risks & Dependencies
- G3 부분 유니크 인덱스는 Prisma 스키마로 표현되지 않을 수 있어 드리프트 게이트와의 관계를 확인한다.
- G5 는 화면 없이 머지하면 기존 프로필 이메일 수정이 막힌다 — 화면과 같이.
- G7 문구는 법무 확인 필요. G8 은 Apple 개발자 콘솔 확인(사용자) 필요.

## Ambiguity Log
- G14 "탈퇴 대기 날짜는 숨기고": 번호 경로에서는 날짜를 숨기되 "로그인하면 탈퇴를 취소할 수 있어요" 안내는 남긴다(본인이 철회 경로를 찾을 수 있게). 10-31 결정 3A(번호 인증 뒤 탈퇴 신청 중 안내)를 이 범위로 좁힌다.
