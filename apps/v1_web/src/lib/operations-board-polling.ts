/**
 * 운영 보드 폴링 주기 단일 소스. 보드 본체(`useV1TournamentOperationsBoard`)와 카드에 붙는 경기 명단
 * 요약(`useV1AdminRegistrationGameRosterList`)이 같은 화면에서 함께 돈다 — 주기가 갈리면 요약만
 * 늦거나 요청이 어긋나 두 번 나간다.
 */
export const OPERATIONS_BOARD_POLL_INTERVAL_MS = 15_000;
