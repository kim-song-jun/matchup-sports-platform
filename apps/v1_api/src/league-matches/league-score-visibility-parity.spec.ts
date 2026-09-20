import type { V1VisibilityMode } from '@prisma/client';
import { resolvePublicScorePresentation } from '../games/public-records/public-score-presentation';
import { effectivePublicVisibilityMode } from '../games/public-records/public-visibility';
import {
  toLeagueFixtureList,
  type LeagueFixtureFactRow,
  type LeagueFixtureListRow,
} from './league-fixture-list-source';

/**
 * **두 lane 이 같은 경기에 대해 같은 답을 하는가.**
 *
 * 리그 경기의 점수 공개 여부를 정하는 자리가 둘이다 — 경기 상세
 * (`resolvePublicScorePresentation ∘ effectivePublicVisibilityMode`)와 일정 목록
 * (`toLeagueFixtureList`). 각자의 스펙은 자기 lane 의 계약만 단언하므로, 한쪽만 고쳐도
 * 둘 다 green 이다. 실제로 그렇게 갈려서 같은 화면이 "점수는 공개되지 않아요" 바로 아래에
 * 다른 경기의 숫자를 찍었다.
 *
 * 그래서 여기서는 **어느 쪽 구현도 되풀이하지 않고** 둘의 일치만 단언한다 — 한쪽을
 * 되돌리면 red 가 된다.
 */

const START = new Date('2026-09-05T09:00:00.000Z');
const OFFICIAL_SCORE = { home: 1, away: 0, penalties: null } as const;

function rowWithPolicy(mode: V1VisibilityMode): LeagueFixtureListRow {
  return {
    id: 'tm-1',
    title: '1R A vs B',
    hostTeamId: 'team-a',
    approvedApplicantTeamId: 'team-b',
    startAt: START,
    placeName: '풋살장 A',
    status: 'completed',
    game: { id: 'game-1', currentOfficialRevisionId: 'rev-1', visibilityPolicy: { mode } },
  };
}

const OFFICIAL_FACT: LeagueFixtureFactRow = {
  homeScore: OFFICIAL_SCORE.home,
  awayScore: OFFICIAL_SCORE.away,
  resultRevision: { reason: null, outcomeReason: 'NORMAL' },
};

const POLICY_MODES: readonly V1VisibilityMode[] = ['LIVE', 'STATUS_ONLY', 'OFFICIAL_ONLY', 'HIDDEN'];

describe('리그 확정 점수 공개 — 목록 lane 과 경기 상세 lane 이 일치한다', () => {
  it.each(POLICY_MODES.flatMap((policyMode) => [true, false].map((flag) => [policyMode, flag] as const)))(
    '정책 %s · PUBLIC_LIVE=%s',
    (policyMode, publicLiveEnabled) => {
      const [item] = toLeagueFixtureList(
        [rowWithPolicy(policyMode)],
        new Map([['game-1', OFFICIAL_FACT]]),
        publicLiveEnabled,
      );
      const mode = effectivePublicVisibilityMode(policyMode, publicLiveEnabled);
      // 상세 lane 은 `hidden` 을 404 로 끊어 점수를 애초에 내보내지 않는다 —
      // 점수 표현 함수는 그 모드를 입력으로 받지 않는다.
      const detailShowsScore =
        mode !== 'hidden' &&
        resolvePublicScorePresentation({
          mode,
          showOfficialResult: true,
          officialScore: { ...OFFICIAL_SCORE },
          liveScore: null,
          submittedScore: null,
        }).score !== null;

      expect(item.homeScore !== null).toBe(detailShowsScore);
      expect(item.scoreHidden).toBe(!detailShowsScore);
    },
  );
});
