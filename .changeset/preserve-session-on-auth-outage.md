---
"v1_web": patch
---

전역 인증 게이트 중 `PendingSocialSignupGate`가 `/auth/me` 실패를 이유 불문 "로그아웃"으로 처리하던 문제를 고친다. `RequireAuth`/`SessionEntryGate`는 이미 진짜 401(미인증)일 때만 로컬 세션을 지우도록 수정됐지만(#100), 앱 전체를 감싸는 `PendingSocialSignupGate`는 여전히 `authMe.isError`(503/네트워크 오류 포함 모든 실패)만으로 세션을 지우고 소켓을 끊었다. alpha 배포 중 몇 분간의 백엔드 다운타임(503)에도 실제로는 로그인 상태인 사용자가 강제 로그아웃되는 현상의 원인이었다. 형제 컴포넌트와 동일하게 `error.statusCode === 401 || error.code === 'UNAUTHENTICATED'`인 경우에만 세션을 지우도록 통일한다.
