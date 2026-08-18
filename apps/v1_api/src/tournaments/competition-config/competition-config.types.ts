export const COMPETITION_CONFIG_CODES = {
  INVALID: 'COMPETITION_CONFIG_INVALID',
  MISSING_SPORT: 'COMPETITION_CONFIG_SPORT_REQUIRED',
  UNSUPPORTED_SPORT: 'COMPETITION_CONFIG_SPORT_UNSUPPORTED',
  USED_MUTATION: 'COMPETITION_CONFIG_VERSION_IN_USE',
} as const;

export type CompetitionConfig = {
  periods: Array<{
    code: string;
    label: string;
    durationMinutes: number;
    extraTime: boolean;
  }>;
  events: string[];
  lineup: {
    minPlayers: number;
    maxPlayers: number;
    substitutions: 'limited' | 'rolling';
    maxSubstitutions: number | null;
    positions: Array<{
      code: string;
      label: string;
      short: string;
      goalkeeper?: true;
    }>;
    formations: Array<{
      code: string;
      label: string;
      outfield: number;
      slots: Array<{ position: string; x: number; y: number }>;
    }>;
  };
  result: {
    tournamentScorerPolicy: 'required' | 'optional';
    teamMatchScorerPolicy: 'optional_with_warning';
    mvpMin: 0;
    mvpMax: 1;
    /**
     * 승부차기 종료 판정 정책. **optional인 것이 핵심이다** — canonical 프리셋
     * (`competition-config.presets.ts`)에는 이 키가 없고, 앞으로도 넣지 않는다.
     *
     * 프리셋의 `result`를 바꾸면 canonical row 2개의 `contentHash`가 바뀌어
     * 백필 CLI가 `COMPETITION_CONFIG_SEED_DRIFT`로 실패하고, 이미 참조 중인 버전 row는
     * `COMPETITION_CONFIG_VERSION_IN_USE` 트리거에 막혀 UPDATE 자체가 안 된다 —
     * 즉 alpha·prod 양쪽에 운영 데이터 마이그레이션이 필요해진다. 기본값은
     * 프리셋이 아니라 **읽는 쪽**(`parseResultPolicy`)이 준다.
     *
     * 이 플래그가 가르는 것은 **처음 5킥 구간뿐**이다.
     * `earlyStop: true`(기본) = FIFA 정규 — 남은 킥을 다 넣어도 못 따라잡으면 그 자리에서 종료.
     * `earlyStop: false` = 양 팀이 5킥씩 다 찬 뒤에야 결판을 본다.
     * 5킥을 다 찬 뒤(서든데스)는 두 정책이 같다 — 같은 횟수를 찬 뒤 점수가 갈리면 종료.
     * 판정 구현은 프런트의 `penaltyShootoutOutcome`(`apps/v1_web/src/lib/penalty-shootout.ts`)
     * 하나뿐이다 — 서버는 킥 목록을 저장하지 않아 이 판정을 할 수 없다.
     */
    penaltyShootout?: {
      earlyStop: boolean;
    };
  };
  tieBreak: {
    points: { win: number; draw: number; loss: number };
    order: Array<
      | 'points'
      | 'head_to_head'
      | 'goal_difference'
      | 'goals_for'
      | 'fair_play'
      | 'seeded_draw'
    >;
    seededDraw: 'sha256-v1';
  };
  visibility: {
    default: 'live';
    allowed: Array<'live' | 'official'>;
  };
};
