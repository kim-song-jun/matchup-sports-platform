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
/**
 * ## ⚠️ 이 헬퍼로 물으면 **안 되는** 질문이 있다 (2026-09-01 실사고)
 *
 * 이 함수는 위에서 설명한 대로 **두 종류를 모두** true 로 준다. 그게 맞는 질문과 틀린
 * 질문이 갈린다:
 *
 * ```
 * ✅ "이 화면을 리그처럼 그릴까?"     순위표·대진표 부재·진행 단계·형식 라벨
 *    → 리그 방식 대회도 리그전으로 치르므로 같은 처리가 맞다
 *
 * ❌ "이 행에 그 데이터가 있나?"      정원 · 참가비 · 성별
 *    → `kind === 'regular_league'` **만** 물어야 한다
 * ```
 *
 * **왜 갈리나.** 없는 것은 *리그 방식*이 아니라 **거울 행**이다 — `V1League` 에 정원·참가비
 * 필드가 아예 없어서 거울이 못 채우고 스키마 기본값(`team_count=8`, `entry_fee=0`)이 남는다.
 * 반면 `format='league'` 인 **리그 방식 대회**(alpha 실측 7건)는 진짜 대회라 정원도 참가비도
 * 있고 신청도 받는다. 이 헬퍼로 정원을 가리면 **그 7건이 신청 정원을 잃는다.**
 *
 * 실제로 그렇게 구현했다가 기존 스펙 3건이 red 로 잡았다(`format: 'league'` 픽스처가 있었다).
 *
 * ## 지금 소비처는 전부 안전하다 — 2026-09-01 전수 확인
 * 프론트 11곳을 다 훑었고 **전부 렌더/계산 판정**이다(순위 계산 방식, 대진표 부재, 시상
 * 조 병합, 진행 스테퍼, 형식 라벨). 데이터 유무를 물은 자리는 그때 고친 둘뿐이었다:
 * `tournament-detail-client.tsx`(정원·참가비) · `tournament-card.tsx`(배지). 둘 다 지금은
 * `kind` 로 묻는다. **새로 쓸 때 위 표로 한 번 갈라 보라** — 이 목록을 다시 훑지 않아도 되게
 * 여기 적어 둔다.
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
