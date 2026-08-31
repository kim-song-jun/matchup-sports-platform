import type { V1CompetitionKind, V1TournamentFormat } from '@/types/api';

/**
 * **"이게 리그인가"를 `format` 으로 물으면 틀린다.** 그 질문의 정답은 두 필드를 다 봐야 나온다.
 *
 * ```
 * format  어떻게 치르나   league | knockout | group_knockout
 * kind    무엇인가        regular_tournament | regular_league | null
 * ```
 *
 * ## 왜 OR 인가 — 두 방향으로 다 틀릴 수 있다
 * ```
 * 리그 방식 대회   format='league'          kind='regular_tournament'   alpha 실측 7건
 * 정규 리그 시즌   format='group_knockout'  kind='regular_league'       ← 통합 거울 행
 * ```
 * **아래쪽이 이 파일이 생긴 이유다.** 통합 백필(R3)과 dual-write 는 `format` 을 **쓰지 않아서**
 * (둘 다 참조 0건) 스키마 기본값 `group_knockout` 이 그대로 들어간다. 그래서 `format` 만 보면
 * **정규 리그에서 리그 분기가 예외 없이 안 탄다** — 순위표가 안 그려지고, 없는 대진표를
 * 그리려 든다.
 *
 * 위쪽은 반대다: `format='league'` 인 진짜 대회가 실제로 있으므로 `kind` 만 봐도 틀린다.
 *
 * ## 데이터를 `format='league'` 로 맞추지 않는 이유 (이미 내려진 결정)
 * 백엔드가 같은 결함을 먼저 겪고 `tournament-bracket.service.ts:121` 에서 같은 형태로 고쳤다.
 * 그 주석이 대안까지 기각해 뒀다:
 *
 * > 데이터를 `format='league'` 로 채워 맞추지 않는다 — 그러면 **가드는 틀린 채로 우연히
 * > 맞게 동작**하고, 두 개념이 갈리는 다음 지점에서 또 터진다. 질문을 둘 다 한다.
 *
 * ## `kind: null` 을 리그로 보지 않는다
 * `kind` 는 nullable 이다(NOT NULL 승격은 R5). null 은 R1 이전 행이고 **전부 단발 대회**다
 * (마이그레이션이 `DEFAULT 'regular_tournament'` 로 채웠다). null 을 리그 쪽에 묶으면 옛 대회가
 * 리그 규칙에 걸리는 **새 회귀**가 된다 — 서버 `tournamentKindCondition` 이 같은 이유로 null 을
 * tournament 쪽에만 붙인다.
 */
export function isLeagueCompetition(competition: {
  format: V1TournamentFormat;
  kind: V1CompetitionKind | null;
}): boolean {
  return competition.format === 'league' || competition.kind === 'regular_league';
}

/**
 * 진행 방식 라벨.
 *
 * **`format` 만으로 만들면 정규 리그에 "조별리그 + 토너먼트" 라고 적힌다** — 거울 행의
 * `format` 은 사실이 아니기 때문이다. 분기와 달리 라벨은 `|| kind` 를 덧붙여 고칠 수 없고
 * (틀린 값을 그대로 읽으니까) **리그 판정을 먼저** 해야 한다.
 */
export function competitionFormatLabel(competition: {
  format: V1TournamentFormat;
  kind: V1CompetitionKind | null;
}): string {
  if (isLeagueCompetition(competition)) return '리그 방식';
  return competition.format === 'knockout' ? '토너먼트' : '조별리그 + 토너먼트';
}
