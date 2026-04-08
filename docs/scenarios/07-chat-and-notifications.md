# Chat And Notification Scenarios

## Scenario Checklist

- [ ] CHAT-001 두 사용자 간 채팅 송수신
- [ ] CHAT-002 같은 사용자의 다중 탭 unread/read 동기화
- [ ] NOTI-001 이벤트 기반 알림 생성과 영속성

## CHAT-001 두 사용자 간 채팅 송수신

### Preconditions

- [ ] `시나로E2E`, `팀장오너E2E` 두 계정을 준비한다.
- [ ] 두 사용자 모두 채팅 진입 가능 상태다.

### Steps

- [ ] 두 컨텍스트에서 같은 채팅방을 연다.
- [ ] 사용자 A가 메시지를 보낸다.
- [ ] 사용자 B가 수신을 확인한다.
- [ ] 사용자 B가 답장을 보낸다.
- [ ] 사용자 A가 수신을 확인한다.

### Expected

- [ ] 양쪽 모두 크래시 없이 채팅방이 열린다.
- [ ] 메시지가 실시간으로 반영된다.
- [ ] 입력창과 메시지 목록이 정상 갱신된다.

## CHAT-002 같은 사용자의 다중 탭 unread/read 동기화

### Preconditions

- [ ] 같은 사용자 컨텍스트에서 탭 2개를 연다.
- [ ] 다른 사용자가 메시지를 보낼 수 있다.

### Steps

- [ ] 탭 A는 `/chat`, 탭 B는 `/home` 또는 `/profile`에 둔다.
- [ ] 다른 사용자가 새 메시지를 보낸다.
- [ ] 탭 B unread 배지 증가를 확인한다.
- [ ] 탭 A에서 메시지를 읽는다.
- [ ] 탭 B 배지 감소 또는 제거를 확인한다.

### Expected

- [ ] 탭 간 상태 불일치가 길게 남지 않는다.

## NOTI-001 이벤트 기반 알림 생성과 영속성

### Trigger Candidates

- [ ] 팀 매치 승인
- [ ] 용병 승인
- [ ] 결제 완료

### Steps

- [ ] 이벤트를 발생시킨다.
- [ ] 수신 사용자 알림 리스트를 연다.
- [ ] 읽지 않음 카운트를 확인한다.

### Expected

- [ ] 알림 항목이 생성된다.
- [ ] unread 카운트가 증가한다.

### Persistence Check

- [ ] 새로고침 후 유지된다.
- [ ] 가능하면 서버 재시작 후에도 유지된다.

## Notes

- 이 파일은 Playwright 다중 컨텍스트와 MCP 수동 검증을 같이 써야 가치가 크다.
- 2026-04-07: `/chat` 페이지 진입, 메시지 입력창, 두 사용자 동일 채팅방 진입 Desktop Chrome 스모크는 통과했다. 실제 실시간 송수신 assert, unread/read 다중 탭 동기화, 이벤트 기반 알림 생성은 후속 자동화 대상이다.
- 2026-04-07: `e2e/tests/chat-realtime.spec.ts` Desktop Chrome smoke와 auth/chat focused rerun이 모두 통과했다. 현재 범위는 채팅방 진입/입력/2-context 구조 검증까지이며, unread-read sync와 notification coupling은 아직 미완료다.
